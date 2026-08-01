# agents

A Git-backed library of reusable Agent Skills and custom agent definitions.

## Install skills

List the skills available in this repository:

```sh
npx skills@latest add https://git.dageniusal.top/operator/agents.git --list
```

Install a skill interactively:

```sh
npx skills@latest add https://git.dageniusal.top/operator/agents.git
```

Install every skill for every detected agent:

```sh
npx skills@latest add https://git.dageniusal.top/operator/agents.git --all
```

You can also install from a local checkout while developing:

```sh
npx skills@latest add . --list
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
│   └── thin-slice/
│       ├── SKILL.md         # Core thin-slice workflow
│       └── wayfinder/
│           ├── SKILL.md     # Idea refinement workflow
│           └── agents/       # Optional UI metadata
└── package.json
```

Each installable skill is a directory containing a `SKILL.md` file with YAML
frontmatter:

```md
---
name: my-skill
description: What the skill does and when an agent should use it.
---

# My skill

Instructions for the agent.
```

Supporting files such as scripts, references, examples, and assets should live
inside the same skill directory. Never commit secrets or machine-specific
credentials.

## Add a skill

1. Create `skills/<skill-name>/SKILL.md`, or place related skills under an
   existing lifecycle directory such as `skills/thin-slice/<skill-name>/`.
2. Use a lowercase, hyphenated name that matches the directory.
3. Write a specific description that explains both capability and trigger.
4. Put detailed workflow instructions in the body.
5. Run `npm test`.
6. Confirm discovery with `npx skills@latest add . --list`.

## Add an agent

Start from [`agents/example-agent.md`](agents/example-agent.md), rename it, and
adapt it to the target application. Agent manifest formats are not yet portable
in the same way as `SKILL.md`, so record the intended runtime in the file.

## Validation

```sh
npm test
```

Validation checks skill discovery, required frontmatter, naming, duplicate
names, and accidental secrets.

## Compatibility

Skills follow the open [Agent Skills specification](https://agentskills.io/specification)
and the repository layout recognized by the
[`skills` CLI](https://www.skills.sh/docs/cli).
