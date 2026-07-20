LicenceGuard Realignment Phase 2C

Complete replacement files:
- src/screens/ApplicationReadinessScreen.tsx
- src/services/referenceLibraryService.ts
- src/services/applicationDocumentSuggestionService.ts

What this phase does:
- Finds motivations and firearm/calibre information automatically.
- Uses strict calibre-first matching.
- Rejects a document whose title names a different calibre, even when the folder or tags are wrong.
- Ranks compatible documents by calibre, firearm category, make, model and application purpose.
- Creates application-specific working copies while preserving the source documents.
- Attaches the current client, firearm, serial number, make, model, calibre, licence section and application context to each working copy.
- Prevents duplicate reference documents being added to the same application.

After extraction run:
npm run tsc
