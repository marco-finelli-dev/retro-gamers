import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const GUEST_IDENTITY_COOKIE_NAME = 'rg_guest_identity';
export const GUEST_IDENTITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export const GUEST_COMMENT_LIMITS = Object.freeze({
  shortWindowMs: 10 * 60 * 1000,
  shortWindowMax: 3,
  dailyWindowMs: 24 * 60 * 60 * 1000,
  dailyMax: 10,
  distinctIdentitiesPerIpDailyMax: 3,
  eventRetentionMs: 30 * 24 * 60 * 60 * 1000,
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COOKIE_VERSION = 'v1';

const getRuntimeSecret = () =>
  String(process.env.GUEST_IDENTITY_SECRET || '').trim();

const signValue = (namespace: string, value: string, secret: string) =>
  createHmac('sha256', secret)
    .update(`${namespace}:${value}`, 'utf8')
    .digest('base64url');

const signaturesMatch = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
};

export const isGuestCommentsConfigured = (secret = getRuntimeSecret()) => Boolean(secret);

export const normalizeGuestEmail = (value: unknown) =>
  String(value || '').trim().toLowerCase();

export const isValidGuestEmail = (value: string) =>
  value.length >= 5 &&
  value.length <= 254 &&
  EMAIL_PATTERN.test(value);

export const normalizeGuestDisplayName = (value: unknown) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

export const isValidGuestDisplayName = (value: string) =>
  value.length >= 2 &&
  value.length <= 60 &&
  !/[\u0000-\u001f\u007f]/.test(value);

export const getGuestIdentityContinuity = ({
  identityCreated,
  identityId,
  cookieIdentityId,
}: {
  identityCreated: boolean;
  identityId: string;
  cookieIdentityId: string | null;
}) => {
  if (identityCreated) return 'new';
  if (cookieIdentityId === identityId) return 'recognized';

  return 'mismatch';
};

export const getGuestRateLimitReason = ({
  shortCount,
  dailyCount,
}: {
  shortCount: number;
  dailyCount: number;
}) => {
  if (shortCount >= GUEST_COMMENT_LIMITS.shortWindowMax) {
    return 'short_rate_limit';
  }

  if (dailyCount >= GUEST_COMMENT_LIMITS.dailyMax) {
    return 'daily_rate_limit';
  }

  return null;
};

export const getRestrictedIpRateLimitReason = ({
  shortCount,
  dailyCount,
}: {
  shortCount: number;
  dailyCount: number;
}) => {
  if (shortCount >= 2) return 'restricted_ip_short_rate_limit';
  if (dailyCount >= 5) return 'restricted_ip_daily_rate_limit';
  return null;
};

export const hasTooManyGuestIdentitiesForIp = (identityCount: number) =>
  identityCount > GUEST_COMMENT_LIMITS.distinctIdentitiesPerIpDailyMax;

export const getGuestBanEvasionAssessment = (signals: Iterable<string>) => {
  const uniqueSignals = [...new Set(
    [...signals]
      .map((signal) => String(signal || '').trim())
      .filter(Boolean)
  )];

  return {
    signals: uniqueSignals,
    suspected: uniqueSignals.length >= 2,
  };
};

export const getGuestIdentityCookieOptions = (
  isProduction =
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
) => ({
  path: '/',
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  maxAge: GUEST_IDENTITY_COOKIE_MAX_AGE,
});

export function createGuestHmac(namespace: string, value: string, secret = getRuntimeSecret()) {
  if (!secret) {
    throw new Error('Guest identity configuration unavailable');
  }

  return signValue(namespace, value, secret);
}

export function createGuestIdentityToken(
  identityId: string,
  now = Date.now(),
  secret = getRuntimeSecret()
) {
  if (!UUID_PATTERN.test(identityId) || !secret) {
    throw new Error('Guest identity token cannot be created');
  }

  const expiresAt = Math.floor((now + GUEST_IDENTITY_COOKIE_MAX_AGE * 1000) / 1000);
  const payload = `${COOKIE_VERSION}.${identityId}.${expiresAt}`;
  const signature = signValue('guest-cookie', payload, secret);

  return `${payload}.${signature}`;
}

export function verifyGuestIdentityToken(
  token: unknown,
  now = Date.now(),
  secret = getRuntimeSecret()
) {
  if (typeof token !== 'string' || !secret) {
    return null;
  }

  const [version, identityId, expiresAtValue, signature, ...rest] = token.split('.');

  if (
    rest.length > 0 ||
    version !== COOKIE_VERSION ||
    !UUID_PATTERN.test(identityId || '') ||
    !/^\d+$/.test(expiresAtValue || '') ||
    !signature
  ) {
    return null;
  }

  const expiresAt = Number(expiresAtValue);

  if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= now) {
    return null;
  }

  const payload = `${version}.${identityId}.${expiresAtValue}`;
  const expectedSignature = signValue('guest-cookie', payload, secret);

  return signaturesMatch(signature, expectedSignature) ? identityId : null;
}

export const getGuestIdentityIdFromCookies = (cookies: {
  get: (name: string) => { value?: string } | undefined;
}, secret = getRuntimeSecret()) =>
  verifyGuestIdentityToken(cookies.get(GUEST_IDENTITY_COOKIE_NAME)?.value, Date.now(), secret);

export function setGuestIdentityCookie(
  cookies: {
    set: (name: string, value: string, options: Record<string, unknown>) => void;
  },
  identityId: string,
  secret = getRuntimeSecret()
) {
  cookies.set(
    GUEST_IDENTITY_COOKIE_NAME,
    createGuestIdentityToken(identityId, Date.now(), secret),
    getGuestIdentityCookieOptions()
  );
}

export function clearGuestIdentityCookie(cookies: {
  delete: (name: string, options: Record<string, unknown>) => void;
}) {
  cookies.delete(GUEST_IDENTITY_COOKIE_NAME, { path: '/' });
}

const normalizeForwardedIp = (value: string) => {
  const candidate = value.split(',')[0]?.trim() || '';

  if (isIP(candidate)) {
    return candidate;
  }

  const bracketMatch = candidate.match(/^\[([^\]]+)\](?::\d+)?$/);

  if (bracketMatch?.[1] && isIP(bracketMatch[1])) {
    return bracketMatch[1];
  }

  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);

  return ipv4WithPort?.[1] && isIP(ipv4WithPort[1])
    ? ipv4WithPort[1]
    : '';
};

export function getRequestIp(
  request: Request,
  isTrustedVercelRuntime = process.env.VERCEL === '1'
) {
  if (!isTrustedVercelRuntime) {
    return '';
  }

  const headerNames = ['x-vercel-forwarded-for', 'x-forwarded-for'];

  for (const headerName of headerNames) {
    const ip = normalizeForwardedIp(request.headers.get(headerName) || '');

    if (ip) {
      return ip;
    }
  }

  return '';
}

export const getAbbreviatedGuestIdentityId = (identityId: unknown) => {
  const normalized = String(identityId || '').trim();

  return UUID_PATTERN.test(normalized)
    ? `${normalized.slice(0, 8)}…${normalized.slice(-4)}`
    : '';
};
