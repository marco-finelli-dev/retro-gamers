import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  perspectiveCookieName,
  urlSearchParamPreviewPathname,
  urlSearchParamPreviewPerspective,
  urlSearchParamPreviewSecret
} from '@sanity/preview-url-secret/constants';

const PREVIEW_COOKIE_MAX_AGE = 60 * 60;
const PREVIEW_COOKIE_MAX_AGE_MS = PREVIEW_COOKIE_MAX_AGE * 1000;
const DEFAULT_REDIRECT_PATH = '/';
const COOKIE_FORMAT_VERSION = 'v1';
const COOKIE_PAYLOAD_VERSION = 1;
const MIN_COOKIE_SECRET_LENGTH = 32;
const SIGNED_PREVIEW_COOKIE_NAME = 'rg-sanity-preview';

const UNSAFE_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const ALLOWED_PREVIEW_PERSPECTIVES = new Set(['drafts']);

const PREVIEW_SEARCH_PARAMS = [
  urlSearchParamPreviewPathname,
  urlSearchParamPreviewPerspective,
  urlSearchParamPreviewSecret
];

export const sanityPreviewPerspectiveCookieName = perspectiveCookieName;
export const sanityPreviewSessionCookieName = SIGNED_PREVIEW_COOKIE_NAME;

function readLocalEnvValue(name: string) {
  if (!import.meta.env.DEV) {
    return '';
  }

  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) {
      continue;
    }

    const match = readFileSync(file, 'utf8').match(
      new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'm')
    );

    if (match?.[1]) {
      return match[1].replace(/^['"]|['"]$/g, '').trim();
    }
  }

  return '';
}

function getPreviewCookieSecret() {
  return String(
    process.env.SANITY_PREVIEW_COOKIE_SECRET ||
      readLocalEnvValue('SANITY_PREVIEW_COOKIE_SECRET') ||
      ''
  ).trim();
}

export function hasPreviewCookieSecret() {
  return getPreviewCookieSecret().length >= MIN_COOKIE_SECRET_LENGTH;
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function signPreviewCookiePayload(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret)
    .update(`${COOKIE_FORMAT_VERSION}.${encodedPayload}`)
    .digest('base64url');
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    const maxLength = Math.max(leftBuffer.length, rightBuffer.length, 1);
    timingSafeEqual(Buffer.alloc(maxLength), Buffer.alloc(maxLength));

    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignedPreviewCookie({
  perspective = 'drafts',
  expiresAt = Date.now() + PREVIEW_COOKIE_MAX_AGE_MS
}: {
  perspective?: string;
  expiresAt?: number;
} = {}) {
  const secret = getPreviewCookieSecret();

  if (!hasPreviewCookieSecret()) {
    throw new Error('Preview cookie signing is not configured.');
  }

  if (!ALLOWED_PREVIEW_PERSPECTIVES.has(perspective)) {
    throw new Error('Preview perspective is not allowed.');
  }

  const payload = encodeBase64Url(JSON.stringify({
    v: COOKIE_PAYLOAD_VERSION,
    p: perspective,
    exp: expiresAt
  }));
  const signature = signPreviewCookiePayload(payload, secret);

  return `${COOKIE_FORMAT_VERSION}.${payload}.${signature}`;
}

export function verifySignedPreviewCookie(value: string | undefined) {
  if (!value || !hasPreviewCookieSecret()) {
    return {
      isValid: false,
      perspective: null
    };
  }

  const [version, encodedPayload, signature, extra] = value.split('.');

  if (
    extra ||
    version !== COOKIE_FORMAT_VERSION ||
    !encodedPayload ||
    !signature
  ) {
    return {
      isValid: false,
      perspective: null
    };
  }

  const expectedSignature = signPreviewCookiePayload(
    encodedPayload,
    getPreviewCookieSecret()
  );

  if (!constantTimeEqual(signature, expectedSignature)) {
    return {
      isValid: false,
      perspective: null
    };
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload));
    const perspective = payload?.p;
    const expiresAt = Number(payload?.exp);

    if (
      payload?.v !== COOKIE_PAYLOAD_VERSION ||
      !ALLOWED_PREVIEW_PERSPECTIVES.has(perspective) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      return {
        isValid: false,
        perspective: null
      };
    }

    return {
      isValid: true,
      perspective
    };
  } catch {
    return {
      isValid: false,
      perspective: null
    };
  }
}

export function isCrossSiteIframeRequest(request: Request) {
  return (
    request.headers.get('sec-fetch-dest') === 'iframe' &&
    request.headers.get('sec-fetch-site') === 'cross-site'
  );
}

export function getDraftModeCookieOptions({ partitioned = false } = {}) {
  const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';

  return {
    httpOnly: true,
    maxAge: PREVIEW_COOKIE_MAX_AGE,
    path: '/',
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    ...(partitioned ? { partitioned: true } : {})
  } as const;
}

export function getPerspectiveCookieOptions({ partitioned = false } = {}) {
  const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';

  return {
    httpOnly: false,
    maxAge: PREVIEW_COOKIE_MAX_AGE,
    path: '/',
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    ...(partitioned ? { partitioned: true } : {})
  } as const;
}

export function isDraftMode(cookies: {
  get: (name: string) => { value?: string } | undefined;
}) {
  const previewCookie = cookies.get(sanityPreviewSessionCookieName)?.value;
  const verification = verifySignedPreviewCookie(previewCookie);

  return verification.isValid && verification.perspective === 'drafts';
}

function stripPreviewSearchParams(url: URL) {
  for (const param of PREVIEW_SEARCH_PARAMS) {
    url.searchParams.delete(param);
  }
}

export function getSafeRedirectPath(value: string | null | undefined) {
  const candidate = String(value || '').trim();

  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    UNSAFE_SCHEME_PATTERN.test(candidate) ||
    CONTROL_CHARACTER_PATTERN.test(candidate)
  ) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const url = new URL(candidate, 'https://www.retro-gamers.it');

    if (url.origin !== 'https://www.retro-gamers.it') {
      return DEFAULT_REDIRECT_PATH;
    }

    stripPreviewSearchParams(url);

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

export function setDraftModeCookies(
  cookies: {
    set: (name: string, value: string, options: Record<string, unknown>) => void;
  },
  {
    perspective = 'drafts',
    partitioned = false
  }: {
    perspective?: string;
    partitioned?: boolean;
  } = {}
) {
  cookies.set(
    sanityPreviewSessionCookieName,
    createSignedPreviewCookie({ perspective }),
    getDraftModeCookieOptions({ partitioned })
  );

  cookies.set(
    sanityPreviewPerspectiveCookieName,
    perspective,
    getPerspectiveCookieOptions({ partitioned })
  );
}

export function clearDraftModeCookies(cookies: {
  set: (name: string, value: string, options: Record<string, unknown>) => void;
}) {
  for (const partitioned of [false, true]) {
    cookies.set(sanityPreviewSessionCookieName, '', {
      ...getDraftModeCookieOptions({ partitioned }),
      maxAge: 0
    });
    cookies.set(sanityPreviewPerspectiveCookieName, '', {
      ...getPerspectiveCookieOptions({ partitioned }),
      maxAge: 0
    });
  }
}
