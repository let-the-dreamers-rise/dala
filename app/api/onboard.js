import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction } from "@solana/spl-token";
import { route } from "../lib/http.js";
import { rateLimit } from "../lib/limit.js";
import { requireSession } from "../lib/session.js";
import { conn, relayer, MINT, ataOf, sendAndConfirm, freshBlockhash } from "../lib/relayer.js";
import { USDC, tokenAmount, familyOwner } from "../lib/dala.js";

const STARTING_BALANCE = { worker: 500, employer: 2_000, foundation: 20_000 };
// A foundation pays rent for its own pool accounts, so it gets a little devnet SOL once.
const FOUNDATION_SOL = 20_000_000;

// POST: set up the signed-in user's demo wallet for their current role. One wallet can act in
// every role, so this tops the balance up to the role's starting level when it has run low,
// and does nothing when the wallet already has enough.
export default route(["POST"], async (_body, req) => {
  const s = requireSession(req);
  rateLimit(req, "onboard", 30, 60 * 60 * 1000);
  const r = relayer();
  const owner = new PublicKey(s.sub);
  const wallet = ataOf(owner);
  const family = ataOf(familyOwner(owner));
  const target = STARTING_BALANCE[s.role] * USDC;

  const [walletAcc, familyAcc, lamports] = await Promise.all([
    conn.getAccountInfo(wallet), conn.getAccountInfo(family), conn.getBalance(owner),
  ]);
  const balance = walletAcc ? tokenAmount(walletAcc.data) : 0;
  const tx = new Transaction();
  if (!walletAcc) tx.add(createAssociatedTokenAccountIdempotentInstruction(r.publicKey, wallet, owner, MINT));
  if (s.role === "worker" && !familyAcc) {
    tx.add(createAssociatedTokenAccountIdempotentInstruction(r.publicKey, family, familyOwner(owner), MINT));
  }
  if (s.role === "foundation" && lamports < FOUNDATION_SOL / 2) {
    tx.add(SystemProgram.transfer({ fromPubkey: r.publicKey, toPubkey: owner, lamports: FOUNDATION_SOL }));
  }
  const topUp = balance < target / 2 ? target - balance : 0;
  if (topUp) tx.add(createMintToInstruction(MINT, wallet, r.publicKey, topUp));

  let sig = null;
  if (tx.instructions.length) {
    tx.feePayer = r.publicKey;
    tx.recentBlockhash = await freshBlockhash();
    tx.sign(r);
    sig = await sendAndConfirm(tx);
  }
  return { wallet: wallet.toBase58(), family: s.role === "worker" ? family.toBase58() : null, sig, funded: topUp };
});
