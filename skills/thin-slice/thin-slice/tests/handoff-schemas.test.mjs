import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testRoot, "..", "..", "..", "..");
const implementationDefinition = path.join(repositoryRoot, "agents", "implementation-agent.md");
const reviewDefinition = path.join(repositoryRoot, "agents", "review-agent.md");

const implementationStatuses = new Set(["ready-for-review", "blocked", "needs-discovery", "failed"]);
const verificationStatuses = new Set(["passed", "failed", "not-applicable"]);
const reviewApprovals = new Set(["approved", "changes-requested", "blocked", "failed"]);
const findingSeverities = new Set(["blocking", "high", "medium", "low"]);
const reviewStatuses = reviewApprovals;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addDiagnostic(diagnostics, field, observed, expected) {
  diagnostics.push(`${field}: observed ${JSON.stringify(observed)}; expected ${expected}.`);
}

function checkObject(value, field, required, allowed, diagnostics) {
  if (!isObject(value)) {
    addDiagnostic(diagnostics, field, value, "an object");
    return false;
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) addDiagnostic(diagnostics, `${field}.${key}`, undefined, "a required field");
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) addDiagnostic(diagnostics, `${field}.${key}`, value[key], "a supported field only");
  }
  return true;
}

function checkPositiveInteger(value, field, diagnostics) {
  if (!Number.isInteger(value) || value < 1) addDiagnostic(diagnostics, field, value, "a positive integer");
}

function checkCommitId(value, field, diagnostics) {
  if (typeof value !== "string" || !/^[0-9a-f]{7,64}$/i.test(value)) {
    addDiagnostic(diagnostics, field, value, "a 7–64 character hexadecimal commit ID");
  }
}

function checkNonEmptyString(value, field, diagnostics) {
  if (typeof value !== "string" || value.trim() === "") addDiagnostic(diagnostics, field, value, "a non-empty string");
}

function checkRelativePath(value, field, diagnostics) {
  if (typeof value !== "string" || value.trim() === "" || path.isAbsolute(value) || value.split(/[\\/]/).includes("..")) {
    addDiagnostic(diagnostics, field, value, "a non-empty repository-relative path without parent traversal");
  }
}

function validateVerification(value, diagnostics) {
  const valid = checkObject(value, "verification", ["tests", "acceptance", "manual_evidence"], new Set(["tests", "acceptance", "manual_evidence"]), diagnostics);
  if (!valid) return;
  for (const listName of ["tests", "acceptance"]) {
    const list = value[listName];
    if (!Array.isArray(list) || list.length === 0) {
      addDiagnostic(diagnostics, `verification.${listName}`, list, "a non-empty list");
      continue;
    }
    list.forEach((entry, index) => {
      const field = `verification.${listName}[${index}]`;
      const required = listName === "tests" ? ["command", "status", "evidence"] : ["criterion", "status", "evidence"];
      if (!checkObject(entry, field, required, new Set(required), diagnostics)) return;
      checkNonEmptyString(entry[listName === "tests" ? "command" : "criterion"], `${field}.${listName === "tests" ? "command" : "criterion"}`, diagnostics);
      if (!verificationStatuses.has(entry.status)) addDiagnostic(diagnostics, `${field}.status`, entry.status, "passed, failed, or not-applicable");
      checkNonEmptyString(entry.evidence, `${field}.evidence`, diagnostics);
    });
  }
  const manual = value.manual_evidence;
  if (!checkObject(manual, "verification.manual_evidence", ["status", "evidence"], new Set(["status", "evidence"]), diagnostics)) return;
  if (!verificationStatuses.has(manual.status)) addDiagnostic(diagnostics, "verification.manual_evidence.status", manual.status, "passed, failed, or not-applicable");
  checkNonEmptyString(manual.evidence, "verification.manual_evidence.evidence", diagnostics);
}

