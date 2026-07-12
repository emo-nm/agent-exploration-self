# Web comparison UI — build notes (plan step 6)

Built the shared comparison UI in `apps/web` (was a bare Next.js 15 / React 19
app). Direct modes only; Smithers modes are phase-3 stubs. Verified at root:
`pnpm install`, `typecheck` (15 tasks), `test` (9 tasks), `build` (5 tasks) all
pass. Runtime-verified the UI loads, the health panel degrades gracefully, and
the approval flow round-trips against the live local Postgres.

## What was built

One shared surface (`app/components/ComparisonSurface.tsx`) parameterized by
backend; all three direct modes (`/direct/eve`, `/direct/flue`,
`/direct/mastra`) render it through a single dynamic route
(`app/direct/[backend]/page.tsx`). Panels: thread selector + new-thread,
send-a-turn, transcript, full event stream, tool activity, subagent activity,
pending-approval card (approve/deny), final-artifact (publication receipt), and
a backend badge with live health + base URL.

- **Index page `/`** (server component): lists the three direct modes with a
  server-side health probe of each backend (up/down + detail), plus the
  phase-3 Smithers links. Shows whether the app repo is `postgres` or
  `in-memory`.
- **Event rendering** (`lib/events.ts`, pure): maps each normalized
  `@demo/contracts` `AgentEvent` variant to a display descriptor
  (glyph/label/summary/tone/time). Every event row has a collapsible **raw
  native-event inspector** (`EventItem.tsx`) rendering the `raw` passthrough —
  framework-specific payloads are never hidden.
- **Approval card** (`lib/approval.ts` pure reducer + `ApprovalCard.tsx`):
  a small state machine (idle -> loading -> pending -> deciding -> settled,
  with an error branch and double-submit guard). Drives the application-owned
  proposals flow via route handlers.
- **Route handlers** (all `runtime = "nodejs"`, server-only):
  - `GET  /api/health` — probes all three backends.
  - `POST /api/[backend]/message` — streams normalized `AgentEvent`s to the
    browser as SSE (one JSON event per `data:` frame, `raw` attached).
  - `POST|GET /api/[backend]/thread` — create / fetch a `demo_threads` row.
  - `POST /api/proposals`, `GET|POST /api/proposals/[id]` — application-owned
    proposals: create, read, approve/deny (status flip + `decidedAt`). Refuses
    to re-decide a settled proposal (409).
- **Server boundary**: adapters and `@demo/persistence` are only touched from
  route handlers / server modules (`lib/repo.ts` is `import "server-only"`).
  No secret or service base URL reaches the browser; the client only talks to
  `/api/*`. Base URLs come from `EVE_BASE_URL` / `FLUE_BASE_URL` /
  `MASTRA_BASE_URL` (localhost 3001/3002/3003 defaults); added
  `MASTRA_BASE_URL` to `.env.example`.
- **Tests** (`test/events.test.ts`, `test/approval.test.ts`, vitest): 13 tests
  over the event-normalization rendering and the approval state machine. Kept
  as pure-function tests (no DOM/testing-library dependency).

## Verification status

- [live] `pnpm install / typecheck / test / build` pass at repo root (Node 24).
- [live] `pnpm start` for web: `/`, `/direct/eve` (and flue/mastra) return 200;
  `/api/health` returns all three `up:false` with `detail:"fetch failed"` when
  backends are down — the graceful-degrade path.
- [live] Approval flow against local Postgres (`DATABASE_URL=
  postgresql://localhost:5432/agent_eval`): created a proposal, read it back,
  approved it (status -> approved, `decidedAt` set), got 409 on re-approve, and
  created an eve thread row. Confirmed rows landed in `publication_proposals`
  and `demo_threads` via psql — so the Drizzle/Postgres repo path is exercised
  end-to-end from the web app, not just in-memory.
- [blocked] No live agent conversation: there is no model API key in this env,
  so `POST /api/[backend]/message` cannot produce a real turn. The stream is
  wired and yields a normalized `error` event when the backend/adapter is
  unreachable (verified indirectly via the down-backend path). The event
  renderer and raw inspector were exercised via unit tests, not a live stream.

## `pnpm dev` / ports

Turbo `dev` starts web+eve+flue+mastra together. Ports do not collide:
web 3000 (`next dev --port 3000`), eve 3001 (`eve dev --port 3001`), flue 3002
(`flue dev --port 3002`), mastra 3003. Note: **Mastra's dev port is set in
config** (`apps/mastra/src/mastra/index.ts` `server.port: 3003`), not via a CLI
flag like the others — so changing it means editing code, not the dev script.
Did not run the full `pnpm dev` fan-out here (the framework dev servers want
Node 24 + model keys to be useful); port assignment verified by inspection of
each app's dev script/config.

## Adapter/package gaps found (findings)

These are properties of the shared layer surfaced by trying to consume it from
one UI:

1. **The three adapters have genuinely different shapes.** `eve-adapter`
   collects a turn's events and returns them (`sendMessage -> {events, state}`,
   not streaming); `flue-adapter` is submit-then-observe (`sendMessage` then
   `getThread`/`streamEvents(callback)`); `mastra-adapter` is a true async
   generator (`streamEvents(): AsyncGenerator`). `lib/agent-runtime.ts` papers
   over this behind one `AsyncGenerator<AgentEvent>`, but the divergence means
   only Mastra streams incrementally — Eve and Flue are effectively
   turn-at-a-time from the UI's perspective. Worth flagging for the memo
   (criterion 4 observability / live-stream ergonomics).
2. **No health method on the Flue adapter** (Eve and Mastra adapters expose
   `health()`; Flue does not). The UI health-checks all three by direct
   `fetch` to per-framework health paths instead, which also sidesteps having
   to instantiate three different clients just to ping. The health paths
   themselves differ and are a finding: eve `/eve/v1/health`, flue `/health`,
   mastra `/demo/health` (Mastra's built-in `/health` returns `{success:true}`
   and shadows custom routes).
3. **`ThreadsRepo` / `ProposalsRepo` have no list method.** There is no way to
   enumerate threads for a backend or list pending proposals — you can only
   get-by-id. The thread selector therefore remembers thread ids in the
   browser's `localStorage`, and the approval card is driven by a proposalId
   from the event stream (or a manually created demo proposal). A `listThreads`
   / `listPendingProposals` would make a real multi-thread UI and an approvals
   inbox straightforward; today they are not possible without a schema query.
4. **Workspace packages use NodeNext `.js` import specifiers over `.ts`
   source** (e.g. `@demo/persistence` imports `./repo.js`). Next's webpack does
   not resolve `.js` -> `.ts` by default, so the build failed until I added a
   `resolve.extensionAlias` mapping in `next.config.ts`. Any bundler consuming
   these raw-TS packages will hit the same wall — a packaging friction worth
   noting (the Flue baseline already noted a related "can't load raw-TS
   workspace pkgs" issue).
5. **`createDemoRepo()` builds a fresh pg pool per call.** Fine for a demo, but
   in a long-lived Next server it would leak pools; `lib/repo.ts` caches a
   singleton on `globalThis` to avoid that. A repo-level "get shared repo"
   helper would be nicer than each consumer memoizing.

## Blocked pending keys

- Real agent conversations in any of the three direct modes (needs a model
  key + the framework dev/start servers running). The message-stream plumbing,
  event normalization, and raw inspector are built and unit-tested but not
  exercised against a live model stream.
- Verifying the per-framework event field mapping in the adapters' normalizers
  (already flagged as unverified in the adapter source) — only observable once
  a live stream produces native events.
