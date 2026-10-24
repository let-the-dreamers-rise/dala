// Worker tabs other than Home. Each returns { id, node, update(h), tick?(h), show?(h) }.
import * as api from "../api.js";
import { el, usd, short, card, chips, planned, busy, attempt, flag, renderLedger, renderLog, copy, qr, flash } from "../ui.js";
import { periodsUnlocked, claimable, clockText, schedule } from "../passbook.js";

const USD = 1e6;
const whole = (input) => Math.round(Number(input.value) || 0);

function needVault(h) {
  return el("div", { class: "notice" }, el("p", {}, "Open your vault first. It takes one step."),
    el("button", { type: "button", class: "btn small", onclick: () => h.go("home") }, "Go to Home"));
}

// ---- Save ----------------------------------------------------------------

export function savePanel(h) {
  const amount = el("input", { type: "number", id: "save-amt", min: 1, max: 500, step: 1, value: 50, inputmode: "numeric" });
  const balance = el("p", { class: "fine" });
  const poolList = el("div", { class: "pool-pick", role: "radiogroup", "aria-label": "Match pool" }, el("p", { class: "fine" }, "Loading match pools..."));
  const preview = el("p", { class: "preview", "aria-live": "polite" });
  const blocked = needVault(h);
  let pools = [];
  let chosen = null;

  function drawPreview() {
    const p = pools.find((x) => x.address === chosen);
    if (!p) { preview.textContent = ""; return; }
    const a = whole(amount) * USD;
    const me = h.ctx.state?.me;
    const already = chosen === h.ctx.state?.config.pool ? me?.matched ?? 0 : null;
    const room = Math.max(0, p.capPerWorker - (already ?? 0));
    const m = Math.min(Math.floor((a * p.matchBps) / 10000), room, p.available);
    preview.replaceChildren("You put in ", el("b", {}, usd(a)), ". The foundation adds ", el("b", {}, usd(m)),
      ". Your vault grows by ", el("b", {}, usd(a + m)), ".",
      already == null ? el("small", {}, " Less if you already used part of this pool's cap.") : "");
  }

  function drawPools() {
    const def = h.ctx.state?.config.pool;
    const sorted = [...pools].sort((a, b) => (b.address === def) - (a.address === def) || b.available - a.available);
    poolList.replaceChildren(...sorted.map((p) => el("label", { class: "pool-opt" },
      el("input", { type: "radio", name: "pool", value: p.address, checked: p.address === chosen, onchange: () => { chosen = p.address; drawPreview(); } }),
      el("span", {},
        el("strong", {}, `${p.matchBps / 100}% match`, p.available === 0 ? el("em", {}, " (empty)") : ""),
        el("small", {}, `Up to ${usd(p.capPerWorker)} per worker · ${usd(p.available)} left · ${p.workers} worker${p.workers === 1 ? "" : "s"}`),
        el("small", { class: "mono" }, p.address === def ? "Dala demo foundation" : `Foundation ${short(p.sponsor)}`)))));
    if (!pools.length) poolList.append(el("p", { class: "fine" }, "No match pools yet."));
    drawPreview();
  }

  async function loadPools() {
    try {
      const r = await api.pools();
      pools = r.pools;
      if (!pools.some((p) => p.address === chosen)) chosen = r.defaultPool;
      drawPools();
    } catch (err) {
      poolList.replaceChildren(el("p", { class: "fine" }, `Could not load match pools: ${err.message}`));
    }
  }

  amount.addEventListener("input", drawPreview);
  const form = el("form", { class: "stack" },
    el("label", { for: "save-amt", class: "label" }, "How much do you want to lock away?"),
    el("div", { class: "inline wrap" }, amount, chips(amount, [10, 25, 50, 100])),
    balance,
    el("span", { class: "label" }, "Who matches it"), poolList,
    preview,
    el("button", { class: "btn", type: "submit" }, "Save and lock"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const a = whole(amount);
    busy(e.submitter, "Saving", async () => {
      await attempt(`Saved ${usd(a * USD)}`, () => api.act(h.needsWallet(), { action: "save", amount: a, pool: chosen }));
      await Promise.all([h.refresh(), loadPools()]);
    });
  });
  const saveCard = card("", el("span", { class: "eyebrow" }, "Save"), el("h2", {}, "Lock money away for later"),
    el("p", {}, "Money you save goes into your vault and stays there until payouts begin. A foundation adds a match on top."), form);

  // Goal planner: simple arithmetic, no returns assumed.
  const monthly = el("input", { type: "number", id: "plan-monthly", min: 1, max: 2000, value: 50, inputmode: "numeric" });
  const years = el("select", { id: "plan-years" }, ...[3, 5, 10, 15, 20].map((y) => el("option", { value: y, selected: y === 10 }, `${y} years`)));
  const plan = el("p", { class: "preview" });
  const drawPlan = () => {
    const p = pools.find((x) => x.address === chosen);
    const own = whole(monthly) * 12 * Number(years.value) * USD;
    const m = p ? Math.min(Math.floor((own * p.matchBps) / 10000), p.capPerWorker) : 0;
    plan.replaceChildren("You save ", el("b", {}, usd(own)), ". This pool adds up to ", el("b", {}, usd(m)),
      ". Employer payments come on top. Paid over 10 years, that is at least ", el("b", {}, usd(Math.floor((own + m) / 120))), " a month.");
  };
  monthly.addEventListener("input", drawPlan);
  years.addEventListener("change", drawPlan);
  const planCard = card("", el("span", { class: "eyebrow" }, "Plan"), el("h2", {}, "What could this become?"),
    el("div", { class: "form-grid" }, el("label", { for: "plan-monthly" }, "I save each month ($)"), monthly, el("label", { for: "plan-years" }, "For"), years),
    plan, el("p", { class: "fine" }, "Planning only. No interest or investment returns are assumed."));

  const node = el("div", {}, blocked, saveCard, planCard);
  return {
    id: "save", node,
    update(hh) {
      const me = hh.ctx.state.me;
      blocked.hidden = Boolean(me.vault);
      saveCard.hidden = !me.vault;
      balance.textContent = `In your spending wallet: ${usd(me.wallet.amount || 0)}`;
      drawPreview();
      drawPlan();
    },
    show: loadPools,
  };
}

