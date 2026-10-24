// Dala app controller: sign-in, onboarding, worker and employer actions, polling.
import * as api from "./api.js";
import * as wallet from "./wallet.js";
import * as view from "./render.js";

const { $ } = view;
const ctx = { session: null, wallet: null, state: null, clockOffset: 0, busy: false };

const logKey = () => `dala.activity.${ctx.session?.pubkey}`;
function loadLog() {
  try { return JSON.parse(localStorage.getItem(logKey()) || "[]"); } catch { return []; }
}
function log(entry) {
  const items = [{ ...entry, at: Date.now() }, ...loadLog()].slice(0, 30);
  try { localStorage.setItem(logKey(), JSON.stringify(items)); } catch { /* storage blocked: list stays in memory only */ }
  view.renderActivity(items);
}

const roleChoice = () => document.querySelector('input[name="role"]:checked').value;

/** Run one user action with a busy guard, button disabling and uniform error reporting. */
async function busy(button, label, fn) {
  if (ctx.busy) return;
  ctx.busy = true;
  const old = button?.textContent;
  if (button) { button.disabled = true; button.textContent = label; }
  try {
    await fn();
  } catch (err) {
    view.flash(err.message || "Something went wrong", true);
  } finally {
    ctx.busy = false;
    if (button) { button.disabled = false; button.textContent = old; }
  }
}

/** A program refusal (HTTP 422) is a result worth showing, not a crash. */
async function attempt(text, fn) {
  try {
    const res = await fn();
    log({ ok: true, text, sig: res.sig });
    view.flash(`${text}: confirmed on devnet.`);
  } catch (err) {
    if (err.status === 422) {
      log({ ok: false, text, error: err.message });
      view.flash(`Refused by the program: ${err.message}`, true);
    } else {
      throw err;
    }
  }
  await refresh();
}

async function startSession(w) {
  ctx.wallet = w;
  ctx.session = await api.signIn(w, roleChoice());
  await enter();
}

async function enter() {
  $("view-signin").hidden = true;
  $("who").hidden = false;
  $("who-role").textContent = ctx.session.role;
  $("who-addr").textContent = view.short(ctx.session.pubkey);
  view.renderActivity(loadLog());
  await refresh();
  if (ctx.state?.me?.wallet.amount == null || ctx.state.me.wallet.amount === 0) {
    view.flash("Setting up your demo wallet. Dala pays the network fees.");
    await api.onboard();
    log({ ok: true, text: ctx.session.role === "worker" ? "Wallet funded with 500 demo USDC" : "Wallet funded with 2,000 demo USDC" });
    await refresh();
  }
}

async function refresh() {
  const s = await api.state();
  ctx.state = s;
  ctx.clockOffset = s.now - Date.now() / 1000;
  view.renderPool(s.pool);
  if (!s.me) return;
  view.renderWallet(s.me);
  const worker = s.me.role === "worker";
  $("view-worker").hidden = !worker;
  $("view-employer").hidden = worker;
  if (worker) {
    const v = s.me.vault;
    $("open-card").hidden = Boolean(v);
    $("passbook").hidden = !v;
    $("actions").hidden = !v;
    $("share-addr").textContent = s.me.pubkey;
    if (v) {
      view.renderPassbook(v, s.me.matched);
      tick();
    }
  }
}

function tick() {
  const v = ctx.state?.me?.vault;
  if (v) view.renderClock(v, Math.floor(Date.now() / 1000 + ctx.clockOffset));
}

function needsWallet() {
  if (ctx.wallet) return ctx.wallet;
  throw new Error("Your wallet is locked in this tab. Sign out and sign in again with your passkey.");
}

function wire() {
  $("btn-passkey-new").addEventListener("click", (e) => busy(e.currentTarget, "Waiting for your passkey", async () => {
    if (!wallet.passkeysAvailable()) throw new Error("This browser has no passkey support. Use a wallet saved in this browser instead.");
    try {
      await startSession(await wallet.createPasskeyWallet(`Dala ${roleChoice()}`));
    } catch (err) {
      if (err instanceof wallet.PasskeyUnsupported) throw new Error(`${err.message}. Use a wallet saved in this browser instead.`);
      if (err.name === "NotAllowedError") throw new Error("Passkey request was cancelled.");
      throw err;
    }
  }));
  $("btn-passkey").addEventListener("click", (e) => busy(e.currentTarget, "Waiting for your passkey", async () => {
    try {
      await startSession(await wallet.usePasskeyWallet());
    } catch (err) {
      if (err.name === "NotAllowedError") throw new Error("Passkey request was cancelled or no Dala passkey was found.");
      throw err;
    }
  }));
  $("btn-device").addEventListener("click", (e) => busy(e.currentTarget, "Signing in", () => startSession(wallet.deviceWallet())));
  $("signout").addEventListener("click", () => busy(null, "", async () => {
    await api.signOut();
    wallet.forget();
    location.reload();
  }));

  $("open-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, "Opening", () => attempt("Opened your vault", () =>
      api.act(needsWallet(), { action: "open_vault", startInSecs: Number($("start-in").value), months: Number($("months").value) })));
  });
  $("save-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Number($("save-amt").value);
    busy(e.submitter, "Saving", () => attempt(`Saved ${amount} USDC (matched by the foundation if under your cap)`, () =>
      api.act(needsWallet(), { action: "save", amount })));
  });
  $("btn-employer").addEventListener("click", (e) => busy(e.currentTarget, "Paying", () =>
    attempt("Employer paid 100 USDC (simulated payer)", () => api.topup("employer", 100))));
  $("btn-family").addEventListener("click", (e) => busy(e.currentTarget, "Sending", () =>
    attempt("Family sent 50 USDC (simulated payer)", () => api.topup("family", 50))));
  $("btn-claim").addEventListener("click", (e) => {
    const to = $("claim-to").value;
    busy(e.currentTarget, "Asking the program", () => attempt(`Withdraw to ${to === "self" ? "your wallet" : "your family's wallet"}`, () =>
      api.act(needsWallet(), { action: "claim", to })));
  });
  $("btn-copy").addEventListener("click", async () => {
    const text = $("share-addr").textContent;
    try {
      await navigator.clipboard.writeText(text);
      view.flash("Address copied.");
    } catch {
      const range = document.createRange();
      range.selectNodeContents($("share-addr"));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      view.flash("Address selected. Copy it with your keyboard.");
    }
  });
  $("pay-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Number($("pay-amt").value);
    const worker = $("pay-worker").value.trim();
    busy(e.submitter, "Paying", () => attempt(`Paid ${amount} USDC into ${view.short(worker)}'s vault`, () =>
      api.act(needsWallet(), { action: "pay", worker, amount })));
  });
}

async function boot() {
  wire();
  try {
    ctx.session = await api.me();
    if (ctx.session) {
      ctx.wallet = wallet.restore(ctx.session.method);
      await enter();
    } else {
      await refresh();
    }
  } catch (err) {
    view.flash(err.message, true);
  }
  setInterval(tick, 1000);
  setInterval(() => { if (!document.hidden && !ctx.busy) refresh().catch(() => {}); }, 8000);
}

boot();
