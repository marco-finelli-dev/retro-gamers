type RgAnalyticsLanguage = 'it' | 'en';
type RgCommentStatus = 'published' | 'pending';
type RgRegistrationStatus = 'active' | 'pending_verification';
type RgLoginMethod = 'email' | 'google' | 'facebook' | 'apple';
type RgLoginDestination = 'account' | 'previous_page' | 'home';
type RgAffiliateProvider = 'amazon' | 'ebay' | 'gog' | 'other';
type RgAffiliatePlacement = 'affiliate_box' | 'article_body' | 'hardware_card' | 'product_cta';
type RgEventParameterValue = string | number | boolean;
type RgSanitizedParameters = Record<string, RgEventParameterValue>;

export type RgAnalyticsEventName =
  | 'article_view'
  | 'comment_submit_success'
  | 'reader_vote_success'
  | 'account_registration_success'
  | 'download_start'
  | 'login_success'
  | 'playable_classic_open'
  | 'affiliate_click';

export type RgArticleViewParameters = {
  language: RgAnalyticsLanguage;
  content_type: string;
  category_slug: string;
  article_slug: string;
  author_slug?: string;
};

export type RgCommentSubmitSuccessParameters = {
  language: RgAnalyticsLanguage;
  article_slug: string;
  is_reply: boolean;
  is_guest: boolean;
  status?: RgCommentStatus;
};

export type RgReaderVoteSuccessParameters = {
  language: RgAnalyticsLanguage;
  article_slug: string;
  score: number;
};

export type RgAccountRegistrationSuccessParameters = {
  language: RgAnalyticsLanguage;
  method: 'email';
  status?: RgRegistrationStatus;
};

export type RgDownloadStartParameters = {
  language: RgAnalyticsLanguage;
  classic_slug: string;
  package_type?: string;
  platform_slug?: string;
  requires_login?: boolean;
};

export type RgLoginSuccessParameters = {
  language: RgAnalyticsLanguage;
  method: RgLoginMethod;
  destination?: RgLoginDestination;
};

export type RgPlayableClassicOpenParameters = {
  language: RgAnalyticsLanguage;
  classic_slug: string;
  distribution_type?: string;
  legal_status?: string;
  internal_download_available?: boolean;
  requires_login?: boolean;
};

export type RgAffiliateClickParameters = {
  language: RgAnalyticsLanguage;
  article_slug?: string;
  provider: RgAffiliateProvider;
  placement: RgAffiliatePlacement;
  content_type?: string;
};

export type RgAnalyticsEventParameters = {
  article_view: RgArticleViewParameters;
  comment_submit_success: RgCommentSubmitSuccessParameters;
  reader_vote_success: RgReaderVoteSuccessParameters;
  account_registration_success: RgAccountRegistrationSuccessParameters;
  download_start: RgDownloadStartParameters;
  login_success: RgLoginSuccessParameters;
  playable_classic_open: RgPlayableClassicOpenParameters;
  affiliate_click: RgAffiliateClickParameters;
};

type RgAnalyticsConsentState = {
  necessary?: boolean;
  analytics?: boolean;
  thirdParty?: boolean;
  updatedAt?: string | null;
};

type RgConsentApi = {
  get?: () => RgAnalyticsConsentState;
  open?: () => void;
  save?: (consent: Partial<RgAnalyticsConsentState>) => RgAnalyticsConsentState;
};

type RgQueuedEvent = {
  id: number;
  name: RgAnalyticsEventName;
  parameters: RgSanitizedParameters;
};

type RgGtag = (
  command: 'event',
  eventName: RgAnalyticsEventName,
  parameters: RgSanitizedParameters
) => void;

declare global {
  interface Window {
    gtag?: RgGtag;
    RetroGamersConsent?: RgConsentApi;
  }
}

const CONSENT_STORAGE_KEY = 'retro-gamers-cookie-consent';
const CONSENT_EVENT_NAME = 'retro-gamers:cookie-consent';
const MAX_QUEUE_LENGTH = 20;
const MAX_FLUSH_ATTEMPTS = 10;
const FLUSH_DELAY_MS = 250;
const allowedEvents = new Set<RgAnalyticsEventName>([
  'article_view',
  'comment_submit_success',
  'reader_vote_success',
  'account_registration_success',
  'download_start',
  'login_success',
  'playable_classic_open',
  'affiliate_click',
]);

