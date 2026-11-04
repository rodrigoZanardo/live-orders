# Live Orders

Live order board: orders move through statuses and every open screen updates at once (WebSocket, Redis, job queue).
Personal portfolio project, written from scratch. Public repository.

## Plan

See [docs/PLAN.md](docs/PLAN.md) for what to build and [docs/HANDOFF.md](docs/HANDOFF.md) for context from earlier sessions (read it first). The layout and commands are added as the code is written.

## Layout

- `api/`: NestJS service (rules in [api/AGENTS.md](api/AGENTS.md)).
- `web/`: Next.js app (rules in [web/AGENTS.md](web/AGENTS.md)).
- `.agents/skills/`: step-by-step skills: `backend-feature`, `frontend-feature`, `realtime-event`, `review-checklist`.
- `docs/`: plan, handoff and later the webhook and deploy docs.

## Commands

Run at the root (npm workspaces):

- `npm test`: Jest in every workspace.
- `npm run typecheck`: `tsc --noEmit` in every workspace (TypeScript strict, `tsconfig.base.json`).
- `npm run lint`: ESLint (`eslint.config.mjs`, typescript-eslint strict, no type assertions).
- `npm run format` / `npm run format:check`: Prettier (`.prettierrc`, `.editorconfig`).

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
- Each finished PLAN.md step is committed without asking; push only when asked.

