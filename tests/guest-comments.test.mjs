import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GUEST_COMMENT_LIMITS,
  createGuestHmac,
  createGuestIdentityToken,
  clearGuestIdentityCookie,
  getGuestBanEvasionAssessment,
  getGuestIdentityContinuity,
  getGuestIdentityCookieOptions,
  getGuestRateLimitReason,
  getRestrictedIpRateLimitReason,
  getRequestIp,
  isValidGuestDisplayName,
  isValidGuestEmail,
  hasTooManyGuestIdentitiesForIp,
  normalizeGuestDisplayName,
  normalizeGuestEmail,
  verifyGuestIdentityToken,
} from '../src/lib/guest-comments.ts';
import {
  getCommunityAccessFromBans,
  getModerationExpiry,
} from '../src/lib/community-moderation.ts';

const TEST_SECRET = 'local-test-secret-that-is-not-used-by-the-application';
const IDENTITY_ID = 'c96f603f-857b-4dc7-9a8d-8b86eaa7192a';

test('normalizes guest email without provider-specific rewriting', () => {
  assert.equal(normalizeGuestEmail('  Name.Surname+retro@GMAIL.COM  '), 'name.surname+retro@gmail.com');
});

test('validates email and public display name boundaries', () => {
  assert.equal(isValidGuestEmail('reader@example.com'), true);
  assert.equal(isValidGuestEmail('invalid email'), false);
  assert.equal(normalizeGuestDisplayName('  Marco   Retro  '), 'Marco Retro');
  assert.equal(isValidGuestDisplayName('A'), false);
  assert.equal(isValidGuestDisplayName('Retro Reader'), true);
});

test('creates stable namespaced HMAC values', () => {
  const emailHmac = createGuestHmac('guest-email', 'reader@example.com', TEST_SECRET);
  const ipHmac = createGuestHmac('guest-ip', '203.0.113.12', TEST_SECRET);

  assert.equal(emailHmac, createGuestHmac('guest-email', 'reader@example.com', TEST_SECRET));
  assert.notEqual(emailHmac, ipHmac);
});

test('creates and validates opaque expiring guest cookie tokens', () => {
  const now = Date.UTC(2026, 6, 16);
  const token = createGuestIdentityToken(IDENTITY_ID, now, TEST_SECRET);

  assert.equal(verifyGuestIdentityToken(token, now, TEST_SECRET), IDENTITY_ID);
  assert.equal(
    verifyGuestIdentityToken(token, now + GUEST_COMMENT_LIMITS.eventRetentionMs * 7, TEST_SECRET),
    null
  );
  assert.equal(verifyGuestIdentityToken(`${token}tampered`, now, TEST_SECRET), null);
  assert.equal(token.includes('reader@example.com'), false);
});

test('keeps a recognized guest identity stable and detects another browser', () => {
  assert.equal(getGuestIdentityContinuity({
    identityCreated: true,
    identityId: IDENTITY_ID,
    cookieIdentityId: null,
  }), 'new');
  assert.equal(getGuestIdentityContinuity({
    identityCreated: false,
    identityId: IDENTITY_ID,
    cookieIdentityId: IDENTITY_ID,
  }), 'recognized');
  assert.equal(getGuestIdentityContinuity({
    identityCreated: false,
    identityId: IDENTITY_ID,
    cookieIdentityId: null,
  }), 'mismatch');
});

test('applies centralized short and daily guest limits', () => {
  assert.equal(getGuestRateLimitReason({ shortCount: 2, dailyCount: 9 }), null);
  assert.equal(getGuestRateLimitReason({ shortCount: 3, dailyCount: 3 }), 'short_rate_limit');
  assert.equal(getGuestRateLimitReason({ shortCount: 0, dailyCount: 10 }), 'daily_rate_limit');
  assert.equal(getRestrictedIpRateLimitReason({ shortCount: 1, dailyCount: 4 }), null);
  assert.equal(
    getRestrictedIpRateLimitReason({ shortCount: 2, dailyCount: 2 }),
    'restricted_ip_short_rate_limit'
  );
  assert.equal(
    getRestrictedIpRateLimitReason({ shortCount: 0, dailyCount: 5 }),
    'restricted_ip_daily_rate_limit'
  );
});

test('flags many identities without treating shared networks as an automatic block', () => {
  assert.equal(hasTooManyGuestIdentitiesForIp(3), false);
  assert.equal(hasTooManyGuestIdentitiesForIp(4), true);
  assert.deepEqual(getGuestBanEvasionAssessment(['ip_linked_to_blocked_identity']), {
    signals: ['ip_linked_to_blocked_identity'],
    suspected: false,
  });
  assert.equal(getGuestBanEvasionAssessment([
    'ip_linked_to_blocked_identity',
    'repeated_content',
  ]).suspected, true);
});

test('uses an HttpOnly SameSite cookie that is Secure in production', () => {
  assert.deepEqual(getGuestIdentityCookieOptions(true), {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 180,
  });
});

test('reads the first valid Vercel forwarded IP without exposing other values', () => {
  const request = new Request('https://www.retro-gamers.it/api/comments/create', {
    headers: {
      'x-vercel-forwarded-for': '203.0.113.15, 198.51.100.8',
    },
  });

  assert.equal(getRequestIp(request, true), '203.0.113.15');
});

test('does not trust client-provided proxy headers outside Vercel', () => {
  const request = new Request('https://www.retro-gamers.it/api/comments/create', {
    headers: {
      'x-forwarded-for': '203.0.113.15',
      'x-real-ip': '198.51.100.8',
      'cf-connecting-ip': '192.0.2.4',
    },
  });

  assert.equal(getRequestIp(request, false), '');
});

test('invalidates the guest identity cookie using only its opaque cookie name', () => {
  const deleted = [];

  clearGuestIdentityCookie({
    delete(name, options) {
      deleted.push({ name, options });
    },
  });

  assert.deepEqual(deleted, [{
    name: 'rg_guest_identity',
    options: { path: '/' },
  }]);
});

test('applies community restriction precedence without deleting prior content', () => {
  assert.equal(getCommunityAccessFromBans([], 'active'), 'active');
  assert.equal(getCommunityAccessFromBans([{ status: 'restricted' }]), 'restricted');
  assert.equal(getCommunityAccessFromBans([
    { status: 'restricted' },
    { status: 'blocked' },
  ]), 'blocked');
  assert.equal(getCommunityAccessFromBans([
    { status: 'blocked' },
    { status: 'banned' },
  ]), 'banned');
});

test('supports temporary, custom and permanent moderation durations', () => {
  const now = Date.UTC(2026, 6, 16, 12);

  assert.equal(
    getModerationExpiry({ duration: '24h', now }),
    new Date(now + 24 * 60 * 60 * 1000).toISOString()
  );
  assert.equal(
    getModerationExpiry({ duration: '7d', now }),
    new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  );
  assert.equal(
    getModerationExpiry({ duration: '30d', now }),
    new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
  );
  assert.equal(
    getModerationExpiry({
      duration: 'custom',
      customExpiresAt: '2026-08-01T12:00:00.000Z',
      now,
    }),
    '2026-08-01T12:00:00.000Z'
  );
  assert.equal(getModerationExpiry({ duration: 'permanent', now }), null);
  assert.throws(() => getModerationExpiry({
    duration: 'custom',
    customExpiresAt: '2026-07-15T12:00:00.000Z',
    now,
  }), /invalid_custom_expiry/);
});
