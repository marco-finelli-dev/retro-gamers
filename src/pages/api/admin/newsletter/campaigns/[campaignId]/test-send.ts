import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../../lib/api-errors';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../../../lib/supabase/auth';
import {
  getNewsletterCampaignById,
  isEditableNewsletterCampaign,
  logCampaignDelivery,
  markCampaignTestSent,
} from '../../../../../../lib/supabase/newsletter-campaigns';
import { sendNewsletterCampaignEmail } from '../../../../../../lib/supabase/newsletter-campaign-emails';
import { isValidNewsletterEmail, normalizeNewsletterEmail } from '../../../../../../lib/supabase/newsletter';

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

export const POST: APIRoute = async ({ cookies, params, request }) => {
  const session = await getStaffSession(cookies);

  if (!session?.user) {
    return json({ ok: false, error: 'Unauthorized' }, 403);
  }

  const campaignId = getCampaignId(params);

  if (!campaignId) {
    return json({ ok: false, error: 'Invalid campaign id.' }, 400);
  }

  const body = await request.json().catch(() => ({}));
  const requestedEmail = normalizeNewsletterEmail(body.email || '');
  const isAdmin = session.profile?.role === 'admin';
  const testEmail = requestedEmail && isAdmin
    ? requestedEmail
    : normalizeNewsletterEmail(session.user.email || '');

  if (!isValidNewsletterEmail(testEmail)) {
    return json({ ok: false, error: 'A valid test email is required.' }, 400);
  }

  const campaignResult = await getNewsletterCampaignById(campaignId);

  if (!campaignResult.ok) {
    return json(
      {
        ok: false,
        unavailable: campaignResult.unavailable,
        error: campaignResult.error || 'Could not load newsletter campaign.',
      },
      campaignResult.unavailable ? 503 : 500
    );
  }

  const campaign = campaignResult.campaign;

  if (!campaign) {
    return json({ ok: false, error: 'Campaign not found.' }, 404);
  }

  if (!isEditableNewsletterCampaign(campaign)) {
    return json({ ok: false, error: 'This campaign can no longer send tests.' }, 409);
  }

  try {
    const sentAt = new Date().toISOString();
    const result = await sendNewsletterCampaignEmail({
      campaign,
      to: testEmail,
      isTest: true,
    });

    await logCampaignDelivery({
      campaignId: campaign.id,
      email: testEmail,
      status: result.ok ? 'sent' : 'failed',
      resendMessageId: result.messageId,
      errorMessage: result.error,
      sentAt: result.ok ? sentAt : null,
      isTest: true,
    });

    if (!result.ok) {
      return json({ ok: false, error: result.error || 'Could not send test email.' }, 500);
    }

    const updated = await markCampaignTestSent(campaign.id);

    return json({
      ok: true,
      messageId: result.messageId,
      campaign: updated.campaign || campaign,
    });
  } catch (error) {
    logApiError('admin.newsletter.campaigns.test-send', error);
    return json({ ok: false, error: 'Could not send test email.' }, 500);
  }
};

export const ALL: APIRoute = async () =>
  json({ ok: false, error: 'Method not allowed' }, 405);
