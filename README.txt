LICENCEGUARD REALIGNMENT - PHASE 2A

Replace these files in the LicenceGuard project:
  src/screens/ClientProfileScreen.tsx
  src/screens/ApplicationCaseFormScreen.tsx
  src/types/navigation.ts

What this phase does:
- Keeps the five client actions as the normal starting point.
- Loads existing client, firearm and competency records automatically.
- Adds direct Edit client details and Client documents actions inside the workflow.
- Allows a selected firearm to be edited without abandoning the application.
- Allows competencies to be added or edited from the application workflow.
- Competency Renewal now selects an existing competency record and reuses its certificate, issue and expiry dates.
- Existing engines continue to create the application case and open document readiness automatically.

After extraction run:
  npm run tsc

Then test New Firearm Application and Competency Renewal from a client profile.
