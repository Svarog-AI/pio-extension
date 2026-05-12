# Tests: Register skill in `src/index.ts`

**Note:** This project has no test runner (no Jest, Vitest, Mocha, etc.). The only programmatic verification is `npm run check` (`tsc --noEmit`). Since this step modifies a TypeScript source file, type checking serves as the primary automated gate. All other verification uses file-content checks via shell commands.

## Programmatic Verification

1. **Skill path present in array**
   - **What:** Confirm `test-driven-development` appears in the `skillPaths` array
   - **How:** `grep -c 'test-driven-development' src/index.ts`
   - **Expected result:** Output is `1` (exactly one match)

2. **Uses correct pattern (`path.join` + `SKILLS_DIR`)**
   - **What:** Confirm the entry follows the same format as the existing `"pio"` entry
   - **How:** `grep 'path.join(SKILLS_DIR, "test-driven-development")' src/index.ts`
   - **Expected result:** Returns the line (exit code 0)

3. **Both skills present**
   - **What:** Confirm both `pio` and `test-driven-development` are in the array
   - **How:** `grep -c 'path.join(SKILLS_DIR,' src/index.ts`
   - **Expected result:** Output is `2` (two entries total)

4. **TypeScript compiles without errors**
   - **What:** Ensure the change introduces no type or syntax errors
   - **How:** `npm run check`
   - **Expected result:** Exit code 0, no error output

5. **No unintended changes to other parts of index.ts**
   - **What:** Confirm only the `skillPaths` array was modified (no other lines changed)
   - **How:** `git diff src/index.ts | grep -c '^[+-]'` (or visual inspection if git isn't available)
   - **Expected result:** Only additions around the `skillPaths` array line; no imports, function signatures, or other logic altered

6. **Skill directory exists on disk**
   - **What:** Confirm the referenced directory actually exists
   - **How:** `test -d src/skills/test-driven-development && echo "exists"`
   - **Expected result:** Prints `exists` (exit code 0)

## Manual Verification

1. **Visual inspection of the array**
   - **What:** The `skillPaths` array reads naturally with both entries
   - **How:** Open `src/index.ts` and inspect lines around `const skillPaths = [...]`
   - **Expected result:** Array contains exactly two elements: `path.join(SKILLS_DIR, "pio")` and `path.join(SKILLS_DIR, "test-driven-development")`, each on its own line with proper comma separation

## Test Order

1. Run programmatic checks 1–3 (file content verification)
2. Run programmatic check 4 (`npm run check`)
3. Run programmatic check 5 (diff / change scope)
4. Run programmatic check 6 (directory existence)
5. Perform manual verification (visual inspection)
