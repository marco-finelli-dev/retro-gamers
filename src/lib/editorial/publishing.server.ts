import { logApiError } from '../api-errors';
import { getSanityRawClient, getSanityWriteClient } from '../sanity-write.server';
import { supabaseAdmin } from '../supabase/server';
import { canPublishArticle, canPublishWorkflowArticle, getWorkflowTransitionPermissions } from './permissions';
import {
  isEditorialWorkflowStatus,
  normalizeSanityRootDocumentId,
  type EditorialDocumentOwnership,
  type EditorialSessionContext,
  type EditorialWorkflowStatus,
} from './types';

type EditableEditorialContext = EditorialSessionContext & {
  user: NonNullable<EditorialSessionContext['user']>;
  editorialProfile: NonNullable<EditorialSessionContext['editorialProfile']>;
};

type EditorialPublishingDocumentRow = {
  sanity_document_id: string | null;
  owner_user_id: string | null;
  sanity_author_id: string | null;
  workflow_status: string | null;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

type SanityArticleDocument = Record<string, unknown> & {
  _id: string;
  _rev?: string;
  _type: 'article';
};

const workflowDocumentSelect =
  'sanity_document_id, owner_user_id, sanity_author_id, workflow_status, submitted_at, reviewed_by, reviewed_at';

function getDraftDocumentId(rootDocumentId: string) {
  return `drafts.${rootDocumentId}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown, maxLength = 2000) {
  if (typeof value !== 'string') return '';

  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maxLength);
}

function normalizeWorkflowOwnership(
  row: EditorialPublishingDocumentRow | null
): EditorialDocumentOwnership | null {
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

async function fetchPublishOwnership(rootDocumentId: unknown) {
  const sanityDocumentId = normalizeSanityRootDocumentId(rootDocumentId);

  if (!sanityDocumentId) {
    return { ok: false as const, status: 400, error: 'invalid_article_id' };
  }

  const { data, error } = await supabaseAdmin
    .from('editorial_documents')
    .select(workflowDocumentSelect)
    .eq('sanity_document_id', sanityDocumentId)
    .maybeSingle();

  if (error) {
    logApiError('editorial-publish.ownership', error);
    return { ok: false as const, status: 503, error: 'editorial_database_unavailable' };
  }

  const ownership = normalizeWorkflowOwnership(data as EditorialPublishingDocumentRow | null);

  if (!ownership) {
    return { ok: false as const, status: 404, error: 'article_not_found' };
  }

  return { ok: true as const, ownership };
}

async function fetchSanityArticlePair(rootDocumentId: string) {
  const draftDocumentId = getDraftDocumentId(rootDocumentId);
  const [draftDocument, publishedDocument] = await Promise.all([
    getSanityRawClient().getDocument<Record<string, unknown>>(draftDocumentId),
    getSanityRawClient().getDocument<Record<string, unknown>>(rootDocumentId),
  ]);

  return {
    draftDocumentId,
    draftDocument: draftDocument?._type === 'article' ? draftDocument as SanityArticleDocument : null,
    publishedDocument: publishedDocument?._type === 'article'
      ? publishedDocument as SanityArticleDocument
      : null,
  };
}

function getReferenceId(value: unknown) {
  return isPlainObject(value) ? normalizeSanityRootDocumentId(value._ref) : '';
}

function getSlugValue(value: unknown) {
  return isPlainObject(value) ? normalizeString(value.current, 120).trim() : '';
}

function isValidDateString(value: unknown) {
  return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value));
}

function validatePublishableDraft(
  draftDocument: SanityArticleDocument | null,
  ownership: EditorialDocumentOwnership
) {
  if (!draftDocument) {
    return { ok: false as const, status: 409, error: 'publish_requires_draft' };
  }

  if (draftDocument._id !== getDraftDocumentId(ownership.sanityDocumentId)) {
    return { ok: false as const, status: 409, error: 'publish_document_mismatch' };
  }

  if (!draftDocument._rev) {
    return { ok: false as const, status: 422, error: 'publish_revision_missing' };
  }

  const authorId = getReferenceId(draftDocument.author);
  if (!authorId || authorId !== ownership.sanityAuthorId) {
    return { ok: false as const, status: 409, error: 'author_ownership_conflict' };
  }

  if (!normalizeString(draftDocument.title, 300).trim()) {
    return { ok: false as const, status: 422, error: 'publish_title_required' };
  }

  if (!getSlugValue(draftDocument.slug)) {
    return { ok: false as const, status: 422, error: 'publish_slug_required' };
  }

  const type = normalizeString(draftDocument.type, 80).trim();
  if (!type) {
    return { ok: false as const, status: 422, error: 'publish_type_required' };
  }

  const language = normalizeString(draftDocument.language, 8).trim();
  if (language !== 'it' && language !== 'en') {
    return { ok: false as const, status: 422, error: 'publish_language_required' };
  }

  return { ok: true as const };
}

function preparePublishedDocument({
  draftDocument,
  publishedDocument,
  rootDocumentId,
  timestamp,
}: {
  draftDocument: SanityArticleDocument;
  publishedDocument: SanityArticleDocument | null;
  rootDocumentId: string;
  timestamp: string;
}) {
  const nextDocument = JSON.parse(JSON.stringify(draftDocument)) as Record<string, unknown>;
  const existingPublishedAt = publishedDocument?.publishedAt;
  const draftPublishedAt = draftDocument.publishedAt;

  nextDocument._id = rootDocumentId;
  delete nextDocument._rev;
  delete nextDocument._createdAt;
  delete nextDocument._updatedAt;
  delete nextDocument._originalId;

  nextDocument.isPublic = true;

  if (publishedDocument) {
    if (!isValidDateString(existingPublishedAt)) {
      return { ok: false as const, status: 422, error: 'published_at_missing' };
    }

    nextDocument.publishedAt = existingPublishedAt;
  } else {
    nextDocument.publishedAt = isValidDateString(draftPublishedAt)
      ? draftPublishedAt
      : timestamp;
  }

  return { ok: true as const, document: nextDocument as SanityArticleDocument };
}

function isSanityDocumentPubliclyPublished({
  publishedDocument,
  ownership,
}: {
  publishedDocument: SanityArticleDocument | null;
  ownership: EditorialDocumentOwnership;
}) {
  return Boolean(
    publishedDocument &&
      publishedDocument._id === ownership.sanityDocumentId &&
      publishedDocument._type === 'article' &&
      publishedDocument.isPublic === true &&
      isValidDateString(publishedDocument.publishedAt) &&
      getReferenceId(publishedDocument.author) === ownership.sanityAuthorId
  );
}

async function recordPublishAudit({
  actorUserId,
  sanityDocumentId,
  previousWorkflowStatus,
  nextWorkflowStatus,
}: {
  actorUserId: string;
  sanityDocumentId: string;
  previousWorkflowStatus: EditorialWorkflowStatus;
  nextWorkflowStatus: EditorialWorkflowStatus;
}) {
  const { error } = await supabaseAdmin
    .from('editorial_audit_log')
    .insert({
      actor_user_id: actorUserId,
      action: 'article_published',
      sanity_document_id: sanityDocumentId,
      previous_workflow_status: previousWorkflowStatus,
      next_workflow_status: nextWorkflowStatus,
      metadata: {},
    });

  if (error) {
    logApiError('editorial-publish.audit', error);
    return false;
  }

  return true;
}

async function completeSupabasePublish({
  context,
  ownership,
}: {
  context: EditableEditorialContext;
  ownership: EditorialDocumentOwnership;
}) {
  const { data, error } = await supabaseAdmin
    .from('editorial_documents')
    .update({ workflow_status: 'published' })
    .eq('sanity_document_id', ownership.sanityDocumentId)
    .eq('workflow_status', 'approved')
    .select(workflowDocumentSelect)
    .maybeSingle();

  if (error) {
    logApiError('editorial-publish.workflow-partial', error);
    return { ok: false as const, status: 502, error: 'publish_partial_failure' };
  }

  const updatedOwnership = normalizeWorkflowOwnership(data as EditorialPublishingDocumentRow | null);

  if (!updatedOwnership) {
    const latestOwnership = await fetchPublishOwnership(ownership.sanityDocumentId);

    if (
      latestOwnership.ok &&
      latestOwnership.ownership.workflowStatus === 'published'
    ) {
      return {
        ok: true as const,
        workflow: {
          workflowStatus: latestOwnership.ownership.workflowStatus,
          submittedAt: latestOwnership.ownership.submittedAt,
          reviewedBy: latestOwnership.ownership.reviewedBy,
          reviewedAt: latestOwnership.ownership.reviewedAt,
        },
        permissions: getWorkflowTransitionPermissions(context, latestOwnership.ownership),
        auditLogged: false,
        reconciled: true,
      };
    }

    logApiError('editorial-publish.workflow-conflict', new Error('publish_partial_failure'));
    return { ok: false as const, status: 409, error: 'publish_partial_failure' };
  }

  const auditLogged = await recordPublishAudit({
    actorUserId: context.user.id,
    sanityDocumentId: updatedOwnership.sanityDocumentId,
    previousWorkflowStatus: ownership.workflowStatus,
    nextWorkflowStatus: updatedOwnership.workflowStatus,
  });

  return {
    ok: true as const,
    workflow: {
      workflowStatus: updatedOwnership.workflowStatus,
      submittedAt: updatedOwnership.submittedAt,
      reviewedBy: updatedOwnership.reviewedBy,
      reviewedAt: updatedOwnership.reviewedAt,
    },
    permissions: getWorkflowTransitionPermissions(context, updatedOwnership),
    auditLogged,
    reconciled: false,
  };
}

export async function publishApprovedEditorialArticle({
  context,
  rootDocumentId,
}: {
  context: EditableEditorialContext;
  rootDocumentId: unknown;
}) {
  const ownershipResult = await fetchPublishOwnership(rootDocumentId);
  if (!ownershipResult.ok) return ownershipResult;

  const ownership = ownershipResult.ownership;
  const pair = await fetchSanityArticlePair(ownership.sanityDocumentId);
  const sanityAlreadyPublished = isSanityDocumentPubliclyPublished({
    publishedDocument: pair.publishedDocument,
    ownership,
  });

  if (!canPublishArticle(context)) {
    return { ok: false as const, status: 403, error: 'article_publish_forbidden' };
  }

  if (ownership.workflowStatus === 'published') {
    if (sanityAlreadyPublished && !pair.draftDocument) {
      return {
        ok: true as const,
        workflow: {
          workflowStatus: ownership.workflowStatus,
          submittedAt: ownership.submittedAt,
          reviewedBy: ownership.reviewedBy,
          reviewedAt: ownership.reviewedAt,
        },
        permissions: getWorkflowTransitionPermissions(context, ownership),
        auditLogged: false,
        reconciled: false,
        alreadyPublished: true,
      };
    }

    return { ok: false as const, status: 409, error: 'publish_state_inconsistent' };
  }

  if (!canPublishWorkflowArticle(context, ownership)) {
    return { ok: false as const, status: 403, error: 'article_publish_forbidden' };
  }

  if (!pair.draftDocument) {
    if (sanityAlreadyPublished) {
      return completeSupabasePublish({ context, ownership });
    }

    return { ok: false as const, status: 409, error: 'publish_requires_draft' };
  }

  const validation = validatePublishableDraft(pair.draftDocument, ownership);
  if (!validation.ok) return validation;

  if (pair.publishedDocument && getReferenceId(pair.publishedDocument.author) !== ownership.sanityAuthorId) {
    return { ok: false as const, status: 409, error: 'author_ownership_conflict' };
  }

  const timestamp = new Date().toISOString();
  const prepared = preparePublishedDocument({
    draftDocument: pair.draftDocument,
    publishedDocument: pair.publishedDocument,
    rootDocumentId: ownership.sanityDocumentId,
    timestamp,
  });

  if (!prepared.ok) return prepared;

  try {
    const draftTitle = pair.draftDocument.title;

    await getSanityWriteClient()
      .transaction()
      .patch(pair.draftDocumentId, (patch) =>
        patch
          .ifRevisionId(String(pair.draftDocument?._rev || ''))
          .set({ title: draftTitle })
      )
      .createOrReplace(prepared.document)
      .delete(pair.draftDocumentId)
      .commit({ visibility: 'sync', returnDocuments: false });
  } catch (error) {
    logApiError('editorial-publish.sanity-transaction', error);
    return { ok: false as const, status: 502, error: 'sanity_publish_failed' };
  }

  const readBack = await fetchSanityArticlePair(ownership.sanityDocumentId);
  const readBackPublished = isSanityDocumentPubliclyPublished({
    publishedDocument: readBack.publishedDocument,
    ownership,
  });

  if (!readBackPublished || readBack.draftDocument) {
    logApiError('editorial-publish.readback', new Error('publish_readback_failed'));
    return { ok: false as const, status: 502, error: 'publish_readback_failed' };
  }

  return completeSupabasePublish({ context, ownership });
}
