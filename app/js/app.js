// Dala app shell: intro, sign-in, role workspaces with tabs, polling.
import * as api from "./api.js";
import * as wallet from "./wallet.js";
import { $, el, short, usd, flash, busy, isBusy, setLogOwner } from "./ui.js";
import { introSeen, runIntro } from "./intro.js";
import worker from "./views/worker.js";
import employer from "./views/employer.js";
import foundation from "./views/foundation.js";
import impact from "./views/impact.js";

const VIEWS = { worker, employer, foundation };
const params = new URLSearchParams(location.search);
const invitedBy = params.get("pay");
const ctx = { session: null, wallet: null, state: null, offset: 0, invitedBy };
let active = null; // { view, panels: Map, tab }

const roleChoice = () => document.querySelector('input[name="role"]:checked').value;
const now = () => Math.floor(Date.now() / 1000 + ctx.offset);

function needsWallet() {
  if (ctx.wallet) return ctx.wallet;
  throw new Error("Your wallet is locked in this tab. Sign out, then sign in again with your passkey.");
}

const helpers = { refresh, go, needsWallet, now, ctx };

// ---- Tabs ----------------------------------------------------------------

function tabsFor(role) {
  return [...VIEWS[role].tabs, ...impact.tabs];
}

function mountWorkspace(role) {
  const views = $("views");
  views.replaceChildren();
  const panels = new Map();
  for (const v of [VIEWS[role], impact]) {
    for (const [id, node] of v.mount(helpers)) {
      node.hidden = true;
      node.classList.add("panel");
      node.id = `panel-${id}`;
      node.setAttribute("role", "tabpanel");
      panels.set(id, { node, view: v });
      views.append(node);
    }
  }
  const nav = $("tabs");
  nav.setAttribute("role", "tablist");
  nav.replaceChildren(...tabsFor(role).map((t) =>
    el("a", { href: `#${t.id}`, role: "tab", id: `tab-${t.id}`, "aria-controls": `panel-${t.id}`, class: t.id === "impact" ? "public" : "" }, t.label)));
  nav.hidden = false;
  active = { role, panels, tab: null };
  go(location.hash.slice(1));
}

/** Show one tab. Unknown or foreign tab ids fall back to the role's first tab. */
export function go(id) {
  if (!active) return;
  const tab = active.panels.has(id) ? id : tabsFor(active.role)[0].id;
  active.tab = tab;
  for (const [pid, p] of active.panels) p.node.hidden = pid !== tab;
  for (const a of $("tabs").children) a.setAttribute("aria-selected", String(a.id === `tab-${tab}`));
  if (location.hash.slice(1) !== tab) history.replaceState(null, "", `${location.pathname}${location.search}#${tab}`);
  const p = active.panels.get(tab);
  p.view.show?.(tab, helpers);
  scrollTo({ top: 0, behavior: "smooth" });
}

// ---- Session -------------------------------------------------------------

async function startSession(w, role = roleChoice()) {
  ctx.wallet = w;
  ctx.session = await api.signIn(w, role);
  await enter();
}

async function enter() {
  $("signin").hidden = true;
  $("intro").hidden = true;
  $("who").hidden = false;
  $("who-role").textContent = ctx.session.role;
  $("who-addr").textContent = short(ctx.session.pubkey);
  for (const b of document.querySelectorAll("#switch [data-role]")) b.disabled = b.dataset.role === ctx.session.role;
  setLogOwner(ctx.session.pubkey);
  mountWorkspace(ctx.session.role);
  await refresh();
  go(active.tab); // re-run the tab's loader now that state has arrived
  if (ctx.state?.me?.wallet.amount == null) flash("Setting up your demo wallet. Dala pays the network fees.");
  const setup = await api.onboard();
  if (setup.sig) {
    await refresh();
    if (setup.funded) flash(`Your ${ctx.session.role} wallet was topped up with ${usd(setup.funded)} in demo dollars.`);
  }
}

async function switchRole(role) {
  $("switch").open = false;
  const w = needsWallet();
  await startSession(w, role);
}

async function refresh() {
  const s = await api.state();
  ctx.state = s;
  ctx.offset = s.now - Date.now() / 1000;
  if (active && s.me) {
    VIEWS[active.role].update(helpers);
    impact.update?.(helpers);
  }
}

// ---- Signed-out screens --------------------------------------------------

function showSignIn() {
  $("signin").hidden = false;
  $("tabs").hidden = true;
  if (invitedBy) {
    $("role-employer").checked = true;
    const inv = $("invite");
    inv.hidden = false;
    inv.textContent = `A worker (${short(invitedBy)}) asked you to pay into their Dala pension. Sign in as an employer to add them to your payroll.`;
  }
}

async function welcome() {
  if (!invitedBy && !introSeen()) await runIntro();
  showSignIn();
}

function wire() {
  $("btn-passkey-new").addEventListener("click", (e) => busy(e.currentTarget, "Waiting for your passkey", async () => {
    if (!wallet.passkeysAvailable()) throw new Error("This browser has no passkey support. Use a wallet saved in this browser instead.");
    try {
      await startSession(await wallet.createPasskeyWallet(`Dala ${roleChoice()}`));
    } catch (err) {
      if (err instanceof wallet.PasskeyUnsupported) throw new Error(`${err.message}. Use a wallet saved in this browser instead.`);
      if (err.name === "NotAllowedError") throw new Error("The passkey request was cancelled.");
      throw err;
    }
  }));
  $("btn-passkey").addEventListener("click", (e) => busy(e.currentTarget, "Waiting for your passkey", async () => {
    try {
      await startSession(await wallet.usePasskeyWallet());
    } catch (err) {
      if (err.name === "NotAllowedError") throw new Error("The passkey request was cancelled, or no Dala passkey was found.");
      throw err;
    }
  }));
  $("btn-device").addEventListener("click", (e) => busy(e.currentTarget, "Signing in", () => startSession(wallet.deviceWallet())));
  $("replay-intro").addEventListener("click", async () => {
    $("signin").hidden = true;
    await runIntro();
    showSignIn();
  });
  for (const b of document.querySelectorAll("#switch [data-role]")) {
    b.addEventListener("click", () => busy(null, "", () => switchRole(b.dataset.role)));
  }
  $("signout").addEventListener("click", () => busy(null, "", async () => {
    await api.signOut();
    wallet.forget();
    location.href = "/app.html";
  }));
  addEventListener("hashchange", () => go(location.hash.slice(1)));
  document.addEventListener("dala:go", (e) => go(e.detail));
}

async function boot() {
  wire();
  try {
    ctx.session = await api.me();
    if (ctx.session) {
      ctx.wallet = wallet.restore(ctx.session.method);
      await enter();
    } else {
      await welcome();
    }
  } catch (err) {
    flash(err.message, true);
    if (!ctx.session) showSignIn();
  }
  setInterval(() => { if (active) VIEWS[active.role].tick?.(helpers); }, 1000);
  setInterval(() => { if (ctx.session && !document.hidden && !isBusy()) refresh().catch(() => {}); }, 8000);
}

boot();
