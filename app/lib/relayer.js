// The relayer pays every network fee and rent, so workers and employers never need SOL.
// It also mints the devnet demo stablecoin and acts as the foundation that sponsors the match pool.
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { CONFIG } from "./config.js";

export const conn = new Connection(process.env.RPC_URL || "https://api.devnet.solana.com", "confirmed");
export const MINT = new PublicKey(CONFIG.mint);
export const POOL = new PublicKey(CONFIG.pool);
export const PERIOD_SECS = CONFIG.periodSecs;

let cached;
export function relayer() {
  if (!cached) {
    const raw = process.env.RELAYER_SECRET;
    if (!raw) throw new Error("RELAYER_SECRET is not set");
    cached = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    if (cached.publicKey.toBase58() !== CONFIG.relayer) throw new Error("RELAYER_SECRET does not match config");
  }
  return cached;
}

export const ataOf = (owner) => getAssociatedTokenAddressSync(MINT, owner, true);

/** Send a fully signed transaction and wait for confirmation. Preflight errors carry program logs. */
export async function sendAndConfirm(tx) {
  const sig = await conn.sendRawTransaction(tx.serialize(), { preflightCommitment: "confirmed" });
  for (let i = 0; i < 40; i++) {
    const { value } = await conn.getSignatureStatuses([sig]);
    const st = value[0];
    if (st?.err) throw Object.assign(new Error("Transaction failed"), { logs: [] });
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`Transaction ${sig} was not confirmed in time`);
}

export async function freshBlockhash() {
  return (await conn.getLatestBlockhash("confirmed")).blockhash;
}
