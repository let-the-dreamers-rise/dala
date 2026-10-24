// Browser wallet. Two ways in, no seed phrase either way:
//  - passkey: the WebAuthn PRF extension turns the user's passkey into a fixed 32-byte secret,
//    which seeds an Ed25519 Solana key. Same passkey on any synced device gives the same wallet.
//  - device: a random key kept in this browser only, for devices whose passkeys lack PRF.
// The private key never leaves the browser. Requires the solanaWeb3 and nacl globals.

const enc = new TextEncoder();
const STORE = { device: "dala.deviceKey", cred: "dala.passkeyId", unlocked: "dala.unlockedSeed" };

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

function store(kind, key, value) {
  try {
    const s = kind === "session" ? sessionStorage : localStorage;
    if (value === undefined) return s.getItem(key);
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    return null;
  }
  return null;
}

export class PasskeyUnsupported extends Error {}

function keypairFromSeed(seed) {
  return solanaWeb3.Keypair.fromSeed(seed);
}

export function passkeysAvailable() {
  return Boolean(window.PublicKeyCredential && navigator.credentials?.create);
}

async function prfSalt() {
  return sha256(enc.encode("dala passkey wallet v1"));
}

async function seedFromPrf(prfOutput) {
  const mixed = new Uint8Array([...enc.encode("dala-wallet-v1"), ...new Uint8Array(prfOutput)]);
  return sha256(mixed);
}

async function assertWithPrf(credentialId) {
  const salt = await prfSalt();
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: rand(32),
      rpId: location.hostname,
      userVerification: "required",
      allowCredentials: credentialId ? [{ type: "public-key", id: unb64(credentialId) }] : [],
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  const out = cred?.getClientExtensionResults?.().prf?.results?.first;
  if (!out) throw new PasskeyUnsupported("This passkey cannot derive a wallet on this device");
  store("local", STORE.cred, b64(cred.rawId));
  return seedFromPrf(out);
}

/** Create a new passkey, then derive its wallet. */
export async function createPasskeyWallet(label) {
  const salt = await prfSalt();
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { name: "Dala", id: location.hostname },
      user: { id: rand(16), name: label, displayName: label },
      challenge: rand(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      extensions: { prf: { eval: { first: salt } } },
    },
  });
  if (cred?.getClientExtensionResults?.().prf?.enabled === false) {
    throw new PasskeyUnsupported("This device's passkeys do not support wallet derivation");
  }
  const seed = await assertWithPrf(b64(cred.rawId));
  return remember(seed);
}

/** Sign in with an existing passkey (any synced device). */
export async function usePasskeyWallet() {
  const seed = await assertWithPrf(store("local", STORE.cred));
  return remember(seed);
}

function remember(seed) {
  store("session", STORE.unlocked, b64(seed));
  return { keypair: keypairFromSeed(seed), method: "passkey" };
}

export function deviceWallet() {
  let saved = store("local", STORE.device);
  if (!saved) {
    saved = b64(rand(32));
    store("local", STORE.device, saved);
  }
  return { keypair: keypairFromSeed(unb64(saved)), method: "device" };
}

/** Re-open the wallet for this tab without a prompt, if it was unlocked earlier in the tab. */
export function restore(method) {
  if (method === "device") return store("local", STORE.device) ? deviceWallet() : null;
  const seed = store("session", STORE.unlocked);
  return seed ? { keypair: keypairFromSeed(unb64(seed)), method: "passkey" } : null;
}

export function forget() {
  store("session", STORE.unlocked, null);
}

export function signMessage(keypair, message) {
  return b64(nacl.sign.detached(enc.encode(message), keypair.secretKey));
}

export function signTransaction(keypair, base64Tx) {
  const tx = solanaWeb3.Transaction.from(unb64(base64Tx));
  tx.partialSign(keypair);
  return b64(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
}
