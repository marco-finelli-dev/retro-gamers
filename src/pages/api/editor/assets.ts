import type { APIRoute } from 'astro';
import {
  fetchPublishedArticleCountForAuthor,
  normalizeAuthorProfileResponse,
  requireActiveEditorialAuthorContext,
  uploadEditorialAuthorImage,
} from '../../../lib/editorial/profile.server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const access = await requireActiveEditorialAuthorContext(cookies);

  if (!access.ok) {
    return json({ ok: false, error: access.error }, access.status);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  const result = await uploadEditorialAuthorImage({
    context: access.context,
    formData,
  });

  if (!result.ok) {
    return json({
      ok: false,
      error: result.error,
      assetUploaded: 'assetUploaded' in result ? result.assetUploaded : false,
      profileUpdated: 'profileUpdated' in result ? result.profileUpdated : false,
    }, result.status);
  }

  const articleCount = await fetchPublishedArticleCountForAuthor(access.context.sanityAuthorId);

  return json({
    ok: true,
    ...normalizeAuthorProfileResponse(result.author, articleCount),
    assetType: result.assetType,
    auditLogged: result.auditLogged,
  });
};
