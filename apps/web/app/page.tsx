import { BACKENDS, BACKEND_IDS, checkAllHealth } from "../lib/backends";
import { repoBackendLabel } from "../lib/repo";

// Index: lists the direct modes with a server-side health probe of each backend
// so a down service is visible before you click in (task requirement 4).
export const dynamic = "force-dynamic";

export default async function Home() {
  const statuses = await checkAllHealth();
  const byId = Object.fromEntries(statuses.map((s) => [s.backend, s]));

  return (
    <main className="wrap">
      <h1>Agent framework comparison</h1>
      <p className="muted">
        One shared surface, three direct modes. Application repo:{" "}
        <code>{repoBackendLabel()}</code>. Secrets stay server-side; backends are
        health-checked below.
      </p>

      <div className="panel">
        <h2>Direct modes</h2>
        <ul className="clean">
          {BACKEND_IDS.map((id) => {
            const meta = BACKENDS[id];
            const s = byId[id];
            return (
              <li key={id} className="row">
                <span className={`dot ${s?.up ? "up" : "down"}`} />
                <a href={`/direct/${id}`} className="grow">
                  <strong>{meta.label}</strong>{" "}
                  <span className="muted">/direct/{id}</span>
                </a>
                <span className="muted mono" style={{ fontSize: 11 }}>
                  {meta.baseUrl} - {s?.up ? "up" : `down (${s?.detail ?? "?"})`}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Backends serve health without credentials; a live conversation needs a
          model key (not present in this environment). The approval flow works
          against the repo regardless.
        </p>
      </div>

      <div className="panel">
        <h2>Smithers modes</h2>
        <ul className="clean">
          <li>
            <a href="/smithers/compare">/smithers/compare</a>{" "}
            <span className="pill">phase 3</span>
          </li>
          <li>
            <a href="/smithers/child-job">/smithers/child-job</a>{" "}
            <span className="pill">phase 3</span>
          </li>
        </ul>
      </div>
    </main>
  );
}
