import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../lib/api-errors';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../../lib/supabase/auth';
import {
  createNewsletterCampaign,
  listNewsletterCampaigns,
  type NewsletterCampaignInput,
} from '../../../../../lib/supabase/newsletter-campaigns';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

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

export const GET: APIRoute = async ({ cookies }) => {
  const session = await getStaffSession(cookies);

  if (!session) {
    return json({ ok: false, error: 'Unauthorized' }, 403);
  }

  const result = await listNewsletterCampaigns();

  if (!result.ok) {
    return json(
      {
        ok: false,
        unavailable: result.unavailable,
        error: result.unavailable
          ? 'Newsletter campaign schema unavailable.'
          : 'Could not load newsletter campaigns.',
      },
      result.unavailable ? 503 : 500
    );
  }

  return json({ ok: true, campaigns: result.campaigns });
};

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = await getStaffSession(cookies);

  if (!session?.user) {
    return json({ ok: false, error: 'Unauthorized' }, 403);
  }

  try {
    const input = await readCampaignInput(request);
    const result = await createNewsletterCampaign(input, session.user.id);

    if (!result.ok) {
      return json(
        {
          ok: false,
          unavailable: result.unavailable,
          error: result.error || 'Could not create newsletter campaign.',
        },
        result.unavailable ? 503 : 400
      );
    }

    return json({ ok: true, campaign: result.campaign }, 201);
  } catch (error) {
    logApiError('admin.newsletter.campaigns.create', error);
    return json({ ok: false, error: 'Could not create newsletter campaign.' }, 500);
  }
};

export const ALL: APIRoute = async () =>
  json({ ok: false, error: 'Method not allowed' }, 405);
