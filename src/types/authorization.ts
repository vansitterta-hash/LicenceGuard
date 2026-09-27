export const WORKSPACE_KINDS = ['PRODUCTION', 'TEST'] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const DEALER_USER_ROLES = ['owner', 'administrator', 'staff', 'tester'] as const;
export type DealerUserRole = (typeof DEALER_USER_ROLES)[number];

export const RECORD_SCOPES = ['PRIVATE', 'SHARED', 'TEST'] as const;
export type RecordScope = (typeof RECORD_SCOPES)[number];

export const DEALER_PERMISSIONS = [
  'workspace.manage_members',
  'workspace.manage_permissions',
  'clients.read',
  'clients.write',
  'applications.read',
  'applications.write',
  'documents.read',
  'documents.write',
  'test.workspace.access',
] as const;

export type DealerPermission = (typeof DEALER_PERMISSIONS)[number];

export type DealerUserPermissionRecord = {
  id: string;
  dealer_id: string;
  user_id: string;
  permission: DealerPermission;
  scope_type: 'workspace' | 'client' | 'application' | 'document' | 'test';
  scope_id: string | null;
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};