// ---- Send home -----------------------------------------------------------

export function sendPanel(h) {
  const amount = el("input", { type: "number", id: "send-amt", min: 1, max: 500, value: 50, inputmode: "numeric" });
  const fam = el("p", { class: "big num" });
  const form = el("form", { class: "stack" },
    el("label", { for: "send-amt", class: "label" }, "Amount to send now"),
    el("div", { class: "inline wrap" }, amount, chips(amount, [20, 50, 100])),
    el("button", { class: "btn", type: "submit" }, "Send home now"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const a = whole(amount);
    busy(e.submitter, "Sending", async () => {
      await attempt(`Sent ${usd(a * USD)} home`, () => api.act(h.needsWallet(), { action: "send_home", amount: a }));
      await h.refresh();
    });
  });
  const node = el("div", {},
    card("", el("span", { class: "eyebrow" }, "Send home"), el("h2", {}, "Money for your family today"),
      el("p", {}, "This arrives in seconds and is not locked. There is no agent and no cash pickup. Dala pays the network fee."),
      form),
    el("div", { class: "duo" },
      card("mini", el("span", { class: "eyebrow" }, "Family wallet balance"), fam, el("small", { class: "fine" }, "A wallet set aside for your family in this demo.")),
      card("mini", el("span", { class: "eyebrow" }, "For their future"), el("p", {}, "Your pension payouts can go straight to this wallet every month."),
        el("button", { type: "button", class: "btn small quiet", onclick: () => h.go("payouts") }, "Set up payouts"))));
  return { id: "send", node, update(hh) { fam.textContent = usd(hh.ctx.state.me.family?.amount || 0); } };
}

// ---- Payouts -------------------------------------------------------------

export function payoutsPanel(h) {
  const clock = el("p", { class: "clock" });
  const chipsBox = el("div", { class: "periods" });
  const ready = el("p", { class: "big num" });
  const hint = el("p", { class: "fine" });
  const dest = el("select", { id: "claim-to" }, el("option", { value: "family" }, "My family's wallet at home"), el("option", { value: "self" }, "My own wallet"));
  const btn = el("button", { class: "btn", type: "button" }, "Claim");
  const blocked = needVault(h);
  btn.addEventListener("click", () => {
    const v = h.ctx.state.me.vault;
    const early = periodsUnlocked(v, h.now()) === 0;
    busy(btn, "Asking the program", async () => {
      const res = await attempt(early ? "Tried to withdraw early" : `Claimed payout to ${dest.value === "self" ? "your wallet" : "your family"}`,
        () => api.act(h.needsWallet(), { action: "claim", to: dest.value }));
      if (!res) flag("triedEarly", "1");
      await h.refresh();
    });
  });
  const main = card("", el("span", { class: "eyebrow" }, "Payouts"), el("h2", {}, "Your monthly pension"), clock, chipsBox,
    el("div", { class: "claim-row" },
      el("div", {}, el("span", { class: "eyebrow" }, "Ready now"), ready),
      el("div", { class: "stack" }, el("label", { for: "claim-to", class: "label" }, "Send it to"), dest)),
    btn, hint);
  const node = el("div", {}, blocked, main,
    card("", el("span", { class: "eyebrow" }, "Coming next"),
      planned("Hardship withdrawal", "Early access for illness or job loss, approved by a partner NGO."),
      planned("Named heir", "If something happens to you, payouts continue to the person you choose."),
      planned("Automatic monthly payouts", "Paid without you pressing a button.")));
  const tick = (hh) => {
    const v = hh.ctx.state?.me?.vault;
    if (!v) return;
    const t = hh.now();
    const unlocked = periodsUnlocked(v, t);
    clock.textContent = clockText(v, t);
    chipsBox.replaceChildren(...schedule(v, t));
    ready.textContent = usd(claimable(v, t));
    if (btn.disabled) return;
    if (unlocked === 0) {
      btn.textContent = "Try to withdraw early";
      hint.textContent = "The program will refuse. That is the point: nobody can force out an early lump sum, not even you.";
    } else {
      btn.textContent = claimable(v, t) > 0 ? `Claim ${usd(claimable(v, t))}` : "Nothing to claim yet";
      hint.textContent = "Claim what has unlocked so far. Asking twice in the same month is refused.";
    }
  };
  return {
    id: "payouts", node, tick,
    update(hh) {
      const v = hh.ctx.state.me.vault;
      blocked.hidden = Boolean(v);
      main.hidden = !v;
      tick(hh);
    },
  };
}

