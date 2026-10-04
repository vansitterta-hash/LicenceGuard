# Reusable records and SAPS autofill audit — 2026-10-03

Scope: existing SHOTGUN first-competency case; read-only inspection through the authenticated local Edge session on port 8082. No live records were written. No migration, deployment, commit, PDF replacement or privacy-policy change was performed.

## Authoritative facts and storage

| Fact | Existing structured authority | Capture/reuse status |
| --- | --- | --- |
| Existing SAPS competency certificate | `competencies`, edited through `CompetencyFormScreen` and `competencyEngine` | `certificate_number`, `issue_date`, `expiry_date`, `category`, verification fields. One record per client/category in the schema. Multiple category rows may legitimately refer to the same certificate. |
| Requested competency category | `application_cases.competency_category` | Already supplies SAPS 517 category and G3 Shotgun mark. It is not another applicant question. |
| Firearm-required competency | `firearms.required_competency` | Safe fallback category for firearm applications without a case category. |
| Accredited training institution | `clients.saps271_declarations.saps517.accreditedTrainingCertificate.institution` | Structured, reusable profile fact; already consumed by SAPS 517 H2. Not present on `competencies`. |
| Accredited training serial/reference | Same JSON object, `.serialNumber` | Structured field captured by the SAPS 517 client editor; consumed by H3. Distinct from the SAPS competency certificate number. |
| Accredited training issue date | Same JSON object, `.dateIssued` | Structured field captured by the SAPS 517 client editor; consumed by H4. Distinct from the SAPS competency issue date. |
| Training certificate declaration | Same JSON object, `.answer` | Explicit applicant answer. Existence of a competency record does not answer H1. |
| Business Purposes training/competency | No dedicated field in the current schema/types/editor | Not captured as a structured business-purpose fact. Employment details and ordinary competency category do not establish it. |
| Training history / certificates by training category | No separate training entity or category-specific training history | Current client JSON holds one training certificate object. Do not infer its scope or invent additional records. |
| Uploaded evidence | `documents`, files in `licenceguard-documents` | Generic manual issuer/reference/date metadata exists; no dedicated accredited-training semantic classification. `competencies.document_url` exists separately. |
| Firearm | `firearms` | Make, model, calibre, serial, type, required competency; application links by `firearm_id`. |
| Firearm licence | `firearm_licences` | Number, section, issue/expiry dates, status; linked to firearm and optionally application. |
| Reusable applicant | `clients` | Names, ID, contact and residential address fields. Validated ID supplies DOB/age/gender; citizenship remains explicit. |
| SAPS 517 particulars/declarations | `clients.saps271_declarations.saps517`; shared H5–H10 answers in `.answers` | Marital/postal/spouse/employment details, G answers, H1 and H11–H17 are structured profile data. Unknown is never defaulted to NO. |

Potential duplication exists between generic document metadata and structured certificate fields, and in historical generated document/review snapshots. Those snapshots and generic metadata are not current training authority. A document file by itself supplies no structured facts.

## Actual field-test evidence

The signed-in client has one SHOTGUN first-competency case with `competency_id = null` and a separate verified SHOTGUN competency record. Its existing certificate has an expiry date in the past; reuse does not renew it or change its validity.

The client JSON contains marital status `DIVORCED` and postal confirmation `YES`, both strings. The institution is populated; training serial and issue date are empty strings. No alternative structured training source was found in the inspected client, competencies, or document metadata. There are 19 visible document rows; none is classified/named as an uploaded training/competency certificate, and all four competency `document_url` values are empty. Non-generated evidence issuer/reference/date values inspected are null. File contents were not extracted or guessed.

Before this fix, live readiness already recognized marital/postal/institution/category and returned only the two training blockers. Thus this audit does not establish the historical cause of the earlier four-item display.

Before the fix, live autofill returned a SHOTGUN category with blank SAPS competency certificate/date fields because the case lacked `competency_id`. After the fix, the same read-only call returned the existing competency number, issue date and expiry date. The separate training serial/date remained blank. Readiness and autofill still agree on exactly those two missing training facts.

## Data flow and confirmed defect

`ClientFormScreen` saves the reusable JSON through `clientService`; `getClient` reloads that same JSON. `competencyEngine` saves competency facts separately.

