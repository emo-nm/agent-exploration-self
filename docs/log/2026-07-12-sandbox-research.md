# Sandbox / execution-backend research (2026-07-12)

Scope: how each framework isolates model-driven shell/code execution, what
backends are selectable, what the official *local* dev story is, and whether our
`apps/eve/agent/sandbox.ts` `justbash()` pin is the right local pattern.

Tiers: **[live]** = verified against installed code/docs here · **[doc]** =
docs claim, untested at runtime. Everything here is doc/source-verified; no
model loop was run (no keys).

Ground-truth sources (installed packages):
- Eve 0.22.5 bundled docs: `node_modules/.pnpm/eve@0.22.5.../eve/docs/sandbox.mdx`,
  `.../docs/concepts/security-model.md`, `.../docs/reference/cli.md`,
  `.../docs/getting-started.mdx`. [live-read]
- Flue `@flue/runtime` 1.0.0-beta.9 bundled docs: `.../@flue/runtime/docs/guide/sandboxes.md`,
  plus `dist/sandbox-9WxaLcPt.d.mts` (public `SandboxApi` / `bash` / `local`). [live-read]
- Mastra 1.18.2 / `@mastra/core` 1.50.1: `@mastra/core` `CHANGELOG.md` +
  `.d.ts` grep (`workspace.filesystem` / `workspace.sandbox`). [live-read]
- Vercel platform: https://vercel.com/docs/sandbox (referenced by eve docs). [doc]

---

## 1. EVE

**Production (on Vercel).** Every eve agent has exactly one sandbox: an isolated
bash environment rooted at `/workspace`. On hosted Vercel each sandbox is a
**Vercel Sandbox microVM with hardware-level isolation** (security-model.md).
The trust boundary is explicit:

| | App runtime (trusted) | Sandbox (untrusted) |
|---|---|---|
| `process.env` / secrets | Yes | No |
| Network | Unrestricted | Controlled by policy |
| Filesystem | App's own | Isolated `/workspace` |

Key subtlety: **only shell commands run in the sandbox.** Authored tools
(`defineTool` `execute`), model calls, connections, state, and durable execution
all run in the app runtime (a Vercel Function). Even the built-in
`bash`/`read_file`/`write_file`/`glob`/`grep` tools *live in the app runtime and
proxy into the sandbox*. So our demo — which does all real work in app-runtime
tools (search/propose/publish) — touches the sandbox for essentially nothing.
But the sandbox still exists and still prewarms.

**Backends (four pinned factories + an availability-aware default), from
`eve/sandbox` and nested `eve/sandbox/*`:** [live-read sandbox.mdx]

- `vercel()` — Vercel Sandbox microVM (prod; also usable from local dev with
  Vercel creds). Domain-level network policy + credential brokering.
- `docker()` — local Docker container via the `docker` CLI (Docker Desktop /
  OrbStack / Colima / Podman). Base image `ghcr.io/vercel/eve:latest`.
  Long-lived container per durable session; `/workspace` persists across turns.
  Network policy honored only as `allow-all` / `deny-all`.
- `microsandbox()` — local lightweight VM, snapshot-backed templates, a
  `vercel-sandbox` user, firewall with domain-level policy + brokering.
  "Closest local match to hosted Vercel Sandbox." Hosts: macOS Apple Silicon,
  or glibc Linux with KVM. **The `microsandbox` npm pkg + VM runtime are NOT
  bundled** — `eve dev` auto-installs when missing; **production processes fail
  with an install error.**
- `justbash()` — pure-JS `just-bash` interpreter. No daemon, no VM, virtual FS
  under `.eve/sandbox-cache/`. **No real binaries (`git`, `node`, package
  managers) and NO network isolation.** `setNetworkPolicy` is rejected entirely.
  `just-bash` is an optional peer dep; `eve dev` auto-installs, production fails
  with an install error.
- `defaultBackend()` (used when `backend` is omitted) — resolves on first use in
  priority order: **Vercel Sandbox (when `process.env.VERCEL` set) → Docker (if
  a daemon is reachable) → microsandbox (supported host) → just-bash** fallback.
  Accepts a keyed options bag so each inner backend gets typed create options.

