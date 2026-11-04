---
name: frontend-feature
description: Add a page or component to the Live Orders web app. Use for any new screen or UI change in web/.
---

# Frontend feature

Follow [web/AGENTS.md](../../../web/AGENTS.md). In this order:

1. **Data on the server.** Fetch in a server component through `lib/api.ts`. Add the call there if it is new.
2. **Client only when needed.** A client component only for interaction (forms, the live board). Forms use react-hook-form + zod; server actions return `{ error }` with the API code.
3. **Texts.** Every string in `messages/en.json` and `messages/pt.json`, same keys in both.
4. **States.** Handle empty, error and pending (pending in the nav or the button, never `loading.tsx`).
5. **Accessibility.** Labels on inputs, keyboard for every action, text next to any color signal.
6. **Tests.** Pure logic (reducers, formatters) gets a Jest test. A change to a user flow updates or adds a Playwright test.
7. Run the [review checklist](../review-checklist/SKILL.md).
