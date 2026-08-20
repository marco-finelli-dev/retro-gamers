import type {
  EditorialArticleCapabilities,
  EditorialDocumentOwnership,
  EditorialPermissionSet,
  EditorialRole,
  EditorialSessionContext,
  EditorialStatus,
  EditorialWorkflowStatus,
  OwnershipConflict,
} from './types';

const emptyPermissions: EditorialPermissionSet = {
  canCreateArticle: false,
  canEditOwnDraftArticle: false,
  canSubmitOwnArticle: false,
  canManageOwnAuthorProfile: false,
  canUploadEditorialImages: false,
  canPreviewOwnArticle: false,
  canReadSubmittedArticles: false,
  canReviewArticle: false,
  canRequestChanges: false,
  canApproveArticle: false,
  canManageEditorialMappings: false,
  canPublishArticle: false,
};

const contributorPermissions: EditorialPermissionSet = {
  ...emptyPermissions,
  canCreateArticle: true,
  canEditOwnDraftArticle: true,
  canSubmitOwnArticle: true,
  canManageOwnAuthorProfile: true,
  canUploadEditorialImages: true,
  canPreviewOwnArticle: true,
};

const editorPermissions: EditorialPermissionSet = {
  ...contributorPermissions,
  canReadSubmittedArticles: true,
  canReviewArticle: true,
  canRequestChanges: true,
  canApproveArticle: true,
};

const editorialAdminPermissions: EditorialPermissionSet = {
  ...editorPermissions,
  canManageEditorialMappings: true,
  canPublishArticle: true,
};

const emptyArticleCapabilities: EditorialArticleCapabilities = {
  canEditContent: false,
  canEditSeo: false,
  canChangeType: false,
  canEditWorkflow: false,
  canPublish: false,
  canUnpublish: false,
  canChangeAuthor: false,
  canEditMonetization: false,
  canEditLegacy: false,
  canEditEditorNotes: false,
};

const editableOwnWorkflowStatuses = new Set<EditorialWorkflowStatus>([
  'draft',
  'changes_requested',
]);

const submittableOwnWorkflowStatuses = new Set<EditorialWorkflowStatus>([
  'draft',
  'changes_requested',
]);

function clonePermissions(permissions: EditorialPermissionSet): EditorialPermissionSet {
  return { ...permissions };
}

function cloneArticleCapabilities(capabilities: EditorialArticleCapabilities): EditorialArticleCapabilities {
  return { ...capabilities };
}

export function getEditorialPermissions(
  role: EditorialRole | null | undefined,
  status: EditorialStatus | null | undefined
): EditorialPermissionSet {
  if (status !== 'active') {
    return clonePermissions(emptyPermissions);
  }

  if (role === 'editorial_admin') {
    return clonePermissions(editorialAdminPermissions);
  }

  if (role === 'editor') {
    return clonePermissions(editorPermissions);
  }

  if (role === 'contributor') {
    return clonePermissions(contributorPermissions);
  }

  return clonePermissions(emptyPermissions);
}

export function getEmptyEditorialArticleCapabilities(): EditorialArticleCapabilities {
  return cloneArticleCapabilities(emptyArticleCapabilities);
}

export function getEditorialArticleCapabilities(
  context: Pick<EditorialSessionContext, 'permissions'>
): EditorialArticleCapabilities {
  const permissions = context.permissions;
  const canEditDraftArticle = permissions.canEditOwnDraftArticle;
  const canManageReviewWorkflow = (
    permissions.canSubmitOwnArticle ||
    permissions.canReviewArticle ||
    permissions.canRequestChanges ||
    permissions.canApproveArticle ||
    permissions.canPublishArticle
  );
  const canPublish = permissions.canPublishArticle;
  const canEditEditorialNotes = (
    permissions.canReviewArticle ||
    permissions.canRequestChanges ||
    permissions.canApproveArticle ||
    permissions.canPublishArticle
  );

  return {
    canEditContent: canEditDraftArticle,
    canEditSeo: canEditDraftArticle,
    canChangeType: canEditDraftArticle,
    canEditWorkflow: canManageReviewWorkflow,
    canPublish,
    canUnpublish: canPublish,
    canChangeAuthor: canPublish,
    canEditMonetization: canPublish,
    canEditLegacy: canPublish,
    canEditEditorNotes: canEditEditorialNotes,
  };
}

