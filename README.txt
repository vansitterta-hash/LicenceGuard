LicenceGuard Realignment Phase 2B - Full Compile Fix

This package contains the complete replacement file:

src/screens/ApplicationReadinessScreen.tsx

It corrects the typography references so the screen uses the tokens that exist in the current LicenceGuard design system:
- Typography.pageTitle
- Typography.caption

Extract this package directly into the LicenceGuardDesk project folder and allow Windows to overwrite the existing file.

Then run:
  npm run tsc
