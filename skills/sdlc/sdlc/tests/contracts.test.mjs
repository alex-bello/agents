import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  core: "skills/sdlc/sdlc/SKILL.md",
  wayfinder: "skills/sdlc/sdlc-wayfinder/SKILL.md",
  design: "skills/sdlc/sdlc-design/SKILL.md",
  implement: "skills/sdlc/sdlc-implement/SKILL.md",
  orchestrate: "skills/sdlc/sdlc-orchestrate/SKILL.md",
  reconcile: "skills/sdlc/sdlc-reconcile/SKILL.md",
  audit: "skills/sdlc/sdlc-audit/SKILL.md",
};

test("core contract defines generic states, flavors, provenance, and dependencies", async () => {
  const text = await readFile(files.core, "utf8");
  for (const requirement of ["sdlc-feature", "sdlc-work-item", "sdlc-requirements", "sdlc-design", "ready", "in-progress", "review", "complete", "blocked", "needs-discovery", "thin-slice", "stepwise", "feature", "Cross-feature dependencies"]) {
    assert.match(text, new RegExp(`\\b${requirement.replaceAll("-", "\\-")}\\b`));
  }
});

test("phase and delivery skills define approvals, child provenance, and safe boundaries", async () => {
  const text = await Promise.all(Object.values(files).map((file) => readFile(file, "utf8"))).then((parts) => parts.join("\n"));
  for (const requirement of ["explicit human approval", "sdlc-record", "depends_on", "never merge automatically", "managed temporary", "provider-neutral"]) assert.match(text, new RegExp(requirement, "i"));
});

test("orchestrator and reconciliation define bounded batch execution", async () => {
  const orchestrator = await readFile(files.orchestrate, "utf8");
  const reconcile = await readFile(files.reconcile, "utf8");
  for (const requirement of ["--batch", "max_concurrency", "scheduler lock", "run ID", "Independent failures", "isolated worktrees", "exactly\\s+two passes", "aggregate general PR\\s+comment"]) assert.match(orchestrator, new RegExp(requirement, "i"));
  for (const requirement of ["sdlc-reconcile <feature-issue-id>", "verified merged", "idempot", "Never mark a child complete"]) assert.match(reconcile, new RegExp(requirement, "i"));
});
