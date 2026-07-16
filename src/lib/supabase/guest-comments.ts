import {
  GUEST_COMMENT_LIMITS,
  clearGuestIdentityCookie,
  createGuestHmac,
  getGuestBanEvasionAssessment,
  getGuestIdentityContinuity,
  getGuestIdentityIdFromCookies,
  getGuestRateLimitReason,
  getRestrictedIpRateLimitReason,
  getRequestIp,
  hasTooManyGuestIdentitiesForIp,
  isGuestCommentsConfigured,
  isValidGuestDisplayName,
  isValidGuestEmail,
  normalizeGuestDisplayName,
  normalizeGuestEmail,
  setGuestIdentityCookie,
} from '../guest-comments';
import { getGuestIdentitySecret } from '../guest-comments-runtime';
import {
  getGuestCommunityAccess,
  getIpBanEvasionSignals,
} from './community-bans';
import { assessCommentModeration } from './comment-moderation';
import { supabaseAdmin } from './server';

export type GuestCommentLanguage = 'it' | 'en';

export type GuestCommentInput = {
  authorName?: unknown;
  authorEmail?: unknown;
  website?: unknown;
  articleSlug: string;
  articleLanguage: GuestCommentLanguage;
  articleTitle: string;
  articleUrl: string;
  body: string;
  parentId: string | null;
};

type GuestIdentity = {
  id: string;
  canonical_display_name: string;
  status: 'active' | 'restricted' | 'blocked' | string;
  approved_comments_count: number;
};

type GuestSubmissionResult =
  | {
      ok: true;
      status: number;
      payload: Record<string, unknown>;
      comment: {
        id: string;
        user_id: null;
        parent_id: string | null;
        status: 'pending';
        created_at: string;
        article_slug: string;
        article_title: string;
        article_url: string;
        article_language: GuestCommentLanguage;
      } | null;
      authorName: string;
    }
  | {
      ok: false;
      status: number;
      payload: Record<string, unknown>;
    };

const guestCopy = {
  it: {
    invalidName: 'Inserisci un nome pubblico valido, tra 2 e 60 caratteri.',
    invalidEmail: 'Inserisci un indirizzo email valido.',
    unavailable: 'I commenti ospite non sono disponibili in questo momento. Riprova più tardi.',
    retry: 'Commento non inviato. Riprova più tardi.',
    rateLimited: 'Hai inviato diversi commenti in poco tempo. Attendi prima di riprovare.',
    parentUnavailable: 'Il commento a cui vuoi rispondere non è disponibile.',
    nestedReply: 'Le risposte sono consentite solo al primo livello.',
    parentMismatch: 'Risposta non coerente con l’articolo.',
    duplicateReply: 'Hai già risposto a questo commento come ospite.',
    blocked:
      'Non è possibile inviare questo commento. Contatta la redazione se ritieni che si tratti di un errore.',
    sent:
      'Commento inviato alla moderazione. Crea un account per avere un profilo, ricevere le risposte e partecipare pienamente alla community.',
    mismatch:
      'Il commento è stato inviato alla moderazione per una verifica aggiuntiva.',
  },
  en: {
    invalidName: 'Enter a valid public name between 2 and 60 characters.',
    invalidEmail: 'Enter a valid email address.',
    unavailable: 'Guest comments are not available right now. Please try again later.',
    retry: 'The comment could not be submitted. Please try again later.',
    rateLimited: 'You have submitted several comments in a short time. Please wait before trying again.',
    parentUnavailable: 'The comment you are replying to is not available.',
    nestedReply: 'Replies are only allowed at the first level.',
    parentMismatch: 'The reply does not match this article.',
    duplicateReply: 'You have already replied to this comment as a guest.',
    blocked:
      'This comment cannot be submitted. Please contact the editorial team if you believe this is an error.',
    sent:
      'Your comment has been sent for moderation. Create an account to build your profile, receive replies and take part fully in the community.',
    mismatch:
      'Your comment has been sent for moderation for an additional review.',
  },
} as const;

export const isMissingGuestCommentSchemaError = (
  error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined
) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return (
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST205' ||
    (
      (
        message.includes('guest_identities') ||
        message.includes('guest_comment_events') ||
        message.includes('guest_identity_id') ||
        message.includes('guest_display_name') ||
        message.includes('author_type') ||
        message.includes('abuse_flags')
      ) &&
      (
        message.includes('does not exist') ||
        message.includes('schema cache') ||
        message.includes('column') ||
        message.includes('relationship')
      )
    )
  );
};

const countEvents = async (
  column: 'guest_identity_id' | 'ip_hmac',
  value: string,
  since: string
) => {
  if (!value) return 0;

  const { count, error } = await supabaseAdmin
    .from('guest_comment_events')
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', since);

  if (error) throw error;

  return count ?? 0;
};

