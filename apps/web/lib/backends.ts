// Backend registry + server-side health checks (shared comparison instrument).
// Framework base URLs come from env (localhost defaults per docs/architecture.md
// service map). Health paths differ per framework — that difference is itself a
// finding (see docs/log/2026-07-11-web-ui-notes.md).
import type { Backend } from "@demo/contracts";

export interface BackendMeta {
  id: Backend;
  label: string;
  /** Local dev port (docs/architecture.md topology). */
  port: number;
  /** Base URL, env-overridable. */
  baseUrl: string;
  /** Framework-specific health endpoint path. */
  healthPath: string;
  /** One-line note about the framework's native idiom, shown in the UI. */
  blurb: string;
}

const env = (key: string, fallback: string): string =>
  process.env[key]?.replace(/\/$/, "") ?? fallback;

export const BACKENDS: Record<Backend, BackendMeta> = {
  eve: {
    id: "eve",
    label: "Eve",
    port: 3001,
    baseUrl: env("EVE_BASE_URL", "http://localhost:3001"),
    // eve exposes a public, uncredentialed health route (eve baseline notes).
    healthPath: "/eve/v1/health",
    blurb: "Filesystem-first durable sessions; typed eve/client.",
  },
  flue: {
    id: "flue",
    label: "Flue",
    port: 3002,
    baseUrl: env("FLUE_BASE_URL", "http://localhost:3002"),
    healthPath: "/health",
    blurb: "Programmable TS harness; materialized conversation.",
  },
  mastra: {
    id: "mastra",
    label: "Mastra",
    port: 3003,
    baseUrl: env("MASTRA_BASE_URL", "http://localhost:3003"),
    // Mastra's built-in GET /health shadows custom routes; the app registers a
    // richer /demo/health (apps/mastra/src/mastra/index.ts).
    healthPath: "/demo/health",
    blurb: "TS agents + zod tools; native suspend/resume + scorers.",
  },
};

export const BACKEND_IDS = Object.keys(BACKENDS) as Backend[];

export function isBackend(value: string): value is Backend {
  return value in BACKENDS;
}

export interface HealthStatus {
  backend: Backend;
  up: boolean;
  detail: string;
  baseUrl: string;
}

/** Server-side health probe with a short timeout so a down backend never hangs the page. */
export async function checkHealth(backend: Backend): Promise<HealthStatus> {
  const meta = BACKENDS[backend];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${meta.baseUrl}${meta.healthPath}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    const up = res.ok;
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.text();
      if (body) detail = body.slice(0, 120);
    } catch {
      // ignore body read errors
    }
    return { backend, up, detail, baseUrl: meta.baseUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      backend,
      up: false,
      detail: message.includes("aborted") ? "timed out" : message,
      baseUrl: meta.baseUrl,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function checkAllHealth(): Promise<HealthStatus[]> {
  return Promise.all(BACKEND_IDS.map(checkHealth));
}
