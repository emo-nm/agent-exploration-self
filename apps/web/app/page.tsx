export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 720 }}>
      <h1>Eve vs. Flue — Comparison UI</h1>
      <p>
        Scaffold only. This app will host the four comparison modes described in the
        handoff doc:
      </p>
      <ul>
        <li>
          <code>/direct/eve</code>
        </li>
        <li>
          <code>/direct/flue</code>
        </li>
        <li>
          <code>/smithers/compare</code>
        </li>
        <li>
          <code>/smithers/child-job</code>
        </li>
      </ul>
      <p>
        See <code>docs/eve-flue-smithers-codex-handoff.md</code> for the full plan.
      </p>
    </main>
  );
}
