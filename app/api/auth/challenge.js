import { route } from "../../lib/http.js";
import { rateLimit } from "../../lib/limit.js";
import { issueChallenge } from "../../lib/session.js";

// GET: a nonce for the browser wallet to sign. Stateless: the nonce is MAC'd, not stored.
export default route(["GET"], async (_body, req) => {
  rateLimit(req, "challenge", 60, 10 * 60 * 1000);
  return issueChallenge();
});
