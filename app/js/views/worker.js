// Worker workspace: Home (guide + passbook), Save, Send home, Payouts, History, Share.
import * as api from "../api.js";
import { el, usd, short, explorer, link, card, busy, attempt, flag } from "../ui.js";
import { vaultTotal, breakdown, clockText, schedule } from "../passbook.js";
import { savePanel, sendPanel, payoutsPanel, historyPanel, sharePanel } from "./worker-panels.js";

const tabs = [
  { id: "home", label: "Home" },
  { id: "save", label: "Save" },
  { id: "send", label: "Send home" },
  { id: "payouts", label: "Payouts" },
  { id: "history", label: "History" },
  { id: "share", label: "Share" },
];

let refs = null;

// ---- Getting started -----------------------------------------------------

function steps(me, h) {
  const v = me.vault;
  const tried = flag("triedEarly") === "1";
  return [
    { title: "Create your wallet", detail: me.method === "passkey" ? "Done. It opens with your fingerprint or face." : "Done. It is saved in this browser.", done: true },
    { title: "Open your vault", detail: "Choose when your monthly payouts begin.", done: Boolean(v), action: "Open it", run: () => refs.open.scrollIntoView({ behavior: "smooth", block: "center" }) },
    { title: "Save for the first time", detail: "A foundation matches what you put in.", done: v?.ownSaved > 0, action: "Save", run: () => h.go("save") },
    { title: "Get your employer to pay in", detail: "Send them your link, or try it alone with a simulated payment.", done: v?.employerIn > 0, action: "Share my link", run: () => h.go("share") },
    { title: "Try to take it out early", detail: "The program says no. Nobody can empty your vault before the day.", done: tried || v?.claimed > 0, action: "Try it", run: () => h.go("payouts") },
    { title: "Get your first monthly payout", detail: "To yourself, or straight to your family at home.", done: v?.claimed > 0, action: "Payouts", run: () => h.go("payouts") },
  ];
}

function renderGuide(me, h) {
  const list = steps(me, h);
  const done = list.filter((s) => s.done).length;
  const nextIdx = list.findIndex((s) => !s.done);
  const hidden = flag("guideHidden") === "1";
  refs.guide.hidden = hidden;
  refs.guideCount.textContent = nextIdx === -1 ? "All done. Your pension is working." : `${done} of ${list.length} done`;
  refs.guideMeter.style.width = `${(done / list.length) * 100}%`;
  refs.guideList.replaceChildren(...list.map((s, i) => el("li", { class: s.done ? "done" : i === nextIdx ? "next" : "" },
    el("span", { class: "tick", "aria-hidden": "true" }, s.done ? "" : String(i + 1)),
    el("div", {}, el("strong", {}, s.title, s.done ? el("span", { class: "sr-only" }, " (done)") : null), el("small", {}, s.detail)),
    !s.done && s.run && i === nextIdx ? el("button", { type: "button", class: "btn small", onclick: s.run }, s.action) : el("span"),
  )));
}

// ---- Home ----------------------------------------------------------------

function openForm(h) {
  const start = el("select", { id: "start-in" },
    el("option", { value: 60 }, "In 1 minute (stands in for 1 year)"),
    el("option", { value: 120, selected: true }, "In 2 minutes"),
    el("option", { value: 300 }, "In 5 minutes"),
    el("option", { value: 900 }, "In 15 minutes"));
  const months = el("select", { id: "months" }, ...[2, 3, 4, 6, 8, 10, 12].map((m) => el("option", { value: m, selected: m === 6 }, `${m} monthly payouts`)));
  const form = el("form", { class: "form-grid" },
    el("label", { for: "start-in" }, "Payouts begin"), start,
    el("label", { for: "months" }, "Paid over"), months,
    el("button", { class: "btn", type: "submit" }, "Open my vault"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, "Opening your vault", () => attempt("Opened your vault", async () => {
      const res = await api.act(h.needsWallet(), { action: "open_vault", startInSecs: Number(start.value), months: Number(months.value) });
      await h.refresh();
      return res;
    }));
  });
  return card("open",
    el("span", { class: "eyebrow" }, "Step 2"),
    el("h2", {}, "Open your vault"),
    el("p", {}, "Your vault is a locked account in your name on Solana. You decide when it starts paying you. Once set, nobody can change that date or take money out before it. In this demo minutes stand in for years and a month lasts 30 seconds."),
    form);
}

