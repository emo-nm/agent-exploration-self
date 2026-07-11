// Application-owned auth (criterion 8). Flue owns no end-user identity: the
// `route` export is an ordinary Hono middleware, so identity and per-instance
// authorization are entirely the application's job. This baseline demonstrates
// the boundary with a bounded, optional service token; a real deployment would
// resolve a principal and check it against the requested thread/instance id
// here (see docs/log/2026-07-11-flue-baseline-notes.md, criterion 8).
export interface AuthDecision {
  ok: boolean;
  status: 401 | 403;
  reason: string;
}

const OK: AuthDecision = { ok: true, status: 401, reason: "" };

export function authenticateAgentRequest(
  authorization: string | undefined,
  instanceId: string | undefined,
): AuthDecision {
  if (!instanceId) {
    return { ok: false, status: 403, reason: "missing agent instance id" };
  }
  const expected = process.env.FLUE_AUTH_TOKEN;
  // When no service token is configured (this spike), allow all callers but
  // keep the instance-id check so the boundary is exercised.
  if (!expected) return OK;

  const presented = authorization?.replace(/^Bearer\s+/i, "");
  if (presented !== expected) {
    return { ok: false, status: 401, reason: "invalid or missing bearer token" };
  }
  return OK;
}
