import { route, HttpError, parsePubkey } from "../lib/http.js";
import { rateLimit } from "../lib/limit.js";
import { conn, MINT } from "../lib/relayer.js";
import { vaultPda, vaultTokensPda, decodeVault, tokenAmount } from "../lib/dala.js";

// GET ?workers=a,b,c: vault status for up to 25 worker wallets (employer roster view).
export default route(["GET"], async (_body, req) => {
  rateLimit(req, "vaults", 120, 10 * 60 * 1000);
  const raw = new URL(req.url, "http://x").searchParams.get("workers") || "";
  const workers = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (workers.length > 25) throw new HttpError(400, "At most 25 workers at a time");
  const keys = workers.map((w) => parsePubkey(w, "Worker wallet"));
  const vaults = keys.map((k) => vaultPda(k, MINT));
  const accs = await conn.getMultipleAccountsInfo([...vaults, ...vaults.map((v) => vaultTokensPda(v))]);
  return workers.map((w, i) => {
    const acc = accs[i];
    const tok = accs[i + vaults.length];
    if (!acc) return { worker: w, vault: null };
    return { worker: w, vault: { address: vaults[i].toBase58(), ...decodeVault(acc.data), locked: tok ? tokenAmount(tok.data) : 0 } };
  });
});
