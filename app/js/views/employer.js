// Employer workspace: Workers (roster), Payroll (batch pay), Statement (proof of contributions).
import * as api from "../api.js";
import { el, usd, short, explorer, link, card, busy, attempt, flash, ago, planned } from "../ui.js";
import { vaultTotal } from "../passbook.js";

const tabs = [
  { id: "workers", label: "Workers" },
  { id: "payroll", label: "Payroll" },
  { id: "statement", label: "Statement" },
];
const MAX_RUN = 5;
const USD = 1e6;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

let h0 = null;
let roster = [];   // [{ worker, name }] kept in this browser
let vaults = {};   // worker -> vault | null
let paid = [];     // contributions by me: [{ sig, time, vault, amount }]
const r = {};

const rosterKey = () => `dala.roster.${h0.ctx.session.pubkey}`;
function loadRoster() {
  try { roster = JSON.parse(localStorage.getItem(rosterKey()) || "[]"); } catch { roster = []; }
}
function saveRoster(next) {
  roster = next;
  try { localStorage.setItem(rosterKey(), JSON.stringify(roster)); } catch { /* kept in memory */ }
}
const nameOf = (worker) => roster.find((x) => x.worker === worker)?.name || short(worker);
const paidTo = (vault) => paid.filter((p) => p.vault === vault).reduce((a, p) => a + p.amount, 0);

function addWorker(worker, name) {
  const w = worker.trim();
  if (!BASE58.test(w)) throw new Error("That does not look like a Solana wallet address.");
  if (roster.some((x) => x.worker === w)) throw new Error("That worker is already on your list.");
  const fallback = w === h0.ctx.session.pubkey ? "You (testing both sides)" : `Worker ${roster.length + 1}`;
  saveRoster([...roster, { worker: w, name: name.trim().slice(0, 40) || fallback }]);
}

async function loadData() {
  const me = h0.ctx.state?.me;
  const [vs, ledger] = await Promise.all([
    roster.length ? api.vaults(roster.map((x) => x.worker)) : [],
    me ? api.ledger(me.wallet.address, 40) : [],
  ]);
  vaults = Object.fromEntries(vs.map((x) => [x.worker, x.vault]));
  paid = ledger.flatMap((tx) => tx.events.filter((e) => e.type === "contributed" && e.from === me.pubkey)
    .map((e) => ({ sig: tx.sig, time: tx.time, vault: e.vault, amount: e.amount })));
  draw();
}
const reload = () => loadData().catch((err) => flash(`Could not read the chain: ${err.message}`, true));

// ---- Workers -------------------------------------------------------------

function workersPanel() {
  const name = el("input", { type: "text", id: "w-name", maxlength: 40, placeholder: "Maria Santos", autocomplete: "off" });
  const addr = el("input", { type: "text", id: "w-addr", placeholder: "Worker's wallet address", autocomplete: "off", spellcheck: "false" });
  const form = el("form", { class: "form-grid" },
    el("label", { for: "w-name" }, "Name"), name, el("label", { for: "w-addr" }, "Wallet"), addr,
    el("button", { class: "btn", type: "submit" }, "Add worker"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      addWorker(addr.value, name.value);
      addr.value = name.value = "";
      flash("Worker added.");
      reload();
    } catch (err) { flash(err.message, true); }
  });
  r.rows = el("tbody");
  r.summary = el("p", { class: "fine" });
  r.balance = el("p", { class: "big num" });
  return el("div", {},
    el("div", { class: "duo" },
      card("mini", el("span", { class: "eyebrow" }, "Payroll wallet"), r.balance, el("small", { class: "fine" }, "Demo dollars. Dala pays the network fees.")),
      card("mini", el("span", { class: "eyebrow" }, "How it works"),
        el("p", {}, "Each worker sends you their Dala link. Payments go into their locked vault, not their pocket, and are recorded under your name."))),
    card("", el("span", { class: "eyebrow" }, "Your workers"), el("h2", {}, "Pension status"), r.summary,
      el("div", { class: "table-wrap" }, el("table", { class: "roster" },
        el("thead", {}, el("tr", {}, ...["Worker", "Vault", "Balance", "Paid by you", ""].map((t) => el("th", { scope: "col" }, t)))), r.rows))),
    card("", el("span", { class: "eyebrow" }, "Add a worker"), el("h2", {}, "Someone new on your team"),
      el("p", { class: "fine" }, "Opening a worker's Dala link adds them automatically. You can also paste their wallet address."), form));
}

