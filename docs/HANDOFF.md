# Handoff: context from the Stock Manager sessions

Read this before starting. It carries what the earlier sessions learned, so the new one does not repeat mistakes. The plan itself is in [PLAN.md](PLAN.md).

## The owner and how to work with him

- Chat in Brazilian Portuguese. Code, identifiers, commits and docs in English.
- He prefers that the agent does the work by command line (git, gh, Render CLI) instead of giving manual steps. Ask only for what needs his account or a secret.
- Never mention job hunting anywhere (README, portfolio, LinkedIn texts). Future work is described as "next improvements".
- Do not automate his LinkedIn. Give him the text to paste.
- Commit and push only when he asks, but he usually asks; group commits by subject (Conventional Commits).
- Creating a public GitHub repo is blocked for the agent by the permission classifier. Give him the exact `gh repo create` command to run; after that, pushes work.
- Downloading and running external binaries is also blocked; he installs tools himself.

## Accounts and places

| What | Where |
|---|---|
| GitHub user | `rodrigoZanardo` (gh is logged in, SSH remotes) |
| Stock Manager repo | https://github.com/rodrigoZanardo/stock-manager (local: `D:\particular\stock-manager`) |
| Stock Manager demo | https://stock-manager-web-v2s6.onrender.com, login `demo@example.com` / `demo-stock-2026` |
| Portfolio | https://rodrigozanardo.github.io (repo `rodrigoZanardo.github.io`, local `D:\particular\portfolio`, one `index.html` with EN/PT flags and Auto/Light/Dark theme). Add this project as a second card when it is live, in both languages. |
| Render | Free plan, workspace "My Workspace". CLI at `C:\Users\rodri\OneDrive\Área de Trabalho\gerado\WFD\cli_2.35.0_windows_amd64\render.exe`, already logged in (`render login`). Its saved token in `~/.render/cli.yaml` also works with the Render REST API (`https://api.render.com/v1`), which can set env vars (`PUT /services/{id}/env-vars/{key}`), read DB connection info and trigger deploys. Never print secrets. |
| Machine | Windows, Git Bash. Many repo files have CRLF line endings: edit with a tool that keeps them. Do not write to `/tmp`; use the session scratchpad. |

## Patterns from Stock Manager worth reusing

- Layers: `domain` (entities, rules, no framework), `application` (use cases + ports as abstract classes), `infra` (Prisma, HTTP clients), `http` (controllers, DTOs with class-validator and Swagger).
- One error catalog with stable codes (`AppError('CODE', params)`), a global filter that returns `{ statusCode, code, message, params }`, and a test that fails if a code has no web translation.
- Swagger: every route has `@ApiOperation`, its success `@ApiResponse` and each error via a shared `ApiErrorResponse(status, description)` decorator.
- Writes that must stay consistent go in one Prisma transaction; races are guarded in the database (conditional `updateMany`), with an integration test against real Postgres that is skipped without `DATABASE_URL` and runs in CI.
- Web: next-intl (EN/PT, flags), theme toggle, forms with react-hook-form + zod, API calls only in `lib/api.ts`, server actions return `{ error }` with the API code.
- Tests: Jest unit tests with in-memory fakes, integration tests with Postgres, Playwright e2e against the Docker stack.

## Problems already solved (do not rediscover them)

- **Next.js page not refreshing after a server action:** a `loading.tsx` (Suspense boundary) made `router.refresh()` apply only part of the streamed page. Fix used: no `loading.tsx` in the app group; pending state shown in the nav with `useLinkStatus`; the form helper runs the action inside `useTransition` and calls `router.refresh()` on success.
- **Playwright clicking before hydration** submits forms natively. Wait for `networkidle` before filling a form.
- **Render, Docker:** no build args, so one Dockerfile per image or one image that builds everything; `dockerCommand` runs from the image's `WORKDIR`, so use absolute paths.
- **Render, `fromService ... property: host`** returns only the service name; add `.onrender.com` yourself.
- **Render, Next.js standalone** must listen on all interfaces: `ENV HOSTNAME=0.0.0.0`, or the service answers 502.
- **Render subdomains are global:** a taken name gets a random suffix (the Stock Manager web became `-v2s6`). Read the real URL from the API.
- **Free Render plan:** no free private services, so every service is a public web service; services sleep and the first request can take about a minute. One free Postgres can hold several services using `?schema=<name>` (Prisma creates the schema).
- **JWT keys on Render:** read from `JWT_PUBLIC_KEY` / `JWT_PRIVATE_KEY` env values (PEM), falling back to `*_FILE` locally.
- **Login rate limit at an nginx gateway** counted every browser login as one client, because the web server calls the API. Use a per-account lockout in the auth domain instead.
- **Demo account:** create a separate demo user (never publish the real admin password) and show its login in the README and portfolio.

## For this project specifically

- Redis is new here. Render's free plan has a Key Value (Redis-compatible) instance; check its limits before relying on it, and keep the app working if it is unreachable at boot.
- The incoming webhook needs a shared secret in an env var (document it in `.env.example`); the demo script that plays the delivery platform reads the same secret.
- ViaCEP: https://viacep.com.br/ws/{cep}/json/ returns `{ "erro": true }` for an unknown CEP; treat that as "not found", not as a failure.
