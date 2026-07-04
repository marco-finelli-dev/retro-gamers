import { logApiError } from '../api-errors';
import { supabaseAdmin } from './server';
import {
  isNewsletterUnavailableError,
  normalizeNewsletterEmail,
  normalizeNewsletterLanguage,
  type NewsletterLanguage,
  type NewsletterSubscriber,
} from './newsletter';

export type NewsletterCampaignStatus = 'draft' | 'test_sent' | 'sending' | 'sent' | 'cancelled';
export type NewsletterCampaignItemType = 'article' | 'review' | 'feature' | 'guide' | 'news' | 'interview' | 'external_link' | 'text';

export type NewsletterCampaignItem = {
  id: string;
  campaign_id: string;
  position: number;
  type: NewsletterCampaignItemType;
  title: string;
  description: string | null;
  url: string | null;
  image_url: string | null;
  created_at: string;
};

export type NewsletterCampaign = {
  id: string;
  language: NewsletterLanguage;
  status: NewsletterCampaignStatus;
  title: string;
  subject: string;
  preheader: string | null;
  intro: string | null;
  content_html: string | null;
  content_text: string | null;
  cta_label: string | null;
  cta_url: string | null;
  created_by: string | null;
  updated_by: string | null;
  test_sent_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  items?: NewsletterCampaignItem[];
};

export type NewsletterCampaignInput = {
  language?: string | null;
  title?: string | null;
  subject?: string | null;
  preheader?: string | null;
  intro?: string | null;
  contentHtml?: string | null;
  contentText?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  items?: NewsletterCampaignItemInput[];
};

export type NewsletterCampaignItemInput = {
  id?: string | null;
  position?: number | string | null;
  type?: string | null;
  title?: string | null;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
};

const campaignSelect = `
  id,
  language,
  status,
  title,
  subject,
  preheader,
  intro,
  content_html,
  content_text,
  cta_label,
  cta_url,
  created_by,
  updated_by,
  test_sent_at,
  sent_at,
  created_at,
  updated_at,
  items:newsletter_campaign_items (
    id,
    campaign_id,
    position,
    type,
    title,
    description,
    url,
    image_url,
    created_at
  )
`;

const editableStatuses = new Set<NewsletterCampaignStatus>(['draft', 'test_sent']);
const itemTypes = new Set<NewsletterCampaignItemType>([
  'article',
  'review',
  'feature',
  'guide',
  'news',
  'interview',
  'external_link',
  'text',
]);

const trimText = (value?: string | null, maxLength = 5000) =>
  String(value || '').trim().slice(0, maxLength);

const normalizeOptionalUrl = (value?: string | null) => {
  const normalized = trimText(value, 2000);

  if (!normalized) return null;

  try {
    const url = new URL(normalized, 'https://www.retro-gamers.it');

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
};

const normalizeItemType = (value?: string | null): NewsletterCampaignItemType => {
  const normalized = String(value || '').trim() as NewsletterCampaignItemType;

  return itemTypes.has(normalized) ? normalized : 'external_link';
};

const isCampaignUnavailableError = (error: { code?: string; message?: string; details?: string } | null | undefined) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    isNewsletterUnavailableError(error) ||
    message.includes('newsletter_campaigns') ||
    message.includes('newsletter_campaign_items')
  );
};

export const isEditableNewsletterCampaign = (campaign?: Pick<NewsletterCampaign, 'status'> | null) =>
  Boolean(campaign && editableStatuses.has(campaign.status));

export const normalizeNewsletterCampaignInput = (input: NewsletterCampaignInput) => ({
  language: normalizeNewsletterLanguage(input.language),
  title: trimText(input.title, 180),
  subject: trimText(input.subject, 180),
  preheader: trimText(input.preheader, 240) || null,
  intro: trimText(input.intro, 1200) || null,
  content_html: trimText(input.contentHtml, 12000) || null,
  content_text: trimText(input.contentText, 12000) || null,
  cta_label: trimText(input.ctaLabel, 80) || null,
  cta_url: normalizeOptionalUrl(input.ctaUrl),
});