function drawWorkers() {
  const now = h0.now();
  r.balance.textContent = usd(h0.ctx.state?.me?.wallet.amount || 0);
  const open = roster.filter((x) => vaults[x.worker]).length;
  r.summary.textContent = roster.length ? `${roster.length} worker${roster.length === 1 ? "" : "s"}, ${open} with an open vault.` : "No workers yet. Add one below, or open a worker's Dala link.";
  r.rows.replaceChildren(...roster.map((x) => {
    const v = vaults[x.worker];
    const status = v === undefined ? "Checking" : v ? (v.payoutStart <= now ? "Paying out" : "Saving") : "No vault yet";
    return el("tr", {},
      el("td", {}, el("strong", {}, x.name), el("br"), link(explorer("address", x.worker), short(x.worker), "mono")),
      el("td", {}, el("span", { class: `status ${v ? "ok" : "wait"}` }, status)),
      el("td", { class: "num" }, v ? usd(vaultTotal(v)) : "-"),
      el("td", { class: "num" }, v ? usd(paidTo(v.address)) : "-"),
      el("td", {}, el("button", { type: "button", class: "linkish", onclick: () => { saveRoster(roster.filter((y) => y.worker !== x.worker)); draw(); } }, "Remove")));
  }));
}

// ---- Payroll -------------------------------------------------------------

function payrollPanel() {
  r.payRows = el("div", { class: "pay-rows" });
  r.payTotal = el("p", { class: "preview" });
  r.payBtn = el("button", { class: "btn", type: "submit" }, "Pay pensions");
  const form = el("form", { class: "stack" }, r.payRows, r.payTotal, r.payBtn);
  form.addEventListener("input", drawTotal);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const payments = selected();
    if (!payments.length) { flash("Tick at least one worker.", true); return; }
    if (payments.length > MAX_RUN) { flash(`Pay up to ${MAX_RUN} workers per run.`, true); return; }
    const sum = payments.reduce((a, p) => a + p.amount, 0);
    busy(r.payBtn, "Paying", async () => {
      await attempt(`Paid ${usd(sum * USD)} into ${payments.length} pension${payments.length === 1 ? "" : "s"}`,
        () => api.act(h0.needsWallet(), { action: "pay", payments: payments.map(({ worker, amount }) => ({ worker, amount })) }));
      await h0.refresh();
      await reload();
    });
  });
  return el("div", {},
    card("", el("span", { class: "eyebrow" }, "Payroll run"), el("h2", {}, "Pay into your workers' pensions"),
      el("p", {}, `One signature pays up to ${MAX_RUN} workers. Only workers with an open vault can be paid.`), form),
    card("", el("span", { class: "eyebrow" }, "Coming next"),
      planned("Monthly autopay", "Approve once, and Dala pays each worker's pension every payday."),
      planned("Payroll file import", "Upload your payroll CSV and pay everyone in one go.")));
}

function selected() {
  return [...r.payRows.querySelectorAll(".pay-row")].filter((row) => row.querySelector("input[type=checkbox]").checked)
    .map((row) => ({ worker: row.dataset.worker, amount: Math.round(Number(row.querySelector("input[type=number]").value) || 0) }));
}

function drawTotal() {
  const s = selected();
  const sum = s.reduce((a, p) => a + p.amount, 0);
  r.payTotal.textContent = s.length ? `${s.length} worker${s.length === 1 ? "" : "s"}, ${usd(sum * USD)} in total.${s.length > MAX_RUN ? ` Untick some: the limit is ${MAX_RUN} per run.` : ""}` : "";
  r.payBtn.textContent = s.length ? `Pay ${usd(sum * USD)}` : "Pay pensions";
}