function validateImplementationHandoff(value) {
  const diagnostics = [];
  const required = ["issue", "repository", "branch_or_worktree", "base_commit", "commits", "changed_files", "verification", "status"];
  if (!checkObject(value, "handoff", required, new Set(required), diagnostics)) return diagnostics;
  checkPositiveInteger(value.issue, "issue", diagnostics);
  if (typeof value.repository !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(value.repository)) addDiagnostic(diagnostics, "repository", value.repository, "an owner/name repository identifier");
  if (typeof value.branch_or_worktree !== "string" || value.branch_or_worktree.trim() === "" || /[\s\u0000-\u001f]/.test(value.branch_or_worktree)) addDiagnostic(diagnostics, "branch_or_worktree", value.branch_or_worktree, "a valid branch name or absolute worktree path");
  checkCommitId(value.base_commit, "base_commit", diagnostics);
  if (!Array.isArray(value.commits) || value.commits.length === 0) {
    addDiagnostic(diagnostics, "commits", value.commits, "a non-empty list");
  } else {
    const seen = new Set();
    value.commits.forEach((commit, index) => {
      const field = `commits[${index}]`;
      const fields = ["sha", "subject", "afterBase"];
      if (!checkObject(commit, field, fields, new Set(fields), diagnostics)) return;
      checkCommitId(commit.sha, `${field}.sha`, diagnostics);
      if (seen.has(commit.sha)) addDiagnostic(diagnostics, `${field}.sha`, commit.sha, "a unique commit ID");
      seen.add(commit.sha);
      checkNonEmptyString(commit.subject, `${field}.subject`, diagnostics);
      if (typeof commit.afterBase !== "boolean") addDiagnostic(diagnostics, `${field}.afterBase`, commit.afterBase, "a boolean");
    });
    if (!value.commits.some((commit) => commit && commit.afterBase === true)) addDiagnostic(diagnostics, "commits", value.commits, "at least one commit with afterBase: true");
  }
  if (!Array.isArray(value.changed_files)) {
    addDiagnostic(diagnostics, "changed_files", value.changed_files, "a list of repository-relative paths");
  } else {
    const seen = new Set();
    value.changed_files.forEach((file, index) => {
      checkRelativePath(file, `changed_files[${index}]`, diagnostics);
      if (seen.has(file)) addDiagnostic(diagnostics, `changed_files[${index}]`, file, "a unique path");
      seen.add(file);
    });
  }
  validateVerification(value.verification, diagnostics);
  if (!implementationStatuses.has(value.status)) addDiagnostic(diagnostics, "status", value.status, "ready-for-review, blocked, needs-discovery, or failed");
  if (value.status === "ready-for-review" && isObject(value.verification)) {
    for (const [listName, entries] of [["tests", value.verification.tests], ["acceptance", value.verification.acceptance]]) {
      if (Array.isArray(entries)) entries.forEach((entry, index) => {
        if (entry?.status !== "passed") addDiagnostic(diagnostics, `verification.${listName}[${index}].status`, entry?.status, "passed for ready-for-review");
      });
    }
  }
  return diagnostics;
}

