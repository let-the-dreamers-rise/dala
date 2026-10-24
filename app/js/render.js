// Pure-ish DOM rendering for the app. Reads state, writes elements; no network calls here.
const DEC = 1e6;
export const $ = (id) => document.getElementById(id);
export const usd = (raw) => (raw / DEC).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC";
export const short = (s) => (s ? `${s.slice(0, 4)}...${s.slice(-4)}` : "");
export const explorer = (kind, id) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

function el(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

export function vaultTotal(v) {
  return v.ownSaved + v.employerIn + v.familyIn + v.otherIn + v.matchedIn;
}

/** Mirrors the program: periods unlocked at time t, first one at payoutStart. */
export function periodsUnlocked(v, t) {
  if (t < v.payoutStart) return 0;
  return Math.min(v.periods, Math.floor((t - v.payoutStart) / v.periodSecs) + 1);
}

export function renderPool(pool) {
  const dl = $("pool-stats");
  dl.replaceChildren();
  if (!pool) {
    dl.append(el("dt", {}, "Status"), el("dd", {}, "Unavailable"));
    return;
  }
  const rows = [
    ["Match", `${pool.matchBps / 100}% of savings`],
    ["Cap per worker", usd(pool.capPerWorker)],
    ["Workers joined", String(pool.workers)],
    ["Matched so far", usd(pool.totalMatched)],
    ["Left in pool", usd(pool.available)],
  ];
  for (const [k, v] of rows) dl.append(el("dt", {}, k), el("dd", {}, v));
}

export function renderWallet(me) {
  $("wallet-card").hidden = false;
  $("wallet-amt").textContent = me.wallet.amount == null ? "Setting up" : usd(me.wallet.amount);
  const link = $("wallet-link");
  link.href = explorer("address", me.pubkey);
  link.textContent = short(me.pubkey);
  $("wallet-method").textContent = me.method === "passkey" ? "Unlocked with your passkey" : "Saved in this browser only";
  if (me.family) {
    $("family-card").hidden = false;
    $("family-amt").textContent = usd(me.family.amount);
  }
}

export function renderPassbook(v, matched) {
  const total = vaultTotal(v);
  $("pb-total").textContent = usd(total);
  $("pb-locked").textContent = `${usd(v.locked)} locked in the vault`;
  const link = $("pb-vault");
  link.href = explorer("address", v.address);
  link.textContent = short(v.address);

  const parts = [
    ["Your savings", v.ownSaved, "var(--own)"],
    ["Foundation match", v.matchedIn, "var(--match)"],
    ["Employer", v.employerIn, "var(--employer)"],
    ["Family", v.familyIn, "var(--family)"],
  ];
  const bar = $("pb-bar");
  const legend = $("pb-legend");
  bar.replaceChildren();
  legend.replaceChildren();
  for (const [name, amount, color] of parts) {
    const seg = el("span", { title: name });
    seg.style.flexGrow = String(amount);
    seg.style.background = color;
    bar.append(seg);
    const row = el("div");
    const dt = el("dt");
    const sw = el("i");
    sw.style.background = color;
    dt.append(sw, name);
    row.append(dt, el("dd", {}, usd(amount)));
    legend.append(row);
  }
  if (matched) legend.title = `Matched ${usd(matched)} of your cap`;
}

function fmtSpan(secs) {
  const s = Math.max(0, Math.round(secs));
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}

/** Countdown line, payout chips, and the withdraw button's wording. Called every second. */
export function renderClock(v, now) {
  const total = vaultTotal(v);
  const unlocked = periodsUnlocked(v, now);
  const clock = $("pb-clock");
  const hint = $("claim-hint");
  const btn = $("btn-claim");
  if (unlocked === 0) {
    clock.textContent = `Locked. Payouts start in ${fmtSpan(v.payoutStart - now)}.`;
    btn.textContent = "Try to withdraw early";
    hint.textContent = "The program will refuse this. That is the point: nobody can force an early lump sum.";
  } else if (unlocked < v.periods) {
    const next = v.payoutStart + unlocked * v.periodSecs;
    clock.textContent = `Retired. ${unlocked} of ${v.periods} monthly payouts unlocked. Next one in ${fmtSpan(next - now)}.`;
    btn.textContent = "Claim unlocked payouts";
    hint.textContent = "You can claim what has unlocked so far. Claiming twice in one month is refused.";
  } else {
    clock.textContent = "Every payout has unlocked.";
    btn.textContent = "Claim the rest";
    hint.textContent = "";
  }

  const chips = $("pb-periods");
  chips.replaceChildren();
  for (let i = 1; i <= v.periods; i++) {
    const upTo = Math.floor((total * i) / v.periods);
    const due = upTo - Math.floor((total * (i - 1)) / v.periods);
    const paid = upTo > 0 && i <= unlocked && v.claimed >= upTo;
    const open = !paid && i <= unlocked;
    const chip = el("div", { class: `period${paid ? " paid" : open ? " open" : ""}` });
    chip.append(el("span", {}, `Month ${i}`), el("b", {}, usd(due)), el("span", {}, paid ? "Paid" : open ? "Ready to claim" : "Locked"));
    chips.append(chip);
  }
}

export function renderActivity(items) {
  const list = $("activity");
  $("activity-card").hidden = items.length === 0;
  list.replaceChildren();
  for (const it of items) {
    const li = el("li");
    li.append(el("span", { class: `tag ${it.ok ? "ok" : "no"}` }, it.ok ? "Done" : "Refused"));
    const what = el("div", { class: "what" });
    what.append(el("span", {}, it.text));
    const small = el("small");
    if (it.sig) {
      small.append(el("a", { href: explorer("tx", it.sig), target: "_blank", rel: "noreferrer", class: "mono" }, `tx ${short(it.sig)}`));
    } else if (it.error) {
      small.textContent = `Program said: ${it.error}`;
    }
    what.append(small);
    li.append(what);
    list.append(li);
  }
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
