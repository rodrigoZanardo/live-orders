---
name: backend-feature
description: Add an endpoint, use case or entity to the Live Orders API, step by step. Use for any new behaviour in api/.
---

# Backend feature

Follow [api/AGENTS.md](../../../api/AGENTS.md). In this order:

1. **Domain first.** Put the rule in `api/src/domain`. Write the unit test before the code; cover the allowed and the refused cases.
2. **Error codes.** A new refusal gets a code in `src/domain/errors.ts` and its EN and PT translation in `web/messages/`. The translation test must stay green.
3. **Use case + port.** In `src/application`: the use case depends on an abstract class (port), never on Prisma. Test it with an in-memory fake.
4. **Repository.** In `src/infra`: writes that must stay consistent go in one Prisma transaction; an order change also writes its `Event` row there, conditional on `version`.
5. **Controller + DTO.** In `src/http`: class-validator DTO, role guard, Swagger `@ApiOperation`, success `@ApiResponse` and each error response.
6. **Integration test** if it writes: real Postgres (and Redis if used), skipped without `DATABASE_URL` / `REDIS_URL`.
7. **Env.** A new variable goes into `.env.example` with a comment.
8. Run the [review checklist](../review-checklist/SKILL.md).