function validateReviewHandoff(value) {
  const diagnostics = [];
  const required = ["issue", "pr", "pass", "approval", "findings", "recurring_patterns", "comment", "status"];
  if (!checkObject(value, "review", required, new Set(required), diagnostics)) return diagnostics;
  checkPositiveInteger(value.issue, "issue", diagnostics);
  if (value.pr !== null) checkPositiveInteger(value.pr, "pr", diagnostics);
  checkPositiveInteger(value.pass, "pass", diagnostics);
  if (!reviewApprovals.has(value.approval)) addDiagnostic(diagnostics, "approval", value.approval, "approved, changes-requested, blocked, or failed");
  if (!Array.isArray(value.findings)) {
    addDiagnostic(diagnostics, "findings", value.findings, "a list");
  } else {
    let previousRank = -1;
    const ranks = { blocking: 0, high: 1, medium: 2, low: 3 };
    value.findings.forEach((finding, index) => {
      const field = `findings[${index}]`;
      const fields = ["severity", "file", "line", "title", "evidence", "required_change"];
      if (!checkObject(finding, field, fields, new Set(fields), diagnostics)) return;
      if (!findingSeverities.has(finding.severity)) addDiagnostic(diagnostics, `${field}.severity`, finding.severity, "blocking, high, medium, or low");
      else if (ranks[finding.severity] < previousRank) addDiagnostic(diagnostics, field, finding.severity, "severity-ranked order");
      else previousRank = ranks[finding.severity];
      checkRelativePath(finding.file, `${field}.file`, diagnostics);
      checkPositiveInteger(finding.line, `${field}.line`, diagnostics);
      for (const name of ["title", "evidence", "required_change"]) checkNonEmptyString(finding[name], `${field}.${name}`, diagnostics);
    });
  }
  if (!Array.isArray(value.recurring_patterns)) addDiagnostic(diagnostics, "recurring_patterns", value.recurring_patterns, "a list");
  else value.recurring_patterns.forEach((pattern, index) => {
    const field = `recurring_patterns[${index}]`;
    const fields = ["tag", "evidence"];
    if (!checkObject(pattern, field, fields, new Set(fields), diagnostics)) return;
    if (typeof pattern.tag !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pattern.tag)) addDiagnostic(diagnostics, `${field}.tag`, pattern.tag, "a lowercase kebab-case tag");
    checkNonEmptyString(pattern.evidence, `${field}.evidence`, diagnostics);
  });
  const commentFields = ["posted"];
  if (checkObject(value.comment, "comment", commentFields, new Set(["posted", "url", "reason"]), diagnostics)) {
    if (typeof value.comment.posted !== "boolean") addDiagnostic(diagnostics, "comment.posted", value.comment.posted, "a boolean");
    if (value.comment.posted) {
      if (typeof value.comment.url !== "string" || !/^https:\/\//.test(value.comment.url)) addDiagnostic(diagnostics, "comment.url", value.comment.url, "an HTTPS URL");
    } else {
      checkNonEmptyString(value.comment.reason, "comment.reason", diagnostics);
      if (Object.hasOwn(value.comment, "url")) addDiagnostic(diagnostics, "comment.url", value.comment.url, "no URL when posted is false");
    }
  }
  if (!reviewStatuses.has(value.status)) addDiagnostic(diagnostics, "status", value.status, "approved, changes-requested, blocked, or failed");
  if (value.approval !== value.status) addDiagnostic(diagnostics, "status", value.status, `the same terminal value as approval (${value.approval})`);
  if (value.approval === "approved" && Array.isArray(value.findings) && value.findings.some((finding) => ["blocking", "high"].includes(finding?.severity))) addDiagnostic(diagnostics, "approval", value.approval, "no blocking or high-severity findings");
  if (value.pr === null && value.comment?.posted !== false) addDiagnostic(diagnostics, "comment.posted", value.comment?.posted, "false for local review");
  return diagnostics;
}

const validImplementation = {
  issue: 111,
  repository: "operator/agents",
  branch_or_worktree: "thin-slice/111-add-portable-agent-definitions",
  base_commit: "6570bf44c8beae280489fa1af277e2d5e9e37dde",
  commits: [{ sha: "abcdef1234567", subject: "Add portable handoff schemas (#111)", afterBase: true }],
  changed_files: ["agents/implementation-agent.md", "agents/review-agent.md"],
  verification: {
    tests: [{ command: "node --test skills/thin-slice/thin-slice/tests/handoff-schemas.test.mjs", status: "passed", evidence: "focused fixtures passed" }],
    acceptance: [{ criterion: "valid handoffs preserve required evidence", status: "passed", evidence: "all fields retained" }],
    manual_evidence: { status: "passed", evidence: "both definitions manually reviewed" },
  },
  status: "ready-for-review",
};

