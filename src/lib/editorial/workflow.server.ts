import { logApiError } from '../api-errors';
import { supabaseAdmin } from '../supabase/server';
import {
  canApproveWorkflowArticle,
  canRequestWorkflowChanges,
  canSubmitWorkflowArticle,
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

type EditorialWorkflowDocumentRow = {
  sanity_document_id: string | null;
  owner_user_id: string | null;
  sanity_author_id: string | null;
  workflow_status: string | null;
  submitted_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

type WorkflowAuditAction =
  | 'article_submitted'
  | 'article_returned'
  | 'article_approved';

type WorkflowTransitionConfig = {
  nextStatus: EditorialWorkflowStatus;
  auditAction: WorkflowAuditAction;
  canTransition: (
    context: EditableEditorialContext,
    ownership: EditorialDocumentOwnership
  ) => boolean;
  getUpdatePayload: (context: EditableEditorialContext, timestamp: string) => Record<string, string | null>;
  forbiddenError: string;
};

const workflowDocumentSelect =
  'sanity_document_id, owner_user_id, sanity_author_id, workflow_status, submitted_at, reviewed_by, reviewed_at';

function normalizeWorkflowOwnership(
  row: EditorialWorkflowDocumentRow | null
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

async function fetchWorkflowOwnership(rootDocumentId: unknown) {
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
    logApiError('editorial-workflow.ownership', error);
    return { ok: false as const, status: 503, error: 'editorial_database_unavailable' };
  }

  const ownership = normalizeWorkflowOwnership(data as EditorialWorkflowDocumentRow | null);

  if (!ownership) {
    return { ok: false as const, status: 404, error: 'article_not_found' };
  }

  return { ok: true as const, ownership };
}

async function recordWorkflowAudit({
  actorUserId,
  action,
  sanityDocumentId,
  previousWorkflowStatus,
  nextWorkflowStatus,
}: {
  actorUserId: string;
  action: WorkflowAuditAction;
  sanityDocumentId: string;
  previousWorkflowStatus: EditorialWorkflowStatus;
  nextWorkflowStatus: EditorialWorkflowStatus;
}) {
  const { error } = await supabaseAdmin
    .from('editorial_audit_log')
    .insert({
      actor_user_id: actorUserId,
      action,
      sanity_document_id: sanityDocumentId,
      previous_workflow_status: previousWorkflowStatus,
      next_workflow_status: nextWorkflowStatus,
      metadata: {},
    });

  if (error) {
    logApiError(`editorial-workflow.audit.${action}`, error);
    return false;
  }

  return true;
}

async function applyWorkflowTransition({
  context,
  rootDocumentId,
  config,
}: {
  context: EditableEditorialContext;
  rootDocumentId: unknown;
  config: WorkflowTransitionConfig;
}) {
  const ownershipResult = await fetchWorkflowOwnership(rootDocumentId);
  if (!ownershipResult.ok) return ownershipResult;

  const ownership = ownershipResult.ownership;
  const previousWorkflowStatus = ownership.workflowStatus;

  if (!config.canTransition(context, ownership)) {
    return { ok: false as const, status: 403, error: config.forbiddenError };
  }

  const timestamp = new Date().toISOString();
  const updatePayload = {
    workflow_status: config.nextStatus,
    ...config.getUpdatePayload(context, timestamp),
  };

  const { data, error } = await supabaseAdmin
    .from('editorial_documents')
    .update(updatePayload)
    .eq('sanity_document_id', ownership.sanityDocumentId)
    .eq('workflow_status', previousWorkflowStatus)
    .select(workflowDocumentSelect)
    .maybeSingle();

  if (error) {
    logApiError('editorial-workflow.transition', error);
    return { ok: false as const, status: 503, error: 'workflow_update_failed' };
  }

  const updatedOwnership = normalizeWorkflowOwnership(data as EditorialWorkflowDocumentRow | null);

  if (!updatedOwnership) {
    return { ok: false as const, status: 409, error: 'workflow_conflict' };
  }

  const auditLogged = await recordWorkflowAudit({
    actorUserId: context.user.id,
    action: config.auditAction,
    sanityDocumentId: updatedOwnership.sanityDocumentId,
    previousWorkflowStatus,
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
  };
}

export function getEditorialWorkflowTransitionPermissions({
  context,
  ownership,
}: {
  context: EditableEditorialContext;
  ownership: EditorialDocumentOwnership;
}) {
  return getWorkflowTransitionPermissions(context, ownership);
}

export async function submitArticleForReview({
  context,
  rootDocumentId,
}: {
  context: EditableEditorialContext;
  rootDocumentId: unknown;
}) {
  return applyWorkflowTransition({
    context,
    rootDocumentId,
    config: {
      nextStatus: 'submitted',
      auditAction: 'article_submitted',
      canTransition: canSubmitWorkflowArticle,
      getUpdatePayload: (_context, timestamp) => ({
        submitted_at: timestamp,
        reviewed_by: null,
        reviewed_at: null,
      }),
      forbiddenError: 'article_submit_forbidden',
    },
  });
}

export async function requestArticleChanges({
  context,
  rootDocumentId,
}: {
  context: EditableEditorialContext;
  rootDocumentId: unknown;
}) {
  return applyWorkflowTransition({
    context,
    rootDocumentId,
    config: {
      nextStatus: 'changes_requested',
      auditAction: 'article_returned',
      canTransition: canRequestWorkflowChanges,
      getUpdatePayload: (currentContext, timestamp) => ({
        reviewed_by: currentContext.user.id,
        reviewed_at: timestamp,
      }),
      forbiddenError: 'article_request_changes_forbidden',
    },
  });
}

export async function approveArticle({
  context,
  rootDocumentId,
}: {
  context: EditableEditorialContext;
  rootDocumentId: unknown;
}) {
  return applyWorkflowTransition({
    context,
    rootDocumentId,
    config: {
      nextStatus: 'approved',
      auditAction: 'article_approved',
      canTransition: canApproveWorkflowArticle,
      getUpdatePayload: (currentContext, timestamp) => ({
        reviewed_by: currentContext.user.id,
        reviewed_at: timestamp,
      }),
      forbiddenError: 'article_approve_forbidden',
    },
  });
}
