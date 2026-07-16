import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';
import { getAbbreviatedGuestIdentityId } from '../../../../lib/guest-comments';
import { isMissingGuestCommentSchemaError } from '../../../../lib/supabase/guest-comments';
import {
  isMissingCommunityBanSchemaError,
} from '../../../../lib/supabase/community-bans';
import { getCommunityAccessFromBans } from '../../../../lib/community-moderation';
import { isMissingCommentModerationColumnError } from '../../../../lib/supabase/comment-moderation';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

const allowedStatuses = new Set(['all', 'pending', 'pending_review', 'approved', 'rejected', 'deleted']);
const allowedLanguages = new Set(['all', 'it', 'en']);

const normalizeSearch = (value: string) =>
  value.trim().replace(/[(),]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);

const normalizePositiveInteger = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const escapeIlikeValue = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

const logIdentityModerationError = (context: string, error: unknown) => {
  const apiError = error as { code?: string } | null;

  console.error('Admin identity moderation query failed:', {
    context,
    code: apiError?.code || 'unknown',
  });
};

export const GET: APIRoute = async ({ cookies, url }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const statusParam = url.searchParams.get('status') || 'pending';
  const languageParam = url.searchParams.get('lang') || url.searchParams.get('language') || 'all';
  const requestedStatus = allowedStatuses.has(statusParam) ? statusParam : 'pending';
  const status = requestedStatus === 'pending_review' ? 'pending' : requestedStatus;
  const language = allowedLanguages.has(languageParam) ? languageParam : 'all';
  const search = normalizeSearch(url.searchParams.get('q') || '');
  const page = normalizePositiveInteger(url.searchParams.get('page'), 1);
  const pageSize = Math.min(normalizePositiveInteger(url.searchParams.get('pageSize'), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const selectFields = (includeModeration: boolean, includeGuestFields: boolean) => `
      id,
      article_slug,
      article_language,
      article_title,
      article_url,
      user_id,
      parent_id,
      body,
      status,
      ${includeModeration ? 'moderation_reason, moderated_at,' : ''}
      ${includeGuestFields ? `
        author_type,
        guest_display_name,
        guest_identity_id,
        abuse_flags,
        guest_identity:guest_identity_id (
          status,
          approved_comments_count
        ),
      ` : ''}
      deleted_at,
      created_at,
      profiles:profile_id (
        id,
        username,
        display_name,
        badge_key,
        role,
        status,
        user_badges (
          key,
          label_it,
          label_en,
          image_path
        )
      )
    `;

  const matchingProfileIds = search
    ? await (async () => {
        const searchPattern = `%${escapeIlikeValue(search)}%`;
        const { data: profiles, error: profilesError } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .or(`username.ilike.${searchPattern},display_name.ilike.${searchPattern}`)
          .limit(500);

        if (profilesError) {
          logApiError('admin-comments-pending.profile-search', profilesError);
          return [];
        }

        return (profiles ?? [])
          .map((profile) => profile.id)
          .filter((id): id is string => Boolean(id));
      })()
    : [];

  const buildQuery = (includeModeration: boolean, includeGuestFields: boolean) => {
    let query = supabaseAdmin
      .from('comments')
      .select(selectFields(includeModeration, includeGuestFields), { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status === 'deleted') {
      query = query.not('deleted_at', 'is', null);
    } else if (status !== 'all') {
      query = query.eq('status', status).is('deleted_at', null);
    }

    if (language !== 'all') {
      query = query.eq('article_language', language);
    }

    if (search) {
      const searchPattern = `%${escapeIlikeValue(search)}%`;
      const searchFilters = [
        `body.ilike.${searchPattern}`,
        `article_title.ilike.${searchPattern}`,
        `article_slug.ilike.${searchPattern}`,
      ];

      if (includeGuestFields) {
        searchFilters.push(`guest_display_name.ilike.${searchPattern}`);
      }

      if (matchingProfileIds.length > 0) {
        searchFilters.push(`profile_id.in.(${matchingProfileIds.join(',')})`);
      }

      query = query.or(searchFilters.join(','));
    }

    return query;
  };

  let includeModeration = true;
  let includeGuestFields = true;
  let { data, error, count } = await buildQuery(includeModeration, includeGuestFields);

  if (isMissingGuestCommentSchemaError(error)) {
    includeGuestFields = false;
    const fallbackResult = await buildQuery(includeModeration, includeGuestFields);
    data = fallbackResult.data;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (isMissingCommentModerationColumnError(error)) {
    includeModeration = false;
    const fallbackResult = await buildQuery(includeModeration, includeGuestFields);
    data = fallbackResult.data?.map((comment) => ({
      ...comment,
      moderation_reason: null,
      moderated_at: null,
    })) ?? null;
    error = fallbackResult.error;
    count = fallbackResult.count;
  }

  if (error) {
    logApiError('admin-comments-pending.comments', error);
    return json({ ok: false, error: 'Commenti non disponibili. Riprova più tardi.' }, 500);
  }

  let comments = data ?? [];

  const parentIds = [
    ...new Set(
      comments
        .map((comment) => comment.parent_id)
        .filter((parentId): parentId is string => Boolean(parentId))
    ),
  ];

  if (parentIds.length > 0) {
    const { data: parents, error: parentsError } = await supabaseAdmin
      .from('comments')
      .select(`
        id,
        body,
        created_at,
        ${includeGuestFields ? 'author_type, guest_display_name,' : ''}
        profiles:profile_id (
          username,
          display_name
        )
      `)
      .in('id', parentIds);

    if (parentsError) {
      logApiError('admin-comments-pending.parents', parentsError);
      return json({ ok: false, error: 'Contesto risposta non disponibile.' }, 500);
    }

    const parentsById = new Map((parents ?? []).map((parent) => [parent.id, parent]));

    comments = comments.map((comment) => ({
      ...comment,
      parent: comment.parent_id ? parentsById.get(comment.parent_id) ?? null : null,
    }));
  }

  const moderationByCommentId = new Map<string, Record<string, unknown>>();

  if (comments.length > 0) {
    const guestIdentityIds = includeGuestFields
      ? [...new Set(
          comments
            .map((comment) => String(comment.guest_identity_id || ''))
            .filter(Boolean)
        )]
      : [];
    const accountUserIds = [...new Set(
      comments
        .map((comment) => String(comment.user_id || ''))
        .filter(Boolean)
    )];
    const identityFilters = [
      guestIdentityIds.length > 0
        ? `guest_identity_id.in.(${guestIdentityIds.join(',')})`
        : '',
      accountUserIds.length > 0
        ? `user_id.in.(${accountUserIds.join(',')})`
        : '',
    ].filter(Boolean);

    const identityStats = new Map<string, {
      approved: number;
      rejected: number;
      reported: number;
    }>();
    const commentOwnerById = new Map<string, string>();

    if (identityFilters.length > 0) {
      const identityCommentFields = includeGuestFields
        ? 'id, user_id, guest_identity_id, status'
        : 'id, user_id, status';
      const { data: identityComments, error: identityCommentsError } = await supabaseAdmin
        .from('comments')
        .select(identityCommentFields)
        .or(identityFilters.join(','))
        .limit(5000);

      if (identityCommentsError) {
        logIdentityModerationError('admin-comments-pending.identity-stats', identityCommentsError);
      } else {
        for (const identityComment of identityComments ?? []) {
          const identityKey = identityComment.guest_identity_id
            ? `guest:${identityComment.guest_identity_id}`
            : identityComment.user_id
              ? `account:${identityComment.user_id}`
              : '';

          if (!identityKey) continue;

          const stats = identityStats.get(identityKey) ?? {
            approved: 0,
            rejected: 0,
            reported: 0,
          };

          if (identityComment.status === 'approved') stats.approved += 1;
          if (identityComment.status === 'rejected') stats.rejected += 1;
          identityStats.set(identityKey, stats);

          if (identityComment.id) {
            commentOwnerById.set(String(identityComment.id), identityKey);
          }
        }

        const identityCommentIds = [...commentOwnerById.keys()];

        if (identityCommentIds.length > 0) {
          const { data: reports, error: reportsError } = await supabaseAdmin
            .from('comment_reports')
            .select('comment_id')
            .in('comment_id', identityCommentIds)
            .limit(5000);

          if (reportsError) {
            logIdentityModerationError('admin-comments-pending.identity-reports', reportsError);
          } else {
            const reportedIdentityComments = new Set<string>();

            for (const report of reports ?? []) {
              const commentId = String(report.comment_id || '');
              const identityKey = commentOwnerById.get(commentId);
              if (!identityKey) continue;
              const reportedKey = `${identityKey}:${commentId}`;
              if (reportedIdentityComments.has(reportedKey)) continue;

              const stats = identityStats.get(identityKey);
              if (stats) {
                stats.reported += 1;
                reportedIdentityComments.add(reportedKey);
              }
            }
          }
        }
      }
    }

    const activeBansByIdentity = new Map<string, Array<Record<string, unknown>>>();
    const suspectedBanEvasionByIdentity = new Set<string>();
    const banFilters = [
      guestIdentityIds.length > 0
        ? `and(subject_type.eq.guest,guest_identity_id.in.(${guestIdentityIds.join(',')}))`
        : '',
      accountUserIds.length > 0
        ? `and(subject_type.eq.account,user_id.in.(${accountUserIds.join(',')}))`
        : '',
    ].filter(Boolean);

    if (banFilters.length > 0) {
      const { data: bans, error: bansError } = await supabaseAdmin
        .from('community_bans')
        .select(`
          subject_type,
          user_id,
          guest_identity_id,
          status,
          reason,
          expires_at,
          exceptional_permanent_ip,
          created_at
        `)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .or(banFilters.join(','));

      if (bansError && !isMissingCommunityBanSchemaError(bansError)) {
        logIdentityModerationError('admin-comments-pending.identity-bans', bansError);
      } else {
        for (const ban of bans ?? []) {
          const identityKey = ban.subject_type === 'guest'
            ? `guest:${ban.guest_identity_id}`
            : `account:${ban.user_id}`;

          const safeBans = activeBansByIdentity.get(identityKey) ?? [];
          safeBans.push({
            type: ban.subject_type,
            status: ban.status,
            reason: ban.reason,
            expiresAt: ban.expires_at,
            permanent: !ban.expires_at,
            exceptional: Boolean(ban.exceptional_permanent_ip),
            createdAt: ban.created_at,
          });
          activeBansByIdentity.set(identityKey, safeBans);
        }
      }
    }

    const ipHmacByCommentId = new Map<string, string>();
    const currentCommentIds = comments.map((comment) => String(comment.id || '')).filter(Boolean);

    if (includeGuestFields && guestIdentityIds.length > 0) {
      const { data: evasionEvents, error: evasionEventsError } = await supabaseAdmin
        .from('guest_comment_events')
        .select('guest_identity_id')
        .in('guest_identity_id', guestIdentityIds)
        .contains('flags', ['suspected_ban_evasion'])
        .limit(5000);

      if (evasionEventsError) {
        logIdentityModerationError('admin-comments-pending.evasion-events', evasionEventsError);
      } else {
        for (const event of evasionEvents ?? []) {
          const guestIdentityId = String(event.guest_identity_id || '');
          if (guestIdentityId) {
            suspectedBanEvasionByIdentity.add(`guest:${guestIdentityId}`);
          }
        }
      }
    }

    if (includeGuestFields && currentCommentIds.length > 0) {
      const { data: events, error: eventsError } = await supabaseAdmin
        .from('guest_comment_events')
        .select('comment_id, ip_hmac')
        .in('comment_id', currentCommentIds)
        .not('ip_hmac', 'is', null);

      if (eventsError) {
        logIdentityModerationError('admin-comments-pending.ip-events', eventsError);
      } else {
        for (const event of events ?? []) {
          if (event.comment_id && event.ip_hmac) {
            ipHmacByCommentId.set(String(event.comment_id), String(event.ip_hmac));
          }
        }
      }
    }

    const ipBansByHmac = new Map<string, Array<Record<string, unknown>>>();
    const ipHmacs = [...new Set(ipHmacByCommentId.values())];

    if (ipHmacs.length > 0) {
      const { data: ipBans, error: ipBansError } = await supabaseAdmin
        .from('community_bans')
        .select('ip_hmac, status, reason, expires_at, exceptional_permanent_ip, created_at')
        .eq('subject_type', 'ip')
        .in('ip_hmac', ipHmacs)
        .is('revoked_at', null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      if (ipBansError && !isMissingCommunityBanSchemaError(ipBansError)) {
        logIdentityModerationError('admin-comments-pending.ip-bans', ipBansError);
      } else {
        for (const ban of ipBans ?? []) {
          const safeBans = ipBansByHmac.get(String(ban.ip_hmac)) ?? [];
          safeBans.push({
            type: 'ip',
            status: ban.status,
            reason: ban.reason,
            expiresAt: ban.expires_at,
            permanent: !ban.expires_at,
            exceptional: Boolean(ban.exceptional_permanent_ip),
            createdAt: ban.created_at,
          });
          ipBansByHmac.set(String(ban.ip_hmac), safeBans);
        }
      }
    }

    const auditByIdentity = new Map<string, Array<Record<string, unknown>>>();
    const auditByIpHmac = new Map<string, Array<Record<string, unknown>>>();
    const auditFilters = [
      guestIdentityIds.length > 0
        ? `and(subject_type.eq.guest,guest_identity_id.in.(${guestIdentityIds.join(',')}))`
        : '',
      accountUserIds.length > 0
        ? `and(subject_type.eq.account,user_id.in.(${accountUserIds.join(',')}))`
        : '',
      ipHmacs.length > 0
        ? `and(subject_type.eq.ip,ip_hmac.in.(${ipHmacs.join(',')}))`
        : '',
    ].filter(Boolean);

    if (auditFilters.length > 0) {
      const { data: auditEvents, error: auditError } = await supabaseAdmin
        .from('community_ban_events')
        .select(`
          subject_type,
          user_id,
          guest_identity_id,
          ip_hmac,
          event_type,
          status,
          reason,
          expires_at,
          moderator_id,
          created_at
        `)
        .or(auditFilters.join(','))
        .order('created_at', { ascending: false })
        .limit(500);

      if (auditError && !isMissingCommunityBanSchemaError(auditError)) {
        logIdentityModerationError('admin-comments-pending.ban-audit', auditError);
      } else {
        for (const event of auditEvents ?? []) {
          const safeEvent = {
            type: event.subject_type,
            eventType: event.event_type,
            status: event.status,
            reason: event.reason,
            expiresAt: event.expires_at,
            moderatorRef: getAbbreviatedGuestIdentityId(event.moderator_id),
            createdAt: event.created_at,
          };

          if (event.subject_type === 'ip') {
            const events = auditByIpHmac.get(String(event.ip_hmac)) ?? [];
            events.push(safeEvent);
            auditByIpHmac.set(String(event.ip_hmac), events);
          } else {
            const identityKey = event.subject_type === 'guest'
              ? `guest:${event.guest_identity_id}`
              : `account:${event.user_id}`;
            const events = auditByIdentity.get(identityKey) ?? [];
            events.push(safeEvent);
            auditByIdentity.set(identityKey, events);
          }
        }
      }
    }

    for (const comment of comments) {
      const isGuest = comment.author_type === 'guest';
      const guestIdentity = Array.isArray(comment.guest_identity)
        ? comment.guest_identity[0]
        : comment.guest_identity;
      const identityValue = isGuest
        ? String(comment.guest_identity_id || '')
        : String(comment.user_id || '');
      const identityKey = `${isGuest ? 'guest' : 'account'}:${identityValue}`;
      const identityBans = activeBansByIdentity.get(identityKey) ?? [];
      const ipHmac = ipHmacByCommentId.get(String(comment.id || '')) || '';
      const ipBans = ipHmac ? ipBansByHmac.get(ipHmac) ?? [] : [];
      const baseState = isGuest
        ? guestIdentity?.status || 'active'
        : comment.profiles?.status === 'banned'
          ? 'banned'
          : comment.profiles?.status === 'suspended'
            ? 'restricted'
            : 'active';
      const state = getCommunityAccessFromBans(
        identityBans as Array<{ status: 'restricted' | 'blocked' | 'banned' }>,
        baseState
      );
      const flags = Array.isArray(comment.abuse_flags)
        ? comment.abuse_flags.map((flag) => String(flag || ''))
        : [];

      moderationByCommentId.set(String(comment.id), {
        type: isGuest ? 'guest' : 'account',
        state,
        reference: getAbbreviatedGuestIdentityId(identityValue),
        counts: identityStats.get(identityKey) ?? {
          approved: Number(isGuest ? guestIdentity?.approved_comments_count || 0 : 0),
          rejected: 0,
          reported: 0,
        },
        activeBans: [...identityBans, ...ipBans],
        audit: [
          ...(auditByIdentity.get(identityKey) ?? []),
          ...(ipHmac ? auditByIpHmac.get(ipHmac) ?? [] : []),
        ]
          .sort((left, right) =>
            Date.parse(String(right.createdAt || '')) - Date.parse(String(left.createdAt || ''))
          )
          .slice(0, 20),
        suspectedBanEvasion:
          flags.includes('suspected_ban_evasion') ||
          suspectedBanEvasionByIdentity.has(identityKey),
        networkSignalAvailable: Boolean(ipHmac),
      });
    }
  }

  comments = comments.map((comment) => {
    const {
      guest_identity_id: guestIdentityId,
      user_id: _userId,
      ...safeComment
    } = comment;

    return {
      ...safeComment,
      guest_identity_ref: includeGuestFields
        ? getAbbreviatedGuestIdentityId(guestIdentityId)
        : '',
      identity_moderation: moderationByCommentId.get(String(comment.id)) ?? null,
    };
  });

  return json({
    ok: true,
    filters: {
      status: requestedStatus,
      language,
      lang: language,
      q: search,
      page,
      pageSize,
    },
    pagination: {
      page,
      pageSize,
      total: count ?? comments.length,
      totalPages: Math.max(1, Math.ceil((count ?? comments.length) / pageSize)),
      hasPrev: page > 1,
      hasNext: page < Math.max(1, Math.ceil((count ?? comments.length) / pageSize)),
    },
    comments,
  });
};
