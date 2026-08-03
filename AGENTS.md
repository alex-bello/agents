# Agent Instructions

Always use PNPM for package-management and project-script commands. Do not use
`npm`, `npx`, or another package manager in this repository.

Before creating any commit, run the repository validation script from the repository root:

```sh
pnpm run validate
```

Only create the commit if validation passes. If it fails, resolve the relevant validation errors first.

## Skill source of truth

The `skills/` directory contains the source files under development. The
`.agents/` directory contains the installed copy used by agents in this
repository; it is generated/runtime state, not a development target.

When inspecting or editing a skill, use the corresponding files under
`skills/`. Do not inspect or edit the installed copies under `.agents/` unless
the task explicitly concerns installation behavior.
