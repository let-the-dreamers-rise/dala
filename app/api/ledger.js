import { route, parsePubkey, parseWhole } from "../lib/http.js";
import { rateLimit } from "../lib/limit.js";
import { ledger } from "../lib/chain.js";

// GET ?address=&limit=: decoded Dala events for a vault, pool or wallet, newest first.
export default route(["GET"], async (_body, req, res) => {
  rateLimit(req, "ledger", 120, 10 * 60 * 1000);
  const url = new URL(req.url, "http://x");
  const address = parsePubkey(url.searchParams.get("address"), "address").toBase58();
  const limit = url.searchParams.has("limit") ? parseWhole(url.searchParams.get("limit"), "limit", 1, 40) : 20;
  res.setHeader("Cache-Control", "s-maxage=4, stale-while-revalidate=20");
  return { address, items: await ledger(address, limit) };
});
