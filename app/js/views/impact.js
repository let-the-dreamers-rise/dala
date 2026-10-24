// Public Impact tab: totals across every Dala vault and pool, read live from the chain.
import * as api from "../api.js";
import { el, usd, short, card, ago } from "../ui.js";

const tabs = [{ id: "impact", label: "Impact" }];
const r = {};

function mount() {
  r.stats = el("div", { class: "impact-grid" });
  r.recent = el("ul", { class: "ledger" });
  r.when = el("p", { class: "fine" });
  return [["impact", el("div", {},
    card("", el("span", { class: "eyebrow" }, "Public, live from Solana devnet"), el("h2", {}, "What Dala has done so far"), r.when, r.stats),
    card("", el("span", { class: "eyebrow" }, "Newest vaults"), el("h2", {}, "Workers saving now"),
      el("p", { class: "fine" }, "Each one opens that worker's public passbook. Wallets are pseudonymous: no names are stored on chain."), r.recent))]];
}

async function show() {
  r.when.textContent = "Reading the chain...";
  try {
    const d = await api.impact();
    const tiles = [
      ["Workers with a vault", String(d.vaults)],
      ["Saved by workers", usd(d.saved)],
      ["Matched by foundations", usd(d.matched)],
      ["Paid in by employers", usd(d.employer)],
      ["Sent by families", usd(d.family)],
      ["Paid out as pensions", usd(d.paidOut)],
      ["Match pools", String(d.pools)],
      ["Left in pools to give", usd(d.poolFunds)],
    ];
    r.stats.replaceChildren(...tiles.map(([k, v]) => el("div", { class: "tile" }, el("span", {}, k), el("b", { class: "num" }, v))));
    r.recent.replaceChildren(...d.recent.map((v) => el("li", { class: "ev" },
      el("div", { class: "what" }, el("a", { href: `/vault.html?w=${v.worker}` }, `Worker ${short(v.worker)}`), el("small", {}, `opened ${ago(v.openedAt)} · ${usd(v.claimed)} paid out`)),
      el("span", { class: "amt num" }, usd(v.total)))));
    if (!d.recent.length) r.recent.append(el("li", { class: "empty" }, "No vaults yet."));
    r.when.textContent = `Updated ${new Date().toLocaleTimeString()}.`;
  } catch (err) {
    r.when.textContent = `Could not read the chain: ${err.message}`;
  }
}

export default { tabs, mount, show };
