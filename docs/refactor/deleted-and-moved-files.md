# Files moved, merged, split, or removed

**Nothing in `src/`, `socket-server/`, or `prisma/` was deleted, merged, split, or moved in this
pass.**

This is a deliberate outcome, not an oversight - see `docs/refactor/architecture-before.md`'s dead-
code section: every service/lib file was checked with a real repository search (not an automated
unused-export tool alone) and every one has at least one confirmed live caller. The task's own
rule ("do not delete a file merely because it appears unused... confirm usage") was applied, and
no file failed that check.

## File moved

| File | To | Why |
|---|---|---|
| `lms_nextjs_prisma_requirements.md` (repo root) | `docs/requirements.md` | The original project spec used to build this app phase-by-phase (matches the app's actual structure - confirmed by reading it in full, not superseded). Phase 16 explicitly calls for moving it under `docs/` with an accurate name if still current and useful, rather than leaving spec content at the repo root or deleting it. Moved with `git mv` to preserve history. |

## Files added

| File | Why |
|---|---|
| `src/lib/http/json.ts` | Shared JSON body parsing, replacing 16 duplicated unguarded `request.json()` call sites (see `docs/security.md`) |
| `src/app/not-found.tsx`, `src/app/error.tsx` | Previously absent - Phase 10 requirement |
| `vitest.config.ts`, `test/stubs/server-only.ts`, `src/**/*.test.ts` (5 files) | New test layer - Phase 14 |
| `.github/workflows/ci.yml`, `.github/dependabot.yml` | New CI - Phase 15 |
| `docs/architecture.md`, `docs/security.md`, `docs/security/platform-security.md`, `docs/deployment.md`, `docs/testing.md`, `docs/refactor/*` | This pass's documentation deliverables |

## Test file removed during this pass (not application code)

`src/server/services/coupon-service.test.ts` was written, then deleted after confirming (by
actually running it) that it can't import cleanly under Vitest - see `docs/testing.md` for the
exact reason and the recommended follow-up (extracting pure logic out of files with heavy
Next.js-runtime imports). Recorded here for transparency since it's the one file this pass created
and then removed again, even though it was never application code.

## Root-level task specification files (not touched, flagged for a future decision)

`CLAUDE_SOCKET_IO_RENDER_FIX_TASK.md` and `CLAUDE_REPOSITORY_HARDENING_REFACTOR_PR_QC_TASK.md` sit
at the repository root. These are session task specifications, not application code or
contributor-facing documentation - candidates for relocation (e.g. under `docs/tasks/`) or removal
once their content is fully actioned and reviewed. **Not touched in this pass**: the current task
file must remain in place and readable while its own instructions are still being executed, and
deleting or moving the other one without being asked would be an unrequested change to files
outside this task's stated scope.
