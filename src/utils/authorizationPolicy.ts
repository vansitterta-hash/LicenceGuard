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