// ---- History -------------------------------------------------------------

export function historyPanel(h) {
  const chain = el("ul", { class: "ledger" }, el("li", { class: "empty" }, "Loading..."));
  const local = el("ul", { class: "activity" });
  const names = () => {
    const s = h.ctx.state;
    const me = s.me;
    return { [s.config.relayer]: "Dala demo payer", [me.pubkey]: "you", [me.wallet.address]: "your wallet", [me.family?.address]: "your family" };
  };
  async function load() {
    const v = h.ctx.state?.me?.vault;
    if (!v) { chain.replaceChildren(el("li", { class: "empty" }, "Open your vault to start your history.")); return; }
    try {
      renderLedger(chain, await api.ledger(v.address, 30), names());
    } catch (err) {
      chain.replaceChildren(el("li", { class: "empty" }, `Could not read the chain: ${err.message}`));
    }
  }
  document.addEventListener("dala:log", () => renderLog(local));
  const node = el("div", {},
    card("", el("div", { class: "guide-head" },
      el("div", {}, el("span", { class: "eyebrow" }, "Passbook"), el("h2", {}, "Every payment into and out of your vault")),
      el("button", { type: "button", class: "btn small quiet", onclick: load }, "Refresh")),
    el("p", { class: "fine" }, "Read straight from Solana. Nobody can edit or delete these lines."), chain),
    card("", el("span", { class: "eyebrow" }, "On this device"), el("h2", {}, "What you tried"),
      el("p", { class: "fine" }, "Includes requests the program refused."), local));
  return { id: "history", node, update() { renderLog(local); }, show: load };
}

// ---- Share ---------------------------------------------------------------

function shareBlock(title, text, url, id) {
  const box = el("div", { class: "qr", id });
  const field = el("input", { type: "text", readonly: true, value: url, "aria-label": `${title} link`, onfocus: (e) => e.target.select() });
  const share = navigator.share ? el("button", { type: "button", class: "btn small quiet", onclick: () => navigator.share({ title: "Dala", text, url }).catch(() => {}) }, "Share") : null;
  return {
    node: card("share-card", el("div", {}, el("h2", {}, title), el("p", {}, text), field,
      el("div", { class: "row-actions" }, el("button", { type: "button", class: "btn small", onclick: () => copy(field.value) }, "Copy link"), share)), box),
    draw(next) { field.value = next; qr(box, next); },
  };
}

export function sharePanel(h) {
  const employer = shareBlock("Ask your employer to pay in", "When they open this link, you are added to their payroll in Dala. Their payments go into your vault and show their name.", "", "qr-employer");
  const family = shareBlock("Show your family", "They can see your balance, who paid in, and the payout dates. Nobody can move money with this link.", "", "qr-family");
  const sim = (kind, amount, label) => el("button", {
    type: "button", class: "btn small quiet",
    onclick: (e) => busy(e.currentTarget, "Paying", async () => {
      if (!h.ctx.state.me.vault) throw new Error("Open your vault first.");
      await attempt(`${label} (simulated)`, () => api.topup(kind, amount));
      await h.refresh();
    }),
  }, label);
  const node = el("div", {}, employer.node, family.node,
    card("", el("span", { class: "eyebrow" }, "Trying Dala alone?"), el("h2", {}, "Pretend to be your employer or family"),
      el("p", {}, "A Dala demo account pays into your vault, tagged as employer or family, so you can see the whole story yourself."),
      el("div", { class: "row-actions" }, sim("employer", 100, "Employer pays $100"), sim("family", 50, "Family sends $50")),
      el("p", { class: "fine" }, "Or open this site in another browser, sign in as an employer, and use your link.")),
    card("", el("span", { class: "eyebrow" }, "Coming next"),
      planned("Guardian recovery", "Lost your phone? Two people you trust can help you move your vault to a new one.")));
  let drawn = "";
  const draw = (hh) => {
    const pk = hh.ctx.state?.me?.pubkey;
    if (!pk || drawn === pk) return;
    drawn = pk;
    employer.draw(`${location.origin}/app.html?pay=${pk}`);
    family.draw(`${location.origin}/vault.html?w=${pk}`);
  };
  return { id: "share", node, update: draw, show: () => { draw(h); if (!window.QRCode) flash("QR codes could not load. The links still work.", true); } };
}
