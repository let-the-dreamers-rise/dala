// Stateless sign-in: the browser proves it holds a wallet key by signing a server nonce,
// then gets an HMAC-signed, HttpOnly session cookie. No database and no passwords.
import { createHmac, randomBytes, timingSafeEqual, verify, createPublicKey } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { HttpError } from "./http.js";

const COOKIE = "dala_session";
const SESSION_SECS = 12 * 60 * 60;
const CHALLENGE_SECS = 5 * 60;
export const ROLES = ["worker", "employer", "foundation"];

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET is missing or too short");
  return s;
}

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const mac = (text) => createHmac("sha256", secret()).update(text).digest("base64url");

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const signInMessage = (nonce, exp) =>
  `Sign in to Dala\n\nThis proves you hold this wallet. It does not move any money.\n\nNonce: ${nonce}\nExpires: ${exp}`;

export function issueChallenge() {
  const nonce = b64u(randomBytes(16));
  const exp = Math.floor(Date.now() / 1000) + CHALLENGE_SECS;
  return { nonce, exp, token: mac(`challenge:${nonce}:${exp}`), message: signInMessage(nonce, exp) };
}

// Ed25519 public key as SPKI DER: fixed 12-byte prefix plus the 32 raw key bytes.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifySignIn({ pubkey, signature, nonce, exp, token }) {
  const now = Math.floor(Date.now() / 1000);
  if (!nonce || !exp || !token || !safeEqual(token, mac(`challenge:${nonce}:${exp}`))) {
    throw new HttpError(400, "Sign-in challenge is invalid. Start again.");
  }
  if (Number(exp) < now) throw new HttpError(400, "Sign-in challenge expired. Start again.");
  let key;
  try {
    key = new PublicKey(String(pubkey));
  } catch {
    throw new HttpError(400, "Wallet address is invalid");
  }
  const sig = Buffer.from(String(signature || ""), "base64");
  if (sig.length !== 64) throw new HttpError(400, "Signature is malformed");
  const der = Buffer.concat([SPKI_PREFIX, key.toBuffer()]);
  const ok = verify(null, Buffer.from(signInMessage(nonce, exp)), createPublicKey({ key: der, format: "der", type: "spki" }), sig);
  if (!ok) throw new HttpError(401, "Signature does not match this wallet");
  return key.toBase58();
}

export function setSession(res, { sub, role, method }) {
  if (!ROLES.includes(role)) throw new HttpError(400, "Choose worker, employer or foundation");
  const payload = b64u(JSON.stringify({ sub, role, method, exp: Math.floor(Date.now() / 1000) + SESSION_SECS }));
  const value = `${payload}.${mac(payload)}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECS}`);
}

export function clearSession(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

export function readSession(req) {
  const raw = String(req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!payload || !sig || !safeEqual(sig, mac(payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString());
    return s.exp > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}

export function requireSession(req, role) {
  const s = readSession(req);
  if (!s) throw new HttpError(401, "Sign in first");
  if (role && s.role !== role) throw new HttpError(403, `This action is for the ${role} view`);
  return s;
}
