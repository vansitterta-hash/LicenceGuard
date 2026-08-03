# Private-library source audit

This audit is read-only. It does not approve import, publication, reclassification, movement, or deletion.

## Repository inventory

- 99 non-SAPS files are registered in `src/data/referenceLibrary.ts` and present under `public`.
- 19 distinct `applicationFolder` values exist in the current registry, including `General`.
- Eight source categories exist: Identity Documents, Motivations, Other Supporting Documents, Firearm and Calibre Research, Membership Certificates, Dedicated Status, Good Standing, and Endorsements.
- The “approximately 24 supplied folders” cannot be reproduced as 24 canonical folders from the current checkout. The current registry produces 19 logical application folders plus nested duplicate paths and category folders.
- `scripts/import-reference-library.mjs` expects `reference-library/Firearm Apllications` and `reference-library/manifest.json`; neither source path exists in the current checkout. The script is therefore an unapplied/stale import path, not proof that the 99 files have corresponding Supabase rows.

## Why Marlin 30-30 appears under Identity Documents

The registry contains `reference-library/Identity Documents/Marlin 30-30/Marlin 30-30/ID - R Jansen van Vuuren.pdf`. The generated registry preserved the source archive path and assigned `category: Identity Documents` and `applicationFolder: Marlin 30-30`. No canonical client or firearm relationship caused that placement. It is private identity material embedded in a firearm-named archive folder and requires manual ownership review before any import.

## Scattering and likely misclassification

- Firearm/calibre documents under Other Supporting Documents reflect source archive folder names, not entity metadata.
- The Marlin 30-30 archive contains repeated nested folders and repeated filenames across Motivation and Research paths.
- `Firearm License Motivation .222 Brno.docx` is under the `8x68S Mauser` folder, which is contradictory.
- Membership, dedicated-status, good-standing, endorsement, identity, and member-spreadsheet files appear to contain private-person or dealer material despite being web-bundled under `public`.
- `Member_Firearms_19May2025_105227.xlsx` is under Other Supporting Documents but appears membership/client-specific.
- `TRV 545 CQR.pdf` and `R Jansen van Vuuren - 3030.pdf` are too ambiguous for automatic classification from their paths alone.

## Duplicate indicators

The checkout contains at least these repeated filenames in different paths:

- Firearm License Motivation Marlin 30AS 30-30.docx
- TFB Review.docx
- 300 AAC Blackout 1.docx
- Firearm License Motivation S&W M&P 15-22.docx
- Smith & Wesson 15-22.docx
- Marlin Model 336.docx
- Marlin model 30AS 30.docx
- S&W M&P 15-22 Gun Review.docx
- The New Marlin 336 Classic Lever Gun.docx

Filename equality is only a duplicate indicator. The read-only audit also checks reference IDs, original filenames, storage paths, source-document metadata, and checksums when present.

SHA-256 inspection confirms six byte-identical repository duplicate pairs: three nested Marlin 30-30 research pairs and three S&W M&P 15-22 research pairs (`S&W M&P 15-22 Gun Review`, `Smith & Wesson 15-22`, and `TFB Review`). The other repeated filenames are possible duplicates but are not byte-identical.

## Supabase correspondence

The repository alone cannot prove which private rows exist in live Supabase. When an authenticated user opens a client, `auditPrivateLibrarySources` compares every accessible client document against all 99 registry entries and reports:

- present in both;
- repository-only;
- Supabase-only;
- possible duplicate groups;
- incomplete or contradictory metadata.

No repository file is treated as a private-library candidate unless a durable Supabase document exists.

## Unapplied manifests

- `buildRepositoryReclassificationManifest()` emits one proposal per repository file.
- `buildSupabaseReclassificationManifest(model)` emits proposals only for unclassified, conflicting, or low-confidence client records.

Every entry includes source path/document ID, current and proposed classification, proposed entity links, confidence, reason, conflicts, and `manualApprovalRequired: true`.
