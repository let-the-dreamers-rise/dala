// Vault maths and passbook drawing, shared by the worker app and the public vault page.
import { el, usd, span } from "./ui.js";

export const vaultTotal = (v) => v.ownSaved + v.employerIn + v.familyIn + v.otherIn + v.matchedIn;

/** Mirrors the program: periods unlocked at time t, the first one at payoutStart. */
export function periodsUnlocked(v, t) {
  if (t < v.payoutStart) return 0;
  return Math.min(v.periods, Math.floor((t - v.payoutStart) / v.periodSecs) + 1);
}

/** What a claim at time t would pay, as the program computes it. */
export function claimable(v, t) {
  const unlocked = periodsUnlocked(v, t);
  return Math.max(0, Math.floor((vaultTotal(v) * unlocked) / v.periods) - v.claimed);
}

const PARTS = [
  ["Your savings", "ownSaved", "var(--own)"],
  ["Foundation match", "matchedIn", "var(--match)"],
  ["Employer", "employerIn", "var(--employer)"],
  ["Family", "familyIn", "var(--family)"],
];

/** Stacked bar plus legend showing who paid in. */
export function breakdown(v) {
  const bar = el("div", { class: "bar-track", role: "img", "aria-label": PARTS.map(([n, k]) => `${n} ${usd(v[k])}`).join(", ") },
    ...PARTS.map(([name, k, color]) => el("span", { title: name, style: { flexGrow: String(v[k]), background: color } })));
  const legend = el("dl", { class: "legend" }, ...PARTS.map(([name, k, color]) =>
    el("div", {}, el("dt", {}, el("i", { style: { background: color } }), name), el("dd", { class: "num" }, usd(v[k])))));
  return [bar, legend];
}

export function clockText(v, t) {
  const unlocked = periodsUnlocked(v, t);
  if (unlocked === 0) return `Locked. Payouts start in ${span(v.payoutStart - t)}.`;
  if (unlocked < v.periods) {
    const next = v.payoutStart + unlocked * v.periodSecs;
    return `Paying out. ${unlocked} of ${v.periods} monthly payouts unlocked. Next one in ${span(next - t)}.`;
  }
  return `Every payout has unlocked.`;
}

/** One chip per month: paid, ready to claim, or locked. */
export function schedule(v, t) {
  const total = vaultTotal(v);
  const unlocked = periodsUnlocked(v, t);
  const chips = [];
  for (let i = 1; i <= v.periods; i++) {
    const upTo = Math.floor((total * i) / v.periods);
    const due = upTo - Math.floor((total * (i - 1)) / v.periods);
    const paid = upTo > 0 && i <= unlocked && v.claimed >= upTo;
    const open = !paid && i <= unlocked;
    // Money paid in after a claim raises every month's share, so a claimed month can have more to collect.
    const part = open && v.claimed > upTo - due;
    chips.push(el("div", { class: `period${paid ? " paid" : open ? " open" : ""}` },
      el("span", {}, `Month ${i}`), el("b", {}, usd(due)),
      el("span", {}, paid ? "Paid" : part ? "Part paid, more to claim" : open ? "Ready to claim" : "Locked")));
  }
  return chips;
}