function drawPayroll() {
  const keep = new Map([...r.payRows.querySelectorAll(".pay-row")].map((row) => [row.dataset.worker, {
    on: row.querySelector("input[type=checkbox]").checked, amount: row.querySelector("input[type=number]").value,
  }]));
  const payable = roster.filter((x) => vaults[x.worker]);
  r.payRows.replaceChildren(...payable.map((x, i) => {
    const prev = keep.get(x.worker);
    return el("div", { class: "pay-row", "data-worker": x.worker },
      el("label", { class: "inline" }, el("input", { type: "checkbox", checked: prev ? prev.on : i < MAX_RUN }), el("strong", {}, x.name)),
      el("label", { class: "inline" }, "$", el("input", { type: "number", min: 1, max: 1000, value: prev?.amount ?? 50, "aria-label": `Amount for ${x.name}` })));
  }));
  if (!payable.length) {
    r.payRows.append(el("div", { class: "notice" }, el("p", {}, roster.length ? "None of your workers has opened a vault yet." : "Add workers first."),
      el("button", { type: "button", class: "btn small", onclick: () => h0.go("workers") }, "Workers")));
  }
  r.payBtn.hidden = !payable.length;
  drawTotal();
}

// ---- Statement -----------------------------------------------------------

function statementPanel() {
  r.stRows = el("tbody");
  r.stTotal = el("p", { class: "big num" });
  r.stWho = el("p", { class: "mono" });
  return el("div", {}, card("statement",
    el("div", { class: "guide-head" },
      el("div", {}, el("span", { class: "eyebrow" }, "Contribution statement"), el("h2", {}, "Pension payments you made")),
      el("button", { type: "button", class: "btn small quiet noprint", onclick: () => print() }, "Print")),
    r.stWho, r.stTotal,
    el("div", { class: "table-wrap" }, el("table", { class: "roster" },
      el("thead", {}, el("tr", {}, ...["Date", "Worker", "Amount", "Proof"].map((t) => el("th", { scope: "col" }, t)))), r.stRows)),
    el("p", { class: "fine" }, "Every line links to its Solana transaction, so a worker, an auditor or a regulator can check it without asking you.")));
}

function drawStatement() {
  const byVault = Object.fromEntries(Object.entries(vaults).filter(([, v]) => v).map(([w, v]) => [v.address, w]));
  r.stWho.textContent = `Employer wallet ${h0.ctx.session.pubkey}`;
  r.stTotal.textContent = `${usd(paid.reduce((a, p) => a + p.amount, 0))} across ${paid.length} payment${paid.length === 1 ? "" : "s"}`;
  r.stRows.replaceChildren(...paid.map((p) => el("tr", {},
    el("td", {}, p.time ? new Date(p.time * 1000).toLocaleString() : ago(p.time)),
    el("td", {}, byVault[p.vault] ? nameOf(byVault[p.vault]) : `Vault ${short(p.vault)}`),
    el("td", { class: "num" }, usd(p.amount)),
    el("td", {}, link(explorer("tx", p.sig), short(p.sig), "mono")))));
  if (!paid.length) r.stRows.append(el("tr", {}, el("td", { colspan: 4, class: "empty" }, "No pension payments yet.")));
}

// ---- View contract -------------------------------------------------------

function draw() {
  if (!h0?.ctx.state?.me) return;
  drawWorkers();
  drawPayroll();
  drawStatement();
}

let loaded = false;

function mount(h) {
  h0 = h;
  loaded = false;
  loadRoster();
  vaults = {};
  paid = [];
  const invited = h.ctx.invitedBy;
  if (invited && !roster.some((x) => x.worker === invited)) {
    try { addWorker(invited, ""); flash("The worker who invited you is on your list. Pay into their pension from Payroll."); } catch { /* invalid link */ }
  }
  return [["workers", workersPanel()], ["payroll", payrollPanel()], ["statement", statementPanel()]];
}

function update() {
  draw();
  if (!loaded) { loaded = true; reload(); }
}

function show(tab) {
  if (tab === "payroll" || tab === "statement" || tab === "workers") reload();
}

export default { tabs, mount, update, show };
