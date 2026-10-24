import { PublicKey, Transaction } from "@solana/web3.js";
import { route, HttpError, parseWhole } from "../lib/http.js";
import { rateLimit } from "../lib/limit.js";
import { requireSession } from "../lib/session.js";
import { conn, relayer, MINT, ataOf, sendAndConfirm, freshBlockhash } from "../lib/relayer.js";
import * as dala from "../lib/dala.js";

// POST { kind, amount }: a simulated employer or family member pays into the signed-in worker's vault.
// Lets one person try the whole story alone; the relayer signs as the payer and is tagged as such.
export default route(["POST"], async (body, req) => {
  const s = requireSession(req, "worker");
  rateLimit(req, "topup", 30, 60 * 60 * 1000);
  if (!(body.kind in dala.KIND) || body.kind === "other") throw new HttpError(400, "Choose employer or family");
  const amount = parseWhole(body.amount, "Amount", 1, 300);
  const r = relayer();
  const vault = dala.vaultPda(new PublicKey(s.sub), MINT);
  if (!(await conn.getAccountInfo(vault))) throw new HttpError(409, "Open your vault first");
  const tx = new Transaction().add(
    dala.contribute({ contributor: r.publicKey, from: ataOf(r.publicKey), mint: MINT, vault, amount: amount * dala.USDC, kind: dala.KIND[body.kind] }),
  );
  tx.feePayer = r.publicKey;
  tx.recentBlockhash = await freshBlockhash();
  tx.sign(r);
  return { sig: await sendAndConfirm(tx) };
});