const recordEvent = async ({
  identityId,
  commentId = null,
  ipHmac,
  bodyHmac,
  flags,
}: {
  identityId: string;
  commentId?: string | null;
  ipHmac: string | null;
  bodyHmac: string;
  flags: string[];
}) => {
  const { error } = await supabaseAdmin
    .from('guest_comment_events')
    .insert({
      guest_identity_id: identityId,
      comment_id: commentId,
      ip_hmac: ipHmac,
      body_hmac: bodyHmac,
      flags,
    });

  if (error) throw error;
};

const findIdentityByEmailHmac = async (emailHmac: string) => {
  const { data, error } = await supabaseAdmin
    .from('guest_identities')
    .select('id, canonical_display_name, status, approved_comments_count')
    .eq('email_hmac', emailHmac)
    .maybeSingle();

  if (error) throw error;

  return data as GuestIdentity | null;
};

const findIdentityById = async (identityId: string) => {
  const { data, error } = await supabaseAdmin
    .from('guest_identities')
    .select('id, canonical_display_name, status, approved_comments_count')
    .eq('id', identityId)
    .maybeSingle();

  if (error) throw error;

  return data as GuestIdentity | null;
};

const createIdentity = async (emailHmac: string, displayName: string) => {
  const { data, error } = await supabaseAdmin
    .from('guest_identities')
    .insert({
      email_hmac: emailHmac,
      canonical_display_name: displayName,
      status: 'active',
    })
    .select('id, canonical_display_name, status, approved_comments_count')
    .single();

  if (error) {
    if (error.code === '23505') {
      return {
        identity: await findIdentityByEmailHmac(emailHmac),
        created: false,
      };
    }

    throw error;
  }

  return {
    identity: data as GuestIdentity,
    created: true,
  };
};

