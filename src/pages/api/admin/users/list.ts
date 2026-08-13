import type { APIRoute } from 'astro';
import { logApiError } from '../../../../lib/api-errors';
import {
  getActiveReaderBadges,
  isBadgeAssignmentsUnavailable,
  type ReaderBadge,
} from '../../../../lib/badges';
import { calculateCommunityPoints } from '../../../../lib/community-points';
import {
  fetchEditorialProfilesByUserIds,
  type EditorialProfileSummary,
} from '../../../../lib/editorial/admin.server';
import { canAdministerEditorialAccess } from '../../../../lib/editorial/permissions';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserSessionFromCookies, isStaffProfile } from '../../../../lib/supabase/auth';
import { getAvatarPublicUrl, isMissingAvatarColumnError } from '../../../../lib/supabase/avatars';
import { isUserActivityUnavailable } from '../../../../lib/supabase/user-activity';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

const normalizeSearch = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);

const roleFilters = new Set(['user', 'moderator', 'admin']);
const statusFilters = new Set(['active', 'suspended', 'banned']);
const sortFields = new Set([
  'registration',
  'last_activity',
  'comments',
  'approved',
  'pending',
  'community_points',
  'username',
  'role',
]);
const sortDirections = new Set(['asc', 'desc']);
const compactSortValues = new Set([
  'last_activity_desc',
  'last_activity_asc',
  'registered_desc',
  'registered_asc',
  'comments_desc',
  'comments_asc',
  'approved_desc',
  'approved_asc',
  'pending_desc',
  'pending_asc',
  'community_points_desc',
  'community_points_asc',
  'username_asc',
  'username_desc',
  'role_asc',
  'role_desc',
]);

