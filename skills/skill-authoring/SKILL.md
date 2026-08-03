---
name: skill-authoring
description: Create or improve reusable Agent Skills in this repository when a workflow should be packaged for installation with the skills CLI.
---

# Skill authoring

Create focused, portable skills that follow the Agent Skills specification and
can be discovered by `pnpm dlx skills@latest`.

## Workflow

1. Read the repository's `README.md` and any applicable `AGENTS.md`.
2. Identify one concrete capability and the requests that should trigger it.
3. Search existing directories under `skills/` to avoid overlapping behavior or
   duplicate names.
4. Create `skills/<name>/SKILL.md`, where `<name>` is lowercase kebab-case. If
   grouping related skills, keep the group directory free of its own `SKILL.md`
   so the installer does not copy nested skills twice.
5. Add YAML frontmatter with a `name` matching the directory and a specific
   `description` explaining what the skill does and when to use it.
6. Write imperative instructions in the body. Include inputs, workflow,
   verification, expected output, and failure handling when relevant.
7. Put large reference material in `references/`, executable helpers in
   `scripts/`, reusable starting files in `assets/`, and worked samples in
   `examples/`. Reference only the files the agent needs.
8. Keep secrets, credentials, personal paths, and application-specific state out
   of the skill.
9. Run `pnpm test`.
10. Run `pnpm dlx skills@latest add . --list` and confirm the new skill is discovered.

## Quality bar

- Prefer one well-bounded capability over a broad collection of advice.
- State decision rules explicitly when an agent could reasonably choose wrong.
- Make destructive or externally visible actions require clear user authority.
- Use scripts for deterministic operations and prose for judgment.
- Keep the main file concise; use supporting files for detail loaded on demand.
- Do not claim compatibility that has not been tested.

## Output

Summarize the skill created or changed, list its supporting files, and report the
results of repository validation and CLI discovery.