export function hasEditorialAccess(context: Pick<EditorialSessionContext, 'isEditorialActive'>) {
  return context.isEditorialActive;
}

export function isDocumentOwnedByContext(
  context: Pick<EditorialSessionContext, 'user'>,
  ownership: Pick<EditorialDocumentOwnership, 'ownerUserId'> | null | undefined
) {
  return Boolean(context.user?.id && ownership?.ownerUserId === context.user.id);
}

export function getOwnershipConflict(
  ownership: Pick<EditorialDocumentOwnership, 'sanityAuthorId'> | null | undefined,
  actualSanityAuthorId: string | null | undefined
): OwnershipConflict {
  const expectedSanityAuthorId = ownership?.sanityAuthorId || null;
  const normalizedActualSanityAuthorId = actualSanityAuthorId || null;

  return {
    hasConflict: Boolean(
      expectedSanityAuthorId &&
        normalizedActualSanityAuthorId &&
        expectedSanityAuthorId !== normalizedActualSanityAuthorId
    ),
    expectedSanityAuthorId,
    actualSanityAuthorId: normalizedActualSanityAuthorId,
  };
}

export function canCreateArticle(context: Pick<EditorialSessionContext, 'permissions'>) {
  return context.permissions.canCreateArticle;
}

export function canUploadEditorialImages(context: Pick<EditorialSessionContext, 'permissions'>) {
  return context.permissions.canUploadEditorialImages;
}

export function canManageOwnAuthorProfile(context: Pick<EditorialSessionContext, 'permissions'>) {
  return context.permissions.canManageOwnAuthorProfile;
}

export function canPreviewOwnArticle(
  context: Pick<EditorialSessionContext, 'permissions' | 'user'>,
  ownership: Pick<EditorialDocumentOwnership, 'ownerUserId'> | null | undefined
) {
  return (
    context.permissions.canPreviewOwnArticle &&
    isDocumentOwnedByContext(context, ownership)
  );
}

export function canEditOwnArticle(
  context: Pick<EditorialSessionContext, 'permissions' | 'user'>,
  ownership: Pick<EditorialDocumentOwnership, 'ownerUserId' | 'workflowStatus'> | null | undefined
) {
  return (
    context.permissions.canEditOwnDraftArticle &&
    isDocumentOwnedByContext(context, ownership) &&
    Boolean(ownership?.workflowStatus && editableOwnWorkflowStatuses.has(ownership.workflowStatus))
  );
}

export function canSubmitArticle(
  context: Pick<EditorialSessionContext, 'permissions' | 'user'>,
  ownership: Pick<EditorialDocumentOwnership, 'ownerUserId' | 'workflowStatus'> | null | undefined
) {
  return (
    context.permissions.canSubmitOwnArticle &&
    isDocumentOwnedByContext(context, ownership) &&
    Boolean(ownership?.workflowStatus && submittableOwnWorkflowStatuses.has(ownership.workflowStatus))
  );
}

export function canReviewArticle(context: Pick<EditorialSessionContext, 'permissions'>) {
  return context.permissions.canReviewArticle;
}

export function canApproveArticle(context: Pick<EditorialSessionContext, 'permissions'>) {
  return context.permissions.canApproveArticle;
}

export function canRequestChanges(context: Pick<EditorialSessionContext, 'permissions'>) {
  return context.permissions.canRequestChanges;
}

// Control plane bootstrap: a server-loaded active community admin can manage
// editorial access, but operational editor permissions still require an active
// editorial_profile.
export function canAdministerEditorialAccess(context: Pick<EditorialSessionContext, 'profile'>) {
  return context.profile?.role === 'admin' && context.profile?.status === 'active';
}

export function canManageEditorialMappings(
  context: Pick<EditorialSessionContext, 'permissions' | 'profile'>
) {
  return canAdministerEditorialAccess(context) || context.permissions.canManageEditorialMappings;
}

export function canPublishArticle(context: Pick<EditorialSessionContext, 'permissions'>) {
  return context.permissions.canPublishArticle;
}
