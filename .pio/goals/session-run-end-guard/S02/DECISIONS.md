# Accumulated Decisions (through Step 1)

## File Placement

- **Guard module is `session-guard.ts`** (renamed from `turn-guard.ts` in Step 1). All new guard logic must go here. References to the old filename are invalid.
- **Test file is `session-guard.test.ts`**. New tests must be added here, importing from `"./session-guard"`.

## Naming Conventions

- Exported setup function is `setupSessionGuard(pi: ExtensionAPI)`. All wire-ups (e.g., in `src/index.ts`) call this name.
- Module-level test accessors follow the pattern `__testSetActiveSession()` — new accessor should be `__testSetMarkCompleteCalled()`.
