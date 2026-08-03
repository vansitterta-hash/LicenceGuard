# Proactive renewals preview

Milestone D is implemented as a read-only preview. It evaluates firearm-licence and competency renewals without creating cases, linking documents, generating forms or packs, recording events, or sending notifications.

## Local enablement

The feature is off unless explicitly enabled. Set this local environment value and restart Expo:

```text
EXPO_PUBLIC_LG_PROACTIVE_RENEWALS=true
```

Remove the value (or set it to anything other than `true`) and restart Expo to disable it. After enabling it, open a Client Profile and use the **Proactive renewals** panel.

## Eligibility policy

- Authoritative dates are `firearm_licences.expiry_date` and `competencies.expiry_date`.
- The existing 120-day renewal window is used.
- An expired item is not automatically treated as an ordinary renewal because the legally appropriate next application cannot be inferred.
- An active compatible renewal case blocks another candidate. Active cases include work from `NOT_STARTED` through `SUBMITTED`.
- Existing private-library documents are shown as verified, unverified, expired or missing. Exact firearm/competency links outrank generic client documents.
- Unsupported declarations, signatures and physical passport photographs remain manual review items.

## Why preparation is disabled

The current schema has no durable unique claim for an automatic operation. A read-before-insert check cannot prevent two browser sessions or workers from concurrently creating duplicate application cases. Generated forms, packs, notifications and stage events likewise have no unique operation key. Therefore the preview performs no writes and **Prepare draft renewal** is disabled.

The minimum safe forward-only schema capability is a durable operation-claim record with:

- a unique deterministic `idempotency_key`;
- dealer, client, operation, subject type, subject ID and renewal-window fields;
- stage/status, linked application-case ID, last error and timestamps;
- a database operation that atomically claims the key and creates or returns the single compatible application case;
- unique child operation claims for document linking, form generation, pack generation and notification creation, so retries resume rather than duplicate work.

No migration or SQL change is included in Milestone D.