let queue: RgQueuedEvent[] = [];
let nextEventId = 1;
let initialized = false;
let analyticsConsent: boolean | null = null;
let flushTimer: number | null = null;
let flushAttempts = 0;

const isBrowser = () => typeof window !== 'undefined';

const isPlainParameterValue = (value: unknown): value is RgEventParameterValue =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

const normalizeShortToken = (value: unknown, maxLength = 120) => {
  if (typeof value !== 'string') return '';

  const token = value.trim().toLowerCase();

  if (!token || token.length > maxLength) return '';
  if (/^https?:\/\//i.test(token)) return '';
  if (token.includes('@')) return '';
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(token)) return '';

  return token;
};

const normalizeLanguage = (value: unknown): RgAnalyticsLanguage | null =>
  value === 'en' || value === 'it' ? value : null;

const normalizeBoolean = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;

const normalizeCommentStatus = (value: unknown): RgCommentStatus | null =>
  value === 'published' || value === 'pending' ? value : null;

const normalizeRegistrationStatus = (value: unknown): RgRegistrationStatus | null =>
  value === 'active' || value === 'pending_verification' ? value : null;

const normalizeLoginMethod = (value: unknown): RgLoginMethod | null =>
  value === 'email' || value === 'google' || value === 'facebook' || value === 'apple'
    ? value
    : null;

const normalizeLoginDestination = (value: unknown): RgLoginDestination | null =>
  value === 'account' || value === 'previous_page' || value === 'home'
    ? value
    : null;

const normalizeAffiliateProvider = (value: unknown): RgAffiliateProvider | null =>
  value === 'amazon' || value === 'ebay' || value === 'gog' || value === 'other'
    ? value
    : null;

const normalizeAffiliatePlacement = (value: unknown): RgAffiliatePlacement | null =>
  value === 'affiliate_box' ||
  value === 'article_body' ||
  value === 'hardware_card' ||
  value === 'product_cta'
    ? value
    : null;

export function getRgAffiliateProviderFromUrl(value: string): RgAffiliateProvider {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');

    if (hostname === 'amzn.to' || hostname.endsWith('.amzn.to') || hostname.includes('amazon.')) {
      return 'amazon';
    }

    if (hostname.includes('ebay.') || hostname.endsWith('.rover.ebay.com')) {
      return 'ebay';
    }

    if (hostname === 'gog.com' || hostname.endsWith('.gog.com')) {
      return 'gog';
    }
  } catch {
    return 'other';
  }

  return 'other';
}

const normalizeScore = (value: unknown) => {
  const score = Number(value);

  if (
    !Number.isFinite(score) ||
    score < 1 ||
    score > 10 ||
    !Number.isInteger(score * 2)
  ) {
    return null;
  }

  return score;
};

const hasOnlyPlainParameters = (parameters: Record<string, unknown>) =>
  Object.values(parameters).every(isPlainParameterValue);

const hasOnlyKnownKeys = (parameters: Record<string, unknown>, knownKeys: string[]) => {
  const allowedKeys = new Set(knownKeys);

  return Object.keys(parameters).every((key) => allowedKeys.has(key));
};

