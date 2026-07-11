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