export const normalizeNewsletterCampaignItems = (items?: NewsletterCampaignItemInput[]) =>
  (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      position: Number.isFinite(Number(item.position)) ? Number(item.position) : index,
      type: normalizeItemType(item.type),
      title: trimText(item.title, 180),
      description: trimText(item.description, 700) || null,
      url: normalizeOptionalUrl(item.url),
      image_url: normalizeOptionalUrl(item.imageUrl),
    }))
    .filter((item) => item.title)
    .slice(0, 12);

export const campaignHasSendableContent = (campaign: NewsletterCampaign) =>
  Boolean(
    trimText(campaign.intro) ||
    trimText(campaign.content_html) ||
    trimText(campaign.content_text) ||
    (campaign.items || []).some((item) => trimText(item.title))
  );

const sortCampaignItems = (campaign: NewsletterCampaign) => ({
  ...campaign,
  items: [...(campaign.items || [])].sort((a, b) => a.position - b.position),
});

export async function listNewsletterCampaigns() {
  const { data, error } = await supabaseAdmin
    .from('newsletter_campaigns')
    .select(campaignSelect)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    if (!isCampaignUnavailableError(error)) {
      logApiError('newsletter-campaigns.list', error);
    }

    return {
      ok: false,
      unavailable: isCampaignUnavailableError(error),
      campaigns: [] as NewsletterCampaign[],
      error: error.message,
    };
  }

  return {
    ok: true,
    unavailable: false,
    campaigns: ((data ?? []) as NewsletterCampaign[]).map(sortCampaignItems),
  };
}

export async function getNewsletterCampaignById(id: string) {
  const { data, error } = await supabaseAdmin
    .from('newsletter_campaigns')
    .select(campaignSelect)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (!isCampaignUnavailableError(error)) {
      logApiError('newsletter-campaigns.get', error);
    }

    return {
      ok: false,
      unavailable: isCampaignUnavailableError(error),
      campaign: null as NewsletterCampaign | null,
      error: error.message,
    };
  }

  return {
    ok: true,
    unavailable: false,
    campaign: data ? sortCampaignItems(data as NewsletterCampaign) : null,
  };
}

