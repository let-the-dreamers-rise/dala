// Shared UI helpers: DOM building, formatting, feedback, the activity log, ledger rendering.
export const $ = (id) => document.getElementById(id);
const DEC = 1e6;

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") Object.assign(n.style, v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
  return n;
}

export const usd = (raw) => "$" + (raw / DEC).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const short = (s) => (s ? `${s.slice(0, 4)}...${s.slice(-4)}` : "");
export const explorer = (kind, id) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;
export const link = (href, text, cls = "") => el("a", { href, target: "_blank", rel: "noreferrer", class: cls }, text);

export function ago(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

export function span(secs) {
  const s = Math.max(0, Math.round(secs));
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}

let flashTimer;
export function flash(message, bad = false) {
  const f = $("flash");
  f.textContent = message;
  f.classList.toggle("bad", bad);
  f.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { f.hidden = true; }, 7000);
}

// ---- Activity log (this browser only) -------------------------------------
let logOwner = "anon";
export const setLogOwner = (pubkey) => { logOwner = pubkey; };
const logKey = () => `dala.activity.${logOwner}`;
export function readLog() {
  try { return JSON.parse(localStorage.getItem(logKey()) || "[]"); } catch { return []; }
}
export function addLog(entry) {
  const items = [{ ...entry, at: Date.now() }, ...readLog()].slice(0, 40);
  try { localStorage.setItem(logKey(), JSON.stringify(items)); } catch { /* storage blocked */ }
  document.dispatchEvent(new CustomEvent("dala:log"));
}

// ---- Actions ---------------------------------------------------------------
let working = false;
export const isBusy = () => working;

/** One user action at a time; disables the button, reports errors in plain words. */
export async function busy(button, label, fn) {
  if (working) return;
  working = true;
  const old = button?.textContent;
  if (button) { button.disabled = true; button.textContent = label; }
  try {
    await fn();
  } catch (err) {
    flash(err.message || "Something went wrong", true);
  } finally {
    working = false;
    if (button) { button.disabled = false; button.textContent = old; }
  }
}

/** Run a chain action. A program refusal (HTTP 422) is a result to show, not a crash. */
export async function attempt(text, fn) {
  try {
    const res = await fn();
    addLog({ ok: true, text, sig: res?.sig });
    flash(`${text}. Confirmed on devnet.`);
    return res;
  } catch (err) {
    if (err.status === 422) {
      addLog({ ok: false, text, error: err.message });
      flash(`Refused by the program: ${err.message}`, true);
      return null;
    }
    throw err;
  }
}

export function renderLog(list) {
  list.replaceChildren(...readLog().map((it) => el("li", {},
    el("span", { class: `tag ${it.ok ? "ok" : "no"}` }, it.ok ? "Done" : "Refused"),
    el("div", { class: "what" }, el("span", {}, it.text),
      el("small", {}, it.sig ? link(explorer("tx", it.sig), `tx ${short(it.sig)}`, "mono") : it.error ? `Program said: ${it.error}` : "")),
  )));
  if (!list.children.length) list.append(el("li", { class: "empty" }, "Nothing yet."));
}

// ---- On-chain ledger ------------------------------------------------------
const KIND_LABEL = { employer: "Employer", family: "Family", other: "Other" };

/** Describe one decoded Dala event for a human. `names` maps addresses to nicknames. */
export function describe(ev, names = {}) {
  const who = (a) => names[a] || short(a);
  switch (ev.type) {
    case "opened": return { title: "Vault opened", detail: `${ev.periods} monthly payouts`, amount: null };
    case "contributed": return { title: `${KIND_LABEL[ev.kind]} top-up`, detail: `from ${who(ev.from)}`, amount: ev.amount, cls: ev.kind };
    case "saved": return { title: "Saved", detail: ev.matched ? `matched ${usd(ev.matched)} by the pool` : "no match left", amount: ev.amount + ev.matched, cls: "own" };
    case "claimed": return { title: "Payout", detail: `to ${who(ev.to)}`, amount: -ev.amount, cls: "out" };
    default: return { title: ev.type, detail: "", amount: null };
  }
}

export function renderLedger(list, items, names = {}, filter = () => true) {
  const rows = [];
  for (const tx of items) {
    for (const ev of tx.events.filter(filter)) {
      const d = describe(ev, names);
      rows.push(el("li", { class: `ev ${d.cls || ""}` },
        el("div", { class: "what" }, el("strong", {}, d.title), el("small", {}, `${d.detail} · ${ago(tx.time)} · `, link(explorer("tx", tx.sig), "tx", "mono"))),
        d.amount == null ? el("span") : el("span", { class: `amt num ${d.amount < 0 ? "neg" : ""}` }, `${d.amount < 0 ? "-" : "+"}${usd(Math.abs(d.amount))}`),
      ));
    }
  }
  list.replaceChildren(...rows);
  if (!rows.length) list.append(el("li", { class: "empty" }, "No on-chain activity yet."));
}

// ---- Small building blocks -------------------------------------------------

export const card = (cls, ...children) => el("section", { class: `card ${cls || ""}` }, ...children);

/** Quick-pick amount buttons that fill an input. */
export function chips(input, values, prefix = "$") {
  return el("div", { class: "chips" }, ...values.map((v) => el("button", {
    type: "button", class: "chip",
    onclick: () => { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); },
  }, `${prefix}${v}`)));
}

export const planned = (title, text) => el("div", { class: "planned" }, el("span", { class: "tag soon" }, "Planned"), el("div", {}, el("strong", {}, title), el("small", {}, text)));

/** Read a per-user flag from this browser. */
export function flag(name, value) {
  const key = `dala.${name}.${logOwner}`;
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch { /* storage blocked */ }
  return value ?? null;
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    flash("Copied.");
  } catch {
    flash(`Copy this: ${text}`);
  }
}

/** Draw a QR code if the library loaded; otherwise show the link as text. */
export function qr(container, text) {
  container.replaceChildren();
  if (window.QRCode) {
    // eslint-disable-next-line no-new
    new window.QRCode(container, { text, width: 168, height: 168, correctLevel: window.QRCode.CorrectLevel.M });
  } else {
    container.append(el("code", { class: "mono" }, text));
  }
}
