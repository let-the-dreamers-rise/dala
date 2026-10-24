import { route } from "../lib/http.js";
import { listVaults, listPools } from "../lib/chain.js";

// GET: totals across every Dala vault and pool for the demo stablecoin. Public.
export default route(["GET"], async (_body, _req, res) => {
  const [vaults, pools] = await Promise.all([listVaults(), listPools()]);
  const sum = (k) => vaults.reduce((a, v) => a + v[k], 0);
  const now = Math.floor(Date.now() / 1000);
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=60");
  return {
    vaults: vaults.length,
    retired: vaults.filter((v) => v.payoutStart <= now).length,
    saved: sum("ownSaved"),
    employer: sum("employerIn"),
    family: sum("familyIn"),
    other: sum("otherIn"),
    matched: sum("matchedIn"),
    paidOut: sum("claimed"),
    pools: pools.length,
    poolFunds: pools.reduce((a, p) => a + p.available, 0),
    recent: vaults
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, 8)
      .map((v) => ({ address: v.address, worker: v.worker, openedAt: v.openedAt, total: v.ownSaved + v.employerIn + v.familyIn + v.otherIn + v.matchedIn, claimed: v.claimed })),
  };
});
