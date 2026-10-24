// Thin client for the Dala API. Every response is { ok, data } or { ok: false, error }.
import { signMessage, signTransaction } from "./wallet.js";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("You appear to be offline. Check your connection and try again.", 0);
  }
  const json = await res.json().catch(() => ({ ok: false, error: "The server sent an unreadable reply" }));
  if (!json.ok) throw new ApiError(json.error || "Request failed", res.status);
  return json.data;
}

export const me = () => call("/api/auth/session");
export const signOut = () => call("/api/auth/session", { method: "DELETE" });
export const state = () => call("/api/state");
export const onboard = () => call("/api/onboard", { method: "POST" });
export const topup = (kind, amount) => call("/api/topup", { method: "POST", body: { kind, amount } });
export const pools = () => call("/api/pools");
export const impact = () => call("/api/impact");
export const ledger = async (address, limit = 20) => (await call(`/api/ledger?address=${encodeURIComponent(address)}&limit=${limit}`)).items;
export const vaults = (workers) => call(`/api/vaults?workers=${workers.map(encodeURIComponent).join(",")}`);

export async function signIn(wallet, role) {
  const ch = await call("/api/auth/challenge");
  const signature = signMessage(wallet.keypair, ch.message);
  return call("/api/auth/session", {
    method: "POST",
    body: { pubkey: wallet.keypair.publicKey.toBase58(), signature, nonce: ch.nonce, exp: ch.exp, token: ch.token, role, method: wallet.method },
  });
}

/** Build on the server, sign locally, submit. Returns { sig, ...meta }. */
export async function act(wallet, body) {
  const built = await call("/api/build", { method: "POST", body });
  const signed = signTransaction(wallet.keypair, built.tx);
  const { sig } = await call("/api/submit", { method: "POST", body: { tx: signed } });
  return { ...built, sig };
}
