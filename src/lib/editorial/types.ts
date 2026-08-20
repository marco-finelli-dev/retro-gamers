export const editorialRoles = ['contributor', 'editor', 'editorial_admin'] as const;
export const editorialStatuses = ['active', 'suspended'] as const;
export const editorialWorkflowStatuses = [
  'draft',
  'submitted',
  'changes_requested',
  'approved',
  'published',
] as const;

export type EditorialRole = (typeof editorialRoles)[number];
export type EditorialStatus = (typeof editorialStatuses)[number];
export type EditorialWorkflowStatus = (typeof editorialWorkflowStatuses)[number];

export type EditorialProfile = {
  userId: string;
  sanityAuthorId: string;
  editorialRole: EditorialRole;
  status: EditorialStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type EditorialDocumentOwnership = {
  sanityDocumentId: string;
  ownerUserId: string;
  sanityAuthorId: string;
  workflowStatus: EditorialWorkflowStatus;
};

export type EditorialPermissionSet = {
  canCreateArticle: boolean;
  canEditOwnDraftArticle: boolean;
  canSubmitOwnArticle: boolean;
  canManageOwnAuthorProfile: boolean;
  canUploadEditorialImages: boolean;
  canPreviewOwnArticle: boolean;
  canReadSubmittedArticles: boolean;
  canReviewArticle: boolean;
  canRequestChanges: boolean;
  canApproveArticle: boolean;
  canManageEditorialMappings: boolean;
  canPublishArticle: boolean;
};

export type EditorialArticleCapabilities = {
  canEditContent: boolean;
  canEditSeo: boolean;
  canChangeType: boolean;
  canEditWorkflow: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
  canChangeAuthor: boolean;
  canEditMonetization: boolean;
  canEditLegacy: boolean;
  canEditEditorNotes: boolean;
};

export type EditorialSessionContext = {
  user: {
    id: string;
    [key: string]: unknown;
  } | null;
  profile: {
    user_id?: string | null;
    role?: string | null;
    status?: string | null;
    [key: string]: unknown;
  } | null;
  authError: string | null;
  authStatus: number;
  editorialProfile: EditorialProfile | null;
  editorialProfileError: string | null;
  editorialRole: EditorialRole | null;
  sanityAuthorId: string | null;
  isEditorialActive: boolean;
  permissions: EditorialPermissionSet;
};

export type OwnershipConflict = {
  hasConflict: boolean;
  expectedSanityAuthorId: string | null;
  actualSanityAuthorId: string | null;
};

const sanityRootDocumentIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isEditorialRole(value: unknown): value is EditorialRole {
  return typeof value === 'string' && editorialRoles.includes(value as EditorialRole);
}

export function isEditorialStatus(value: unknown): value is EditorialStatus {
  return typeof value === 'string' && editorialStatuses.includes(value as EditorialStatus);
}

export function isEditorialWorkflowStatus(value: unknown): value is EditorialWorkflowStatus {
  return (
    typeof value === 'string' &&
    editorialWorkflowStatuses.includes(value as EditorialWorkflowStatus)
  );
}

export function normalizeSanityRootDocumentId(value: unknown) {
  const documentId = String(value || '').trim();

  if (
    !documentId ||
    documentId.startsWith('drafts.') ||
    !sanityRootDocumentIdPattern.test(documentId)
  ) {
    return '';
  }

  return documentId;
}
