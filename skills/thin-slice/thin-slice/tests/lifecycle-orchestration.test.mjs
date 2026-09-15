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

function stablePatterns(patterns) {
  const grouped = new Map();
  for (const pattern of patterns) {
    const existing = grouped.get(pattern.tag) ?? { tag: pattern.tag, count: 0, evidence: [] };
    existing.count += 1;
    if (!existing.evidence.includes(pattern.evidence)) existing.evidence.push(pattern.evidence);
    grouped.set(pattern.tag, existing);
  }
  return [...grouped.values()].sort((left, right) => left.tag.localeCompare(right.tag));
}

function runReviewContractFixture(reviewPasses) {
  let remediationPasses = 0;
  const comments = [];
  const patterns = [];

  for (const review of reviewPasses) {
    if (review.providerFailure || review.malformed || review.remediationFailure) {
      return {
        state: "in-progress",
        terminal: review.providerFailure
          ? "provider-failure"
          : review.malformed
            ? "malformed-remediation"
            : "remediation-failure",
        remediationPasses,
        draftAvailable: true,
        comments,
        patterns: stablePatterns(patterns),
      };
    }
    comments.push(review.pass);
    patterns.push(...review.recurringPatterns);
    const blocking = review.findings.some((finding) => ["blocking", "high"].includes(finding.severity));
    if (!blocking) {
      return { state: "promoted", remediationPasses, draftAvailable: false, comments, patterns: stablePatterns(patterns) };
    }
    if (remediationPasses >= 2) {
      return { state: "in-progress", terminal: "unresolved", remediationPasses, draftAvailable: true, comments, patterns: stablePatterns(patterns) };
    }
    remediationPasses += 1;
  }

  return { state: "in-progress", terminal: "awaiting-review", remediationPasses, draftAvailable: true, comments, patterns: stablePatterns(patterns) };
}

const allowedImplementationOperations = new Set(["branch.write", "commit.write", "verification.run"]);
const allowedReviewOperations = new Set(["read.issue", "read.pr", "read.diff", "read.evidence", "pr.comment.general"]);

function requestAgentOperation(state, request) {
  const next = structuredClone(state);
  const allowed = request.role === "implementation" ? allowedImplementationOperations : allowedReviewOperations;
  const providerMutation = request.operation.startsWith("issue.") || request.operation.startsWith("label.")
    || request.operation.startsWith("pr.") || request.operation === "merge";

  if (request.role === "implementation" && (providerMutation || !allowed.has(request.operation))) {
    return { ok: false, diagnostic: `implementation mutation rejected: ${request.operation}; only local implementation operations are allowed`, state };
  }
  if (request.role === "review" && !allowed.has(request.operation)) {
    return { ok: false, diagnostic: `review mutation rejected: ${request.operation}; only one structured general PR comment is allowed`, state };
  }
  if (request.role === "review" && request.operation === "pr.comment.general") {
    if (!state.pr || request.pass !== state.activeReviewPass) {
      return { ok: false, diagnostic: `review comment rejected: pass ${request.pass ?? "missing"} has no matching active PR review pass`, state };
    }
    if (!request.structured) {
      return { ok: false, diagnostic: `review comment rejected: pass ${request.pass} requires a structured general comment`, state };
    }
    if (state.commentedPasses.includes(request.pass)) {
      return { ok: false, diagnostic: `review comment rejected: pass ${request.pass} already has a structured general comment`, state };
    }
    next.commentedPasses.push(request.pass);
  }
  return { ok: true, state: next };
}

