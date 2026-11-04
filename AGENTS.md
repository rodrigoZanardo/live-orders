# Live Orders

Live order board: orders move through statuses and every open screen updates at once (WebSocket, Redis, job queue).
Personal portfolio project, written from scratch. Public repository.

## Plan

See [docs/PLAN.md](docs/PLAN.md) for what to build and [docs/HANDOFF.md](docs/HANDOFF.md) for context from earlier sessions (read it first). The layout and commands are added as the code is written.

## Rules for every change

- Smallest change that fully solves the task. No options, layers or helpers nobody asked for.
- Code that a second place needs moves to one shared place (`packages/shared`, a web component, a CSS utility). Never copy it.
- Business rules live in the backend domain of the service that owns the data, never only in the UI.
- New logic ships with a test. A bug fix starts with a test that reproduces it.
- TypeScript strict everywhere. No `any`, no `as` to silence the compiler, no `!` without a guard.
- Code, identifiers, commits and docs in English. UI text goes through translations.
- Never commit secrets or keys. Config comes from environment variables; document new ones in `.env.example`.
- Never copy code, names or rules from an employer or client codebase into this repo.

## Git

- Conventional Commits, scoped by folder: `feat(api): ...`, `fix(web): ...`, `test(api): ...`, `docs: ...`.
- One commit changes structure **or** behaviour, not both.
- Do not commit or push unless asked.

