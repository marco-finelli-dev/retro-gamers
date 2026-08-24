import { logApiError } from '../api-errors';
import { getAvatarPublicUrl } from '../supabase/avatars';
import { supabaseAdmin } from '../supabase/server';
import {
  canCreateEditorialComment,
  canReadEditorialComments,
  canResolveEditorialComment,
} from './permissions';
import {
  isEditorialCommentStatus,
  isEditorialWorkflowStatus,
  normalizeSanityRootDocumentId,
  type EditorialCommentStatus,
  type EditorialDocumentOwnership,
  type EditorialSessionContext,
  type EditorialWorkflowStatus,
} from './types';

type EditorialCommentContext = EditorialSessionContext & {
  user: NonNullable<EditorialSessionContext['user']>;
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

type EditorialArticleCommentRow = {
  id: string | null;
  sanity_document_id: string | null;
  parent_id: string | null;
  author_user_id: string | null;
  body: string | null;
  status: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
};

type EditorialCommentAuthorProfileRow = {
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_path?: string | null;
};

export type EditorialArticleCommentAuthorDto = {
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

export type EditorialArticleCommentDto = {
  id: string;
  sanityDocumentId: string;
  parentId: string | null;
  body: string;
  status: EditorialCommentStatus;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  author: EditorialArticleCommentAuthorDto | null;
  resolvedBy: EditorialArticleCommentAuthorDto | null;
  isOwnComment: boolean;
  canResolve: boolean;
};

type EditorialCommentsResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      status: number;
      error: string;
    };

const editorialDocumentSelect =
  'sanity_document_id, owner_user_id, sanity_author_id, workflow_status, submitted_at, reviewed_by, reviewed_at';

const editorialCommentSelect =
  'id, sanity_document_id, parent_id, author_user_id, body, status, resolved_by, resolved_at, created_at, updated_at, metadata';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeEditorialCommentRootDocumentId(value: unknown) {
  const documentId = String(value || '').trim();
  const rootDocumentId = documentId.startsWith('drafts.')
    ? documentId.slice('drafts.'.length)
    : documentId;

  return normalizeSanityRootDocumentId(rootDocumentId);
}

function normalizeUuid(value: unknown) {
  const id = String(value || '').trim();

  return uuidPattern.test(id) ? id : '';
}

function normalizeCommentBody(value: unknown) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function normalizeCommentMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return value as Record<string, unknown>;
}

