# agents

A Git-backed library of reusable Agent Skills and custom agent definitions.

## Source-control CLI development

The source-control CLI is authored in TypeScript at
`skills/source-control/src/cli.ts`. Its generated
`skills/source-control/scripts/sc` bundle runs on the repository's supported
Node version and remains the entry point for installed skills. Build both the
compatibility bundle and a standalone executable for the current host with:

```sh
pnpm run sc:build
./dist/sc --help
```

`dist/sc` is local build output and is not committed. The binary still uses
`git`, `gh`, and `tea` from `PATH` for repository discovery and provider
operations. Run the source through Bun during development with
`pnpm run sc:dev -- <arguments>`. `pnpm run sc:test` runs source-control
regression checks against both the Node-compatible script and the standalone
binary; `pnpm test` includes those checks.

## Install skills

List the skills available in this repository:

```sh
pnpm dlx skills@latest add https://git.dageniusal.top/operator/agents.git --list
```

Install a skill interactively:

```sh
pnpm dlx skills@latest add https://git.dageniusal.top/operator/agents.git
```

Install every skill for every detected agent:

```sh
pnpm dlx skills@latest add https://git.dageniusal.top/operator/agents.git --all
```

You can also install from a local checkout while developing:

```sh
pnpm dlx skills@latest add . --list
```

The `skills` CLI installs the contents of `skills/`. Custom definitions in
`agents/` are kept here for reuse, but must be copied or linked according to
the target application's agent format.

## Repository layout

```text
.
├── agents/                  # Portable source files for custom agents
├── scripts/
│   └── validate.mjs         # Repository validation
├── skills/
│   ├── sdlc/
│   │   ├── sdlc/            # Shared SDLC contract and config validator
│   │   ├── sdlc-setup/      # Repository foundation
│   │   ├── sdlc-wayfinder/  # Planning and requirements
│   │   ├── sdlc-design/     # Code-informed system design
│   │   ├── sdlc-implement/  # One work-item implementation
│   │   ├── sdlc-orchestrate/# Single-item and batch delivery
│   │   ├── sdlc-reconcile/  # Post-merge tracking updates
│   │   └── sdlc-audit/      # Read-only lifecycle audit
│   └── thin-slice/          # Legacy compatibility workflow
│       ├── thin-slice/      # Core thin-slice workflow
│       ├── thin-slice-setup/ # Repository lifecycle setup
│       ├── thin-slice-audit/ # Lifecycle traceability audit
│       ├── thin-slice-implement/ # Work-item implementation workflow
│       ├── thin-slice-lifecycle/ # One-issue implementation and review orchestration
│       └── thin-slice-wayfinder/
│           ├── SKILL.md     # Idea refinement workflow
│           └── agents/       # Optional UI metadata
└── package.json
```

Each installable skill is a directory containing a `SKILL.md` file with YAML
frontmatter:

```md
---
name: my-skill
version: 1.0.0
description: What the skill does and when an agent should use it.
---

# My skill

Instructions for the agent.
```

Supporting files such as scripts, references, examples, and assets should live
inside the same skill directory. Never commit secrets or machine-specific
credentials.

Generated issue, comment, and pull-request bodies belong in a unique managed
temporary directory outside the repository. Inspect the exact file before a
provider mutation, remove the directory after success, and never stage or
commit it. Interrupted runs must clean only the recorded uniquely named
directory after confirming it is under the platform temporary directory; do
not use broad temporary-directory deletion.

The `version` field is semantic versioning for installed skill content. Increase
the patch component for fixes, the minor component for additive behavior, and
the major component for breaking workflow changes. Compare this value with the
installed `SKILL.md` frontmatter when checking whether another machine needs an
update; the skills installer does not use it to resolve dependencies.

## Add a skill

1. Create `skills/<skill-name>/SKILL.md`, or place related skills under an
   existing lifecycle directory such as `skills/sdlc/<skill-name>/`.
2. Use a lowercase, hyphenated name that matches the directory.
3. Write a specific description that explains both capability and trigger.
4. Put detailed workflow instructions in the body.
5. Run `pnpm test`.
6. Confirm discovery with `pnpm dlx skills@latest add . --list`.

## Add an agent

Start from [`agents/example-agent.md`](agents/example-agent.md), rename it, and
adapt it to the target application. Agent manifest formats are not yet portable
in the same way as `SKILL.md`, so record the intended runtime in the file.

## Validation

```sh
pnpm test
```

Validation checks skill discovery, required frontmatter, naming, duplicate
names, and accidental secrets.

## Compatibility

Skills follow the open [Agent Skills specification](https://agentskills.io/specification)
and the repository layout recognized by the
[`skills` CLI](https://www.skills.sh/docs/cli).
