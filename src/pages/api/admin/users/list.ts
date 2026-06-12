import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  getActiveReaderBadges,
  isBadgeAssignmentsUnavailable,
  type ReaderBadge,
} from '../../../../lib/badges';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserProfileFromToken, isStaffProfile } from '../../../../lib/supabase/auth';
import { getAvatarPublicUrl, isMissingAvatarColumnError } from '../../../../lib/supabase/avatars';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const normalizeSearch = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);

const fetchAllAuthUsers = async () => {
  const users = [];
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    users.push(...(data.users ?? []));

    if ((data.users ?? []).length < perPage) {
      break;
    }
  }

  return users;
};

const getProfilesSelect = (includeAvatar = true) =>
  `id, user_id, username, display_name, ${includeAvatar ? 'avatar_path,' : ''} role, status, badge_key`;

const fetchAllProfiles = async () => {
  const rows = [];
  const pageSize = 1000;
  let includeAvatar = true;

  for (let from = 0; from < 10000; from += pageSize) {
    let { data, error } = await supabaseAdmin
      .from('profiles')
      .select(getProfilesSelect(includeAvatar))
      .range(from, from + pageSize - 1);

    if (isMissingAvatarColumnError(error)) {
      includeAvatar = false;
      const fallbackResult = await supabaseAdmin
        .from('profiles')
        .select(getProfilesSelect(false))
        .range(from, from + pageSize - 1);

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      throw error;
    }

    rows.push(...(data ?? []));

    if ((data ?? []).length < pageSize) {
      break;
    }
  }

  return rows;
};

const fetchCommentStats = async () => {
  const stats = new Map<string, { total: number; pending: number; approved: number }>();
  const pageSize = 1000;

  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('comments')
      .select('user_id, status')
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    for (const comment of data ?? []) {
      const userId = String(comment.user_id || '');
      if (!userId) continue;

      const current = stats.get(userId) ?? { total: 0, pending: 0, approved: 0 };
      current.total += 1;

      if (comment.status === 'pending') {
        current.pending += 1;
      }

      if (comment.status === 'approved') {
        current.approved += 1;
      }

      stats.set(userId, current);
    }

    if ((data ?? []).length < pageSize) {
      break;
    }
  }

  return stats;
};

const fetchBadgeAssignments = async () => {
  const assignments = new Map<string, Set<string>>();
  const pageSize = 1000;

  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('user_badge_assignments')
      .select('user_id, badge_key')
      .range(from, from + pageSize - 1);

    if (error) {
      if (isBadgeAssignmentsUnavailable(error)) {
        return {
          assignments,
          available: false,
          error: null,
        };
      }

      throw error;
    }

    for (const row of data ?? []) {
      const userId = String(row.user_id || '');
      const badgeKey = String(row.badge_key || '');

      if (!userId || !badgeKey) continue;

      const current = assignments.get(userId) ?? new Set<string>();
      current.add(badgeKey);
      assignments.set(userId, current);
    }

    if ((data ?? []).length < pageSize) {
      break;
    }
  }

  return {
    assignments,
    available: true,
    error: null,
  };
};

const serializeBadge = (badge: ReaderBadge) => ({
  key: badge.key,
  labelIt: badge.label_it,
  labelEn: badge.label_en,
  imagePath: badge.image_path,
});

export const GET: APIRoute = async ({ cookies, url }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const search = normalizeSearch(url.searchParams.get('q') || '');

  try {
    const [authUsers, profiles, commentStats, activeBadges, badgeAssignmentsResult] = await Promise.all([
      fetchAllAuthUsers(),
      fetchAllProfiles(),
      fetchCommentStats(),
      getActiveReaderBadges({ fallback: false }),
      fetchBadgeAssignments(),
    ]);

    const authByUserId = new Map(authUsers.map((user) => [user.id, user]));
    const activeBadgeByKey = new Map(activeBadges.map((badge) => [badge.key, badge]));
    const viewerRole = session.profile.role === 'admin' ? 'admin' : 'moderator';
    const badgeManagementAvailable = badgeAssignmentsResult.available;

    let users = profiles.map((profile) => {
      const authUser = authByUserId.get(profile.user_id);
      const comments = commentStats.get(profile.user_id) ?? {
        total: 0,
        pending: 0,
        approved: 0,
      };
      const isSelf = profile.user_id === session.user?.id;
      const role = profile.role || 'user';
      const status = profile.status || 'active';
      const assignedBadgeKeys = badgeManagementAvailable
        ? [...(badgeAssignmentsResult.assignments.get(profile.user_id) ?? new Set<string>())]
        : (profile.badge_key ? [profile.badge_key] : []);
      const assignedBadges = assignedBadgeKeys
        .map((badgeKey) => activeBadgeByKey.get(badgeKey))
        .filter((badge): badge is ReaderBadge => Boolean(badge))
        .map(serializeBadge);
      const currentBadge = profile.badge_key
        ? activeBadgeByKey.get(profile.badge_key)
        : null;

      return {
        id: profile.id,
        userId: profile.user_id,
        email: authUser?.email || '',
        username: profile.username || '',
        displayName: profile.display_name || '',
        avatarUrl: getAvatarPublicUrl(profile.avatar_path),
        role,
        status,
        currentBadgeKey: profile.badge_key || '',
        currentBadge: currentBadge ? serializeBadge(currentBadge) : null,
        assignedBadges,
        createdAt: authUser?.created_at || null,
        emailConfirmedAt: authUser?.email_confirmed_at || null,
        comments,
        isSelf,
        canManageRole: viewerRole === 'admin' && !isSelf,
        canManageStatus:
          !isSelf && (viewerRole === 'admin' || (viewerRole === 'moderator' && role === 'user')),
        canManageBadges: viewerRole === 'admin' && badgeManagementAvailable,
      };
    });

    if (search) {
      users = users.filter((user) => {
        const haystack = [
          user.email,
          user.username,
          user.displayName,
          user.role,
          user.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(search);
      });
    }

    users.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

      return dateB - dateA || a.username.localeCompare(b.username);
    });

    return json({
      ok: true,
      viewerRole,
      badgeManagementAvailable,
      availableBadges: activeBadges.map(serializeBadge),
      users,
      filters: {
        q: search,
      },
    });
  } catch (error) {
    logApiError('admin-users-list', error);
    return json({
      ok: false,
      error: 'Utenti non disponibili. Riprova più tardi.',
    }, 500);
  }
};