function runApprovedFixture() {
  const issue = { number: 110, labels: ["thin-slice", "thin-slice-ready"] };
  const operations = [];
  const pr = { number: 17, draft: true, state: "open", head: "thin-slice/110-example" };
  const handoff = {
    issue: issue.number,
    repository: "operator/agents",
    branch_or_worktree: pr.head,
    base_commit: "base-commit",
    commits: [{ sha: "implementation-commit", afterBase: true }],
    changed_files: ["skills/thin-slice/thin-slice-lifecycle/SKILL.md"],
    verification: {
      tests: [{ command: "pnpm test", status: "passed", evidence: "all tests passed" }],
      acceptance: [{ criterion: "approved run", status: "passed", evidence: "fixture passed" }],
      manual_evidence: { status: "not-applicable", evidence: "contract-only repository" },
    },
    status: "ready-for-review",
  };

  operations.push("issue.edit ready->in-progress");
  issue.labels = ["thin-slice", "thin-slice-in-progress"];
  operations.push("implementation.handoff");
  assert.equal(validateHandoff(handoff), true);
  operations.push("pr.create --draft");
  operations.push("review.handoff");
  operations.push("pr.comment pass=1");
  operations.push("pr.ready");
  pr.draft = false;
  operations.push("pr.view draft=false");

  return { issue, pr, operations };
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
    "orchestrator must enforce these boundaries",
    "preserves the last verified issue, PR, label",
  ]) assert.match(skill, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing lifecycle rule: ${requirement}`);
  assert.match(implementer, /thin-slice-implement.*implement.*mode/s);
  assert.match(implementer, /implementation mode is mandatory/i);
  assert.match(implementer, /lifecycle labels/i);
  assert.match(implementer, /must not create.*pull request/i);
  assert.match(reviewer, /read-only/i);
  assert.match(reviewer, /exactly one structured general PR comment/i);
  assert.match(reviewer, /duplicate comment.*matching active review pass/i);
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

test("classifies non-blocking findings as reportable observations without remediation", () => {
  const result = runReviewContractFixture([{
    pass: 1,
    findings: [{ severity: "medium" }, { severity: "low" }],
    recurringPatterns: [{ tag: "missing-acceptance-evidence", evidence: "medium observation" }],
  }]);
  assert.equal(result.state, "promoted");
  assert.equal(result.remediationPasses, 0);
  assert.equal(result.draftAvailable, false);
  assert.deepEqual(result.comments, [1]);
});

test("stops after exactly two remediation passes with unresolved findings and stable patterns", () => {
  const result = runReviewContractFixture([1, 2, 3].map((pass) => ({
    pass,
    findings: [{ severity: "blocking" }],
    recurringPatterns: [{ tag: "unsafe-retry", evidence: "same blocking evidence" }],
  })));
  assert.deepEqual(result, {
    state: "in-progress",
    terminal: "unresolved",
    remediationPasses: 2,
    draftAvailable: true,
    comments: [1, 2, 3],
    patterns: [{ tag: "unsafe-retry", count: 3, evidence: ["same blocking evidence"] }],
  });
});

test("malformed remediation preserves the draft and last verified state", () => {
  const result = runReviewContractFixture([
    { pass: 1, findings: [{ severity: "blocking" }], recurringPatterns: [] },
    { pass: 2, malformed: true, findings: [], recurringPatterns: [] },
  ]);
  assert.equal(result.state, "in-progress");
  assert.equal(result.terminal, "malformed-remediation");
  assert.equal(result.remediationPasses, 1);
  assert.equal(result.draftAvailable, true);
  assert.deepEqual(result.comments, [1]);
});

test("failed remediation does not claim approval or promote the draft", () => {
  const result = runReviewContractFixture([
    { pass: 1, findings: [{ severity: "blocking" }], recurringPatterns: [] },
    { pass: 2, remediationFailure: true, findings: [], recurringPatterns: [] },
  ]);
  assert.equal(result.state, "in-progress");
  assert.equal(result.terminal, "remediation-failure");
  assert.equal(result.draftAvailable, true);
  assert.deepEqual(result.comments, [1]);
});

test("provider failure preserves the verified comment ledger without retry", () => {
  const result = runReviewContractFixture([
    { pass: 1, findings: [{ severity: "blocking" }], recurringPatterns: [] },
    { pass: 2, providerFailure: true, findings: [], recurringPatterns: [] },
  ]);
  assert.equal(result.terminal, "provider-failure");
  assert.deepEqual(result.comments, [1]);
  assert.equal(result.draftAvailable, true);
});

test("recurring-pattern output is deduplicated and deterministic", () => {
  const result = runReviewContractFixture([{
    pass: 1,
    findings: [{ severity: "low" }],
    recurringPatterns: [
      { tag: "z-pattern", evidence: "z" },
      { tag: "a-pattern", evidence: "a" },
      { tag: "z-pattern", evidence: "z" },
    ],
  }]);
  assert.deepEqual(result.patterns, [
    { tag: "a-pattern", count: 1, evidence: ["a"] },
    { tag: "z-pattern", count: 2, evidence: ["z"] },
  ]);
});

test("encodes review comment and recurring-pattern evidence for each PR pass", async () => {
  const text = await readFile(lifecycle, "utf8");
  assert.match(text, /Record every review pass when a PR exists/);
  assert.match(text, /pass number, approval status, findings, required changes, evidence/);
  assert.match(text, /tags, counts, and evidence/);
  assert.match(text, /For `never`, set `pr: null`/);
});

test("approved fixture performs one bounded run and promotes without merging or waiting", async () => {
  const [skill, result] = await Promise.all([
    readFile(lifecycle, "utf8"),
    Promise.resolve(runApprovedFixture()),
  ]);

  assert.match(skill, /bounded command with an auditable operation ledger/);
  assert.deepEqual(result.operations, [
    "issue.edit ready->in-progress",
    "implementation.handoff",
    "pr.create --draft",
    "review.handoff",
    "pr.comment pass=1",
    "pr.ready",
    "pr.view draft=false",
  ]);
  assert.equal(result.pr.draft, false);
  assert.equal(result.pr.state, "open");
  assert.deepEqual(result.issue.labels, ["thin-slice", "thin-slice-in-progress"]);
  assert.equal(result.operations.some((operation) => /merge|wait|close|follow-up/i.test(operation)), false);
});

test("rejects implementation provider mutations and preserves the verified state", () => {
  const state = {
    issue: { labels: ["thin-slice", "thin-slice-in-progress"] },
    pr: { number: 17, draft: true },
    activeReviewPass: 1,
    commentedPasses: [],
  };
  for (const operation of ["pr.create", "pr.ready", "issue.edit", "label.add", "pr.comment"]) {
    const before = structuredClone(state);
    const result = requestAgentOperation(state, { role: "implementation", operation });
    assert.equal(result.ok, false);
    assert.match(result.diagnostic, /implementation mutation rejected/);
    assert.deepEqual(result.state, before);
  }
});

test("allows local implementation work and read-only review operations", () => {
  const state = {
    issue: { labels: ["thin-slice", "thin-slice-in-progress"] },
    pr: { number: 17, draft: true },
    activeReviewPass: 1,
    commentedPasses: [],
  };
  for (const request of [
    { role: "implementation", operation: "branch.write" },
    { role: "implementation", operation: "commit.write" },
    { role: "implementation", operation: "verification.run" },
    { role: "review", operation: "read.issue" },
    { role: "review", operation: "read.pr" },
    { role: "review", operation: "read.diff" },
    { role: "review", operation: "read.evidence" },
  ]) {
    const result = requestAgentOperation(state, request);
    assert.equal(result.ok, true);
    assert.deepEqual(result.state, state);
  }
});

test("rejects reviewer code, label, and PR-state mutations", () => {
  const state = {
    issue: { labels: ["thin-slice", "thin-slice-in-progress"] },
    pr: { number: 17, draft: true },
    activeReviewPass: 1,
    commentedPasses: [],
  };
  for (const operation of ["code.write", "branch.write", "commit.write", "label.add", "issue.close", "pr.ready", "merge"]) {
    const before = structuredClone(state);
    const result = requestAgentOperation(state, { role: "review", operation });
    assert.equal(result.ok, false);
    assert.match(result.diagnostic, /review mutation rejected/);
    assert.deepEqual(result.state, before);
  }
});

test("allows one structured general comment only for the active review pass", () => {
  const state = {
    issue: { labels: ["thin-slice", "thin-slice-in-progress"] },
    pr: { number: 17, draft: true },
    activeReviewPass: 1,
    commentedPasses: [],
  };
  const allowed = requestAgentOperation(state, { role: "review", operation: "pr.comment.general", pass: 1, structured: true });
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.state.commentedPasses, [1]);

  const duplicate = requestAgentOperation(allowed.state, { role: "review", operation: "pr.comment.general", pass: 1, structured: true });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.diagnostic, /already has/);
  assert.deepEqual(duplicate.state, allowed.state);

  const unmatched = requestAgentOperation(state, { role: "review", operation: "pr.comment.general", pass: 2, structured: true });
  assert.equal(unmatched.ok, false);
  assert.match(unmatched.diagnostic, /no matching active PR review pass/);

  const malformed = requestAgentOperation(state, { role: "review", operation: "pr.comment.general", pass: 1, structured: false });
  assert.equal(malformed.ok, false);
  assert.match(malformed.diagnostic, /requires a structured general comment/);
});
