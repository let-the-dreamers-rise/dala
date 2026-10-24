import { route } from "../lib/http.js";
import { listPools } from "../lib/chain.js";
import { CONFIG } from "../lib/config.js";

// GET: every match pool for the demo stablecoin, with what each has left to give.
export default route(["GET"], async (_body, _req, res) => {
  const pools = await listPools();
  res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=20");
  return { pools, defaultPool: CONFIG.pool };
});
