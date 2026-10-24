import { route, HttpError } from "../../lib/http.js";
import { rateLimit } from "../../lib/limit.js";
import { verifySignIn, setSession, readSession, clearSession, ROLES } from "../../lib/session.js";

const METHODS = ["passkey", "device"];

// GET: who is signed in. POST: sign in with a signed challenge. DELETE: sign out.
export default route(["GET", "POST", "DELETE"], async (body, req, res) => {
  if (req.method === "GET") {
    const s = readSession(req);
    return s ? { pubkey: s.sub, role: s.role, method: s.method } : null;
  }
  if (req.method === "DELETE") {
    clearSession(res);
    return null;
  }
  rateLimit(req, "signin", 30, 10 * 60 * 1000);
  if (!ROLES.includes(body.role)) throw new HttpError(400, "Choose worker or employer");
  const method = METHODS.includes(body.method) ? body.method : "device";
  const sub = verifySignIn(body);
  setSession(res, { sub, role: body.role, method });
  return { pubkey: sub, role: body.role, method };
});
