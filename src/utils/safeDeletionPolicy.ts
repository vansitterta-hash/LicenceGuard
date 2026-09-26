export type DeletableRecord = 'application_cases' | 'competencies' | 'clients' | 'firearms';

export function assertSafeRecordRemoval(table: DeletableRecord, record: Record<string, unknown>, role: string): void {
  if (!['owner', 'administrator'].includes(role)) throw new Error('Only a dealer owner or administrator can remove records.');
  if (table === 'application_cases' && (record.status !== 'NOT_STARTED'
    || record.actual_submission_date || record.application_reference || record.outcome_date
    || record.closed_date || record.withdrawn_date)) {
    throw new Error('Only an unsubmitted draft without outcome or submission records can be deleted.');
  }
  if (table === 'competencies' && (record.certificate_number || record.issue_date || record.expiry_date
    || record.verified || record.verified_at || record.document_url)) {
    throw new Error('Issued or verified competency records must be retained.');
  }
}
