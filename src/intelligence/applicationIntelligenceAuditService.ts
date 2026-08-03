import { recordApplicationWorkspaceEvent } from '../services/applicationWorkspaceService';
import type { IntelligenceAuditEvent } from './types';

export async function recordIntelligenceAuditEvent(event: IntelligenceAuditEvent): Promise<void> {
  await recordApplicationWorkspaceEvent(
    event.applicationCaseId,
    event.actorId,
    event.eventType,
    event.title,
    JSON.stringify({
      detail: event.detail,
      idempotencyKey: event.idempotencyKey,
      payload: event.payload,
    })
  );
}
