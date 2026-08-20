import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import { requireEditorialArticleContext } from '../../../../../lib/editorial/articles.server';
import {
  approveArticle,
  requestArticleChanges,
  submitArticleForReview,
} from '../../../../../lib/editorial/workflow.server';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });

export const POST: APIRoute = async ({ request, params, cookies }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  let payload: Record<string, unknown>;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ ok: false, error: 'invalid_request' }, 400);
    }

    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const action = String(payload.action || '').trim();
    const rootDocumentId = params.id;
    const result = action === 'submit'
      ? await submitArticleForReview({ context: access.context, rootDocumentId })
      : action === 'request_changes'
        ? await requestArticleChanges({ context: access.context, rootDocumentId })
        : action === 'approve'
          ? await approveArticle({ context: access.context, rootDocumentId })
          : { ok: false as const, status: 400, error: 'invalid_workflow_action' };

    if (!result.ok) {
      return json({ ok: false, error: result.error }, result.status);
    }

    return json({
      ok: true,
      workflow: result.workflow,
      permissions: result.permissions,
      auditLogged: result.auditLogged,
    });
  } catch (error) {
    logApiError('editorial-workflow.api', error);
    return json({ ok: false, error: 'workflow_update_failed' }, 500);
  }
};