const validReview = {
  issue: 111,
  pr: 222,
  pass: 1,
  approval: "changes-requested",
  findings: [{ severity: "high", file: "agents/review-agent.md", line: 42, title: "Missing evidence", evidence: "The handoff omits evidence.", required_change: "Preserve the evidence field." }],
  recurring_patterns: [{ tag: "missing-acceptance-evidence", evidence: "Seen in this review pass." }],
  comment: { posted: true, url: "https://git.example.test/operator/agents/pulls/222#issuecomment-1" },
  status: "changes-requested",
};

test("portable definitions are discoverable and declare strict schemas", async () => {
  const [implementation, review, listing] = await Promise.all([
    readFile(implementationDefinition, "utf8"),
    readFile(reviewDefinition, "utf8"),
    readFile(path.join(repositoryRoot, "agents", "README.md"), "utf8"),
  ]);
  for (const definition of [implementation, review]) {
    assert.match(definition, /schema: 1/);
    assert.match(definition, /additionalProperties: false/);
    assert.match(definition, /Validation diagnostics/);
    assert.match(definition, /must not|never/i);
  }
  assert.match(listing, /implementation-agent\.md/);
  assert.match(listing, /review-agent\.md/);
});

test("valid implementation and review fixtures preserve all required evidence", () => {
  assert.deepEqual(validateImplementationHandoff(validImplementation), []);
  assert.deepEqual(validateReviewHandoff(validReview), []);
  assert.equal(validImplementation.verification.tests[0].evidence, "focused fixtures passed");
  assert.equal(validReview.findings[0].required_change, "Preserve the evidence field.");
});

test("malformed implementation results report field-level diagnostics", () => {
  const malformed = structuredClone(validImplementation);
  delete malformed.base_commit;
  malformed.issue = 0;
  malformed.commits[0].sha = "not-a-commit";
  malformed.commits.push({ sha: malformed.commits[0].sha, subject: "duplicate", afterBase: true });
  malformed.changed_files = ["../secret.txt"];
  malformed.verification.tests[0].status = "unknown";
  malformed.status = "done";
  malformed.extra = true;
  const diagnostics = validateImplementationHandoff(malformed).join("\n");
  for (const expected of ["handoff.base_commit", "issue", "commits[0].sha", "commits[1].sha", "changed_files[0]", "verification.tests[0].status", "handoff.extra", "status"]) assert.ok(diagnostics.includes(expected), `missing diagnostic for ${expected}`);
});

test("malformed review results reject identifiers, statuses, list shapes, and missing fields", () => {
  const malformed = structuredClone(validReview);
  malformed.pr = 0;
  malformed.pass = "first";
  malformed.approval = "needs-work";
  malformed.status = "needs-work";
  malformed.findings[0].line = 0;
  malformed.findings[0].severity = "urgent";
  malformed.findings[0].evidence = "";
  malformed.recurring_patterns[0].tag = "Not Valid";
  delete malformed.comment.reason;
  malformed.comment.posted = false;
  const diagnostics = validateReviewHandoff(malformed).join("\n");
  for (const expected of ["pr", "pass", "approval", "findings[0].line", "findings[0].severity", "findings[0].evidence", "recurring_patterns[0].tag", "comment.reason", "status"]) assert.ok(diagnostics.includes(expected), `missing diagnostic for ${expected}`);

  const malformedLists = structuredClone(validReview);
  malformedLists.findings = { severity: "high" };
  malformedLists.recurring_patterns = "not-a-list";
  const listDiagnostics = validateReviewHandoff(malformedLists).join("\n");
  assert.match(listDiagnostics, /findings: observed/);
  assert.match(listDiagnostics, /recurring_patterns: observed/);
});

test("read-only and mutation boundaries are explicit", async () => {
  const [implementation, review] = await Promise.all([
    readFile(implementationDefinition, "utf8"),
    readFile(reviewDefinition, "utf8"),
  ]);
  assert.match(implementation, /must not create, edit, comment on, promote, merge, or close a pull request/i);
  assert.match(review, /never change code,\s*branches, commits, labels, issue state, PR state/i);
  assert.match(review, /exactly one\s+structured general PR comment per pass/i);
});
