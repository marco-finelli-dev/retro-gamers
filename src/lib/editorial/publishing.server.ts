import { logApiError } from '../api-errors';
import { getSanityDocumentActionsClient, getSanityRawClient, getSanityWriteClient } from '../sanity-write.server';
import { supabaseAdmin } from '../supabase/server';
import { validateArticleForWorkflow } from './article-workflow-validation.server';
import {
  canPublishArticle,
  canPublishArticleRevision,
  canPublishWorkflowArticle,
  getWorkflowTransitionPermissions,
} from './permissions';
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

type PublishFailurePhase =
  | 'request'
  | 'supabase_preflight'
  | 'permission'
  | 'sanity_preflight'
  | 'sanity_prepare_draft'
  | 'sanity_publish'
  | 'sanity_readback'
  | 'supabase_update';

const workflowDocumentSelect =
  'sanity_document_id, owner_user_id, sanity_author_id, workflow_status, submitted_at, reviewed_by, reviewed_at';

function publishFailure(
  status: number,
  error: string,
  phase: PublishFailurePhase,
  details: { missingFields?: string[] } = {}
) {
  return { ok: false as const, status, error, phase, ...details };
}

function getDraftDocumentId(rootDocumentId: string) {
  return `drafts.${rootDocumentId}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
    return publishFailure(400, 'invalid_article_id', 'request');
  }

  const { data, error } = await supabaseAdmin
    .from('editorial_documents')
    .select(workflowDocumentSelect)
    .eq('sanity_document_id', sanityDocumentId)
    .maybeSingle();

  if (error) {
    logApiError('editorial-publish.ownership', error);
    return publishFailure(503, 'editorial_database_unavailable', 'supabase_preflight');
  }

  const ownership = normalizeWorkflowOwnership(data as EditorialPublishingDocumentRow | null);

  if (!ownership) {
    return publishFailure(404, 'article_not_found', 'supabase_preflight');
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

function isValidDateString(value: unknown) {
  return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value));
}

function validatePublishableDraft(
  draftDocument: SanityArticleDocument | null,
  ownership: EditorialDocumentOwnership
) {
  if (!draftDocument) {
    return publishFailure(409, 'publish_requires_draft', 'sanity_preflight');
  }

  if (draftDocument._id !== getDraftDocumentId(ownership.sanityDocumentId)) {
    return publishFailure(409, 'publish_document_mismatch', 'sanity_preflight');
  }

  if (!draftDocument._rev) {
    return publishFailure(422, 'publish_revision_missing', 'sanity_preflight');
  }

  const validation = validateArticleForWorkflow(draftDocument, 'publish', {
    expectedSanityAuthorId: ownership.sanityAuthorId,
  });
  const contentIssues = validation.blockingIssues.filter((issue) => issue.code !== 'author_ownership_conflict');
  const hasAuthorConflict = validation.blockingIssues.some((issue) => issue.code === 'author_ownership_conflict');

  if (contentIssues.length > 0) {
    const missingFields = Array.from(new Set(contentIssues.map((issue) => issue.field)));

    return publishFailure(422, 'publish_missing_required_fields', 'sanity_preflight', {
      missingFields,
    });
  }

  if (hasAuthorConflict) {
    return publishFailure(409, 'author_ownership_conflict', 'sanity_preflight');
  }

  return { ok: true as const };
}

function getPublishFieldPatch({
  draftDocument,
  publishedDocument,
  timestamp,
}: {
  draftDocument: SanityArticleDocument;
  publishedDocument: SanityArticleDocument | null;
  timestamp: string;
}) {
  const existingPublishedAt = publishedDocument?.publishedAt;
  const draftPublishedAt = draftDocument.publishedAt;
  let publishedAt: unknown;

  if (publishedDocument) {
    if (!isValidDateString(existingPublishedAt)) {
      return publishFailure(422, 'published_at_missing', 'sanity_preflight');
    }

    publishedAt = existingPublishedAt;
  } else {
    publishedAt = isValidDateString(draftPublishedAt)
      ? draftPublishedAt
      : timestamp;
  }

  return {
    ok: true as const,
    set: {
      isPublic: true,
      publishedAt,
    },
  };
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
  metadata = {},
}: {
  actorUserId: string;
  sanityDocumentId: string;
  previousWorkflowStatus: EditorialWorkflowStatus;
  nextWorkflowStatus: EditorialWorkflowStatus;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin
    .from('editorial_audit_log')
    .insert({
      actor_user_id: actorUserId,
      action: 'article_published',
      sanity_document_id: sanityDocumentId,
      previous_workflow_status: previousWorkflowStatus,
      next_workflow_status: nextWorkflowStatus,
      metadata,
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
    return publishFailure(502, 'publish_partial_failure', 'supabase_update');
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
    return publishFailure(409, 'publish_partial_failure', 'supabase_update');
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
    return publishFailure(403, 'article_publish_forbidden', 'permission');
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

    if (sanityAlreadyPublished && pair.draftDocument && pair.publishedDocument) {
      if (!canPublishArticleRevision(context)) {
        return publishFailure(403, 'article_publish_forbidden', 'permission');
      }

      const validation = validatePublishableDraft(pair.draftDocument, ownership);
      if (!validation.ok) return validation;

      if (getReferenceId(pair.publishedDocument.author) !== ownership.sanityAuthorId) {
        return publishFailure(409, 'author_ownership_conflict', 'sanity_preflight');
      }

      if (!pair.publishedDocument._rev) {
        return publishFailure(422, 'publish_revision_missing', 'sanity_preflight');
      }

      const timestamp = new Date().toISOString();
      const publishFieldPatch = getPublishFieldPatch({
        draftDocument: pair.draftDocument,
        publishedDocument: pair.publishedDocument,
        timestamp,
      });

      if (!publishFieldPatch.ok) return publishFieldPatch;

      let preparedDraft: SanityArticleDocument;

      try {
        preparedDraft = await getSanityWriteClient()
          .patch(pair.draftDocumentId)
          .ifRevisionId(pair.draftDocument._rev || '')
          .set(publishFieldPatch.set)
          .commit<SanityArticleDocument>({ visibility: 'sync' });
      } catch (error) {
        logApiError('editorial-publish.prepare-revision-draft', error);
        return publishFailure(409, 'publish_revision_conflict', 'sanity_prepare_draft');
      }

      try {
        await getSanityDocumentActionsClient().action({
          actionType: 'sanity.action.document.publish',
          draftId: pair.draftDocumentId,
          ifDraftRevisionId: preparedDraft._rev,
          publishedId: ownership.sanityDocumentId,
          ifPublishedRevisionId: pair.publishedDocument._rev,
        });
      } catch (error) {
        logApiError('editorial-publish.sanity-revision-action', error);
        console.error('editorial-publish.sanity-revision-action', error);
        return publishFailure(502, 'sanity_publish_failed', 'sanity_publish');
      }

      const readBack = await fetchSanityArticlePair(ownership.sanityDocumentId);
      const readBackPublished = isSanityDocumentPubliclyPublished({
        publishedDocument: readBack.publishedDocument,
        ownership,
      });
      const publishedRevisionChanged = Boolean(
        readBack.publishedDocument?._rev &&
          readBack.publishedDocument._rev !== pair.publishedDocument._rev
      );

      if (!readBackPublished || readBack.draftDocument || !publishedRevisionChanged) {
        logApiError('editorial-publish.revision-readback', new Error('publish_readback_failed'));
        return publishFailure(502, 'publish_readback_failed', 'sanity_readback');
      }

      const auditLogged = await recordPublishAudit({
        actorUserId: context.user.id,
        sanityDocumentId: ownership.sanityDocumentId,
        previousWorkflowStatus: ownership.workflowStatus,
        nextWorkflowStatus: ownership.workflowStatus,
        metadata: { revisionPublished: true },
      });

      return {
        ok: true as const,
        workflow: {
          workflowStatus: ownership.workflowStatus,
          submittedAt: ownership.submittedAt,
          reviewedBy: ownership.reviewedBy,
          reviewedAt: ownership.reviewedAt,
        },
        permissions: getWorkflowTransitionPermissions(context, ownership),
        auditLogged,
        reconciled: false,
        revisionPublished: true,
      };
    }

    return publishFailure(409, 'publish_state_inconsistent', 'sanity_preflight');
  }

  if (!canPublishWorkflowArticle(context, ownership)) {
    return publishFailure(403, 'article_publish_forbidden', 'permission');
  }

  if (!pair.draftDocument) {
    if (sanityAlreadyPublished) {
      return completeSupabasePublish({ context, ownership });
    }

    return publishFailure(409, 'publish_requires_draft', 'sanity_preflight');
  }

  const validation = validatePublishableDraft(pair.draftDocument, ownership);
  if (!validation.ok) return validation;

  if (pair.publishedDocument && getReferenceId(pair.publishedDocument.author) !== ownership.sanityAuthorId) {
    return publishFailure(409, 'author_ownership_conflict', 'sanity_preflight');
  }

  const timestamp = new Date().toISOString();
  const publishFieldPatch = getPublishFieldPatch({
    draftDocument: pair.draftDocument,
    publishedDocument: pair.publishedDocument,
    timestamp,
  });

  if (!publishFieldPatch.ok) return publishFieldPatch;

  let preparedDraft: SanityArticleDocument;

  try {
    preparedDraft = await getSanityWriteClient()
      .patch(pair.draftDocumentId)
      .ifRevisionId(pair.draftDocument._rev || '')
      .set(publishFieldPatch.set)
      .commit<SanityArticleDocument>({ visibility: 'sync' });
  } catch (error) {
    logApiError('editorial-publish.prepare-draft', error);
    return publishFailure(409, 'publish_revision_conflict', 'sanity_prepare_draft');
  }

  try {
    await getSanityDocumentActionsClient().action({
      actionType: 'sanity.action.document.publish',
      draftId: pair.draftDocumentId,
      ifDraftRevisionId: preparedDraft._rev,
      publishedId: ownership.sanityDocumentId,
      ...(pair.publishedDocument?._rev ? { ifPublishedRevisionId: pair.publishedDocument._rev } : {}),
    });
  } catch (error) {
    logApiError('editorial-publish.sanity-action', error);
    console.error('editorial-publish.sanity-action', error);
    return publishFailure(502, 'sanity_publish_failed', 'sanity_publish');
  }

  const readBack = await fetchSanityArticlePair(ownership.sanityDocumentId);
  const readBackPublished = isSanityDocumentPubliclyPublished({
    publishedDocument: readBack.publishedDocument,
    ownership,
  });

  if (!readBackPublished || readBack.draftDocument) {
    logApiError('editorial-publish.readback', new Error('publish_readback_failed'));
    return publishFailure(502, 'publish_readback_failed', 'sanity_readback');
  }

  return completeSupabasePublish({ context, ownership });
}
