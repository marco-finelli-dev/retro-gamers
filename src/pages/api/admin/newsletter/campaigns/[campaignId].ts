import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../../lib/supabase/auth';
import {
  deleteDraftNewsletterCampaign,
  getNewsletterCampaignById,
  updateNewsletterCampaign,
  type NewsletterCampaignInput,
} from '../../../../../lib/supabase/newsletter-campaigns';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getCampaignId = (params: Record<string, string | undefined>) => {
  const id = String(params.campaignId || '').trim();

  return uuidPattern.test(id) ? id : '';
};

const getStaffSession = async (cookies: any) => {
  const session = await getUserSessionFromCookies(cookies);

  if (!session.user || !isStaffProfile(session.profile)) {
    return null;
  }

  return session;
};

const readCampaignInput = async (request: Request): Promise<NewsletterCampaignInput> => {
  const body = await request.json().catch(() => ({}));

  return {
    language: body.language,
    title: body.title,
    subject: body.subject,
    preheader: body.preheader,
    intro: body.intro,
    contentHtml: body.contentHtml,
    contentText: body.contentText,
    ctaLabel: body.ctaLabel,
    ctaUrl: body.ctaUrl,
    items: Array.isArray(body.items) ? body.items : [],
  };
};

export const GET: APIRoute = async ({ cookies, params }) => {
  const session = await getStaffSession(cookies);

  if (!session) {
    return json({ ok: false, error: 'Unauthorized' }, 403);
  }

  const campaignId = getCampaignId(params);

  if (!campaignId) {
    return json({ ok: false, error: 'Invalid campaign id.' }, 400);
  }

  const result = await getNewsletterCampaignById(campaignId);

  if (!result.ok) {
    return json(
      {
        ok: false,
        unavailable: result.unavailable,
        error: result.error || 'Could not load newsletter campaign.',
      },
      result.unavailable ? 503 : 500
    );
  }

  if (!result.campaign) {
    return json({ ok: false, error: 'Campaign not found.' }, 404);
  }

  return json({ ok: true, campaign: result.campaign });
};

export const PATCH: APIRoute = async ({ cookies, params, request }) => {
  const session = await getStaffSession(cookies);

  if (!session?.user) {
    return json({ ok: false, error: 'Unauthorized' }, 403);
  }

  const campaignId = getCampaignId(params);

  if (!campaignId) {
    return json({ ok: false, error: 'Invalid campaign id.' }, 400);
  }

  try {
    const input = await readCampaignInput(request);
    const result = await updateNewsletterCampaign(campaignId, input, session.user.id);

    if (!result.ok) {
      return json(
        {
          ok: false,
          unavailable: result.unavailable,
          code: result.code,
          error: result.error || 'Could not update newsletter campaign.',
        },
        result.code === 'not_editable' ? 409 : result.unavailable ? 503 : 400
      );
    }

    return json({ ok: true, campaign: result.campaign });
  } catch (error) {
    logApiError('admin.newsletter.campaigns.update', error);
    return json({ ok: false, error: 'Could not update newsletter campaign.' }, 500);
  }
};

export const DELETE: APIRoute = async ({ cookies, params }) => {
  const session = await getStaffSession(cookies);

  if (!session) {
    return json({ ok: false, error: 'Unauthorized' }, 403);
  }

  const campaignId = getCampaignId(params);

  if (!campaignId) {
    return json({ ok: false, error: 'Invalid campaign id.' }, 400);
  }

  const result = await deleteDraftNewsletterCampaign(campaignId);

  if (!result.ok) {
    return json(
      {
        ok: false,
        unavailable: result.unavailable,
        code: result.code,
        error: result.error || 'Could not delete newsletter campaign.',
      },
      result.code === 'not_draft' ? 409 : result.unavailable ? 503 : 400
    );
  }

  return json({ ok: true });
};

export const ALL: APIRoute = async () =>
  json({ ok: false, error: 'Method not allowed' }, 405);
