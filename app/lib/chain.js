// Reading Dala state from the chain: program accounts, Anchor events in transaction logs.
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { conn, MINT } from "./relayer.js";
import { PROGRAM_ID, decodeVault, decodePool, poolTokensPda, tokenAmount } from "./dala.js";

const hash8 = (s) => createHash("sha256").update(s).digest().subarray(0, 8);
const ACCOUNT = { Vault: hash8("account:Vault"), MatchPool: hash8("account:MatchPool") };
const SIZE = { Vault: 148, MatchPool: 96 };

/** All program accounts of one type for our demo mint (mint sits at byte 40 in both). */
async function programAccounts(type) {
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: SIZE[type] },
      { memcmp: { offset: 0, bytes: ACCOUNT[type].toString("base64"), encoding: "base64" } },
      { memcmp: { offset: 40, bytes: MINT.toBase58() } },
    ],
  });
  return accounts.map((a) => ({ address: a.pubkey.toBase58(), data: a.account.data }));
}

/** Pools with the balance each has left to match with. */
export async function listPools() {
  const pools = (await programAccounts("MatchPool")).map((a) => ({ address: a.address, ...decodePool(a.data) }));
  if (!pools.length) return [];
  const tokens = await conn.getMultipleAccountsInfo(pools.map((p) => poolTokensPda(new PublicKey(p.address))));
  return pools.map((p, i) => ({ ...p, available: tokens[i] ? tokenAmount(tokens[i].data) : 0 }));
}

export async function listVaults() {
  return (await programAccounts("Vault")).map((a) => ({ address: a.address, ...decodeVault(a.data) }));
}

// ---- Events --------------------------------------------------------------

const EVENT = {
  VaultOpened: hash8("event:VaultOpened").toString("hex"),
  Contributed: hash8("event:Contributed").toString("hex"),
  Saved: hash8("event:Saved").toString("hex"),
  Claimed: hash8("event:Claimed").toString("hex"),
};
const KINDS = ["employer", "family", "other"];

function reader(buf) {
  let o = 8;
  return {
    pk() { const v = new PublicKey(buf.subarray(o, o + 32)).toBase58(); o += 32; return v; },
    u8() { return buf[o++]; },
    u16() { const v = buf.readUInt16LE(o); o += 2; return v; },
    u64() { const v = Number(buf.readBigUInt64LE(o)); o += 8; return v; },
    i64() { const v = Number(buf.readBigInt64LE(o)); o += 8; return v; },
  };
}

export function decodeEvent(b64) {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 8) return null;
  const d = buf.subarray(0, 8).toString("hex");
  const r = reader(buf);
  switch (d) {
    case EVENT.VaultOpened:
      return { type: "opened", vault: r.pk(), worker: r.pk(), payoutStart: r.i64(), periodSecs: r.i64(), periods: r.u16() };
    case EVENT.Contributed:
      return { type: "contributed", vault: r.pk(), from: r.pk(), kind: KINDS[r.u8()] || "other", amount: r.u64(), ts: r.i64() };
    case EVENT.Saved: {
      const vault = r.pk();
      const amount = r.u64();
      const matched = r.u64();
      const pool = r.u8() === 1 ? r.pk() : null;
      return { type: "saved", vault, amount, matched, pool, ts: r.i64() };
    }
    case EVENT.Claimed:
      return { type: "claimed", vault: r.pk(), to: r.pk(), amount: r.u64(), periodsUnlocked: r.u16(), ts: r.i64() };
    default:
      return null;
  }
}

function eventsFromLogs(logs = []) {
  return logs
    .filter((l) => l.startsWith("Program data: "))
    .map((l) => decodeEvent(l.slice("Program data: ".length)))
    .filter(Boolean);
}

/** Recent Dala events touching an address (a vault, a pool, or a token account). */
export async function ledger(address, limit = 20) {
  const sigs = await conn.getSignaturesForAddress(new PublicKey(address), { limit });
  const ok = sigs.filter((s) => !s.err);
  if (!ok.length) return [];
  const txs = await conn.getTransactions(ok.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  // Batched RPC replies can come back in any order, so match them by signature, not position.
  const bySig = new Map(txs.filter(Boolean).map((t) => [t.transaction.signatures[0], t]));
  return ok
    .map((s) => ({ sig: s.signature, time: s.blockTime, events: eventsFromLogs(bySig.get(s.signature)?.meta?.logMessages) }))
    .filter((t) => t.events.length);
}