const sanitizeParameters = <TName extends RgAnalyticsEventName>(
  name: TName,
  parameters: RgAnalyticsEventParameters[TName]
): RgSanitizedParameters | null => {
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    return null;
  }

  const rawParameters = parameters as Record<string, unknown>;

  if (!hasOnlyPlainParameters(
    Object.fromEntries(
      Object.entries(rawParameters).filter(([, value]) => value !== undefined && value !== null)
    )
  )) {
    return null;
  }

  const language = normalizeLanguage(rawParameters.language);

  if (!language) {
    return null;
  }

  if (name === 'article_view') {
    if (!hasOnlyKnownKeys(rawParameters, [
      'language',
      'content_type',
      'category_slug',
      'article_slug',
      'author_slug',
    ])) {
      return null;
    }

    const articleSlug = normalizeShortToken(rawParameters.article_slug, 160);
    const contentType = normalizeShortToken(rawParameters.content_type, 40);
    const categorySlug = normalizeShortToken(rawParameters.category_slug, 80);
    const authorSlug = normalizeShortToken(rawParameters.author_slug, 120);

    if (!articleSlug || !contentType || !categorySlug) {
      return null;
    }

    return {
      language,
      content_type: contentType,
      category_slug: categorySlug,
      article_slug: articleSlug,
      ...(authorSlug ? { author_slug: authorSlug } : {}),
    };
  }

  if (name === 'comment_submit_success') {
    if (!hasOnlyKnownKeys(rawParameters, [
      'language',
      'article_slug',
      'is_reply',
      'is_guest',
      'status',
    ])) {
      return null;
    }

    const articleSlug = normalizeShortToken(rawParameters.article_slug, 160);
    const isReply = normalizeBoolean(rawParameters.is_reply);
    const isGuest = normalizeBoolean(rawParameters.is_guest);
    const status = normalizeCommentStatus(rawParameters.status);

    if (!articleSlug || isReply === null || isGuest === null) {
      return null;
    }

    return {
      language,
      article_slug: articleSlug,
      is_reply: isReply,
      is_guest: isGuest,
      ...(status ? { status } : {}),
    };
  }

  if (name === 'reader_vote_success') {
    if (!hasOnlyKnownKeys(rawParameters, [
      'language',
      'article_slug',
      'score',
    ])) {
      return null;
    }

    const articleSlug = normalizeShortToken(rawParameters.article_slug, 160);
    const score = normalizeScore(rawParameters.score);

    if (!articleSlug || score === null) {
      return null;
    }

    return {
      language,
      article_slug: articleSlug,
      score,
    };
  }

  if (name === 'account_registration_success') {
    if (!hasOnlyKnownKeys(rawParameters, [
      'language',
      'method',
      'status',
    ])) {
      return null;
    }

    const method = rawParameters.method === 'email' ? 'email' : null;
    const status = normalizeRegistrationStatus(rawParameters.status);

    if (!method) {
      return null;
    }

    return {
      language,
      method,
      ...(status ? { status } : {}),
    };
  }

  if (name === 'download_start') {
    if (!hasOnlyKnownKeys(rawParameters, [
      'language',
      'classic_slug',
      'package_type',
      'platform_slug',
      'requires_login',
    ])) {
      return null;
    }

    const classicSlug = normalizeShortToken(rawParameters.classic_slug, 160);
    const packageType = normalizeShortToken(rawParameters.package_type, 60);
    const platformSlug = normalizeShortToken(rawParameters.platform_slug, 120);
    const requiresLogin = normalizeBoolean(rawParameters.requires_login);

    if (!classicSlug) {
      return null;
    }

    return {
      language,
      classic_slug: classicSlug,
      ...(packageType ? { package_type: packageType } : {}),
      ...(platformSlug ? { platform_slug: platformSlug } : {}),
      ...(requiresLogin !== null ? { requires_login: requiresLogin } : {}),
    };
  }

  if (name === 'login_success') {
    if (!hasOnlyKnownKeys(rawParameters, [
      'language',
      'method',
      'destination',
    ])) {
      return null;
    }

    const method = normalizeLoginMethod(rawParameters.method);
    const destination = normalizeLoginDestination(rawParameters.destination);

    if (!method) {
      return null;
    }

    return {
      language,
      method,
      ...(destination ? { destination } : {}),
    };
  }

  if (name === 'playable_classic_open') {
    if (!hasOnlyKnownKeys(rawParameters, [
      'language',
      'classic_slug',
      'distribution_type',
      'legal_status',
      'internal_download_available',
      'requires_login',
    ])) {
      return null;
    }

    const classicSlug = normalizeShortToken(rawParameters.classic_slug, 160);
    const distributionType = normalizeShortToken(rawParameters.distribution_type, 80);
    const legalStatus = normalizeShortToken(rawParameters.legal_status, 80);
    const internalDownloadAvailable = normalizeBoolean(rawParameters.internal_download_available);
    const requiresLogin = normalizeBoolean(rawParameters.requires_login);

    if (!classicSlug) {
      return null;
    }

    return {
      language,
      classic_slug: classicSlug,
      ...(distributionType ? { distribution_type: distributionType } : {}),
      ...(legalStatus ? { legal_status: legalStatus } : {}),
      ...(internalDownloadAvailable !== null
        ? { internal_download_available: internalDownloadAvailable }
        : {}),
      ...(requiresLogin !== null ? { requires_login: requiresLogin } : {}),
    };
  }

  if (name === 'affiliate_click') {
    if (!hasOnlyKnownKeys(rawParameters, [
      'language',
      'article_slug',
      'provider',
      'placement',
      'content_type',
    ])) {
      return null;
    }

    const articleSlug = normalizeShortToken(rawParameters.article_slug, 160);
    const provider = normalizeAffiliateProvider(rawParameters.provider);
    const placement = normalizeAffiliatePlacement(rawParameters.placement);
    const contentType = normalizeShortToken(rawParameters.content_type, 40);

    if (!provider || !placement) {
      return null;
    }

    return {
      language,
      provider,
      placement,
      ...(articleSlug ? { article_slug: articleSlug } : {}),
      ...(contentType ? { content_type: contentType } : {}),
    };
  }

  return null;
};

