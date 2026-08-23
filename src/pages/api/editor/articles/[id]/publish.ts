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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getDiagnosticErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return null;
}

function getDiagnosticErrorStatus(error: unknown) {
  if (!isPlainObject(error)) return null;

  const directStatus = error.statusCode ?? error.status;
  if (typeof directStatus === 'number' || typeof directStatus === 'string') return directStatus;

  const response = error.response;
  if (!isPlainObject(response)) return null;

  const responseStatus = response.statusCode ?? response.status;
  return typeof responseStatus === 'number' || typeof responseStatus === 'string'
    ? responseStatus
    : null;
}

function getDiagnosticErrorResponse(error: unknown) {
  if (!isPlainObject(error)) return null;

  const response = error.response;
  if (!response) return null;

  if (!isPlainObject(response)) return response;

  return {
    status: response.status ?? response.statusCode ?? null,
    statusText: response.statusText ?? response.statusMessage ?? null,
    body: response.body ?? response.text ?? null,
  };
}

function logPublishApiDiagnostic(context: string, error: unknown) {
  console.error('editorial-publish.api.diagnostic', {
    context,
    message: getDiagnosticErrorMessage(error),
    stack: error instanceof Error ? error.stack : null,
    status: getDiagnosticErrorStatus(error),
    response: getDiagnosticErrorResponse(error),
  });
}

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
    logPublishApiDiagnostic('editorial-publish.api', error);
    return json({ ok: false, error: 'publish_failed', phase: 'api' }, 500);
  }
};
