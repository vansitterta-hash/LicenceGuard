# Controlled beta sprint report

Repository: `C:\Users\BM\Desktop\LicenceGuardDesk`  
Date: 2026-09-12

Local implementation is prepared. Full A-to-Z acceptance remains blocked by the unexecuted database proposal and unverified Supabase recovery-email configuration. No production-readiness claim is made.

## A. Root causes found

| Area | Finding |
| --- | --- |
| Persistence and hydration | Autosave could execute against the initial/default form before hydration. Debounce cancellation could discard edits. Blur, autosave and explicit saves were independent requests, allowing an older request to finish last. Focus and route initialization were not coordinated with outstanding writes. |
| Authentication and persistence | Every auth event toggled the root loading state, unmounting navigation and active forms, including on token refresh. The auth callback also awaited database work inside the Supabase callback. |
| Competency duplicates | Competency draft creation used direct INSERT without a server create/resume operation. An existing case ID was not established consistently before editing. |
| Deletion | The installed React Native Web `Alert.alert()` implementation is empty, so native confirmations did not invoke removal callbacks. Existing delete helpers lacked protected-record guards and affected-row checks. Clients/firearms already used archival. |
| Password change | No authenticated password-change flow was exposed in the inspected account/auth/navigation code. No existing mandatory-password screen or flow was found there to reuse. |
| Forgot/reset password | Login had no recovery request, reset form, or callback handling. Supabase URL-session detection was disabled. |
| Dashboard | All four displayed totals were literal zero strings. |
| R02 | Regression dependency mocks referenced an older policy-module location and only exercised empty results. |
| R03 | The regression required a throwing guard in readiness, although readiness intentionally returns a blocked, readable historical record using the non-throwing policy check. |
| Terminal save | A new failing regression demonstrated that readiness's existing Save draft helper could update a submitted case before attempting its existing event write. |

## B. Files changed in this sprint

Existing files edited:

- `App.tsx`
- `src/context/AuthContext.tsx`
- `src/navigation/AppNavigator.tsx`
- `src/engines/competencyEngine.ts`
- `src/screens/ApplicationCaseFormScreen.tsx`
- `src/screens/ApplicationCasesScreen.tsx`
- `src/screens/ApplicationReadinessScreen.tsx`
- `src/screens/ClientProfileScreen.tsx`
- `src/screens/CompetenciesScreen.tsx`
- `src/screens/DashboardScreen.tsx`
- `src/screens/FirearmsScreen.tsx`
- `src/screens/LoginScreen.tsx`
- `src/services/applicationCaseService.ts`
- `src/services/applicationWorkspaceService.ts`
- `src/services/clientService.ts`
- `src/services/firearmService.ts`
- `scripts/r02-readonly-regression.mjs`
- `scripts/r03-unsupported-types-regression.mjs`
- `scripts/r04-draft-persistence-regression.mjs`

New implementation files:

- `src/screens/PasswordScreen.tsx`
- `src/services/passwordService.ts`
- `src/services/dashboardService.ts`
- `src/services/safeDeletionService.ts`
- `src/utils/draftSaveQueue.ts`
- `src/utils/safeDeletionPolicy.ts`
- `src/utils/userAlert.ts`

New regression/report files:

- `scripts/beta-test-support.mjs`
- `scripts/r01-evidence-format-regression.mjs`
- `scripts/r02-readiness-no-write-regression.mjs`
- `scripts/r05-safe-deletion-regression.mjs`
- `scripts/r06-password-regression.mjs`
- `scripts/r07-dashboard-regression.mjs`
- `supabase/proposals/20260912_controlled_beta_boundaries.sql`
- `CONTROLLED_BETA_SPRINT_REPORT.md`

The working tree was already dirty. Existing SAPS mapping, AutoFill, pack, policy, migration and backup changes were preserved. In particular, this sprint did not edit SAPS mappings or motivation logic. The applied `20260906_firearm_application_drafts.sql` was not changed.

## C. Exact fixes implemented

**Application lifecycle**

- Gate saving until the intended case has hydrated successfully; reject a case/client/dealer mismatch and show a retryable load error instead of editable defaults.
- Establish and retain the returned case ID in navigation.
- Serialize form writes by case ID. Reopening waits for outstanding writes. Remove the cancellable autosave debounce.
- Preserve all hydrated form values during edits and child-screen/focus returns; show failed saves with a retry action.
- Await persistence before readiness navigation. Block removal while changes need saving, warn before browser unload, and wait for pending writes before sign-out.
- Avoid unmounting the application on token-refresh and password-update auth events.
- Add case URLs for browser re-entry. A readiness request for a missing ID no longer falls through to another case.
- Retain service-side terminal-status filters and add them to the existing workspace Save draft helper after reproducing its failing regression. No new workspace-event persistence was added.

**Competency draft identity**

- New competency actions look up an existing working case and hydrate it.
- The proposal defines one working competency draft per dealer/client/application type. Category and linked competency are editable within that case.
- Repeated creation uses an RLS-bound create/resume RPC. A client-row lock serializes starts; a trigger also guards direct creation.
- Historical duplicates are neither merged nor deleted. Automatic resume chooses the oldest by creation time, then ID; explicit Continue keeps the selected historical ID. Saved applications have distinct list positions and opened dates.
- The existing firearm RPC/migration remains in use.

**Removal**

