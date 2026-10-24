import { Transaction } from "@solana/web3.js";
import { route, HttpError } from "../lib/http.js";
import { rateLimit } from "../lib/limit.js";
import { requireSession } from "../lib/session.js";
import { relayer, sendAndConfirm } from "../lib/relayer.js";
import { PROGRAM_ID, DISC } from "../lib/dala.js";

const ALLOWED = {
  worker: new Set([DISC.open_vault, DISC.join_pool, DISC.save_with_match, DISC.claim]),
  employer: new Set([DISC.contribute]),
};
// Instructions where the relayer may appear, and only as the rent payer in slot 0.
const RELAYER_PAYS_RENT = new Set([DISC.open_vault, DISC.join_pool]);

/**
 * The relayer co-signs only transactions it would have built itself: Dala instructions
 * allowed for the user's role, signed by the signed-in user, with the relayer as fee payer.
 */
export function checkTransaction(tx, session, relayerKey) {
  if (!tx.feePayer?.equals(relayerKey)) throw new HttpError(400, "Fee payer must be the Dala relayer");
  if (tx.instructions.length < 1 || tx.instructions.length > 2) throw new HttpError(400, "Unexpected transaction shape");
  const allowed = ALLOWED[session.role];
  for (const ix of tx.instructions) {
    if (!ix.programId.equals(PROGRAM_ID)) throw new HttpError(400, "Only Dala instructions can be relayed");
    const d = Buffer.from(ix.data.subarray(0, 8)).toString("hex");
    if (!allowed.has(d)) throw new HttpError(403, "That instruction is not allowed for your role");
    ix.keys.forEach((k, i) => {
      if (k.pubkey.equals(relayerKey) && !(i === 0 && RELAYER_PAYS_RENT.has(d))) {
        throw new HttpError(400, "The relayer can only pay fees and rent");
      }
    });
    const userSlot = RELAYER_PAYS_RENT.has(d) ? 1 : 0;
    if (ix.keys[userSlot]?.pubkey.toBase58() !== session.sub) {
      throw new HttpError(403, "Transactions must be signed by the account you signed in with");
    }
  }
}

// POST { tx }: verify, co-sign as fee payer, send, confirm.
export default route(["POST"], async (body, req) => {
  const s = requireSession(req);
  rateLimit(req, "submit", 60, 10 * 60 * 1000);
  const r = relayer();
  let tx;
  try {
    tx = Transaction.from(Buffer.from(String(body.tx || ""), "base64"));
  } catch {
    throw new HttpError(400, "Transaction could not be decoded");
  }
  checkTransaction(tx, s, r.publicKey);
  tx.partialSign(r);
  if (!tx.verifySignatures()) throw new HttpError(400, "Transaction is missing your signature");
  return { sig: await sendAndConfirm(tx) };
});
