import { readFile } from "node:fs/promises";

const file = process.argv[2] ?? ".thin-slice.yml";
const text = await readFile(file, "utf8");
const required = ["schema:", "labels:", "branch:", "implementation:", "pull_request:", "verification:"];
const missing = required.filter((key) => !new RegExp(`^${key}`, "m").test(text));
const schema = text.match(/^schema:\s*(\d+)\s*$/m)?.[1];
const branch = text.match(/^\s+pattern:\s*(\S+)\s*$/m)?.[1];
const errors = [];
if (missing.length) errors.push(`missing top-level keys: ${missing.join(", ")}`);
if (schema !== "1") errors.push("schema must be 1");
if (!branch || !branch.includes("{issue-number}") || !branch.includes("{short-slug}")) {
  errors.push("branch.pattern must contain {issue-number} and {short-slug}");
}
if (errors.length) {
  console.error(`Invalid ${file}:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Valid ${file} (schema 1)`);
}
