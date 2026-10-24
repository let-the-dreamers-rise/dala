// Minimal hand-rolled client for the Dala program: instruction encoding and account decoding.
import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const PROGRAM_ID = new PublicKey("J4NigtmbyxjPXkrLz77ZFpkQ3JXfVuBpzEyYWuGykoMY");
export const KIND = { employer: 0, family: 1, other: 2 };

const disc = (name) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const i64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
const u8 = (n) => Buffer.from([n]);

const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const vaultPda = (worker, mint) => pda([Buffer.from("vault"), worker.toBuffer(), mint.toBuffer()]);
export const vaultTokensPda = (vault) => pda([Buffer.from("vault_tokens"), vault.toBuffer()]);
export const poolPda = (sponsor, mint) => pda([Buffer.from("pool"), sponsor.toBuffer(), mint.toBuffer()]);
export const poolTokensPda = (pool) => pda([Buffer.from("pool_tokens"), pool.toBuffer()]);
export const recordPda = (pool, vault) => pda([Buffer.from("match"), pool.toBuffer(), vault.toBuffer()]);

const w = (pubkey) => ({ pubkey, isSigner: false, isWritable: true });
const r = (pubkey) => ({ pubkey, isSigner: false, isWritable: false });
const sw = (pubkey) => ({ pubkey, isSigner: true, isWritable: true });
const sr = (pubkey) => ({ pubkey, isSigner: true, isWritable: false });
const ix = (keys, data) => new TransactionInstruction({ programId: PROGRAM_ID, keys, data: Buffer.concat(data) });

export function openVault({ payer, worker, mint, payoutStart, periodSecs, periods }) {
  const vault = vaultPda(worker, mint);
  return ix(
    [sw(payer), sr(worker), r(mint), w(vault), w(vaultTokensPda(vault)), r(TOKEN_PROGRAM_ID), r(SystemProgram.programId)],
    [disc("open_vault"), i64(payoutStart), i64(periodSecs), u16(periods)],
  );
}

export function contribute({ contributor, from, mint, vault, amount, kind }) {
  return ix(
    [sr(contributor), w(from), r(mint), w(vault), w(vaultTokensPda(vault)), r(TOKEN_PROGRAM_ID)],
    [disc("contribute"), u64(amount), u8(kind)],
  );
}

export function createMatchPool({ sponsor, mint, matchBps, capPerWorker }) {
  const pool = poolPda(sponsor, mint);
  return ix(
    [sw(sponsor), r(mint), w(pool), w(poolTokensPda(pool)), r(TOKEN_PROGRAM_ID), r(SystemProgram.programId)],
    [disc("create_match_pool"), u16(matchBps), u64(capPerWorker)],
  );
}

export function fundPool({ funder, from, mint, pool, amount }) {
  return ix(
    [sr(funder), w(from), r(mint), r(pool), w(poolTokensPda(pool)), r(TOKEN_PROGRAM_ID)],
    [disc("fund_pool"), u64(amount)],
  );
}

export function joinPool({ payer, worker, vault, pool }) {
  return ix(
    [sw(payer), sr(worker), r(vault), w(pool), w(recordPda(pool, vault)), r(SystemProgram.programId)],
    [disc("join_pool")],
  );
}

export function saveWithMatch({ worker, from, mint, vault, pool, amount }) {
  return ix(
    [
      sr(worker), w(from), r(mint), w(vault), w(vaultTokensPda(vault)),
      w(pool), w(poolTokensPda(pool)), w(recordPda(pool, vault)), r(TOKEN_PROGRAM_ID),
    ],
    [disc("save_with_match"), u64(amount)],
  );
}

export function claim({ worker, mint, vault, to }) {
  return ix(
    [sr(worker), r(mint), w(vault), w(vaultTokensPda(vault)), w(to), r(TOKEN_PROGRAM_ID)],
    [disc("claim")],
  );
}

export function decodeVault(data) {
  const b = Buffer.from(data);
  const pk = (o) => new PublicKey(b.subarray(o, o + 32)).toBase58();
  const n = (o) => Number(b.readBigUInt64LE(o));
  return {
    worker: pk(8), mint: pk(40),
    payoutStart: Number(b.readBigInt64LE(72)), periodSecs: Number(b.readBigInt64LE(80)),
    periods: b.readUInt16LE(88),
    ownSaved: n(90), employerIn: n(98), familyIn: n(106), otherIn: n(114), matchedIn: n(122),
    claimed: n(130), openedAt: Number(b.readBigInt64LE(138)),
  };
}
