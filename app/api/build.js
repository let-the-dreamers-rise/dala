import { PublicKey, Transaction } from "@solana/web3.js";
import { route, HttpError, parsePubkey, parseWhole } from "../lib/http.js";
import { rateLimit } from "../lib/limit.js";
import { requireSession } from "../lib/session.js";
import { conn, relayer, MINT, POOL, PERIOD_SECS, ataOf, freshBlockhash } from "../lib/relayer.js";
import * as dala from "../lib/dala.js";
import { familyOwner } from "../lib/dala.js";

// POST: build an unsigned transaction for the signed-in user. The relayer is the fee payer;
// the browser adds the user's signature and sends it to /api/submit.
export default route(["POST"], async (body, req) => {
  const s = requireSession(req);
  rateLimit(req, "build", 120, 10 * 60 * 1000);
  const r = relayer();
  const me = new PublicKey(s.sub);
  const ixs = [];
  const meta = {};

  if (s.role === "worker") {
    const vault = dala.vaultPda(me, MINT);
    switch (body.action) {
      case "open_vault": {
        const startIn = parseWhole(body.startInSecs, "Retirement starts in", 60, 3600);
        const months = parseWhole(body.months, "Number of monthly payouts", 2, 12);
        meta.payoutStart = Math.floor(Date.now() / 1000) + startIn;
        ixs.push(dala.openVault({ payer: r.publicKey, worker: me, mint: MINT, payoutStart: meta.payoutStart, periodSecs: PERIOD_SECS, periods: months }));
        break;
      }
      case "save": {
        const amount = parseWhole(body.amount, "Amount", 1, 500);
        const record = dala.recordPda(POOL, vault);
        if (!(await conn.getAccountInfo(record))) {
          ixs.push(dala.joinPool({ payer: r.publicKey, worker: me, vault, pool: POOL }));
        }
        ixs.push(dala.saveWithMatch({ worker: me, from: ataOf(me), mint: MINT, vault, pool: POOL, amount: amount * dala.USDC }));
        break;
      }
      case "claim": {
        const to = body.to === "self" ? ataOf(me) : ataOf(familyOwner(me));
        ixs.push(dala.claim({ worker: me, mint: MINT, vault, to }));
        break;
      }
      default:
        throw new HttpError(400, "Unknown worker action");
    }
  } else {
    if (body.action !== "pay") throw new HttpError(400, "Unknown employer action");
    const worker = parsePubkey(body.worker, "Worker wallet");
    const amount = parseWhole(body.amount, "Amount", 1, 1000);
    const vault = dala.vaultPda(worker, MINT);
    if (!(await conn.getAccountInfo(vault))) {
      throw new HttpError(404, "That worker has not opened a Dala vault yet");
    }
    ixs.push(dala.contribute({ contributor: me, from: ataOf(me), mint: MINT, vault, amount: amount * dala.USDC, kind: dala.KIND.employer }));
  }

  const tx = new Transaction().add(...ixs);
  tx.feePayer = r.publicKey;
  tx.recentBlockhash = await freshBlockhash();
  return { tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), ...meta };
});
