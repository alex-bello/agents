import { readFile } from "node:fs/promises";

const file = process.argv[2] ?? ".thin-slice.yml";
const source = await readFile(file, "utf8");
const errors = [];
const values = new Map();
const sections = new Set(["labels", "branch", "implementation", "pull_request", "verification"]);
function error(line, message) { errors.push(`${file}:${line}: ${message}`); }
function scalar(raw, line) {
  const value = raw.trim();
  if (!value) return "";
  if (/^(true|false)$/.test(value)) return value === "true";
  if (/^\d+$/.test(value)) return Number(value);
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  if (/^[\[\{]/.test(value)) { try { return JSON.parse(value.replaceAll("'", '"')); } catch { error(line, `expected a valid inline value, got ${value}`); return null; } }
  return value;
}
let section = "";
for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
  const line = index + 1; const content = rawLine.replace(/\s+#.*$/, "").trimEnd();
  if (!content.trim()) continue;
  const top = content.match(/^([A-Za-z][\w-]*):(?:\s*(.*))?$/);
  if (top) { section = top[1]; if (section !== "schema" && !sections.has(section)) error(line, `unknown top-level key ${section}`); values.set(section, top[2] === undefined || top[2] === "" ? {} : scalar(top[2], line)); continue; }
  const nested = content.match(/^\s+([A-Za-z][\w-]*):(?:\s*(.*))?$/);
  if (!nested) { error(line, "expected a top-level or indented key"); continue; }
  if (!sections.has(section)) { error(line, `unknown section ${section || "<none>"}`); continue; }
  values.set(`${section}.${nested[1]}`, nested[2] === undefined || nested[2] === "" ? {} : scalar(nested[2], line));
}
function requireValue(key, description = key) { if (!values.has(key) || values.get(key) === "" || values.get(key) === null) error(1, `${description} is required`); return values.get(key); }
function type(key, expected) { if (values.has(key) && typeof values.get(key) !== expected) error(1, `${key} must be ${expected}`); }
function enumValue(key, allowed) { if (values.has(key) && !allowed.includes(values.get(key))) error(1, `${key} must be one of: ${allowed.join(", ")}`); }
const schema = requireValue("schema", "schema");
if (schema !== 1) error(1, "schema must be 1");
for (const name of sections) if (!values.has(name)) error(1, `missing top-level section ${name}`);
requireValue("branch.pattern", "branch.pattern"); type("branch.pattern", "string");
if (typeof values.get("branch.pattern") === "string" && (!values.get("branch.pattern").includes("{issue-number}") || !values.get("branch.pattern").includes("{short-slug}"))) error(1, "branch.pattern must contain {issue-number} and {short-slug}");
for (const key of ["labels.mode", "pull_request.creation"]) requireValue(key);
type("labels.mode", "string"); type("pull_request.creation", "string"); enumValue("labels.mode", ["mapped", "native"]); enumValue("pull_request.creation", ["never", "ask", "automatic"]);
const bools = ["implementation.create_branch", "implementation.commit_reference_required", "implementation.automatic_lifecycle", "pull_request.close_work_item_on_merge", "verification.require_tests", "verification.require_acceptance_checks", "verification.require_manual_evidence_when_relevant", "verification.reject_unrelated_changes"];
for (const key of bools) { requireValue(key); type(key, "boolean"); }
for (const key of ["implementation.ready_label", "implementation.in_progress_label", "implementation.implemented_label", "implementation.blocked_label", "implementation.needs_discovery_label"]) { const value = requireValue(key); type(key, "string"); if (typeof value === "string" && !value.trim()) error(1, `${key} must not be empty`); }
if (errors.length) { console.error(`Invalid ${file}:\n${errors.map((item) => `- ${item}`).join("\n")}`); process.exitCode = 1; } else console.log(`Valid ${file} (schema 1)`);