function homePanel(h) {
  refs.guideCount = el("span", { class: "fine" });
  refs.guideMeter = el("i");
  refs.guideList = el("ol", { class: "guide-list" });
  refs.guide = card("guide",
    el("div", { class: "guide-head" },
      el("div", {}, el("span", { class: "eyebrow" }, "Getting started"), el("h2", {}, "Your next steps")),
      el("button", { type: "button", class: "linkish", onclick: () => { flag("guideHidden", "1"); refs.guide.hidden = true; } }, "Hide")),
    el("div", { class: "meter" }, refs.guideMeter), refs.guideCount, refs.guideList);

  refs.open = openForm(h);
  refs.total = el("p", { class: "big num" });
  refs.locked = el("small", { class: "fine" });
  refs.vaultLink = el("a", { target: "_blank", rel: "noreferrer", class: "mono" });
  refs.parts = el("div", { class: "parts" });
  refs.clock = el("p", { class: "clock" });
  refs.chips = el("div", { class: "periods" });
  refs.passbook = card("passbook",
    el("div", { class: "pb-head" },
      el("div", {}, el("span", { class: "eyebrow" }, "Your pension"), refs.total, refs.locked),
      el("div", { class: "pb-total" }, el("span", { class: "eyebrow" }, "Vault on devnet"), refs.vaultLink)),
    refs.parts, refs.clock, refs.chips,
    el("div", { class: "row-actions" },
      el("button", { type: "button", class: "btn", onclick: () => h.go("save") }, "Save more"),
      el("button", { type: "button", class: "btn quiet", onclick: () => h.go("payouts") }, "Payouts"),
      el("button", { type: "button", class: "btn quiet", onclick: () => h.go("share") }, "Share")));

  refs.walletAmt = el("p", { class: "big num" });
  refs.walletMeta = el("small", { class: "fine" });
  refs.familyAmt = el("p", { class: "big num" });
  const wallets = el("div", { class: "duo" },
    card("mini", el("span", { class: "eyebrow" }, "Spending wallet"), refs.walletAmt, refs.walletMeta),
    card("mini", el("span", { class: "eyebrow" }, "Family wallet at home"), refs.familyAmt,
      el("small", { class: "fine" }, "Stands in for your family's phone in this demo.")));

  return el("div", {}, refs.guide, refs.open, refs.passbook, wallets);
}

function updateHome(h) {
  const me = h.ctx.state.me;
  const v = me.vault;
  renderGuide(me, h);
  refs.open.hidden = Boolean(v);
  refs.passbook.hidden = !v;
  refs.walletAmt.textContent = me.wallet.amount == null ? "Setting up" : usd(me.wallet.amount);
  refs.walletMeta.replaceChildren(link(explorer("address", me.pubkey), short(me.pubkey), "mono"), me.method === "passkey" ? " · opens with your passkey" : " · saved in this browser only");
  refs.familyAmt.textContent = usd(me.family?.amount || 0);
  if (!v) return;
  refs.total.textContent = usd(vaultTotal(v));
  refs.locked.textContent = `${usd(v.locked)} still locked · ${usd(v.claimed)} paid out`;
  refs.vaultLink.href = explorer("address", v.address);
  refs.vaultLink.textContent = short(v.address);
  refs.parts.replaceChildren(...breakdown(v));
  tickHome(h);
}

function tickHome(h) {
  const v = h.ctx.state?.me?.vault;
  if (!v || !refs) return;
  const t = h.now();
  refs.clock.textContent = clockText(v, t);
  refs.chips.replaceChildren(...schedule(v, t));
}

// ---- View contract -------------------------------------------------------

let panels = [];

function mount(h) {
  refs = {};
  panels = [savePanel(h), sendPanel(h), payoutsPanel(h), historyPanel(h), sharePanel(h)];
  return [["home", homePanel(h)], ...panels.map((p) => [p.id, p.node])];
}

function update(h) {
  if (!h.ctx.state?.me) return;
  updateHome(h);
  for (const p of panels) p.update(h);
}

function tick(h) {
  tickHome(h);
  for (const p of panels) p.tick?.(h);
}

function show(tab, h) {
  panels.find((p) => p.id === tab)?.show?.(h);
}

export default { tabs, mount, update, tick, show };
