import { supabase } from '../lib/supabase';
import { declarationReadinessIssues, emptySaps271Declarations } from '../utils/saps271Declarations';
import type { ApplicationFormAnswers } from '../utils/applicationFormAnswers';
import type { Saps271Declarations } from '../types/saps271Declarations';

const db = supabase as any;

/** Optimistic update of the existing private JSON; never overwrite a concurrent profile edit. */
export async function saveApplicationFormAnswers(input: {
  dealerId: string; clientId: string; caseId: string; userId: string;
  answers: ApplicationFormAnswers;
  declarations?: Pick<Saps271Declarations, 'answers' | 'confirmedAt'>;
}): Promise<Saps271Declarations> {
  const session = await supabase.auth.getUser();
  if (session.error || !session.data.user || session.data.user.id !== input.userId) throw new Error('Sign in before saving applicant answers.');
  const application = await db.from('application_cases').select('id,status,application_type,created_at').eq('id', input.caseId).eq('client_id', input.clientId).eq('dealer_id', input.dealerId).single();
  if (application.error || !application.data) throw new Error('This application is not available.');
  if (['SUBMITTED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'CLOSED'].includes(application.data.status)) throw new Error('This application is protected.');
  if (input.declarations) {
    if (!['FIREARM_LICENCE_FIRST_APPLICATION', 'FIREARM_LICENCE_ADDITIONAL_APPLICATION'].includes(application.data.application_type)) throw new Error('SAPS 271 declarations do not apply to this application.');
    if (input.declarations.confirmedAt) {
      const issues = declarationReadinessIssues(input.declarations, application.data.created_at);
      if (issues.length) throw new Error(issues.join(' '));
    }
  }
  const client = await db.from('clients').select('saps271_declarations').eq('id', input.clientId).eq('dealer_id', input.dealerId).single();
  if (client.error || !client.data) throw new Error('This client is not available.');
  const original = client.data.saps271_declarations as Saps271Declarations | null;
  const next = { ...(original ?? emptySaps271Declarations()), ...(input.declarations ? { answers: input.declarations.answers, confirmedAt: input.declarations.confirmedAt } : {}), applications: { ...original?.applications, [input.caseId]: input.answers } };
  let query = db.from('clients').update({ saps271_declarations: next, updated_by: input.userId }).eq('id', input.clientId).eq('dealer_id', input.dealerId);
  query = original == null ? query.is('saps271_declarations', null) : query.eq('saps271_declarations', JSON.stringify(original));
  const result = await query.select('saps271_declarations').single();
  if (result.error || !result.data) throw new Error('Applicant answers were not saved. Another edit may have changed the profile; reload and retry.');
  return result.data.saps271_declarations;
}