- Browser confirmations now work and cancellation performs no action.
- Owners/administrators can request removal; authenticated membership and dealer-scoped record lookup are checked first.
- Clients/firearms retain the existing archive model. Only unsubmitted application drafts and unissued/unverified competency records are candidates for hard deletion.
- The proposed database function/triggers enforce role checks, protected fields, linked records/history, tenant filters and affected-row checks. Document metadata links are also considered.
- The functions use `security invoker`; they do not replace or loosen existing RLS, grants or `is_dealer_member` protection. No unsafe fallback runs when the RPC is unavailable.

**Passwords**

- Dashboard provides Change password, with a shared password/confirmation screen, validation and visible feedback.
- Login provides Forgot Password using the entered email and Supabase reset-email requests, with a neutral success message.
- Callback handling supports recovery tokens and code exchange, rejects invalid/expired state, validates the authenticated user, and permits refresh of a validated recovery session.
- The redirect is the current web origin plus `/?reset-password=1`; it does not include client/case paths.
- Password updates use Supabase Auth only. No custom password storage was added. Callback credentials are removed from the address bar after handling. Completing recovery can return the user to sign-in.

**Dashboard and beta regressions**

- Counts now use database count queries scoped to the current dealer and active clients; refresh occurs on focus.
- Open-case totals exclude closed statuses. Expiry totals use date windows over competencies and firearm licences.
- Loading/failure does not masquerade as a zero count.
- R02 now exercises supported cases and reusable client evidence repeatedly with zero writes.
- R03 tests the actual shared policy and retains blocked, readable unsupported history. Unsupported workflows remain unavailable.
- R01 format/required-pack behavior was not changed.

## D. Regression coverage

R04 executes the form component with a hook/navigation harness and an in-memory service boundary. It exercises draft identity, changed values, fresh hydration, all eight supported application types, non-NOT_STARTED editable status, hidden-field preservation, focus return, delayed writes, explicit-save ordering, unmount, repeated start, historical duplicates, failed hydration, tenant mismatch and terminal protection.

R05 exercises removal prechecks, protected records, membership/tenant failures, server rejection, and browser confirmation/cancellation. R06 exercises password requests/validation, recovery tokens/code/refresh/expiry, and auth-event state. R07 checks count query results, tenant/active-client filters, status/date filters and errors.

These are local regressions with mocked Supabase boundaries. They do not prove PostgreSQL trigger execution, concurrent database behavior, real RLS outcomes, email delivery, or browser acceptance with a real account.

## E. Command results

| Command | Result |
| --- | --- |
| `npm run tsc` | PASS, exit 0 |
| `node .\scripts\r01-evidence-format-regression.mjs` | PASS, exit 0 |
| `node .\scripts\r02-readiness-no-write-regression.mjs` | PASS, exit 0 |
| `node .\scripts\r03-unsupported-types-regression.mjs` | PASS, exit 0 |
| `node .\scripts\r04-draft-persistence-regression.mjs` | PASS, exit 0 |
| `node .\scripts\r05-safe-deletion-regression.mjs` | PASS, exit 0 |
| `node .\scripts\r06-password-regression.mjs` | PASS, exit 0 |
| `node .\scripts\r07-dashboard-regression.mjs` | PASS, exit 0 |
| Configured full test suite | No test-suite command exists in `package.json`; all regression entry points above were run. |
| `npx expo export --platform web` | PASS, exit 0; 2,581 modules bundled and output written to `dist` |
| `git diff --check` | PASS, exit 0; no whitespace errors |

Export emitted only color-environment warnings (`FORCE_COLOR` overrides `NO_COLOR`). Git emitted existing LF/CRLF conversion warnings, with no diff-check errors.

During development, the added terminal-save regression failed before its guard was added. The expanded R02 fixture initially asserted a nonexistent document-ID result field; it now asserts the actual SATISFIED readiness contract. Both corrected regressions pass.

## F. Remaining blockers and safety review

1. `supabase/proposals/20260912_controlled_beta_boundaries.sql` is review-only and has not been executed. Validate it in an isolated database with representative schema, existing RLS and test tenants before approving application. Test simultaneous competency starts, historical duplicates, allowed removal, protected/history-linked records, and cross-tenant/staff denial.
2. Until those RPCs are installed, new competency creation and safe removal fail with an explicit unavailable message. Existing saved competency drafts can still resume through the read path.
3. Supabase must allow the intended local/beta `/?reset-password=1` redirect. Configuration and real email delivery/expired-link behavior were not changed or verified against a live account.
4. Browser acceptance remains required, including the Shotgun/Camperdown example plus notes/references, child navigation, reload, logout/login, Prepare/Save-and-readiness, safe/protected deletion and dashboard refresh.

No production database changes were made. The three specified historical firearm rows were not accessed or modified. No RLS/RBAC weakening, enum changes, new unsupported workflows, commits, pushes or deployments were performed. No SAPS mapping or motivation changes were introduced by this sprint. Pre-existing unrelated working-tree artifacts were preserved.

## G. Manual A-to-Z local beta acceptance

**Not yet ready for the full A-to-Z run against the unchanged live database.** The local implementation is ready for review and isolated acceptance setup. Complete the database and recovery-configuration prerequisites above, then run the manual acceptance sequence. Automated passes alone do not establish production readiness.

Implementation references consulted: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo 57 Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/), [Supabase reset email](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [Supabase auth state events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
