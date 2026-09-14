import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const thinSliceRoot = path.resolve(testRoot, "..");
const lifecycle = path.resolve(thinSliceRoot, "..", "thin-slice-lifecycle", "SKILL.md");
const implementationAgent = path.resolve(thinSliceRoot, "..", "..", "..", "agents", "implementation-agent.md");
const reviewAgent = path.resolve(thinSliceRoot, "..", "..", "..", "agents", "review-agent.md");

function selectIssue(issues, explicitNumber = null) {
  if (explicitNumber !== null) return issues.filter((issue) => issue.number === explicitNumber);
  return issues
    .filter((issue) => issue.state === "open" && issue.labels.includes("thin-slice-ready"))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.number - right.number);
}

function validateHandoff(handoff) {
  const required = ["issue", "branch_or_worktree", "base_commit", "commits", "changed_files", "verification", "status"];
  return required.every((field) => Object.hasOwn(handoff, field))
    && handoff.status === "ready-for-review"
    && handoff.commits.some((commit) => commit.afterBase === true);
}

function reviewLoop(reviewStatuses) {
  let remediationPasses = 0;
  for (const status of reviewStatuses) {
    if (status === "approved") return { state: "promoted", remediationPasses };
    if (status !== "changes-requested" || remediationPasses === 2) {
      return { state: "in-progress", remediationPasses };
    }
    remediationPasses += 1;
  }
  return { state: "in-progress", remediationPasses };
}

test("defines portable lifecycle agents and the strict orchestration contract", async () => {
  const [skill, implementer, reviewer] = await Promise.all([
    readFile(lifecycle, "utf8"),
    readFile(implementationAgent, "utf8"),
    readFile(reviewAgent, "utf8"),
  ]);
  for (const requirement of [
    "$thin-slice-lifecycle [issue-number]",
    "exactly one",
    "oldest `createdAt`",
    "empty ready queue",
    "ambiguous queue",
    "automatic_lifecycle: true",
    "ready-label",
    "in-progress",
    "thin-slice-implement` in `implement` mode",
    "must not create the PR",
    "branch_or_worktree",
    "base_commit",
    "changed_files",
    "verification",
    "pull_request.creation: never",
    "pull_request.creation: ask",
    "pull_request.creation: automatic",
    "sc pr create --draft",
    "read-only review",
    "severity-ranked",
    "recurring-pattern",
    "exactly one structured general PR comment per review pass",
    "at most two remediation passes",
    "sc pr ready",
    "draft: false",
    "Do not merge, close, or wait for merge",
    "never edit `AGENTS.md`",
  ]) assert.match(skill, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing lifecycle rule: ${requirement}`);
  assert.match(implementer, /thin-slice-implement.*implement.*mode/s);
  assert.match(implementer, /must not create.*pull request/i);
  assert.match(reviewer, /read-only/i);
  assert.match(reviewer, /exactly one structured general PR comment/i);
});

test("selects an explicit issue or the oldest ready issue and handles queue edges", () => {
  const issues = [
    { number: 9, state: "open", labels: ["thin-slice-ready"], createdAt: "2026-02-02" },
    { number: 7, state: "open", labels: ["thin-slice-ready"], createdAt: "2026-01-01" },
    { number: 8, state: "closed", labels: ["thin-slice-ready"], createdAt: "2025-12-01" },
  ];
  assert.deepEqual(selectIssue(issues).map((issue) => issue.number), [7, 9]);
  assert.deepEqual(selectIssue(issues)[0].number, 7);
  assert.deepEqual(selectIssue(issues, 9).map((issue) => issue.number), [9]);
  assert.deepEqual(selectIssue(issues.filter((issue) => issue.number === 8)), []);
  assert.deepEqual(selectIssue([]), []);
});

test("rejects malformed implementation handoffs before review", () => {
  assert.equal(validateHandoff({ issue: 7, status: "ready-for-review" }), false);
  assert.equal(validateHandoff({
    issue: 7,
    branch_or_worktree: "codex/7-example",
    base_commit: "abc",
    commits: [{ sha: "def", afterBase: true }],
    changed_files: ["file.ts"],
    verification: { tests: [] },
    status: "ready-for-review",
  }), true);
});

test("keeps unresolved findings in progress after two remediation passes", () => {
  assert.deepEqual(reviewLoop(["changes-requested", "changes-requested", "changes-requested"]), {
    state: "in-progress", remediationPasses: 2,
  });
  assert.deepEqual(reviewLoop(["changes-requested", "approved"]), {
    state: "promoted", remediationPasses: 1,
  });
});

test("encodes review comment and recurring-pattern evidence for each PR pass", async () => {
  const text = await readFile(lifecycle, "utf8");
  assert.match(text, /Record every review pass when a PR exists/);
  assert.match(text, /pass number, approval status, findings, required changes, evidence/);
  assert.match(text, /tags, counts, and evidence/);
  assert.match(text, /For `never`, set `pr: null`/);
});
