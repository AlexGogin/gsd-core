# Docs sync — verify:post step

You are the verifier closing a phase. Before the phase can be declared closed, sync the
project documents against the project document registry.

## Inputs

- The phase's SUMMARY artifacts in the phase directory (what the phase actually changed).
- The project document registry. Canonical location: `.planning/PROJECT-DOCS.md` — a
  markdown table of `| Path | Topic | Owner phase | Last touched |`. If the project keeps
  its document index elsewhere (for example `docs/README.md`), use that; the project policy
  layer (an `AGENTS-CUSTOM.md`-style file or the managed custom section of the project's
  agent-instruction file) names the location.

## Two control questions

Answer BOTH in the `## Docs sync` section of VERIFICATION.md:

1. **Operational surface:** did the phase change a host / service / monitoring / backup
   surface? → update the matching runbook and/or machine-readable inventory file.
2. **Cross-cutting topic:** which cross-cutting topic did the phase work through?
   → contribute at least one substantive paragraph to the registry document for that topic.

## Per-document lines

Every touched registry document gets its own line under `## Docs sync`:

- `<path> — updated (commit <hash>)`, or
- `<path> — not required (<reason>)`.

**A phase is not closed without a filled `## Docs sync` section.** This step is dispatched
advisory (`onError: continue`); the closure rule above is a project-process requirement that
the verifier enforces by refusing to mark the phase complete with the section missing.

## Open registry

The registry is an OPEN list. If the phase surfaced a new cross-cutting topic that has no
document yet: create the document AND append a registry row in the same commit. There is no
allow-list enforcement — the git history of the registry file is the audit trail.

## Last-touched bookkeeping

For every document synced in this phase, update that row's `Last touched` column with the
closing phase's number. Leave `Owner phase` unchanged unless a phase explicitly takes
ownership of a document's lifecycle.
