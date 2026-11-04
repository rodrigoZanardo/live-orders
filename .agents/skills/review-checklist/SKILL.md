---
name: review-checklist
description: Checks to run before calling a Live Orders change done or committing it.
---

# Review checklist

Run each and read the output; never report a check as passing without running it.

1. `npm run lint`
2. `npm run typecheck`
3. `npm test` (integration tests too, when `DATABASE_URL` / `REDIS_URL` are set)
4. `npm run build -w <workspace>` for each workspace touched
5. `npm run format:check`
6. New logic has a test; a bug fix starts with a test that reproduces it.
7. New error codes have EN and PT translations.
8. New routes have full Swagger (summary, success, each error).
9. New env variables are in `.env.example`; no secrets in the diff (`git diff --cached`).
10. Commit: Conventional Commits scoped by folder (`feat(api)`, `feat(web)`, `test(api)`, `docs`, `chore`); structure and behaviour in separate commits.
