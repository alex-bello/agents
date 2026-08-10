---
name: csharp-xml-comments
version: 1.0.0
description: Add or improve C# XML documentation comments consistently across a repository, a single .cs file, or a path glob. Use when asked to document C# code or add XML summary comments.
---

# C# XML comments

Add accurate XML documentation to C# source while preserving the code's public
API and existing documentation style. Use the bundled script to select targets
and to normalize and verify summary formatting; do not invent an alternate file
selection or formatting workflow.

## Input

Accept zero or one target:

- No target: document every `*.cs` file below the repository root.
- A `.cs` file: document that file.
- A directory: document every `*.cs` file beneath it.
- A path glob such as `src/**/*.cs` or `**/*Controller.cs`: document its
  matching C# files.

By default, `bin`, `obj`, `.git`, `.vs`, `node_modules`, and `TestResults` are
excluded. Pass paths to the script relative to the repository root whenever
possible.

## Workflow

1. From the repository root, resolve files with the helper. Quote the optional
   target so the shell does not expand it:

   ```sh
   node "$SKILL_DIR/scripts/csharp-xml-comments.mjs" targets ["<file-or-path-glob>"]
   ```

   Stop and report the result if no files match. Do not silently broaden a
   user-provided target.

2. Inspect each selected file and its nearby types, members, interfaces, base
   types, and call sites as needed. Add documentation only where it clarifies
   the API or behavior; do not add boilerplate comments that merely repeat an
   identifier.

3. Write XML documentation with `///` on every documentation line. Use clear,
   sentence-style summaries that explain the member's purpose. Preserve valid,
   useful existing `<param>`, `<returns>`, `<remarks>`, `<exception>`, and
   `<inheritdoc/>` elements unless the requested change calls for revising them.

   Every non-empty `<summary>` must use a separate line for its contents,
   including summaries short enough to fit on one line:

   ```csharp
   /// <summary>
   /// Starts the background synchronization process.
   /// </summary>
   ```

   Never write `<summary>Starts the background synchronization process.</summary>`.
   For multi-line summaries, keep all content between the opening and closing
   tags on their own `///` lines.

4. Normalize the touched files after editing. This makes inline summaries use
   the required multiline form while leaving other XML documentation intact:

   ```sh
   node "$SKILL_DIR/scripts/csharp-xml-comments.mjs" normalize ["<file-or-path-glob>"]
   ```

5. Verify the selection and formatting. The command fails if an inline,
   non-empty `<summary>` remains:

   ```sh
   node "$SKILL_DIR/scripts/csharp-xml-comments.mjs" verify ["<file-or-path-glob>"]
   ```

6. Run the repository's relevant formatter, build, and tests when available.
   Report the selected files, documentation added or changed, normalization
   result, and verification/build/test status.

## Failure handling

- If the script reports an invalid target or no matching C# files, ask the user
  for a corrected target rather than editing unrelated files.
- If an existing inline summary contains complex XML that cannot safely be
  normalized, the script leaves it unchanged and `verify` identifies the file
  and line. Rewrite that summary manually in the required multiline form, then
  run `normalize` and `verify` again.
- Do not add documentation merely to satisfy compiler XML-doc warnings unless
  the user specifically asks for complete coverage.
