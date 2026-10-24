import { PublicKey, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction } from "@solana/spl-token";
import { route } from "../lib/http.js";
import { rateLimit } from "../lib/limit.js";
import { requireSession } from "../lib/session.js";
import { conn, relayer, MINT, ataOf, sendAndConfirm, freshBlockhash } from "../lib/relayer.js";
import { USDC, tokenAmount, familyOwner } from "../lib/dala.js";

const STARTING_BALANCE = { worker: 500, employer: 2_000 };

// POST: create the signed-in user's demo stablecoin wallet and fund it once.
export default route(["POST"], async (_body, req) => {
  const s = requireSession(req);
  rateLimit(req, "onboard", 10, 60 * 60 * 1000);
  const r = relayer();
  const owner = new PublicKey(s.sub);
  const wallet = ataOf(owner);
  const family = ataOf(familyOwner(owner));

  const existing = await conn.getAccountInfo(wallet);
  const alreadyFunded = existing && tokenAmount(existing.data) > 0;
  let sig = null;
  if (!existing || !alreadyFunded) {
    const tx = new Transaction();
    tx.add(createAssociatedTokenAccountIdempotentInstruction(r.publicKey, wallet, owner, MINT));
    if (s.role === "worker") {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(r.publicKey, family, familyOwner(owner), MINT));
    }
    tx.add(createMintToInstruction(MINT, wallet, r.publicKey, STARTING_BALANCE[s.role] * USDC));
    tx.feePayer = r.publicKey;
    tx.recentBlockhash = await freshBlockhash();
    tx.sign(r);
    sig = await sendAndConfirm(tx);
  }
  return { wallet: wallet.toBase58(), family: s.role === "worker" ? family.toBase58() : null, sig, funded: !alreadyFunded };
});
