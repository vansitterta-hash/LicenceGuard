LicenceGuard Application Orchestrator

Complete replacement files:
- src/screens/ApplicationReadinessScreen.tsx
- src/services/applicationOrchestratorService.ts

This update turns Compile Application Pack into a single coordinated action. LicenceGuard will:
1. select calibre-compatible motivation and firearm-information documents;
2. attach working copies without changing the source library;
3. auto-complete and archive the official SAPS PDF when captured data permits;
4. prepare the application pack manifest;
5. generate, archive and download the final PDF when all blocking requirements are satisfied;
6. report only the remaining blockers when the pack is not yet ready.

After extraction run:
npm run tsc