const normalizeOption = (value: string | null, allowedValues: Set<string>, fallback: string) => {
  const normalized = String(value || '').trim().toLowerCase();

  return allowedValues.has(normalized) ? normalized : fallback;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

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

const getProfilesSelect = (includeAvatar = true, includeLastActivity = true) =>
  `
    id,
    user_id,
    username,
    display_name,
    ${includeAvatar ? 'avatar_path,' : ''}
    role,
    status,
    badge_key
    ${includeLastActivity ? ', last_activity_at' : ''}
  `;

const fetchAllProfiles = async () => {
  const rows = [];
  const pageSize = 1000;
  let includeAvatar = true;
  let includeLastActivity = true;

  for (let from = 0; from < 10000; from += pageSize) {
    let { data, error } = await supabaseAdmin
      .from('profiles')
      .select(getProfilesSelect(includeAvatar, includeLastActivity))
      .range(from, from + pageSize - 1);

    if (isMissingAvatarColumnError(error)) {
      includeAvatar = false;
      const fallbackResult = await supabaseAdmin
        .from('profiles')
        .select(getProfilesSelect(false, includeLastActivity))
        .range(from, from + pageSize - 1);

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (isUserActivityUnavailable(error)) {
      includeLastActivity = false;
      const fallbackResult = await supabaseAdmin
        .from('profiles')
        .select(getProfilesSelect(includeAvatar, false))
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
  const stats = new Map<string, { total: number; pending: number; approved: number; likesReceived: number }>();
  const approvedCommentOwnerById = new Map<string, string>();
  const pageSize = 1000;

  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('comments')
      .select('id, user_id, status')
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    for (const comment of data ?? []) {
      const userId = String(comment.user_id || '');
      if (!userId) continue;

      const current = stats.get(userId) ?? { total: 0, pending: 0, approved: 0, likesReceived: 0 };
      current.total += 1;

      if (comment.status === 'pending') {
        current.pending += 1;
      }

      if (comment.status === 'approved') {
        current.approved += 1;

        if (comment.id) {
          approvedCommentOwnerById.set(String(comment.id), userId);
        }
      }

      stats.set(userId, current);
    }

    if ((data ?? []).length < pageSize) {
      break;
    }
  }

  const approvedCommentIds = [...approvedCommentOwnerById.keys()];

  for (const commentIdChunk of chunkArray(approvedCommentIds, 500)) {
    const { data, error } = await supabaseAdmin
      .from('comment_reactions')
      .select('comment_id')
      .eq('reaction', 'like')
      .in('comment_id', commentIdChunk);

    if (error) {
      throw error;
    }

    for (const reaction of data ?? []) {
      const commentId = String(reaction.comment_id || '');
      const userId = approvedCommentOwnerById.get(commentId);

      if (!userId) continue;

      const current = stats.get(userId) ?? { total: 0, pending: 0, approved: 0, likesReceived: 0 };
      current.likesReceived += 1;
      stats.set(userId, current);
    }
  }

  return stats;
};

const isReviewRatingsUnavailable = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    message.includes('review_ratings')
  );
};

const fetchRatingStats = async () => {
  const stats = new Map<string, { total: number }>();
  const pageSize = 1000;

  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('review_ratings')
      .select('user_id')
      .range(from, from + pageSize - 1);

    if (error) {
      if (isReviewRatingsUnavailable(error)) {
        return stats;
      }

      throw error;
    }

    for (const rating of data ?? []) {
      const userId = String(rating.user_id || '');
      if (!userId) continue;

      const current = stats.get(userId) ?? { total: 0 };
      current.total += 1;
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
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const search = normalizeSearch(url.searchParams.get('q') || '');
  const roleFilter = normalizeOption(url.searchParams.get('role'), roleFilters, 'all');
  const statusFilter = normalizeOption(url.searchParams.get('status'), statusFilters, 'all');
  const requestedSort = normalizeOption(url.searchParams.get('sort'), compactSortValues, '');
  let sortBy = normalizeOption(url.searchParams.get('sortBy'), sortFields, 'last_activity');
  let direction = normalizeOption(url.searchParams.get('direction'), sortDirections, 'desc');

  if (requestedSort) {
    direction = requestedSort.endsWith('_asc') ? 'asc' : 'desc';
    const field = requestedSort.replace(/_(asc|desc)$/, '');
    sortBy = field === 'registered' ? 'registration' : normalizeOption(field, sortFields, 'last_activity');
  }

  const detailUserId = String(url.searchParams.get('userId') || '').trim();
  const isDetailRequest = url.searchParams.get('detail') === '1';

  if (detailUserId && !isUuid(detailUserId)) {
    return json({ ok: false, error: 'Utente non valido.' }, 400);
  }

  try {
    const [authUsers, profiles, commentStats, ratingStats, activeBadges, badgeAssignmentsResult] = await Promise.all([
      fetchAllAuthUsers(),
      fetchAllProfiles(),
      fetchCommentStats(),
      fetchRatingStats(),
      isDetailRequest ? getActiveReaderBadges({ fallback: false }) : Promise.resolve([]),
      isDetailRequest
        ? fetchBadgeAssignments()
        : Promise.resolve({
            assignments: new Map<string, Set<string>>(),
            available: false,
            error: null,
          }),
    ]);

    const authByUserId = new Map(authUsers.map((user) => [user.id, user]));
    const activeBadgeByKey = new Map(activeBadges.map((badge) => [badge.key, badge]));
    const viewerRole = session.profile.role === 'admin' ? 'admin' : 'moderator';
    const badgeManagementAvailable = badgeAssignmentsResult.available;
    const canManageEditorialAccess = canAdministerEditorialAccess({ profile: session.profile });
    let editorialDatabaseAvailable = false;
    let editorialDatabaseError: string | null = null;
    let editorialProfileByUserId = new Map<string, EditorialProfileSummary>();

    if (isDetailRequest && detailUserId && canManageEditorialAccess) {
      try {
        const editorialResult = await fetchEditorialProfilesByUserIds([detailUserId]);
        editorialDatabaseAvailable = editorialResult.available;
        editorialDatabaseError = editorialResult.error;
        editorialProfileByUserId = editorialResult.profilesByUserId;
      } catch (error) {
        logApiError('admin-users-list.editorial-access', error);
        editorialDatabaseAvailable = false;
        editorialDatabaseError = 'Editorial access unavailable';
      }
    }

    let users = profiles
      .filter((profile) => !detailUserId || profile.user_id === detailUserId)
      .map((profile) => {
        const authUser = authByUserId.get(profile.user_id);
        const comments = commentStats.get(profile.user_id) ?? {
          total: 0,
          pending: 0,
          approved: 0,
          likesReceived: 0,
        };
        const ratings = ratingStats.get(profile.user_id) ?? { total: 0 };
        const communityPoints = calculateCommunityPoints({
          approvedComments: comments.approved,
          receivedLikes: comments.likesReceived,
          reviewRatings: ratings.total,
        });
        const isSelf = profile.user_id === session.user?.id;
        const role = profile.role || 'user';
        const status = profile.status || 'active';
        const baseUser = {
          id: profile.id,
          userId: profile.user_id,
          email: authUser?.email || '',
          username: profile.username || '',
          displayName: profile.display_name || '',
          avatarUrl: getAvatarPublicUrl(profile.avatar_path),
          role,
          status,
          createdAt: authUser?.created_at || null,
          lastActivityAt: profile.last_activity_at || null,
          comments,
          ratings,
          communityPoints,
          communityPointsBreakdown: {
            reviewRatings: ratings.total,
            approvedComments: comments.approved,
            receivedLikes: comments.likesReceived,
            memories: null,
          },
          isSelf,
        };

        if (!isDetailRequest) {
          return baseUser;
        }

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
          ...baseUser,
          currentBadgeKey: profile.badge_key || '',
          currentBadge: currentBadge ? serializeBadge(currentBadge) : null,
          assignedBadges,
          emailConfirmedAt: authUser?.email_confirmed_at || null,
          canManageRole: viewerRole === 'admin' && !isSelf,
          canManageStatus:
            !isSelf && (viewerRole === 'admin' || (viewerRole === 'moderator' && role === 'user')),
          canManageBadges: viewerRole === 'admin' && badgeManagementAvailable,
          editorialAccess: {
            canManage: canManageEditorialAccess,
            databaseAvailable: editorialDatabaseAvailable,
            error: editorialDatabaseError,
            profile: editorialProfileByUserId.get(profile.user_id) || null,
          },
        };
      });

    if (isDetailRequest && detailUserId && users.length === 0) {
      return json({ ok: false, error: 'Utente non trovato.' }, 404);
    }

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

    if (!isDetailRequest && roleFilter !== 'all') {
      users = users.filter((user) => user.role === roleFilter);
    }

    if (!isDetailRequest && statusFilter !== 'all') {
      users = users.filter((user) => user.status === statusFilter);
    }

    const compareDate = (aValue: string | null, bValue: string | null) => {
      const hasA = Boolean(aValue);
      const hasB = Boolean(bValue);

      if (hasA !== hasB) {
        return hasA ? -1 : 1;
      }

      const dateA = aValue ? new Date(aValue).getTime() : 0;
      const dateB = bValue ? new Date(bValue).getTime() : 0;
      const comparison = dateA - dateB;

      return direction === 'asc' ? comparison : -comparison;
    };

    const compareNumber = (aValue: number, bValue: number) => {
      const comparison = aValue - bValue;

      return direction === 'asc' ? comparison : -comparison;
    };

    const compareText = (aValue: string, bValue: string) => {
      const comparison = aValue.localeCompare(bValue, 'it', { sensitivity: 'base' });

      return direction === 'asc' ? comparison : -comparison;
    };

    users.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'registration') {
        comparison = compareDate(a.createdAt, b.createdAt);
      } else if (sortBy === 'last_activity') {
        comparison = compareDate(a.lastActivityAt, b.lastActivityAt);
      } else if (sortBy === 'comments') {
        comparison = compareNumber(a.comments.total, b.comments.total);
      } else if (sortBy === 'approved') {
        comparison = compareNumber(a.comments.approved, b.comments.approved);
      } else if (sortBy === 'pending') {
        comparison = compareNumber(a.comments.pending, b.comments.pending);
      } else if (sortBy === 'community_points') {
        comparison = compareNumber(a.communityPoints, b.communityPoints);
      } else if (sortBy === 'username') {
        comparison = compareText(a.username || a.displayName || a.email, b.username || b.displayName || b.email);
      } else if (sortBy === 'role') {
        comparison = compareText(a.role, b.role);
      }

      return comparison ||
        compareText(a.username || a.displayName || a.email, b.username || b.displayName || b.email) ||
        compareDate(a.createdAt, b.createdAt);
    });

    return json({
      ok: true,
      viewerRole,
      canManageEditorialAccess,
      badgeManagementAvailable,
      availableBadges: activeBadges.map(serializeBadge),
      users,
      filters: {
        q: search,
        role: roleFilter,
        status: statusFilter,
        sortBy,
        direction,
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
