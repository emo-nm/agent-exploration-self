// Map an application thread ID to a stable Flue agent instance ID.
//
// In Flue the agent instance id IS the caller-chosen path segment in
// `POST /agents/<name>/<id>` (handoff #12: "Map the application thread ID to a
// stable Flue agent instance ID"). Flue owns no separate instance registry, so
// the mapping is a deterministic, reversible-enough sanitization: the same
// thread id always yields the same Flue instance id, and different thread ids
// never collide (unsafe characters are percent-escaped, not dropped).
export const RESEARCH_PUBLISHER_AGENT = "research-publisher";

/** Deterministic thread-id -> Flue-instance-id mapping. Stable across restarts. */
export function toFlueInstanceId(threadId: string): string {
    if (!threadId) throw new Error("threadId must be a non-empty string");
    // Keep URL-path-safe characters as-is; escape everything else so the mapping
    // is injective (no two distinct thread ids map to the same instance id).
    return threadId.replace(/[^A-Za-z0-9_-]/g, (ch) => {
        const hex = ch.codePointAt(0)!.toString(16).padStart(2, "0");
        return `~${hex}`;
    });
}