const readStoredConsent = (): boolean | null => {
  if (!isBrowser()) return null;

  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as RgAnalyticsConsentState;
    return parsed.analytics === true;
  } catch {
    return null;
  }
};

const readCurrentConsent = (): boolean | null => {
  if (!isBrowser()) return null;

  const storedConsent = readStoredConsent();
  if (storedConsent !== null) {
    return storedConsent;
  }

  try {
    const apiConsent = window.RetroGamersConsent?.get?.();
    return apiConsent?.updatedAt ? apiConsent.analytics === true : null;
  } catch {
    return null;
  }
};

const cancelFlushTimer = () => {
  if (!isBrowser() || flushTimer === null) return;

  window.clearTimeout(flushTimer);
  flushTimer = null;
};

const clearQueue = () => {
  queue = [];
  flushAttempts = 0;
  cancelFlushTimer();
};

const sendEvent = (event: RgQueuedEvent) => {
  if (!isBrowser() || typeof window.gtag !== 'function') return false;

  window.gtag('event', event.name, event.parameters);
  return true;
};

const flushQueue = () => {
  if (!isBrowser()) return;

  if (analyticsConsent !== true) {
    if (analyticsConsent === false) {
      clearQueue();
    }

    return;
  }

  if (typeof window.gtag !== 'function') {
    if (queue.length === 0 || flushAttempts >= MAX_FLUSH_ATTEMPTS) {
      clearQueue();
      return;
    }

    if (flushTimer === null) {
      flushAttempts += 1;
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        flushQueue();
      }, FLUSH_DELAY_MS);
    }

    return;
  }

  const pending = queue;
  queue = [];
  flushAttempts = 0;
  cancelFlushTimer();

  for (const event of pending) {
    sendEvent(event);
  }
};

const enqueueEvent = (event: RgQueuedEvent) => {
  if (queue.some((queuedEvent) => queuedEvent.id === event.id)) return;

  queue = [...queue.slice(Math.max(0, queue.length - MAX_QUEUE_LENGTH + 1)), event];
};

const applyConsent = (consent: boolean | null) => {
  analyticsConsent = consent;

  if (analyticsConsent === false) {
    clearQueue();
    return;
  }

  if (analyticsConsent === true) {
    flushQueue();
  }
};

const initAnalyticsClient = () => {
  if (!isBrowser() || initialized) return;

  initialized = true;
  applyConsent(readCurrentConsent());

  window.addEventListener(CONSENT_EVENT_NAME, (event: Event) => {
    const consent = event instanceof CustomEvent
      ? (event.detail as RgAnalyticsConsentState)
      : null;

    applyConsent(consent?.analytics === true);
  });
};

export function trackRgEvent<TName extends RgAnalyticsEventName>(
  eventName: TName,
  parameters: RgAnalyticsEventParameters[TName]
) {
  if (!isBrowser() || !allowedEvents.has(eventName)) return;

  initAnalyticsClient();

  const sanitizedParameters = sanitizeParameters(eventName, parameters);
  if (!sanitizedParameters) return;

  const event = {
    id: nextEventId,
    name: eventName,
    parameters: sanitizedParameters,
  };
  nextEventId += 1;

  const currentConsent = analyticsConsent ?? readCurrentConsent();
  applyConsent(currentConsent);

  if (analyticsConsent === false) {
    return;
  }

  enqueueEvent(event);
  flushQueue();
}
