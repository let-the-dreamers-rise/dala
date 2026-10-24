// Foundation workspace: My pool (create, fund, stats) and Matches (every worker the pool reached).
import * as api from "../api.js";
import { el, usd, short, explorer, link, card, busy, attempt, flash, ago, planned, chips } from "../ui.js";

const tabs = [
  { id: "pool", label: "My pool" },
  { id: "matches", label: "Matches" },
];
const USD = 1e6;
const whole = (input) => Math.round(Number(input.value) || 0);
const r = {};
let h0 = null;

function createCard() {
  const pct = el("input", { type: "number", id: "f-pct", min: 10, max: 300, value: 100, inputmode: "numeric" });
  const cap = el("input", { type: "number", id: "f-cap", min: 10, max: 1000, value: 200, inputmode: "numeric" });
  const explain = el("p", { class: "preview" });
  const draw = () => {
    explain.textContent = `When a worker saves $10, your pool adds $${((10 * whole(pct)) / 100).toFixed(2).replace(/\.00$/, "")}. Each worker can receive at most $${whole(cap)} from you in total.`;
  };
  const form = el("form", { class: "form-grid" },
    el("label", { for: "f-pct" }, "Match rate (%)"), pct, el("label", { for: "f-cap" }, "Cap per worker ($)"), cap,
    el("button", { class: "btn", type: "submit" }, "Create my pool"));
  form.addEventListener("input", draw);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, "Creating", async () => {
      await attempt("Created your match pool", () => api.act(h0.needsWallet(), { action: "create_pool", matchPercent: whole(pct), cap: whole(cap) }));
      await h0.refresh();
    });
  });
  draw();
  return card("", el("span", { class: "eyebrow" }, "Step 1"), el("h2", {}, "Create a match pool"),
    el("p", {}, "Your pool tops up what migrant workers save for retirement. The rules are fixed in code: you set the rate and the cap, and the money can only go into workers' locked vaults."),
    form, explain);
}

function fundCard() {
  const amount = el("input", { type: "number", id: "f-fund", min: 1, max: 20000, value: 1000, inputmode: "numeric" });
  const form = el("form", { class: "stack" },
    el("label", { for: "f-fund", class: "label" }, "Add funds to your pool"),
    el("div", { class: "inline wrap" }, amount, chips(amount, [500, 1000, 5000])),
    el("button", { class: "btn", type: "submit" }, "Fund pool"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const a = whole(amount);
    busy(e.submitter, "Funding", async () => {
      await attempt(`Added ${usd(a * USD)} to your pool`, () => api.act(h0.needsWallet(), { action: "fund_pool", amount: a }));
      await h0.refresh();
    });
  });
  return form;
}

function poolPanel() {
  r.create = createCard();
  r.stats = el("dl", { class: "stats big-stats" });
  r.poolLink = el("p", { class: "fine" });
  r.balance = el("p", { class: "big num" });
  r.mine = card("", el("span", { class: "eyebrow" }, "Your match pool"), el("h2", {}, "Live on Solana devnet"), r.poolLink, r.stats, fundCard(),
    el("p", { class: "fine" }, "Workers see your pool in their Save tab and can choose it. Funds in the pool can only leave as a match into a worker's vault."));
  return el("div", {},
    el("div", { class: "duo" },
      card("mini", el("span", { class: "eyebrow" }, "Foundation wallet"), r.balance, el("small", { class: "fine" }, "Demo dollars for this trial.")),
      card("mini", el("span", { class: "eyebrow" }, "Why fund here"), el("p", {}, "Every dollar lands in a named worker's retirement, and you can prove it, line by line."))),
    r.create, r.mine,
    card("", el("span", { class: "eyebrow" }, "Coming next"),
      planned("Eligibility lists", "Match only workers verified by a partner, such as domestic workers in Hong Kong."),
      planned("Impact reports", "A quarterly export for your board and donors.")));
}

function drawPool() {
  const me = h0.ctx.state.me;
  const p = me.myPool;
  r.balance.textContent = usd(me.wallet.amount || 0);
  r.create.hidden = Boolean(p);
  r.mine.hidden = !p;
  if (!p) return;
  r.poolLink.replaceChildren("Pool ", link(explorer("address", p.address), short(p.address), "mono"));
  const rows = [
    ["Match rate", `${p.matchBps / 100}%`],
    ["Cap per worker", usd(p.capPerWorker)],
    ["Workers reached", String(p.workers)],
    ["Matched so far", usd(p.totalMatched)],
    ["Left to give", usd(p.available)],
  ];
  r.stats.replaceChildren(...rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
}

function matchesPanel() {
  r.mList = el("ul", { class: "ledger" });
  r.mSum = el("p", { class: "fine" });
  r.all = el("ul", { class: "ledger" });
  return el("div", {},
    card("", el("div", { class: "guide-head" },
      el("div", {}, el("span", { class: "eyebrow" }, "Matches"), el("h2", {}, "Every worker your pool reached")),
      el("button", { type: "button", class: "btn small quiet", onclick: loadMatches }, "Refresh")), r.mSum, r.mList),
    card("", el("span", { class: "eyebrow" }, "All pools"), el("h2", {}, "Foundations matching on Dala"), r.all));
}

async function loadMatches() {
  const p = h0.ctx.state?.me?.myPool;
  try {
    const [mine, all] = await Promise.all([p ? api.ledger(p.address, 40) : [], api.pools()]);
    const saves = mine.flatMap((tx) => tx.events.filter((e) => e.type === "saved" && e.pool === p.address).map((e) => ({ ...e, sig: tx.sig, time: tx.time })));
    const workers = new Set(saves.map((s) => s.vault)).size;
    r.mSum.textContent = p ? `${saves.length} match${saves.length === 1 ? "" : "es"} to ${workers} worker vault${workers === 1 ? "" : "s"} in recent history.` : "Create your pool first.";
    r.mList.replaceChildren(...saves.map((s) => el("li", { class: "ev own" },
      el("div", { class: "what" }, el("strong", {}, `Worker saved ${usd(s.amount)}`),
        el("small", {}, "vault ", link(explorer("address", s.vault), short(s.vault), "mono"), ` · ${ago(s.time)} · `, link(explorer("tx", s.sig), "tx", "mono"))),
      el("span", { class: "amt num" }, `+${usd(s.matched)}`))));
    if (!saves.length) r.mList.append(el("li", { class: "empty" }, "No matches yet. Workers who choose your pool appear here."));
    r.all.replaceChildren(...all.pools.map((x) => el("li", { class: "ev" },
      el("div", { class: "what" }, el("strong", {}, x.address === all.defaultPool ? "Dala demo foundation" : x.sponsor === h0.ctx.session.pubkey ? "You" : `Foundation ${short(x.sponsor)}`),
        el("small", {}, `${x.matchBps / 100}% match, up to ${usd(x.capPerWorker)} · ${x.workers} workers · ${usd(x.available)} left`)),
      el("span", { class: "amt num" }, usd(x.totalMatched)))));
  } catch (err) {
    flash(`Could not read the chain: ${err.message}`, true);
  }
}

function mount(h) {
  h0 = h;
  return [["pool", poolPanel()], ["matches", matchesPanel()]];
}

function update() {
  if (h0?.ctx.state?.me) drawPool();
}

function show(tab) {
  if (tab === "matches") loadMatches();
}

export default { tabs, mount, update, show };