export async function replaceNewsletterCampaignItems(campaignId: string, items: NewsletterCampaignItemInput[]) {
  const normalizedItems = normalizeNewsletterCampaignItems(items);

  const { error: deleteError } = await supabaseAdmin
    .from('newsletter_campaign_items')
    .delete()
    .eq('campaign_id', campaignId);

  if (deleteError) {
    throw deleteError;
  }

  if (normalizedItems.length === 0) {
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from('newsletter_campaign_items')
    .insert(normalizedItems.map((item) => ({
      campaign_id: campaignId,
      ...item,
    })));

  if (insertError) {
    throw insertError;
  }
}

export async function createNewsletterCampaign(input: NewsletterCampaignInput, userId: string) {
  const normalized = normalizeNewsletterCampaignInput(input);

  if (!normalized.title || !normalized.subject) {
    return { ok: false, error: 'Campaign title and subject are required.', campaign: null as NewsletterCampaign | null };
  }

  const { data, error } = await supabaseAdmin
    .from('newsletter_campaigns')
    .insert({
      ...normalized,
      status: 'draft',
      created_by: userId,
      updated_by: userId,
    })
    .select(campaignSelect)
    .single();

  if (error) {
    if (!isCampaignUnavailableError(error)) {
      logApiError('newsletter-campaigns.create', error);
    }

    return { ok: false, unavailable: isCampaignUnavailableError(error), error: error.message, campaign: null as NewsletterCampaign | null };
  }

  const campaign = data as NewsletterCampaign;

  try {
    await replaceNewsletterCampaignItems(campaign.id, input.items || []);
  } catch (itemsError) {
    logApiError('newsletter-campaigns.create-items', itemsError);
    return { ok: false, error: 'Campaign items could not be saved.', campaign };
  }

  return getNewsletterCampaignById(campaign.id);
}

export async function updateNewsletterCampaign(id: string, input: NewsletterCampaignInput, userId: string) {
  const current = await getNewsletterCampaignById(id);

  if (!current.ok || !current.campaign) {
    return { ok: false, unavailable: current.unavailable, error: current.error || 'Campaign not found.', campaign: current.campaign };
  }

  if (!isEditableNewsletterCampaign(current.campaign)) {
    return { ok: false, error: 'Sent campaigns cannot be edited.', campaign: current.campaign, code: 'not_editable' };
  }

  const normalized = normalizeNewsletterCampaignInput(input);

  if (!normalized.title || !normalized.subject) {
    return { ok: false, error: 'Campaign title and subject are required.', campaign: current.campaign };
  }

  const { data, error } = await supabaseAdmin
    .from('newsletter_campaigns')
    .update({
      ...normalized,
      updated_by: userId,
    })
    .eq('id', id)
    .select(campaignSelect)
    .single();

  if (error) {
    if (!isCampaignUnavailableError(error)) {
      logApiError('newsletter-campaigns.update', error);
    }

    return { ok: false, unavailable: isCampaignUnavailableError(error), error: error.message, campaign: current.campaign };
  }

  try {
    await replaceNewsletterCampaignItems(id, input.items || []);
  } catch (itemsError) {
    logApiError('newsletter-campaigns.update-items', itemsError);
    return { ok: false, error: 'Campaign items could not be saved.', campaign: data as NewsletterCampaign };
  }

  return getNewsletterCampaignById(id);
}

export async function deleteDraftNewsletterCampaign(id: string) {
  const current = await getNewsletterCampaignById(id);

  if (!current.ok || !current.campaign) {
    return { ok: false, unavailable: current.unavailable, error: current.error || 'Campaign not found.' };
  }

  if (current.campaign.status !== 'draft') {
    return { ok: false, error: 'Only draft campaigns can be deleted.', code: 'not_draft' };
  }

  const { error } = await supabaseAdmin
    .from('newsletter_campaigns')
    .delete()
    .eq('id', id);

  if (error) {
    logApiError('newsletter-campaigns.delete', error);
    return { ok: false, unavailable: isCampaignUnavailableError(error), error: error.message };
  }

  return { ok: true };
}

export async function getActiveSubscribersForCampaign(language: NewsletterLanguage) {
  const normalizedLanguage = normalizeNewsletterLanguage(language);
  const { data, error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select(`
      id,
      email,
      user_id,
      language,
      status,
      consent_at,
      confirmed_at,
      unsubscribed_at,
      unsubscribe_token,
      confirmation_token,
      source,
      created_at,
      updated_at
    `)
    .eq('status', 'active')
    .eq('language', normalizedLanguage)
    .order('created_at', { ascending: true })
    .limit(501);

  if (error) {
    logApiError('newsletter-campaigns.subscribers', error);
    return { ok: false, subscribers: [] as NewsletterSubscriber[], error: error.message };
  }

  return { ok: true, subscribers: (data ?? []) as NewsletterSubscriber[] };
}

async function updateCampaignStatus(id: string, status: NewsletterCampaignStatus, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabaseAdmin
    .from('newsletter_campaigns')
    .update({
      status,
      ...extra,
    })
    .eq('id', id)
    .select(campaignSelect)
    .single();

  if (error) {
    logApiError(`newsletter-campaigns.status.${status}`, error);
    return { ok: false, error: error.message, campaign: null as NewsletterCampaign | null };
  }

  return { ok: true, campaign: sortCampaignItems(data as NewsletterCampaign) };
}

export const markCampaignTestSent = (id: string) =>
  updateCampaignStatus(id, 'test_sent', { test_sent_at: new Date().toISOString() });

export const markCampaignSending = (id: string) =>
  updateCampaignStatus(id, 'sending');

export const markCampaignSent = (id: string) =>
  updateCampaignStatus(id, 'sent', { sent_at: new Date().toISOString() });

export async function logCampaignDelivery({
  campaignId,
  subscriberId,
  email,
  status,
  resendMessageId,
  errorMessage,
  sentAt,
  isTest = false,
}: {
  campaignId: string;
  subscriberId?: string | null;
  email: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  resendMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
  isTest?: boolean;
}) {
  const { error } = await supabaseAdmin
    .from('newsletter_delivery_logs')
    .insert({
      campaign_id: campaignId,
      subscriber_id: subscriberId || null,
      email: normalizeNewsletterEmail(email),
      campaign_key: campaignId,
      email_type: isTest ? 'manual' : 'newsletter',
      status,
      resend_message_id: resendMessageId || null,
      provider_message_id: resendMessageId || null,
      error_message: errorMessage || null,
      sent_at: sentAt || null,
    });

  if (error && !isNewsletterUnavailableError(error)) {
    logApiError('newsletter-campaigns.delivery-log', error);
  }
}
