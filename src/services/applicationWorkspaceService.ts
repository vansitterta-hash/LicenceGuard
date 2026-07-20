import { supabase } from '../lib/supabase';
import type { ApplicationCaseStatus } from '../types/applicationCase';

const db = supabase as any;

export type ApplicationWorkspaceMeta = {
  id: string;
  status: ApplicationCaseStatus;
  progressPercent: number;
  openedDate: string;
  createdAt: string;
  updatedAt: string;
  actualSubmissionDate: string | null;
  outcomeDate: string | null;
};

export type ApplicationWorkspaceEvent = {
  id: string;
  eventType: string;
  title: string;
  detail: string | null;
  createdAt: string;
};

export async function saveApplicationDraft(
  applicationCaseId: string,
  userId: string
): Promise<string> {
  const savedAt = new Date().toISOString();
  const result = await db
    .from('application_cases')
    .update({ updated_by: userId, updated_at: savedAt })
    .eq('id', applicationCaseId)
    .select('updated_at')
    .single();

  if (result.error) throw new Error(result.error.message);
  await recordApplicationWorkspaceEvent(applicationCaseId, userId, 'DRAFT_SAVED', 'Application draft saved');
  return result.data?.updated_at ?? savedAt;
}

export async function getApplicationWorkspaceMeta(
  applicationCaseId: string
): Promise<ApplicationWorkspaceMeta> {
  const result = await db
    .from('application_cases')
    .select('id,status,progress_percent,opened_date,created_at,updated_at,actual_submission_date,outcome_date')
    .eq('id', applicationCaseId)
    .single();

  if (result.error) throw new Error(result.error.message);
  return {
    id: result.data.id,
    status: result.data.status,
    progressPercent: Number(result.data.progress_percent ?? 0),
    openedDate: result.data.opened_date,
    createdAt: result.data.created_at,
    updatedAt: result.data.updated_at,
    actualSubmissionDate: result.data.actual_submission_date,
    outcomeDate: result.data.outcome_date,
  };
}

export async function recordApplicationWorkspaceEvent(
  applicationCaseId: string,
  userId: string | null,
  eventType: string,
  title: string,
  detail: string | null = null
): Promise<void> {
  const result = await db.from('application_workspace_events').insert({
    application_case_id: applicationCaseId,
    event_type: eventType,
    title,
    detail,
    created_by: userId,
  });

  // The workspace remains usable before the optional migration is applied.
  if (result.error && !String(result.error.message).toLowerCase().includes('application_workspace_events')) {
    throw new Error(result.error.message);
  }
}

export async function listApplicationWorkspaceEvents(
  applicationCaseId: string,
  meta?: ApplicationWorkspaceMeta
): Promise<ApplicationWorkspaceEvent[]> {
  const result = await db
    .from('application_workspace_events')
    .select('id,event_type,title,detail,created_at')
    .eq('application_case_id', applicationCaseId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!result.error) {
    return (result.data ?? []).map((item: any) => ({
      id: item.id,
      eventType: item.event_type,
      title: item.title,
      detail: item.detail,
      createdAt: item.created_at,
    }));
  }

  const current = meta ?? await getApplicationWorkspaceMeta(applicationCaseId);
  const events: ApplicationWorkspaceEvent[] = [
    {
      id: `${current.id}-updated`,
      eventType: 'APPLICATION_UPDATED',
      title: 'Application last updated',
      detail: null,
      createdAt: current.updatedAt,
    },
    {
      id: `${current.id}-created`,
      eventType: 'APPLICATION_CREATED',
      title: 'Application created',
      detail: null,
      createdAt: current.createdAt,
    },
  ];

  if (current.actualSubmissionDate) {
    events.unshift({
      id: `${current.id}-submitted`,
      eventType: 'APPLICATION_SUBMITTED',
      title: 'Application submitted',
      detail: null,
      createdAt: `${current.actualSubmissionDate}T12:00:00`,
    });
  }

  return events;
}
