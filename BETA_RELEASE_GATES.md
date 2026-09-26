# A. SQL proposal: NOT APPROVED

Reviewed `supabase/proposals/20260912_controlled_beta_boundaries.sql`. No SQL was executed.

The remaining compatibility blocker is the absence of authoritative current database metadata. `application_cases_upgrade.sql` permits only two competency types in its required-links constraint. The July schema reconciliation is explicitly a proposal; it adds additional-category support but excludes competency reapplication and requires a competency link for renewal. The September boundary proposal expects all four competency enum values. A proposal file is not evidence that those enum values, columns or constraints exist in production. Its metadata preflight rejects missing enum values/columns, but does not establish that the active check constraint accepts every supported draft payload.

Run only `supabase/proposals/20260912_beta_gate_readonly.sql` and return every result set for a final compatibility review. Do not apply either proposal to resolve this uncertainty. PostgreSQL runtime testing of concurrent starts, dependency blocking and reruns remains unperformed; the regressions are local mocks/static checks.

# B. SQL safety findings

- The current local proposal contains the narrow safety corrections: replaceable triggers for reruns; explicit anonymous/PUBLIC revokes; validation of competency ownership before resume; terminal competency update protection; audit and document logical-link checks; complete inbound-FK inspection; and transaction isolation/locking guards. No historical cleanup or application data rewrite occurs when installing it.
- Draft identity is dealer + client + competency application type + NOT_STARTED. Existing duplicates remain untouched; oldest created_at/id is resumed. Client row locking serializes starts at READ COMMITTED. Other snapshot isolation levels are rejected. The direct-insert trigger follows the same rule. Runtime concurrency still needs database validation.
- RPC writes are SECURITY INVOKER, retaining existing RLS. Membership, client/dealer and competency/client/dealer checks are explicit. Approval requires confirming the deployed membership helper and policies match these assumptions.
- `remove_safe_beta_record(text, uuid, uuid)` hard-deletes only application_cases and competencies; clients/firearms are archived. Active owner/administrator membership is required. Existing direct DELETE paths on all four tables also run the guard, so an unlinked client/firearm can still be hard-deleted directly by an authorized role if table RLS permits it. This is not an archive-only database policy.
- Cases must be unsubmitted NOT_STARTED records without submission/outcome dates or reference. Competencies must lack issued/verified evidence. Any audited, documented or FK-linked record is retained; this intentionally includes linked draft records. Both CASCADE and SET NULL dependencies are blocked before removal.
- Exactly one function is SECURITY DEFINER: the removal trigger. It reads/locks dependencies, performs no DML, fixes search_path to pg_catalog/public/pg_temp, sets row_security=off, and denies execution to PUBLIC/anon/authenticated. This privilege is needed to inspect dependencies hidden by caller RLS. row_security=off alone does not grant RLS bypass; owner privileges, table ownership/forced RLS and schema write privileges require verification. Failure to inspect must abort removal.
- SHARE locks on dependency tables can block unrelated writes; lock_timeout is five seconds and deadlocks abort the transaction. This is a conservative safety tradeoff, not a measured production performance guarantee.
- Four functions and five triggers are created/replaced within BEGIN/COMMIT. No indexes, constraints, RLS policies or firearm ON CONFLICT predicates are changed. R08 pins the firearm migration's current bytes. Rerun syntax is replaceable, but requires compatible PostgreSQL/version, existing signatures and deployment privileges.
- Exact client contracts match: create_or_resume_competency_application_draft(p_dealer_id uuid, p_client_id uuid, p_values jsonb) returns public.application_cases; remove_safe_beta_record(p_table text, p_id uuid, p_dealer_id uuid) returns boolean. Services handle the returned row and require true respectively.
- Failure before COMMIT rolls installation back. After a future successful application, restoring previous definitions/grants requires capturing them first; dropping guards removes protections. Reversing installation cannot restore records subsequently deleted by users.
- R04, R05, R06 and R08 passed; git diff --check passed. R08 is static SQL/contract validation, not SQL execution.

# C. Exact Supabase password-reset configuration

In Authentication > URL Configuration set Site URL to `https://licenceguard.vercel.app` and add Redirect URL `https://licenceguard.vercel.app/?reset-password=1`. Preserve other required entries. For local testing on port 8081 also add `http://localhost:8081/?reset-password=1`; use the actual origin/port if different. Local testing does not require changing the production Site URL.

The implemented callback is `/` with `reset-password=1`, not a separate callback route. The Reset password email template should link to `{{ .ConfirmationURL }}` so Supabase verifies recovery before redirecting. The existing Expo root handling and Vercel SPA fallback suffice. No new Vercel variable is required: the existing EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must identify the intended project.

The code passes that exact redirectTo to resetPasswordForEmail; validates recovery tokens/code and getUser; handles invalid/expired links; enforces matching passwords and eight characters; and calls updateUser({password}). Recovery selects the root reset screen, while ordinary Change Password is independently entered from the dashboard. Real Auth responses, project-specific password rules and email delivery remain live-test requirements.

The SMTP mode cannot be determined from repository files or this session. Inspect Authentication's Email/SMTP settings: enabled custom SMTP means provider delivery; otherwise default Supabase Auth delivery is expected (subject also to any configured Send Email hook). Default delivery is restricted to project-team addresses and currently two messages/hour, so it cannot establish general beta-user delivery. No SMTP setting was changed.

References: https://supabase.com/docs/guides/auth/redirect-urls ; https://supabase.com/docs/guides/auth/auth-email-templates ; https://supabase.com/docs/guides/auth/auth-smtp

# D. Remaining manual actions

1. Return the SELECT-only evidence query results for review. Keep the migration unapplied until it is approved; then arrange a separately authorized controlled application and database verification, including simultaneous starts, tenant/RBAC rejection, historical/terminal preservation, hidden dependencies and rerun behavior.
2. Confirm production contains the reviewed password implementation. This review did not deploy or verify the deployed build.
3. Check/save the exact Dashboard URLs/template and report SMTP mode (no credentials). Resolve default-sender restrictions if testing a non-team beta user.
4. Open production login, enter a controlled existing test-user email in the login email field, then click Forgot Password. This UI reads the email already entered. Check inbox/spam and confirm receipt; if absent inspect Auth/email-provider logs and rate limits.
5. Follow the newest link and confirm the reset screen. Verify mismatched confirmation is rejected, then save a new matching password. Return to sign in; confirm old password fails and new password succeeds. Verify the same dealer, clients and application records remain intact.
6. In a fresh browser session verify an expired/used link is rejected. Separately test dashboard Change Password and repeat the recovery flow locally using the allowlisted local origin. These tests change only the controlled test user's Auth password; none were performed automatically.

# E. Acceptance readiness

Not yet. After current-schema review, SQL approval and separately authorized application/verification, confirmation of the reviewed production build, and successful live/local recovery tests, proceed directly to final local/production A-to-Z acceptance. No repeat implementation sprint is indicated.
