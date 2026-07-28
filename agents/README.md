# Custom agents

This directory stores reusable custom-agent source files.

Unlike Agent Skills, custom agent manifests do not have one portable format.
Keep each definition in a plainly readable Markdown source file and note its
target runtime. When an application requires JSON, YAML, or a special directory,
add an adapter or installation instructions beside the source.

Use `example-agent.md` as a starting point. Remove placeholder text before using
an agent in an application.