`buildApplicationAutofillPackage` reads the case and client, firearm/licence links, and now client-scoped competencies. It resolves a reusable competency and constructs the package. `saps517ApplicantFields` reads training facts from the reusable profile JSON and category from the case. `saps517RequiredProfileIssues` is used by both readiness and autofill. `sapsFieldMappingEngine` / `documentFieldRegistry` resolve values; `generateOfficialApplicationPdf` revalidates SAPS 517 and reconstructs applicant fields; `pdfTemplateRenderer` overlays the unchanged pinned official PDF.

Confirmed root cause: readiness previously searched client competencies by category, but autofill read only a manually linked competency. It could report a competency present while autofill omitted its stored facts. There was no confirmed ignored alternate training-record source: the profile training facts were already reused correctly.

## Implemented precedence and safeguards

1. An explicit competency link takes precedence, but must resolve among the current client's RLS-visible records and match the known category. Invalid/unavailable links block instead of silently selecting another record.
2. Without a link, exactly one matching category record is reused. No match or ambiguous matches leave competency facts unavailable. No first-row guessing.
3. Further-competency applications may explicitly reference an existing different category. No automatic fallback chooses a previous certificate for that workflow.
4. Requested case category remains authoritative; firearm-required competency supplies the category for firearm workflows where the case has none.
5. SAPS 517 training institution/serial/date remain sourced exclusively from the existing client training object. SAPS competency numbers/dates, generic upload metadata, filenames, and generated snapshots are not substituted.
6. Reads never backfill/write the case link or client profile. Blank case fields cannot overwrite competency records. No declaration is inferred.

Readiness uses the same competency resolver. SAPS 517 detail/state continue to derive from the same profile-issues result, and counts derive from requirement states (one incomplete applicant requirement can contain two missing fields). Requirement definitions are cloned before per-case detail changes, avoiding mutable shared definitions.

Applicant signatures, signing date/place, fingerprints and other physical submission actions are not fabricated. Existing official-use protections and PDF coordinates are unchanged.

## Upload audit

`DocumentLibraryScreen` → `uploadClientDocument`:

- A: stores the file and a document row.
- B: accepts optional manually entered `issued_by`, `reference_number`, `document_date`, `expiry_date`, plus name/type/scope/notes and workflow metadata.
- C: no OCR or training/certificate fact extraction in this upload flow.
- D: `uploadClientDocument` currently inserts `competency_id: null`; it does not link or create a competency/training record. Application/firearm links are supported separately.

No new document extraction, metadata interpretation, storage entity or capture flow was added.

## Cross-form scope

| Form | Safe reuse and remaining gaps |
| --- | --- |
| SAPS 517 | Existing profile facts and requested category already reused. Existing SAPS competency now available in the common package, but it does not answer H2–H4 training particulars. Missing actual training serial/date must be captured once. |
| SAPS 517(a) | Common applicant facts and explicitly linked existing competency remain available. Requested vs existing category currently share one package/mapping category, so multiple/prior categories need a form-specific model/mapping review. No training/declaration mappings were copied from 517. |
| SAPS 517(g) | Matching existing competency number/issue/expiry now reuse without requiring a redundant case link; existing mappings consume those facts. Package still represents one category at a time; multi-category renewal and form-specific particulars remain separate work. |
| SAPS 271 | Firearm-required category can select the matching existing competency without a redundant case link; current competency mappings consume it. Existing client/firearm/licence sources and declaration rules retained. No 517-only declarations copied. |
| SAPS 518(a) | Existing linked firearm/licence and common client reuse retained. Common competency resolution does not insert competency/training facts into unrelated licence fields. No new form mappings. |

## Validation

`reusable-record-autofill-regression.mjs` exercises client-scoped lookup, explicit-link precedence, ambiguity, wrong category/client, training-versus-competency separation, known and missing training facts, unknown H1, SAPS mapping and PDF draw operations, official/physical exclusions, and 517(g)/271 common reuse. It uses synthetic records and rejects writes.

Existing SAPS 517 field-test, save/reload persistence, competency acceptance, spatial mapping, SAPS 271 declarations, R02 read-only readiness, R08 static SQL, R10 static authorization, security foundation/adversarial regressions and TypeScript were run. The R02 harness only gained permission to load the new pure helper; all its write guards/assertions remain intact. Migration and official-PDF hashes are checked against their pre-edit state.

Physical validation remains BLOCKED by the real training certificate serial number and issue date. The next user action is to capture those two actual training facts once from the accredited training certificate in Edit client, then save. Refresh reuses existing marital/postal/institution/category and competency facts; it cannot create the missing training facts.
