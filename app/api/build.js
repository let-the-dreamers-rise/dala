import { PublicKey, Transaction } from "@solana/web3.js";
import { createTransferCheckedInstruction } from "@solana/spl-token";
import { route, HttpError, parsePubkey, parseWhole } from "../lib/http.js";
import { rateLimit } from "../lib/limit.js";
import { requireSession } from "../lib/session.js";
import { conn, relayer, MINT, POOL, PERIOD_SECS, ataOf, freshBlockhash } from "../lib/relayer.js";
import * as dala from "../lib/dala.js";

const MAX_PAYROLL = 5;

async function requirePool(address) {
  const pool = address ? parsePubkey(address, "Match pool") : POOL;
  const acc = await conn.getAccountInfo(pool);
  if (!acc || !acc.owner.equals(dala.PROGRAM_ID)) throw new HttpError(404, "That match pool does not exist");
  if (dala.decodePool(acc.data).mint !== MINT.toBase58()) throw new HttpError(400, "That pool is for a different stablecoin");
  return pool;
}

async function requireVault(worker) {
  const vault = dala.vaultPda(worker, MINT);
  if (!(await conn.getAccountInfo(vault))) throw new HttpError(404, `${worker.toBase58().slice(0, 4)}... has not opened a Dala vault yet`);
  return vault;
}

async function workerIxs(me, body, r) {
  const vault = dala.vaultPda(me, MINT);
  switch (body.action) {
    case "open_vault": {
      const startIn = parseWhole(body.startInSecs, "Retirement starts in", 60, 3600);
      const months = parseWhole(body.months, "Number of monthly payouts", 2, 12);
      const payoutStart = Math.floor(Date.now() / 1000) + startIn;
      return { ixs: [dala.openVault({ payer: r.publicKey, worker: me, mint: MINT, payoutStart, periodSecs: PERIOD_SECS, periods: months })], meta: { payoutStart } };
    }
    case "save": {
      const amount = parseWhole(body.amount, "Amount", 1, 500);
      const pool = await requirePool(body.pool);
      const ixs = [];
      if (!(await conn.getAccountInfo(dala.recordPda(pool, vault)))) {
        ixs.push(dala.joinPool({ payer: r.publicKey, worker: me, vault, pool }));
      }
      ixs.push(dala.saveWithMatch({ worker: me, from: ataOf(me), mint: MINT, vault, pool, amount: amount * dala.USDC }));
      return { ixs };
    }
    case "send_home": {
      // Plain remittance from her wallet to her family's wallet: not locked, arrives now.
      const amount = parseWhole(body.amount, "Amount", 1, 500);
      const to = ataOf(dala.familyOwner(me));
      return { ixs: [createTransferCheckedInstruction(ataOf(me), MINT, to, me, amount * dala.USDC, 6)] };
    }
    case "claim": {
      const to = body.to === "self" ? ataOf(me) : ataOf(dala.familyOwner(me));
      return { ixs: [dala.claim({ worker: me, mint: MINT, vault, to })] };
    }
    default:
      throw new HttpError(400, "Unknown worker action");
  }
}

async function employerIxs(me, body) {
  if (body.action !== "pay") throw new HttpError(400, "Unknown employer action");
  const payments = Array.isArray(body.payments) ? body.payments : [{ worker: body.worker, amount: body.amount }];
  if (payments.length < 1 || payments.length > MAX_PAYROLL) throw new HttpError(400, `Pay 1 to ${MAX_PAYROLL} workers per run`);
  const ixs = [];
  for (const p of payments) {
    const worker = parsePubkey(p.worker, "Worker wallet");
    const amount = parseWhole(p.amount, "Amount", 1, 1000);
    const vault = await requireVault(worker);
    ixs.push(dala.contribute({ contributor: me, from: ataOf(me), mint: MINT, vault, amount: amount * dala.USDC, kind: dala.KIND.employer }));
  }
  return { ixs };
}

async function foundationIxs(me, body) {
  const pool = dala.poolPda(me, MINT);
  switch (body.action) {
    case "create_pool": {
      const pct = parseWhole(body.matchPercent, "Match rate", 10, 300);
      const cap = parseWhole(body.cap, "Cap per worker", 10, 1000);
      if (await conn.getAccountInfo(pool)) throw new HttpError(409, "You already have a pool. Fund it instead.");
      return { ixs: [dala.createMatchPool({ sponsor: me, mint: MINT, matchBps: pct * 100, capPerWorker: cap * dala.USDC })], meta: { pool: pool.toBase58() } };
    }
    case "fund_pool": {
      const amount = parseWhole(body.amount, "Amount", 1, 20_000);
      if (!(await conn.getAccountInfo(pool))) throw new HttpError(409, "Create your pool first");
      return { ixs: [dala.fundPool({ funder: me, from: ataOf(me), mint: MINT, pool, amount: amount * dala.USDC })] };
    }
    default:
      throw new HttpError(400, "Unknown foundation action");
  }
}

const BUILDERS = { worker: workerIxs, employer: employerIxs, foundation: foundationIxs };

// POST: build an unsigned transaction for the signed-in user. The relayer is the fee payer;
// the browser adds the user's signature and sends it to /api/submit.
export default route(["POST"], async (body, req) => {
  const s = requireSession(req);
  rateLimit(req, "build", 120, 10 * 60 * 1000);
  const r = relayer();
  const { ixs, meta = {} } = await BUILDERS[s.role](new PublicKey(s.sub), body, r);
  const tx = new Transaction().add(...ixs);
  tx.feePayer = r.publicKey;
  tx.recentBlockhash = await freshBlockhash();
  return { tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), ...meta };
});
