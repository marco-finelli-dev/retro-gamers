import { logApiError } from '../api-errors';
import { getSanityRawClient } from '../sanity-write.server';
import { supabaseAdmin } from '../supabase/server';
import { normalizeUuid } from '../uuid';
import {
  canCreateRevisionDraft,
  canEditOwnArticle,
  canPreviewEditorialArticle,
  getEditorialPermissions,
} from './permissions';
import {
  getEditorialArticleEditPath,
  getEditorialArticlePreviewPath,
} from './articles.server';
import {
  isEditorialRole,
  isEditorialStatus,
  isEditorialWorkflowStatus,
  normalizeSanityRootDocumentId,
  type EditorialDocumentOwnership,
  type EditorialProfile,
  type EditorialSessionContext,
  type EditorialWorkflowStatus,
} from './types';

type EditorialNotificationLanguage = 'it' | 'en';

export type EditorialNotificationActionType =
  | 'editorial_comment_created'
  | 'editorial_comment_reply'
  | 'editorial_comment_resolved';

type EditorialProfileRow = {
  user_id: string | null;
  sanity_author_id: string | null;
  editorial_role: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type EditorialDocumentRow = {
  sanity_document_id: string | null;
  owner_user_id: string | null;
  sanity_author_id: string | null;
  workflow_status: string | null;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export type EditorialNotificationAction = {
  actionUrl: string;
  actionLabel: string;
};

const actionLabels = {
  it: {
    editor: 'Apri editor',
    preview: 'Apri revisione',
    dashboard: 'Apri dashboard',
  },
  en: {
    editor: 'Open editor',
    preview: 'Open review',
    dashboard: 'Open dashboard',
  },
} as const;

function normalizeLanguage(value: unknown): EditorialNotificationLanguage {
  return value === 'en' ? 'en' : 'it';
}

function getEditorialDashboardPath(language: EditorialNotificationLanguage) {
  return language === 'en'
    ? '/en/account/editor/articles/'
    : '/account/editor/articles/';
}

function appendCommentHash(url: string, commentId: string | null) {
  if (!commentId) return url;

  return `${url}#editorial-comment-${encodeURIComponent(commentId)}`;
}

function normalizeEditorialProfile(row: EditorialProfileRow | null): EditorialProfile | null {
  if (!row) return null;

  const userId = normalizeUuid(row.user_id);
  const sanityAuthorId = normalizeSanityRootDocumentId(row.sanity_author_id);

  if (
    !userId ||
    !sanityAuthorId ||
    !isEditorialRole(row.editorial_role) ||
    !isEditorialStatus(row.status)
  ) {
    return null;
  }

  return {
    userId,
    sanityAuthorId,
    editorialRole: row.editorial_role,
    status: row.status,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeOwnership(row: EditorialDocumentRow | null): EditorialDocumentOwnership | null {
  if (!row) return null;

  const sanityDocumentId = normalizeSanityRootDocumentId(row.sanity_document_id);
  const ownerUserId = normalizeUuid(row.owner_user_id);
  const sanityAuthorId = normalizeSanityRootDocumentId(row.sanity_author_id);
  const workflowStatus = row.workflow_status as EditorialWorkflowStatus;

  if (
    !sanityDocumentId ||
    !ownerUserId ||
    !sanityAuthorId ||
    !isEditorialWorkflowStatus(workflowStatus)
  ) {
    return null;
  }

  return {
    sanityDocumentId,
    ownerUserId,
    sanityAuthorId,
    workflowStatus,
    submittedAt: row.submitted_at || null,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
  };
}

async function fetchRecipientEditorialProfile(recipientUserId: string) {
  const { data, error } = await supabaseAdmin
    .from('editorial_profiles')
    .select('user_id, sanity_author_id, editorial_role, status, created_at, updated_at')
    .eq('user_id', recipientUserId)
    .maybeSingle();

  if (error) {
    logApiError('editorial-notification-links.profile', error);
    return null;
  }

  return normalizeEditorialProfile(data as EditorialProfileRow | null);
}

async function fetchEditorialDocumentOwnership(sanityDocumentId: string) {
  const { data, error } = await supabaseAdmin
    .from('editorial_documents')
    .select('sanity_document_id, owner_user_id, sanity_author_id, workflow_status, submitted_at, reviewed_by, reviewed_at')
    .eq('sanity_document_id', sanityDocumentId)
    .maybeSingle();

  if (error) {
    logApiError('editorial-notification-links.ownership', error);
    return null;
  }

  return normalizeOwnership(data as EditorialDocumentRow | null);
}

async function hasSanityRevisionDraft(sanityDocumentId: string) {
  try {
    const draftId = `drafts.${sanityDocumentId}`;
    const publishedId = sanityDocumentId;
    const pair = await getSanityRawClient().fetch<{ hasDraft?: boolean; hasPublished?: boolean }>(
      `{
        "hasDraft": defined(*[_id == $draftId && _type == "article"][0]._id),
        "hasPublished": defined(*[_id == $publishedId && _type == "article"][0]._id)
      }`,
      { draftId, publishedId }
    );

    return Boolean(pair?.hasDraft && pair?.hasPublished);
  } catch (error) {
    logApiError('editorial-notification-links.sanity-lifecycle', error);
    return false;
  }
}

function createRecipientEditorialContext({
  recipientUserId,
  editorialProfile,
}: {
  recipientUserId: string;
  editorialProfile: EditorialProfile;
}): EditorialSessionContext {
  const permissions = getEditorialPermissions(editorialProfile.editorialRole, editorialProfile.status);

  return {
    user: { id: recipientUserId },
    profile: null,
    authError: null,
    authStatus: 200,
    editorialProfile,
    editorialProfileError: null,
    editorialRole: editorialProfile.editorialRole,
    sanityAuthorId: editorialProfile.sanityAuthorId,
    isEditorialActive: editorialProfile.status === 'active',
    permissions,
  };
}

export async function buildEditorialNotificationAction({
  sanityDocumentId,
  commentId = null,
  recipientUserId,
  articleLanguage,
}: {
  sanityDocumentId?: string | null;
  commentId?: string | null;
  recipientUserId?: string | null;
  articleLanguage?: string | null;
  actionType: EditorialNotificationActionType;
}): Promise<EditorialNotificationAction> {
  const language = normalizeLanguage(articleLanguage);
  const labels = actionLabels[language];
  const dashboardUrl = getEditorialDashboardPath(language);
  const rootDocumentId = normalizeSanityRootDocumentId(sanityDocumentId);
  const normalizedCommentId = commentId ? normalizeUuid(commentId) : null;
  const recipient = normalizeUuid(recipientUserId);

  if (!rootDocumentId || !recipient) {
    return {
      actionUrl: dashboardUrl,
      actionLabel: labels.dashboard,
    };
  }

  const [editorialProfile, ownership] = await Promise.all([
    fetchRecipientEditorialProfile(recipient),
    fetchEditorialDocumentOwnership(rootDocumentId),
  ]);

  if (!editorialProfile || !ownership) {
    return {
      actionUrl: dashboardUrl,
      actionLabel: labels.dashboard,
    };
  }

  const context = createRecipientEditorialContext({
    recipientUserId: recipient,
    editorialProfile,
  });

  const canOpenPublishedRevisionDraft = (
    ownership.workflowStatus === 'published' &&
    canCreateRevisionDraft(context) &&
    await hasSanityRevisionDraft(ownership.sanityDocumentId)
  );

  if (canEditOwnArticle(context, ownership) || canOpenPublishedRevisionDraft) {
    return {
      actionUrl: appendCommentHash(
        getEditorialArticleEditPath(ownership.sanityDocumentId, language),
        normalizedCommentId
      ),
      actionLabel: labels.editor,
    };
  }

  if (canPreviewEditorialArticle(context, ownership)) {
    return {
      actionUrl: getEditorialArticlePreviewPath(ownership.sanityDocumentId, language),
      actionLabel: labels.preview,
    };
  }

  return {
    actionUrl: dashboardUrl,
    actionLabel: labels.dashboard,
  };
}
