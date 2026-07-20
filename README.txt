LICENCEGUARD BATCH 5 — PERSISTENT APPLICATION WORKSPACE

This package adds:
- persistent application progress and last-updated information
- visible Save Draft with saved timestamp
- direct Upload Documents and View Application Documents actions
- actionable outstanding-document rows
- motivation and firearm-information previews
- application timeline
- activity recording for draft saves and compilation attempts
- safe fallback timeline before the optional database migration is applied

INSTALL
1. Extract this ZIP into C:\Users\BM\Desktop\LicenceGuardDesk with -Force.
2. Run npm run tsc.
3. Apply supabase/migrations/20260720_application_workspace_events.sql in Supabase SQL Editor.
   The screen works without the migration, but the migration enables the full persistent timeline.
4. Test on localhost.
5. Commit only after the compile and workflow test are clean.

PUBLIC LIBRARY GOVERNANCE (LOCKED FOR FUTURE BUILD)
Any public submission must be converted to a skeletal reference copy and reviewed before publication. Remove names, surnames, identity/passport numbers, addresses, email addresses, contact numbers, signatures, initials, application references, invoice references, firearm makes/models/calibres where client-specific, serial numbers, licence numbers, dealer/private-seller personal details, QR codes, barcodes and hidden document metadata that can identify the contributor or their client. The private original must never be altered or published.
