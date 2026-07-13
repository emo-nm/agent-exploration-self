import { eveChannel } from "eve/channels/eve";
import {
  extractBearerToken,
  localDev,
  vercelOidc,
  type AuthFn,
} from "eve/channels/auth";
import { timingSafeEqual } from "node:crypto";

// Criterion 8 measurement: replacing eve's placeholderAuth with a REAL
// provider. eve hard-refuses production traffic on the placeholder (observed
// live: 401 eve_production_auth_not_configured on the deployed app), so auth
// is enforced, not optional. This is the minimal honest provider: a service
// token compared in constant time. A user-facing app would swap this AuthFn
// for Clerk/Auth.js; the shape (one function returning SessionAuthContext)
// stays the same.
function serviceToken(): AuthFn<Request> {
  return (req) => {
    const expected = process.env.EVE_SERVICE_TOKEN;
    if (!expected) return null; // unset -> skip, fall through to next entry
    const got = extractBearerToken(req.headers.get("authorization"));
    if (!got) return null;
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return {
      attributes: {},
      authenticator: "service-token",
      principalId: "eval-harness",
      principalType: "service",
    };
  };
}

export default eveChannel({
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // Bearer service token for the eval harness (prod).
    serviceToken(),
  ],
});
