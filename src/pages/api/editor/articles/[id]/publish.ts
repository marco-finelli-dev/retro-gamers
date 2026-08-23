import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import { requireEditorialArticleContext } from '../../../../../lib/editorial/articles.server';
import { publishApprovedEditorialArticle } from '../../../../../lib/editorial/publishing.server';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'private, no-store',
    },
  });

export const POST: APIRoute = async ({ params, cookies }) => {
  const access = await requireEditorialArticleContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  try {
    const result = await publishApprovedEditorialArticle({
      context: access.context,
      rootDocumentId: params.id,
    });

    if (!result.ok) {
      return json({
        ok: false,
        error: result.error,
        phase: result.phase,
        missingFields: result.missingFields || [],
      }, result.status);
    }

    return json({
      ok: true,
      workflow: result.workflow,
      permissions: result.permissions,
      auditLogged: result.auditLogged,
      reconciled: result.reconciled,
      alreadyPublished: result.alreadyPublished === true,
      revisionPublished: result.revisionPublished === true,
    });
  } catch (error) {
    logApiError('editorial-publish.api', error);
    return json({ ok: false, error: 'publish_failed', phase: 'api' }, 500);
  }
};
