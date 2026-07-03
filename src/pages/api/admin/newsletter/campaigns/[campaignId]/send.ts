import type { APIRoute } from 'astro';
import { logApiError } from '../../../../../../lib/api-errors';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../../../lib/supabase/auth';
import {
  campaignHasSendableContent,
  getActiveSubscribersForCampaign,
  getNewsletterCampaignById,
  isEditableNewsletterCampaign,
  logCampaignDelivery,
  markCampaignSending,
  markCampaignSent,
} from '../../../../../../lib/supabase/newsletter-campaigns';
import { sendNewsletterCampaignEmail } from '../../../../../../lib/supabase/newsletter-campaign-emails';

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

  if (body.confirm !== true) {
    return json({ ok: false, error: 'Explicit confirmation is required.' }, 400);
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
    return json({ ok: false, error: 'This campaign can no longer be sent.' }, 409);
  }

  if (!campaignHasSendableContent(campaign)) {
    return json({ ok: false, error: 'Add editorial content before sending.' }, 400);
  }

  const subscribersResult = await getActiveSubscribersForCampaign(campaign.language);

  if (!subscribersResult.ok) {
    return json({ ok: false, error: subscribersResult.error || 'Could not load subscribers.' }, 500);
  }

  const subscribers = subscribersResult.subscribers;

  if (subscribers.length === 0) {
    return json({ ok: false, error: 'No active subscribers for this campaign language.' }, 400);
  }

  if (subscribers.length > 500) {
    return json({ ok: false, error: 'Too many recipients for the synchronous V2 sender.' }, 409);
  }

  const sending = await markCampaignSending(campaign.id);

  if (!sending.ok) {
    return json({ ok: false, error: sending.error || 'Could not mark campaign as sending.' }, 500);
  }

  let sentCount = 0;
  let failedCount = 0;

  try {
    for (const subscriber of subscribers) {
      const sentAt = new Date().toISOString();
      const result = await sendNewsletterCampaignEmail({
        campaign,
        to: subscriber.email,
        subscriber,
      });

      if (result.ok) {
        sentCount += 1;
      } else {
        failedCount += 1;
      }

      await logCampaignDelivery({
        campaignId: campaign.id,
        subscriberId: subscriber.id,
        email: subscriber.email,
        status: result.ok ? 'sent' : 'failed',
        resendMessageId: result.messageId,
        errorMessage: result.error,
        sentAt: result.ok ? sentAt : null,
      });
    }

    const sent = await markCampaignSent(campaign.id);

    return json({
      ok: true,
      sentCount,
      failedCount,
      campaign: sent.campaign || sending.campaign || campaign,
    });
  } catch (error) {
    logApiError('admin.newsletter.campaigns.send', error);
    return json({
      ok: false,
      sentCount,
      failedCount,
      error: 'Newsletter send was interrupted. Check delivery logs before retrying.',
    }, 500);
  }
};

export const ALL: APIRoute = async () =>
  json({ ok: false, error: 'Method not allowed' }, 405);
