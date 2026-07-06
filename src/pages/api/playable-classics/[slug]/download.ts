import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  checkPlayableClassicDownloadRequest,
  createPlayableClassicSignedUrl,
  logPlayableClassicDownload,
} from '../../../../lib/supabase/playable-classics-downloads';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  });

export const GET: APIRoute = async ({ params, cookies, request }) => {
  const slug = String(params.slug || '').trim();

  if (!slug) {
    return json({
      ok: false,
      code: 'not_found',
      message: 'Playable classic not found.',
    }, 404);
  }

  try {
    const check = await checkPlayableClassicDownloadRequest({ cookies, slug });

    if (!check.ok) {
      return json({
        ok: false,
        code: check.code,
        message: check.message,
      }, check.status);
    }

    const signedUrl = await createPlayableClassicSignedUrl(check.classic);

    if (!signedUrl.ok) {
      return json({
        ok: false,
        code: signedUrl.code,
        message: signedUrl.message,
      }, signedUrl.status);
    }

    const logResult = await logPlayableClassicDownload({
      userId: check.session.user.id,
      classic: check.classic,
      userAgent: request.headers.get('user-agent') || '',
    });

    if (!logResult.ok) {
      console.warn('Playable Classics download served without log entry.');
    }

    return json({
      ok: true,
      url: signedUrl.signedUrl,
      expiresIn: signedUrl.expiresIn,
      packageName: check.classic.packageName || null,
      packageVersion: check.classic.packageVersion || null,
      packageSize: check.classic.packageSize || null,
      checksumSha256: check.classic.checksumSha256 || null,
    });
  } catch (error) {
    logApiError('playable-classics-download', error);

    return json({
      ok: false,
      code: 'service_unavailable',
      message: 'Download storage is not configured yet.',
    }, 503);
  }
};
