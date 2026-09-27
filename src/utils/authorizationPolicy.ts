import type {
  DealerPermission,
  DealerUserRole,
  RecordScope,
  WorkspaceKind,
} from '../types/authorization';

export const DEFAULT_WORKSPACE_KIND: WorkspaceKind = 'PRODUCTION';
export const DEFAULT_RECORD_SCOPE: RecordScope = 'PRIVATE';

export function isWorkspaceRole(role?: string | null): role is DealerUserRole {
  return role === 'owner' || role === 'administrator' || role === 'staff' || role === 'tester';
}

export function isProductionWorkspace(workspaceKind?: WorkspaceKind | null): boolean {
  return workspaceKind === 'PRODUCTION' || workspaceKind == null;
}

export function isTestWorkspace(workspaceKind?: WorkspaceKind | null): boolean {
  return workspaceKind === 'TEST';
}

export function isTesterRole(role?: string | null): boolean {
  return role === 'tester';
}

export function requiresExplicitPrivateAccess(scope?: RecordScope | null): boolean {
  return scope === 'PRIVATE' || scope == null;
}

export function isExplicitPermission(permission: string): permission is DealerPermission {
  return [
    'workspace.manage_members',
    'workspace.manage_permissions',
    'clients.read',
    'clients.write',
    'applications.read',
    'applications.write',
    'documents.read',
    'documents.write',
    'test.workspace.access',
  ].includes(permission);
}

export function testerMustUseDedicatedWorkspace(role?: string | null, workspaceKind?: WorkspaceKind | null): boolean {
  return isTesterRole(role) && isProductionWorkspace(workspaceKind);
}

export function canAccessPrivateRecord({
  currentUserId,
  ownerUserId,
  scope,
  role,
  hasExplicitGrant,
  isAdministrativeAccess,
}: {
  currentUserId: string | null;
  ownerUserId?: string | null;
  scope?: RecordScope | null;
  role?: string | null;
  hasExplicitGrant?: boolean;
  isAdministrativeAccess?: boolean;
}): boolean {
  if (!currentUserId) return false;
  if (ownerUserId && ownerUserId === currentUserId) return true;
  if (isAdministrativeAccess) return true;
  if (requiresExplicitPrivateAccess(scope)) {
    return Boolean(hasExplicitGrant);
  }
  if (role === 'staff' || role === 'administrator' || role === 'owner') {
    return Boolean(hasExplicitGrant) || Boolean(isAdministrativeAccess);
  }
  return false;
}
