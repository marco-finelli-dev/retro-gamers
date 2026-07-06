import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  checkPlayableClassicDownloadRequest,
  getPlayableClassicsStorageUnavailableResponse,
} from '../../../../lib/supabase/playable-classics-downloads';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ params, cookies }) => {
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

    const unavailable = getPlayableClassicsStorageUnavailableResponse();

    return json({
      ok: false,
      code: unavailable.code,
      message: unavailable.message,
    }, unavailable.status);
  } catch (error) {
    logApiError('playable-classics-download', error);

    return json({
      ok: false,
      code: 'service_unavailable',
      message: 'Download storage is not configured yet.',
    }, 503);
  }
};
