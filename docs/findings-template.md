# Findings (template)

Copy to `docs/findings.md` and update at the end of every phase (§24). Record
measured data, not impressions. Keep framework behavior separate from model
variance (§20).

## Resolved package versions

Pin exact resolved versions from the lockfile here (§7 version policy).

| Package | Version |
| ------- | ------- |
| eve     |         |
| @flue/runtime |   |
| @flue/cli |       |
| smithers-orchestrator | |
| next    |         |
| turbo   |         |

## Per-phase log

For each phase, capture:

- what worked
- what differed from docs
- framework-specific workarounds
- unresolved issues
- measured LOC / setup / runtime data

## Evaluation metrics

See §20. Implementation, Runtime, Developer experience, Portability.

## Skill authoring & discovery (criterion 7, added 07-11)

Per candidate, record from first-hand use:

- how a custom skill is defined (file format, location, frontmatter)
- how the agent discovers/invokes it (automatic, manifest, code registration)
- whether skills compose (skill → tool/subagent references)
- hot-reload / iteration loop while authoring
- if the framework has no first-class skill concept, what the closest
  equivalent is — the absence is itself a finding

## Auth story (criterion 8, added 07-11)

Per candidate, record from first-hand use:

- end-user identity: how a session is bound to a user; what enforces that
  user A cannot resume user B's thread (test-plan security row)
- service auth: how the web app / adapters authenticate to the agent runtime
  (tokens, OIDC, platform-magic)
- connections/OAuth to external tools: who stores the tokens, whether the
  model can ever see them
- setup effort vs. lock-in: what you get for free on the home platform, and
  what you'd rebuild if you left