**Official local-dev story.** `eve dev` is the local runtime: it boots eve's
durable server + HMR + terminal UI, and `eve dev --no-ui` is the headless
"controllable background" mode for verification (getting-started.mdx, cli.md).
`eve dev` is also what **auto-installs** the microsandbox / just-bash packages
when a backend needs them. `eve start`, by contrast, "serves the built
`.output/` app" — it is the *production / self-hosted serving* command and does
**not** auto-install backends; those "production processes fail with actionable
install errors instead" (sandbox.mdx). There is no separate "sandbox emulator";
local parity comes from `docker()`/`microsandbox()` sharing the
`ghcr.io/vercel/eve:latest` image and the single `/workspace` namespace ("`/workspace/foo`
points at the same file whether the backend is local or Vercel").

**Local-vs-prod parity per backend:** microsandbox is the closest local match to
Vercel Sandbox (VM isolation + domain policy + brokering). Docker is close
(container isolation, `allow-all`/`deny-all` only, no domain policy/brokering).
just-bash is NOT parity: no real binaries, no isolation, no network policy.

**Is our `justbash()` pin legitimate?** It is a *documented, first-class backend*
— so it is not an undocumented hack, and for THIS demo (zero sandbox work) it is
functionally harmless. But as a *local-dev choice it is the wrong lever*: it was
introduced to work around running `eve start` locally (which doesn't
auto-install microsandbox), and it silently changes semantics — no isolation, no
real toolchain, `setNetworkPolicy` throws. Any future demo step that shells out
to `git`/`node`/network would behave differently locally than in prod, with no
warning. The friction the baseline hit is real, but its root cause is "we ran
the production serve command locally," not "the default backend is broken."

License: eve is Apache-2.0 [live, per prior baseline notes].

---

## 2. FLUE

Flue's model mirrors eve's shape (harness gives the agent filesystem + command
access) but with a **weaker default and a Node-target escape hatch**
(sandboxes.md, `dist/sandbox-9WxaLcPt.d.mts`):

- **Virtual sandbox (default).** In-memory workspace powered by **just-bash**
  (same engine eve's justbash backend uses). Selected when the `sandbox` field
  is omitted. Explicitly documented as: not persistent, "not an arbitrary Linux
  toolchain," and **"not a network isolation boundary: current generated
  runtimes permit network access from the virtual sandbox."** So Flue's Node
  target does **not** meaningfully isolate command execution by default.
- **`local()`** (from `@flue/runtime/node`) — agent operates directly on the
  host filesystem and shell. Docs are blunt: "It does not provide isolation
  between model-directed work and the host machine." Host env vars limited by
  default; widen via `local({ env: { ... } })`. For trusted dev tools / CI.
- **Remote sandboxes** — provider-managed isolation supplied via ecosystem
  integrations: **Daytona**, **Cloudflare Sandbox** (container-backed Linux),
  E2B/Modal/Mirage-style providers (named in the `SandboxApi` type doc). You
  implement/choose an adapter conforming to `SandboxApi` (`readFile`/`writeFile`/
  `exec` with `timeoutMs` + optional `AbortSignal` cancellation).

Local vs deployed: local is either the virtual sandbox (no isolation) or
`local()` (explicitly no isolation); real isolation is only via a remote/cloud
provider you wire up yourself. Isolation is **opt-in and BYO-provider**, whereas
eve gives you a hardware-isolated microVM automatically in prod. The Flue README
example even ships `sandbox: local()` as the illustrative default.

License: Apache-2.0 [per prior baseline notes].

---

## 3. MASTRA

Mastra has a sandbox concept but it is a general **Workspace** abstraction, not
an isolation guarantee (`@mastra/core` CHANGELOG + `.d.ts`):

- A `Workspace` = `workspace.filesystem` + `workspace.sandbox` (file ops +
  command execution). The default factory wires "**a local filesystem + sandbox
  rooted at `process.cwd()`**" — i.e. runs on the host, no isolation. You can set
  `basePath`, pass your own `workspace`, or `workspace: undefined` to opt out
  entirely.
- A **WorkspaceProvider registry** lets you register cloud providers
  (`new MyCloudFilesystem(...)` / `new MyCloudSandbox(...)`) so stored agents can
  reference `{ type: 'provider', provider: 'my-cloud' }`. Isolation, like Flue,
  is **BYO cloud provider**; the built-in default is local/unisolated.

So: yes, Mastra has a sandbox/workspace story, but the stock local default is
host-rooted execution, not an isolation boundary. (Consistent with the
criterion-7 finding that Mastra leans on generic primitives rather than
opinionated defaults.) License: Apache-2.0.

---

## 4. COMPARISON TABLE

| Framework | Backend / mode | Isolates command exec? | Network isolation | Real toolchain (git/node) | Local mac | CI | Prod | Auto-selected? |
|---|---|---|---|---|---|---|---|---|
| Eve | `vercel()` | Yes (microVM, HW-level) | Domain policy + brokering | Yes (image) | via creds | via creds | **default on Vercel** | default when `VERCEL` set |
| Eve | `microsandbox()` | Yes (local VM) | Domain policy + brokering | Yes (image) | Apple Silicon only | glibc+KVM | self-host | default #3 (pkg not bundled; `eve dev` installs) |
| Eve | `docker()` | Yes (container) | allow-all/deny-all only | Yes (image) | needs daemon | needs daemon | self-host | default #2 (if daemon reachable) |
| Eve | `justbash()` | **No** | **None** (policy throws) | **No** | Yes | Yes | fails on `eve start` unless installed | default #4 fallback |
| Flue | virtual (default) | No (in-memory just-bash) | **None** (net permitted) | No | Yes | Yes | Yes | default |
| Flue | `local()` (node) | **No** (host shell/FS) | None | Host's | Yes | Yes (disposable runners) | discouraged | opt-in |
| Flue | remote (Daytona/Cloudflare/E2B...) | Yes (provider) | provider-defined | provider image | via provider | via provider | via provider | BYO |
| Mastra | default Workspace | **No** (host, `process.cwd()`) | None | Host's | Yes | Yes | discouraged | default |
| Mastra | WorkspaceProvider (cloud) | Yes (provider) | provider-defined | provider | via provider | via provider | via provider | BYO |

Headline: **only Eve ships real isolation as the automatic default (in prod)**.
Flue and Mastra default to non-isolated local execution and make isolation an
opt-in, bring-your-own-provider decision. This is a genuine criterion-5 /
security signal for the memo, not just a local-dev detail.

---

## 5. WHAT WE SHOULD CHANGE IN apps/eve, IF ANYTHING

Root cause of the baseline friction: we serve locally with **`eve start`** (the
production serve command, which does not auto-install sandbox backends), so the
default microsandbox backend failed to prewarm, and we pinned `justbash()` to
get past it. The pin works but it is the wrong lever — it disables isolation and
the real toolchain, and it masks the fact that prod (`vercel()` microVM) behaves
differently.

Recommended, in order:

1. **Prefer `eve dev` for local runs.** `apps/eve/package.json` already has
   `"dev": "eve dev --no-ui --port 3001"`. `eve dev` auto-installs the backend
   `defaultBackend()` selects (Docker if a daemon is up, else microsandbox on
   this Apple-Silicon host) and gives real local↔prod parity. Then **delete
   `agent/sandbox.ts`** and let `defaultBackend()` resolve. This removes the
   `just-bash` devDependency and the divergence. Use `eve start` only for the
   built-output/deploy smoke test, where `vercel()` is selected automatically.

2. **If we specifically want `eve start` to work on this host** (e.g. testing
   the built `.output/`), the parity-correct pin is Docker, not just-bash — start
   Docker Desktop/OrbStack and either omit `backend` (defaultBackend picks
   `docker()`) or pin it explicitly:

   ```ts
   // agent/sandbox.ts
   import { defineSandbox } from "eve/sandbox";
   import { docker } from "eve/sandbox/docker";
   export default defineSandbox({ backend: docker() }); // ghcr.io/vercel/eve:latest
   ```

   Or, to keep the availability-aware default but stop `eve start` from dying
   when microsandbox isn't installed, rely on the just-bash fallback *knowingly*
   rather than pinning it — the honest thing is to document that `eve start`
   locally needs a backend installed, which `eve dev` does for you.

3. **Only keep `justbash()` if we make an explicit, documented decision** that
   this demo does zero sandbox work and we accept losing isolation locally. Even
   then, prefer leaving `backend` omitted and running via `eve dev` so the
   fallback is reached automatically, instead of hard-pinning it (a hard pin
   would also override `vercel()` in prod, which we do NOT want — worth checking
   the current pin isn't shipping to the Vercel deploy and defeating the microVM).

**Action for the memo/STATE (not edited here):** reframe finding #1 in the eve
baseline notes from "default backend is broken" to "we used the prod serve
command (`eve start`) locally; the supported local command is `eve dev`, which
auto-installs a real backend. The `justbash` pin trades away isolation and, if it
reaches the Vercel deploy, would override the microVM." Also add the criterion-5
comparison point: Eve isolates by default in prod; Flue/Mastra do not.
