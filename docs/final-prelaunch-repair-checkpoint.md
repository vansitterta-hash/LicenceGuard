# Final pre-launch workflow checkpoint — 4 October 2026

Base: `cd314f567fd10f220b1862cf5c81b7561b9154b5`, branch `licenceguard-recovery-spatial-integration`.

The interrupted implementation is preserved. The continuation corrects failed-answer-save retry, removes obsolete single-category/current-certificate AutoFill entries for 517(a), pins its selected existing certificate document for pack reuse, and makes an explicitly confirmed hand-in date authoritative over an unconfirmed target date. A recorded actual hand-in date must still agree.

Case-specific answers use the existing private client declaration JSON, keyed by application ID, with optimistic conflict checks. No schema, migration, RLS policy, official PDF template, production record, or SAPS 517 layout changed.

517(a) maps the Handgun/Rifle/Shotgun boxes printed on the pinned form. Current/previous certificate facts are separate from requested categories. 517(g) timing uses confirmed hand-in and certificate expiry dates, never the generation date. Unknowns mark neither answer; applicable reasons must be applicant supplied. The pinned competency forms' DFO motivation sections do not establish a generic applicant motivation document requirement; conditional applicant reasons remain required. Ambiguous SLR mapping and multiple different prior certificate groups remain blocked rather than guessed.

## Validation

Run in this continuation, all PASS:

- `npm.cmd run tsc`
- `npm.cmd run test:security`: foundation 15/15, adversarial privacy 16/16
- `node scripts/launch-form-workflow-regression.mjs`: persisted 271 licence-term confirmation and existing-firearm path; 517(a) multi-category/prior-certificate reuse; 517(g) date boundaries, reasons, nulls, exact draw operations; real pinned 517(a)/517(g) rendering; 518(a) timing; owner scoping, concurrency and failed-save retry
- `node scripts/r09-saps271-declarations-regression.mjs`
- `node scripts/saps-autofill-spatial-regression.mjs`
- `node scripts/saps517-generation-handoff-regression.mjs`: includes saved form/ID pack reuse and review gating
- `git diff --check`

The user's independently passing SAPS 517 profile/field/persistence and Research gates were accepted without repeating the broad suite. Research live production acceptance remains manual. Tests do not replace human physical validation.

Release blocker: a read-only request to the existing production `/api/saps-template?code=SAPS_271` returned HTTP 502. The existing template URL and proxy are unchanged. SAPS 271 electronic data readiness is tested, but its end-to-end PDF physical validation is blocked by template delivery. Push/deployment are withheld under the user's no-unresolved-blocker condition.

## Exact checkpoint files

```text
docs/final-prelaunch-repair-checkpoint.md
scripts/launch-form-workflow-regression.mjs
scripts/r09-saps271-declarations-regression.mjs
scripts/research-context-regression.mjs
scripts/saps-autofill-spatial-regression.mjs
scripts/saps517-field-test-regression.mjs
scripts/saps517-readiness-persistence-regression.mjs
src/components/client/ApplicationFormQuestions.tsx
src/components/client/Saps271DeclarationsSection.tsx
src/data/documentFieldRegistry.ts
src/data/documentLayoutDefinitions.ts
src/data/sapsTemplateRegistry.ts
src/engines/pdfTemplateRenderer.ts
src/engines/sapsFieldMappingEngine.ts
src/screens/ApplicationCaseFormScreen.tsx
src/screens/ApplicationReadinessScreen.tsx
src/screens/ClientFormScreen.tsx
src/services/applicationAutofillService.ts
src/services/applicationFormAnswerService.ts
src/services/applicationReadinessService.ts
src/services/applicationResearchService.ts
src/services/clientService.ts
src/services/generatedApplicationDocumentService.ts
src/services/referenceLibraryService.ts
src/types/applicationAutofill.ts
src/types/saps271Declarations.ts
src/types/sapsTemplate.ts
src/utils/applicationFormAnswers.ts
```

## Preserved and excluded

```text
.tmp/
supabase/.temp/
check-auth.js
check-signup.js
check-staff-auth.js
create-staff-temp.js
scripts/runtime-research-check.js
temp-create-prod-user.ps1
temp-dealer-memberships.sql
temp-fix-auth.sql
temp-test-users.sql
temp-valid-users.sql
```
