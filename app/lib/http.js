// Request handling helpers shared by every API route.
import { PublicKey } from "@solana/web3.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Pull the human-readable Anchor error out of failed transaction logs. */
export function programError(err) {
  const logs = err?.transactionLogs || err?.logs || [];
  for (const line of logs) {
    const m = /Error Message: (.+?)\.?$/.exec(line);
    if (m) return m[1];
  }
  if (logs.some((l) => l.includes("insufficient funds"))) return "Not enough demo USDC in that wallet";
  return null;
}

export function parsePubkey(value, name) {
  try {
    return new PublicKey(String(value));
  } catch {
    throw new HttpError(400, `${name} is not a valid Solana address`);
  }
}

export function parseWhole(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${name} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) {
    try { return JSON.parse(req.body); } catch { throw new HttpError(400, "Request body must be JSON"); }
  }
  return {};
}

/**
 * Wrap a route: method check, JSON body, uniform { ok, data | error } envelope.
 * Program errors become 422 with the program's own message; unknown errors are logged, not leaked.
 */
export function route(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) {
      res.setHeader("Allow", methods.join(", "));
      return res.status(405).json({ ok: false, error: `Use ${methods.join(" or ")}` });
    }
    try {
      const data = await fn(readBody(req), req, res);
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ ok: false, error: err.message });
      const msg = programError(err);
      if (msg) return res.status(422).json({ ok: false, error: msg });
      console.error("[dala api]", req.url, err);
      return res.status(502).json({ ok: false, error: "The Solana network did not accept the request. Try again in a few seconds." });
    }
  };
}
