# web

Next.js 15 (App Router) app: login, live board, order form, order detail, webhooks and users pages. Root rules in [../AGENTS.md](../AGENTS.md) apply too.

## Rules

- Server components fetch the data. The board is the one live client component: first list from the server, then WebSocket events applied by `seq`, catch-up on reconnect.
- The board reducer (apply events in order, ignore duplicates) is a pure function in `lib/` with Jest tests.
- API calls only in `lib/api.ts`. Server actions return `{ error }` with the API error code.
- Every UI text comes from `messages/en.json` and `messages/pt.json`; error codes are translated there too.
- Accessibility: no color-only signals (the late badge says "Late"), every move works with the keyboard, no drag-only actions.
- No `loading.tsx` (it breaks `router.refresh()` after a server action, see docs/HANDOFF.md); show pending state in the nav.
- Playwright: wait for `networkidle` before filling a form.

## Commands

- `npm test -w @live/web`, `npm run typecheck -w @live/web`.

## Run locally

- API on :3001 (see `.env.example`), then `npm run build -w @live/web && npm start -w @live/web` or `npm run dev -w @live/web` (http://localhost:3000).
- `API_URL` is how the Next server reaches the API; `PUBLIC_API_URL` is how the browser reaches it (WebSocket + catch-up).