export async function getRecognizedGuestIdentity(cookies: {
  get: (name: string) => { value?: string } | undefined;
}) {
  const guestIdentitySecret = getGuestIdentitySecret();

  if (!isGuestCommentsConfigured(guestIdentitySecret)) {
    return null;
  }

  const identityId = getGuestIdentityIdFromCookies(cookies, guestIdentitySecret);

  if (!identityId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('guest_identities')
    .select('id, canonical_display_name, status, approved_comments_count')
    .eq('id', identityId)
    .maybeSingle();

  if (error) {
    if (isMissingGuestCommentSchemaError(error)) {
      return null;
    }

    throw error;
  }

  if (!data || data.status === 'blocked') {
    return null;
  }

  return data as GuestIdentity;
}

export async function createGuestComment({
  input,
  request,
  cookies,
}: {
  input: GuestCommentInput;
  request: Request;
  cookies: {
    get: (name: string) => { value?: string } | undefined;
    set: (name: string, value: string, options: Record<string, unknown>) => void;
    delete: (name: string, options: Record<string, unknown>) => void;
  };
}): Promise<GuestSubmissionResult> {
  const copy = guestCopy[input.articleLanguage];
  const displayName = normalizeGuestDisplayName(input.authorName);
  const email = normalizeGuestEmail(input.authorEmail);
  const honeypot = String(input.website || '').trim();
  const guestIdentitySecret = getGuestIdentitySecret();

  if (honeypot) {
    return {
      ok: true,
      status: 202,
      payload: { ok: true, message: copy.sent },
      comment: null,
      authorName: '',
    };
  }

  if (!isValidGuestDisplayName(displayName)) {
    return { ok: false, status: 400, payload: { ok: false, error: copy.invalidName } };
  }

  if (!isValidGuestEmail(email)) {
    return { ok: false, status: 400, payload: { ok: false, error: copy.invalidEmail } };
  }

  if (!isGuestCommentsConfigured(guestIdentitySecret)) {
    return { ok: false, status: 503, payload: { ok: false, error: copy.unavailable } };
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const shortWindowIso = new Date(now - GUEST_COMMENT_LIMITS.shortWindowMs).toISOString();
  const dailyWindowIso = new Date(now - GUEST_COMMENT_LIMITS.dailyWindowMs).toISOString();
  const retentionIso = new Date(now - GUEST_COMMENT_LIMITS.eventRetentionMs).toISOString();
  const emailHmac = createGuestHmac('guest-email', email, guestIdentitySecret);
  const bodyHmac = createGuestHmac(
    'guest-body',
    input.body.replace(/\s+/g, ' ').trim(),
    guestIdentitySecret
  );
  const requestIp = getRequestIp(request);
  const ipHmac = requestIp
    ? createGuestHmac('guest-ip', requestIp, guestIdentitySecret)
    : null;
  const recognizedCookieIdentityId = getGuestIdentityIdFromCookies(
    cookies,
    guestIdentitySecret
  );

  await supabaseAdmin
    .from('guest_comment_events')
    .delete()
    .lt('created_at', retentionIso);

  if (recognizedCookieIdentityId) {
    const cookieIdentity = await findIdentityById(recognizedCookieIdentityId);

    if (cookieIdentity) {
      const cookieAccess = await getGuestCommunityAccess({
        identityId: cookieIdentity.id,
        identityStatus: cookieIdentity.status,
      });

      if (cookieAccess.state === 'blocked' || cookieAccess.state === 'banned') {
        await recordEvent({
          identityId: cookieIdentity.id,
          ipHmac,
          bodyHmac,
          flags: ['blocked_cookie'],
        });
        clearGuestIdentityCookie(cookies);

        return { ok: false, status: 403, payload: { ok: false, error: copy.blocked } };
      }
    }
  }

  let identity = await findIdentityByEmailHmac(emailHmac);
  let identityCreated = false;

  if (!identity) {
    const createResult = await createIdentity(emailHmac, displayName);
    identity = createResult.identity;
    identityCreated = createResult.created;
  }

  if (!identity) {
    return { ok: false, status: 500, payload: { ok: false, error: copy.retry } };
  }

  const identityAccess = await getGuestCommunityAccess({
    identityId: identity.id,
    identityStatus: identity.status,
  });

  const identityContinuity = getGuestIdentityContinuity({
    identityCreated,
    identityId: identity.id,
    cookieIdentityId: recognizedCookieIdentityId,
  });
  const identityMismatch = identityContinuity === 'mismatch';
  const flags = new Set<string>();
  const evasionSignals = new Set<string>();

  if (identityMismatch) {
    flags.add('identity_mismatch');
    evasionSignals.add('identity_mismatch');
  }
  if (identityAccess.state === 'restricted') flags.add('restricted_identity');

  if (identityAccess.state === 'blocked' || identityAccess.state === 'banned') {
    flags.add('blocked_identity');
    await recordEvent({
      identityId: identity.id,
      ipHmac,
      bodyHmac,
      flags: [...flags],
    });

    if (recognizedCookieIdentityId === identity.id) {
      clearGuestIdentityCookie(cookies);
    }

    return { ok: false, status: 403, payload: { ok: false, error: copy.blocked } };
  }

  const ipSignals = await getIpBanEvasionSignals({
    ipHmac,
    currentIdentityId: identity.id,
    since: retentionIso,
  });

  if (ipSignals.linkedToBlockedIdentity) {
    flags.add('ip_linked_to_blocked_identity');
    evasionSignals.add('ip_linked_to_blocked_identity');
  }

  if (ipSignals.activeIpState === 'restricted') {
    flags.add('ip_moderation_required');
  }

  if (ipSignals.activeIpState === 'blocked' || ipSignals.activeIpState === 'banned') {
    flags.add('temporary_ip_block');
    await recordEvent({
      identityId: identity.id,
      ipHmac,
      bodyHmac,
      flags: [...flags],
    });

    return { ok: false, status: 403, payload: { ok: false, error: copy.blocked } };
  }

  const [
    identityShortCount,
    identityDailyCount,
    ipShortCount,
    ipDailyCount,
  ] = await Promise.all([
    countEvents('guest_identity_id', identity.id, shortWindowIso),
    countEvents('guest_identity_id', identity.id, dailyWindowIso),
    ipHmac ? countEvents('ip_hmac', ipHmac, shortWindowIso) : 0,
    ipHmac ? countEvents('ip_hmac', ipHmac, dailyWindowIso) : 0,
  ]);

  const shortCount = Math.max(identityShortCount, ipShortCount);
  const dailyCount = Math.max(identityDailyCount, ipDailyCount);
  const rateLimitReason = ipSignals.activeIpState === 'restricted'
    ? getRestrictedIpRateLimitReason({ shortCount, dailyCount })
      || getGuestRateLimitReason({ shortCount, dailyCount })
    : getGuestRateLimitReason({ shortCount, dailyCount });

  if (rateLimitReason) {
    flags.add(rateLimitReason);
    evasionSignals.add('abnormal_frequency');
    if (getGuestBanEvasionAssessment(evasionSignals).suspected) {
      flags.add('suspected_ban_evasion');
    }
    await recordEvent({
      identityId: identity.id,
      ipHmac,
      bodyHmac,
      flags: [...flags],
    });

    return { ok: false, status: 429, payload: { ok: false, error: copy.rateLimited } };
  }

  if (ipHmac) {
    const { data: recentIpIdentities, error: identitiesError } = await supabaseAdmin
      .from('guest_comment_events')
      .select('guest_identity_id')
      .eq('ip_hmac', ipHmac)
      .gte('created_at', dailyWindowIso)
      .limit(100);

    if (identitiesError) throw identitiesError;

    const distinctIdentityIds = new Set(
      (recentIpIdentities ?? [])
        .map((event) => String(event.guest_identity_id || ''))
        .filter(Boolean)
    );
    distinctIdentityIds.add(identity.id);

    if (hasTooManyGuestIdentitiesForIp(distinctIdentityIds.size)) {
      flags.add('multiple_guest_identities');
      evasionSignals.add('multiple_guest_identities');
    }
  }

  const { count: repeatedBodyCount, error: repeatedBodyError } = await supabaseAdmin
    .from('guest_comment_events')
    .select('id', { count: 'exact', head: true })
    .eq('body_hmac', bodyHmac)
    .gte('created_at', dailyWindowIso);

  if (repeatedBodyError) throw repeatedBodyError;
  if ((repeatedBodyCount ?? 0) > 0) {
    flags.add('repeated_content');
    evasionSignals.add('repeated_content');
  }

  const evasionAssessment = getGuestBanEvasionAssessment(evasionSignals);
  if (evasionAssessment.suspected) {
    flags.add('suspected_ban_evasion');
  }

  if (input.parentId) {
    const { data: parentComment, error: parentError } = await supabaseAdmin
      .from('comments')
      .select('id, parent_id, article_slug, article_language, status, deleted_at')
      .eq('id', input.parentId)
      .maybeSingle();

    if (parentError) throw parentError;

    if (!parentComment || parentComment.deleted_at || parentComment.status !== 'approved') {
      return { ok: false, status: 410, payload: { ok: false, error: copy.parentUnavailable } };
    }

    if (parentComment.parent_id) {
      return { ok: false, status: 400, payload: { ok: false, error: copy.nestedReply } };
    }

    if (
      parentComment.article_slug !== input.articleSlug ||
      parentComment.article_language !== input.articleLanguage
    ) {
      return { ok: false, status: 400, payload: { ok: false, error: copy.parentMismatch } };
    }

    const { count: duplicateReplyCount, error: duplicateReplyError } = await supabaseAdmin
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', input.parentId)
      .eq('guest_identity_id', identity.id)
      .is('deleted_at', null);

    if (duplicateReplyError) throw duplicateReplyError;

    if ((duplicateReplyCount ?? 0) > 0) {
      return { ok: false, status: 409, payload: { ok: false, error: copy.duplicateReply } };
    }
  }

  const contentAssessment = assessCommentModeration(input.body);

  if (contentAssessment.status === 'rejected') {
    flags.add('content_rejected');
  } else if (contentAssessment.reason) {
    flags.add('content_review');
  }

  const moderationReason = [
    'Commento ospite: moderazione preventiva.',
    contentAssessment.reason,
    flags.size > 0 ? `Flag: ${[...flags].join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  const { data: comment, error: insertError } = await supabaseAdmin
    .from('comments')
    .insert({
      article_slug: input.articleSlug,
      article_language: input.articleLanguage,
      article_title: input.articleTitle,
      article_url: input.articleUrl,
      user_id: null,
      profile_id: null,
      parent_id: input.parentId,
      body: input.body,
      status: 'pending',
      author_type: 'guest',
      guest_identity_id: identity.id,
      guest_display_name: identity.canonical_display_name,
      abuse_flags: [...flags],
      moderation_reason: moderationReason,
      moderated_at: nowIso,
      moderated_by: null,
    })
    .select('id, user_id, parent_id, status, created_at, article_slug, article_title, article_url, article_language')
    .single();

  if (insertError) throw insertError;

  const { error: eventError } = await supabaseAdmin
    .from('guest_comment_events')
    .insert({
      guest_identity_id: identity.id,
      comment_id: comment.id,
      ip_hmac: ipHmac,
      body_hmac: bodyHmac,
      flags: [...flags],
    });

  if (eventError) {
    await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', comment.id)
      .eq('status', 'pending');
    throw eventError;
  }

  await supabaseAdmin
    .from('guest_identities')
    .update({ last_seen_at: nowIso })
    .eq('id', identity.id);

  if (!identityMismatch) {
    setGuestIdentityCookie(cookies, identity.id, guestIdentitySecret);
  }

  return {
    ok: true,
    status: 202,
    payload: {
      ok: true,
      message: identityMismatch ? copy.mismatch : copy.sent,
      comment: {
        id: comment.id,
        status: comment.status,
        created_at: comment.created_at,
      },
      guest: identityMismatch
        ? undefined
        : {
            recognized: true,
            displayName: identity.canonical_display_name,
          },
    },
    comment,
    authorName: identity.canonical_display_name,
  };
}