function normalizeOwnership(row: EditorialDocumentRow | null): EditorialDocumentOwnership | null {
  if (!row) return null;

  const sanityDocumentId = normalizeSanityRootDocumentId(row.sanity_document_id);
  const ownerUserId = String(row.owner_user_id || '').trim();
  const sanityAuthorId = normalizeSanityRootDocumentId(row.sanity_author_id);
  const workflowStatus = row.workflow_status as EditorialWorkflowStatus;

  if (!sanityDocumentId || !ownerUserId || !sanityAuthorId || !isEditorialWorkflowStatus(workflowStatus)) {
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

function normalizeCommentRow(row: EditorialArticleCommentRow | null) {
  if (!row) return null;

  const id = normalizeUuid(row.id);
  const sanityDocumentId = normalizeSanityRootDocumentId(row.sanity_document_id);
  const parentId = row.parent_id ? normalizeUuid(row.parent_id) : null;
  const authorUserId = normalizeUuid(row.author_user_id);
  const status = row.status as EditorialCommentStatus;
  const body = String(row.body || '').trim();
  const createdAt = String(row.created_at || '').trim();
  const updatedAt = String(row.updated_at || '').trim();
  const resolvedBy = row.resolved_by ? normalizeUuid(row.resolved_by) : null;

  if (
    !id ||
    !sanityDocumentId ||
    !authorUserId ||
    !body ||
    !createdAt ||
    !updatedAt ||
    !isEditorialCommentStatus(status)
  ) {
    return null;
  }

  return {
    id,
    sanityDocumentId,
    parentId,
    authorUserId,
    body,
    status,
    resolvedBy,
    resolvedAt: row.resolved_at || null,
    createdAt,
    updatedAt,
    metadata: normalizeCommentMetadata(row.metadata),
  };
}

type NormalizedEditorialArticleComment = NonNullable<ReturnType<typeof normalizeCommentRow>>;

function getProfileDisplayName(profile: EditorialCommentAuthorProfileRow) {
  return String(profile.display_name || profile.username || '').trim();
}

function normalizeAuthorProfile(
  profile: EditorialCommentAuthorProfileRow | null | undefined
): EditorialArticleCommentAuthorDto | null {
  if (!profile) return null;

  const displayName = getProfileDisplayName(profile);

  if (!displayName) return null;

  const username = String(profile.username || '').trim();

  return {
    displayName,
    username: username || null,
    avatarUrl: getAvatarPublicUrl(profile.avatar_path || null) || null,
  };
}

function ensureCommentContext(
  context: EditorialSessionContext
): EditorialCommentsResult<{ context: EditorialCommentContext }> {
  if (context.authError || !context.user) {
    return {
      ok: false,
      status: context.authStatus || 401,
      error: context.authError || 'unauthorized',
    };
  }

  if (context.editorialProfileError) {
    return { ok: false, status: 503, error: 'editorial_profile_unavailable' };
  }

  if (!context.editorialProfile || !context.isEditorialActive) {
    return {
      ok: false,
      status: 403,
      error: context.editorialProfile?.status === 'suspended'
        ? 'editorial_profile_suspended'
        : 'editorial_profile_required',
    };
  }

  return { ok: true, context: context as EditorialCommentContext };
}

async function fetchCommentOwnership(rootDocumentId: unknown) {
  const sanityDocumentId = normalizeEditorialCommentRootDocumentId(rootDocumentId);

  if (!sanityDocumentId) {
    return { ok: false as const, status: 400, error: 'invalid_article_id' };
  }

  const { data, error } = await supabaseAdmin
    .from('editorial_documents')
    .select(editorialDocumentSelect)
    .eq('sanity_document_id', sanityDocumentId)
    .maybeSingle();

  if (error) {
    logApiError('editorial-comments.ownership', error);
    return { ok: false as const, status: 503, error: 'editorial_database_unavailable' };
  }

  const ownership = normalizeOwnership(data as EditorialDocumentRow | null);

  if (!ownership) {
    return { ok: false as const, status: 404, error: 'article_not_found' };
  }

  return { ok: true as const, ownership };
}

async function fetchCommentRow({
  sanityDocumentId,
  commentId,
}: {
  sanityDocumentId: string;
  commentId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('editorial_article_comments')
    .select(editorialCommentSelect)
    .eq('sanity_document_id', sanityDocumentId)
    .eq('id', commentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logApiError('editorial-comments.fetch-comment', error);
    return { ok: false as const, status: 503, error: 'editorial_database_unavailable' };
  }

  const comment = normalizeCommentRow(data as EditorialArticleCommentRow | null);

  if (!comment) {
    return { ok: false as const, status: 404, error: 'comment_not_found' };
  }

  return { ok: true as const, comment };
}

async function fetchCommentAuthorProfiles(comments: NormalizedEditorialArticleComment[]) {
  const userIds = [
    ...new Set(
      comments
        .flatMap((comment) => [comment.authorUserId, comment.resolvedBy].filter(Boolean))
        .map((id) => String(id))
    ),
  ];

  if (userIds.length === 0) return new Map<string, EditorialArticleCommentAuthorDto>();

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id, username, display_name, avatar_path')
    .in('user_id', userIds);

  if (error) {
    logApiError('editorial-comments.author-profiles', error);
    return new Map<string, EditorialArticleCommentAuthorDto>();
  }

  const profiles = new Map<string, EditorialArticleCommentAuthorDto>();

  for (const row of (data || []) as EditorialCommentAuthorProfileRow[]) {
    const userId = normalizeUuid(row.user_id);
    const profile = normalizeAuthorProfile(row);

    if (userId && profile) {
      profiles.set(userId, profile);
    }
  }

  return profiles;
}

function orderCommentThreads<T extends { id: string; parentId: string | null; createdAt: string }>(comments: T[]) {
  const childrenByParentId = new Map<string, T[]>();
  const commentIds = new Set(comments.map((comment) => comment.id));
  const roots: T[] = [];

  for (const comment of comments) {
    if (comment.parentId && commentIds.has(comment.parentId)) {
      const siblings = childrenByParentId.get(comment.parentId) || [];
      siblings.push(comment);
      childrenByParentId.set(comment.parentId, siblings);
    } else {
      roots.push(comment);
    }
  }

  const sortByCreatedAt = (left: T, right: T) =>
    Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
    left.id.localeCompare(right.id);

  roots.sort(sortByCreatedAt);

  for (const siblings of childrenByParentId.values()) {
    siblings.sort(sortByCreatedAt);
  }

  const ordered: T[] = [];
  const appendComment = (comment: T) => {
    ordered.push(comment);

    for (const child of childrenByParentId.get(comment.id) || []) {
      appendComment(child);
    }
  };

  for (const root of roots) {
    appendComment(root);
  }

  return ordered;
}

function toCommentDto({
  comment,
  context,
  ownership,
  profiles,
}: {
  comment: NormalizedEditorialArticleComment;
  context: EditorialCommentContext;
  ownership: EditorialDocumentOwnership;
  profiles: Map<string, EditorialArticleCommentAuthorDto>;
}): EditorialArticleCommentDto {
  return {
    id: comment.id,
    sanityDocumentId: comment.sanityDocumentId,
    parentId: comment.parentId,
    body: comment.body,
    status: comment.status,
    resolvedAt: comment.resolvedAt,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    metadata: comment.metadata,
    author: profiles.get(comment.authorUserId) || null,
    resolvedBy: comment.resolvedBy ? profiles.get(comment.resolvedBy) || null : null,
    isOwnComment: comment.authorUserId === context.user.id,
    canResolve: canResolveEditorialComment(context, ownership),
  };
}

async function hydrateCommentDtos({
  comments,
  context,
  ownership,
}: {
  comments: NormalizedEditorialArticleComment[];
  context: EditorialCommentContext;
  ownership: EditorialDocumentOwnership;
}) {
  const profiles = await fetchCommentAuthorProfiles(comments);

  return orderCommentThreads(
    comments.map((comment) => toCommentDto({
      comment,
      context,
      ownership,
      profiles,
    }))
  );
}

export async function listEditorialArticleComments({
  context,
  rootDocumentId,
}: {
  context: EditorialSessionContext;
  rootDocumentId: unknown;
}): Promise<EditorialCommentsResult<{ comments: EditorialArticleCommentDto[] }>> {
  const contextResult = ensureCommentContext(context);
  if (!contextResult.ok) return contextResult;

  const ownershipResult = await fetchCommentOwnership(rootDocumentId);
  if (!ownershipResult.ok) return ownershipResult;

  const ownership = ownershipResult.ownership;

  if (!canReadEditorialComments(contextResult.context, ownership)) {
    return { ok: false, status: 403, error: 'comments_forbidden' };
  }

  const { data, error } = await supabaseAdmin
    .from('editorial_article_comments')
    .select(editorialCommentSelect)
    .eq('sanity_document_id', ownership.sanityDocumentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) {
    logApiError('editorial-comments.list', error);
    return { ok: false, status: 503, error: 'editorial_database_unavailable' };
  }

  const comments = ((data || []) as EditorialArticleCommentRow[])
    .map((row) => normalizeCommentRow(row))
    .filter((comment): comment is NormalizedEditorialArticleComment => Boolean(comment));

  return {
    ok: true,
    comments: await hydrateCommentDtos({
      comments,
      context: contextResult.context,
      ownership,
    }),
  };
}

export async function createEditorialArticleComment({
  context,
  rootDocumentId,
  body,
  parentId = null,
}: {
  context: EditorialSessionContext;
  rootDocumentId: unknown;
  body: unknown;
  parentId?: unknown;
}): Promise<EditorialCommentsResult<{ comment: EditorialArticleCommentDto }>> {
  const contextResult = ensureCommentContext(context);
  if (!contextResult.ok) return contextResult;

  const ownershipResult = await fetchCommentOwnership(rootDocumentId);
  if (!ownershipResult.ok) return ownershipResult;

  const ownership = ownershipResult.ownership;

  if (!canCreateEditorialComment(contextResult.context, ownership)) {
    return { ok: false, status: 403, error: 'comments_forbidden' };
  }

  const normalizedBody = normalizeCommentBody(body);

  if (!normalizedBody) {
    return { ok: false, status: 422, error: 'comment_body_required' };
  }

  const normalizedParentId = parentId ? normalizeUuid(parentId) : null;

  if (parentId && !normalizedParentId) {
    return { ok: false, status: 400, error: 'invalid_parent_comment_id' };
  }

  if (normalizedParentId) {
    const parentResult = await fetchCommentRow({
      sanityDocumentId: ownership.sanityDocumentId,
      commentId: normalizedParentId,
    });

    if (!parentResult.ok) {
      return parentResult.status === 404
        ? { ok: false, status: 404, error: 'parent_comment_not_found' }
        : parentResult;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('editorial_article_comments')
    .insert({
      sanity_document_id: ownership.sanityDocumentId,
      parent_id: normalizedParentId,
      author_user_id: contextResult.context.user.id,
      body: normalizedBody,
      metadata: {},
    })
    .select(editorialCommentSelect)
    .single();

  if (error) {
    logApiError('editorial-comments.create', error);
    return { ok: false, status: 503, error: 'comment_create_failed' };
  }

  const comment = normalizeCommentRow(data as EditorialArticleCommentRow | null);

  if (!comment) {
    return { ok: false, status: 500, error: 'comment_create_readback_failed' };
  }

  const comments = await hydrateCommentDtos({
    comments: [comment],
    context: contextResult.context,
    ownership,
  });
  const dto = comments[0];

  if (!dto) {
    return { ok: false, status: 500, error: 'comment_create_readback_failed' };
  }

  return { ok: true, comment: dto };
}

export async function resolveEditorialArticleComment({
  context,
  rootDocumentId,
  commentId,
}: {
  context: EditorialSessionContext;
  rootDocumentId: unknown;
  commentId: unknown;
}): Promise<EditorialCommentsResult<{ comment: EditorialArticleCommentDto }>> {
  const contextResult = ensureCommentContext(context);
  if (!contextResult.ok) return contextResult;

  const ownershipResult = await fetchCommentOwnership(rootDocumentId);
  if (!ownershipResult.ok) return ownershipResult;

  const ownership = ownershipResult.ownership;

  if (!canResolveEditorialComment(contextResult.context, ownership)) {
    return { ok: false, status: 403, error: 'comments_forbidden' };
  }

  const normalizedCommentId = normalizeUuid(commentId);

  if (!normalizedCommentId) {
    return { ok: false, status: 400, error: 'invalid_comment_id' };
  }

  const existingResult = await fetchCommentRow({
    sanityDocumentId: ownership.sanityDocumentId,
    commentId: normalizedCommentId,
  });

  if (!existingResult.ok) return existingResult;

  if (existingResult.comment.status === 'resolved') {
    const comments = await hydrateCommentDtos({
      comments: [existingResult.comment],
      context: contextResult.context,
      ownership,
    });
    const dto = comments[0];

    if (!dto) {
      return { ok: false, status: 500, error: 'comment_resolve_readback_failed' };
    }

    return { ok: true, comment: dto };
  }

  const { data, error } = await supabaseAdmin
    .from('editorial_article_comments')
    .update({
      status: 'resolved',
      resolved_by: contextResult.context.user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq('sanity_document_id', ownership.sanityDocumentId)
    .eq('id', normalizedCommentId)
    .is('deleted_at', null)
    .select(editorialCommentSelect)
    .maybeSingle();

  if (error) {
    logApiError('editorial-comments.resolve', error);
    return { ok: false, status: 503, error: 'comment_resolve_failed' };
  }

  const comment = normalizeCommentRow(data as EditorialArticleCommentRow | null);

  if (!comment) {
    return { ok: false, status: 409, error: 'comment_resolve_conflict' };
  }

  const comments = await hydrateCommentDtos({
    comments: [comment],
    context: contextResult.context,
    ownership,
  });
  const dto = comments[0];

  if (!dto) {
    return { ok: false, status: 500, error: 'comment_resolve_readback_failed' };
  }

  return { ok: true, comment: dto };
}
