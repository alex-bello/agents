---
name: sdlc-setup
version: 1.0.0
description: Inspect a repository and establish its validated unified SDLC configuration, labels, conventions, and recovery contract.
---

# SDLC setup

Establish the repository foundation for the unified SDLC workflow. Read
`AGENTS.md`, `README.md`, applicable project instructions, and the shared
`sdlc` skill first.

## Inspect

Report the provider, authentication, repository, default/current branches,
package manager, `validate` command, tests, formatter, CI, branch conventions,
existing labels, and source-control capabilities. Inspect `.sdlc.yml` when it
exists and validate it from the repository root:

```sh
pnpm run sdlc:validate-config -- .sdlc.yml
```

Use `skills/source-control/scripts/sc` for provider operations. Do not install
dependencies, modify the default branch, create labels, or change files during
inspection.

## Propose and apply

After inspection, propose `.sdlc.yml`, `SDLC.md`, package scripts, canonical
label mappings, setup branch, and optional setup PR. Show existing labels
separately from labels proposed for creation. Require explicit confirmation for
package-script edits, label creation, and branch/configuration/PR mutations.

The generated configuration must define all canonical ownership, phase, and
generic state labels; all three delivery flavors; reviewer configuration; a
positive `orchestration.max_concurrency`; exactly two remediation passes; and
the repository’s branch, worktree, PR, verification, and reconciliation
policies. Batch mode must require isolated worktrees when concurrency is above
one.

Apply only the approved changes. Use PNPM for project commands, validate the
configuration, run `pnpm run validate`, and verify generated commands from the
repository root and an unrelated working directory. Use managed temporary body
files outside the repository for provider mutations.

## Failure handling

Stop before the next mutation when validation, authentication, label handling,
branch safety, or provider operations fail. Preserve exact diagnostics and the
last verified state. Never fall back to raw provider CLIs or APIs.
