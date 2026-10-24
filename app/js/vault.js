// Public passbook for one worker: /vault.html?w=<wallet>. Read-only, no sign-in.
import * as api from "./api.js";
import { $, usd, short, explorer, link, renderLedger, flash } from "./ui.js";
import { vaultTotal, breakdown, clockText, schedule } from "./passbook.js";

const worker = new URLSearchParams(location.search).get("w") || "";
let vault = null;
let offset = 0;

function tick() {
  if (!vault) return;
  const t = Math.floor(Date.now() / 1000 + offset);
  $("pv-clock").hidden = false;
  $("pv-clock").textContent = clockText(vault, t);
  $("pv-chips").replaceChildren(...schedule(vault, t));
}

async function load() {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(worker)) {
    $("pv-title").textContent = "This link is missing a wallet address.";
    $("pv-ledger").replaceChildren();
    return;
  }
  const [[row], s] = await Promise.all([api.vaults([worker]), api.state()]);
  offset = s.now - Date.now() / 1000;
  $("pv-who").replaceChildren("Worker wallet ", link(explorer("address", worker), short(worker), "mono"));
  if (!row.vault) {
    $("pv-title").textContent = "This worker has not opened a vault yet.";
    $("pv-ledger").replaceChildren();
    return;
  }
  vault = row.vault;
  $("pv-title").textContent = "A Dala pension, locked until payout day";
  $("pv-total").textContent = `${usd(vaultTotal(vault))} paid in · ${usd(vault.claimed)} paid out`;
  $("pv-parts").replaceChildren(...breakdown(vault));
  tick();
  renderLedger($("pv-ledger"), await api.ledger(vault.address, 30), { [s.config.relayer]: "Dala demo payer", [worker]: "the worker" });
}

load().catch((err) => flash(err.message, true));
setInterval(tick, 1000);
setInterval(() => { if (!document.hidden) load().catch(() => {}); }, 20000);
