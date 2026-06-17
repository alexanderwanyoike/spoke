# Agent Instructions

## Workstream Boundary

- This repository is part of the `jolt-apps` workstream.
- Do not change the Jolt protocol repository (`/home/alexander/Code/Apps/jolt`)
  unless the user explicitly asks for Jolt/protocol work.
- Spoke product concepts such as profiles, feeds, posts, replies, contacts,
  messages, media, and notifications stay in Spoke app code and docs.

## Engineering Workflow

- Test-driven development is required for behavioral changes.
- Write or update one focused failing test first, implement the smallest change
  that makes it pass, then repeat.
- Test durable behavior through public app-level interfaces or helpers, not
  incidental component structure.
- Keep the red-green-refactor loop visible in PR descriptions when practical.
- For docs-only or tooling-only changes, say explicitly that test-first does not
  apply.

## Spoke Social Threads

- Recursive visible thread work must be test-first.
- Required Bob/Alice/Carol behaviors:
  - Bob can reply to Bob's own post.
  - Bob can reply to Bob's own reply.
  - Alice and Carol can reply to the post at any point.
  - Alice and Carol can reply to any visible reply at any point.
  - All participants can assemble and render the same nested thread from public
    Spoke/Jolt-facing data.
- Add behavior coverage before UI polish.

