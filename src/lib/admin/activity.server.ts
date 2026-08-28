import { logApiError } from '../api-errors';
import { supabaseAdmin } from '../supabase/server';

export const adminActivityCategories = ['users', 'comments', 'surveys', 'newsletter'] as const;

export type AdminActivityCategory = (typeof adminActivityCategories)[number];

export type AdminActivityCategorySummary = {
  category: AdminActivityCategory;
  unreadCount: number;
  latestAt: string | null;
  latestHref: string;
  seenThrough: string | null;
  error: string;
};

export type AdminActivitySummary = {
  available: boolean;
  totalUnread: number;
  categories: Record<AdminActivityCategory, AdminActivityCategorySummary>;
  error: string;
};

type SeenRow = {
  category?: string | null;
  seen_through?: string | null;
};

type TimestampedRow = {
  id?: string | null;
  user_id?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  survey_key?: string | null;
  status?: string | null;
};

type TableFilterBuilder = {
  eq(column: string, value: unknown): this;
  in(column: string, values: readonly unknown[]): this;
  is(column: string, value: unknown): this;
};

const epochIso = '1970-01-01T00:00:00.000Z';
const categorySet = new Set<string>(adminActivityCategories);

const isOptionalDataError = (error: unknown) => {
  const apiError = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const message = `${apiError?.message || ''} ${apiError?.details || ''} ${apiError?.hint || ''}`.toLowerCase();

  return (
    apiError?.code === '42P01' ||
    apiError?.code === '42703' ||
    apiError?.code === 'PGRST204' ||
    apiError?.code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('admin_activity_seen')
  );
};

const parseTime = (value?: string | null) => {
  const time = Date.parse(String(value || ''));

  return Number.isFinite(time) ? time : 0;
};

const normalizeTimestamp = (value?: string | null) => {
  const time = parseTime(value);

  return time > 0 ? new Date(time).toISOString() : '';
};

const normalizeCheckpointTimestamp = (value?: string | null) => {
  const timestamp = String(value || '').trim();

  return parseTime(timestamp) > 0 ? timestamp : '';
};

const compareTimestamps = (left?: string | null, right?: string | null) => {
  const leftTime = parseTime(left);
  const rightTime = parseTime(right);

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return String(left || '').localeCompare(String(right || ''));
};

export const normalizeAdminActivityCategory = (value?: string | null): AdminActivityCategory | null => {
  const category = String(value || '').trim();

  return categorySet.has(category) ? category as AdminActivityCategory : null;
};

const getAdminBase = (lang: 'it' | 'en' = 'it') =>
  lang === 'en' ? '/en/admin' : '/admin';

const emptyCategorySummary = (
  category: AdminActivityCategory,
  seenThrough: string | null,
  adminBase: string,
  error = ''
): AdminActivityCategorySummary => ({
  category,
  unreadCount: 0,
  latestAt: null,
  latestHref: getCategoryFallbackHref(category, adminBase),
  seenThrough,
  error,
});

const getCategoryFallbackHref = (category: AdminActivityCategory, adminBase: string) => {
  if (category === 'users') return `${adminBase}/users/`;
  if (category === 'comments') return `${adminBase}/comments/?status=all`;
  if (category === 'newsletter') return `${adminBase}/newsletter/`;
  if (category === 'surveys') return '/admin/';

  return `${adminBase}/`;
};

const getSeenMap = async (adminUserId: string) => {
  const { data, error } = await supabaseAdmin
    .from('admin_activity_seen')
    .select('category, seen_through')
    .eq('admin_user_id', adminUserId);

  if (error) {
    if (isOptionalDataError(error)) {
      return {
        available: false,
        seenThroughByCategory: new Map<AdminActivityCategory, string>(),
        error: 'Admin activity read state is not configured.',
      };
    }

    logApiError('admin-activity.seen-map', error);

    return {
      available: false,
      seenThroughByCategory: new Map<AdminActivityCategory, string>(),
      error: 'Admin activity read state unavailable.',
    };
  }

  const seenThroughByCategory = new Map<AdminActivityCategory, string>();

  for (const row of (data || []) as SeenRow[]) {
    const category = normalizeAdminActivityCategory(row.category);
    const seenThrough = normalizeCheckpointTimestamp(row.seen_through);

    if (category && seenThrough) {
      seenThroughByCategory.set(category, seenThrough);
    }
  }

  return {
    available: true,
    seenThroughByCategory,
    error: '',
  };
};

const getProfileUserIds = async () => {
  const userIds = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .range(from, from + pageSize - 1);

    if (error) {
      logApiError('admin-activity.users-profiles', error);

      return {
        userIds,
        error: 'Count unavailable',
      };
    }

    for (const row of data || []) {
      const userId = String(row.user_id || '').trim();

      if (userId) {
        userIds.add(userId);
      }
    }

    if ((data || []).length < pageSize) {
      break;
    }
  }

  return {
    userIds,
    error: '',
  };
};

const getAuthUserEvents = async (seenThrough: string, adminBase: string) => {
  const profileResult = await getProfileUserIds();

  if (profileResult.error) {
    return {
      unreadCount: 0,
      latestAt: null,
      latestHref: `${adminBase}/users/`,
      error: profileResult.error,
    };
  }

  const users: Array<{ id?: string | null; created_at?: string | null }> = [];
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      logApiError('admin-activity.users-auth', error);

      return {
        unreadCount: 0,
        latestAt: null,
        latestHref: `${adminBase}/users/`,
        error: 'Count unavailable',
      };
    }

    users.push(...(data.users ?? []));

    if ((data.users ?? []).length < perPage) {
      break;
    }
  }

  const manageableUsers = users.filter((user) => {
    const userId = String(user.id || '').trim();

    return userId && profileResult.userIds.has(userId);
  });
  const seenTime = parseTime(seenThrough);
  const unreadUsers = manageableUsers
    .filter((user) => parseTime(user.created_at) > seenTime)
    .sort((a, b) => parseTime(b.created_at) - parseTime(a.created_at));
  const latestUser = unreadUsers[0] || [...manageableUsers].sort((a, b) => parseTime(b.created_at) - parseTime(a.created_at))[0];

  return {
    unreadCount: unreadUsers.length,
    latestAt: normalizeTimestamp(latestUser?.created_at) || null,
    latestHref: latestUser?.id ? `${adminBase}/users/${encodeURIComponent(latestUser.id)}/` : `${adminBase}/users/`,
    error: '',
  };
};

const getTableEventStats = async ({
  category,
  table,
  timestampColumn,
  seenThrough,
  adminBase,
  select,
  applyFilters,
  getHref,
}: {
  category: AdminActivityCategory;
  table: string;
  timestampColumn: 'created_at' | 'submitted_at';
  seenThrough: string;
  adminBase: string;
  select: string;
  applyFilters?: <T extends TableFilterBuilder>(query: T) => T;
  getHref: (row?: TimestampedRow | null) => string;
}) => {
  const buildBaseQuery = (
    columns: string,
    options?: { count: 'exact'; head: true }
  ) => {
    const query = supabaseAdmin.from(table).select(columns, options);

    return applyFilters ? applyFilters(query) : query;
  };
  const countResult = await buildBaseQuery('id', { count: 'exact', head: true })
    .gt(timestampColumn, seenThrough);
  const latestResult = await buildBaseQuery(select)
    .order(timestampColumn, { ascending: false })
    .limit(1);

  if (countResult.error || latestResult.error) {
    const error = countResult.error || latestResult.error;

    if (!isOptionalDataError(error)) {
      logApiError(`admin-activity.${category}`, error);
    }

    return {
      unreadCount: 0,
      latestAt: null,
      latestHref: getCategoryFallbackHref(category, adminBase),
      error: 'Count unavailable',
    };
  }

  const latestRow = ((latestResult.data || []) as TimestampedRow[])[0] || null;

  return {
    unreadCount: countResult.count ?? 0,
    latestAt: normalizeTimestamp(latestRow?.[timestampColumn]) || null,
    latestHref: getHref(latestRow),
    error: '',
  };
};

const getCategoryEventStats = async (
  category: AdminActivityCategory,
  seenThrough: string,
  adminBase: string
) => {
  if (category === 'users') {
    return getAuthUserEvents(seenThrough, adminBase);
  }

  if (category === 'comments') {
    return getTableEventStats({
      category,
      table: 'comments',
      timestampColumn: 'created_at',
      seenThrough,
      adminBase,
      select: 'id, status, created_at',
      applyFilters: (query) =>
        query
          .in('status', ['pending', 'approved'])
          .is('deleted_at', null),
      getHref: (row) => {
        const status = row?.status === 'pending' ? 'pending' : row?.status === 'approved' ? 'approved' : 'all';

        return `${adminBase}/comments/?status=${status}`;
      },
    });
  }

  if (category === 'surveys') {
    return getTableEventStats({
      category,
      table: 'community_survey_responses',
      timestampColumn: 'submitted_at',
      seenThrough,
      adminBase,
      select: 'id, survey_key, submitted_at',
      getHref: (row) => {
        const surveyKey = String(row?.survey_key || '').trim();

        return surveyKey
          ? `/admin/surveys/${encodeURIComponent(surveyKey)}/`
          : '/admin/';
      },
    });
  }

  return getTableEventStats({
    category,
    table: 'newsletter_subscribers',
    timestampColumn: 'created_at',
    seenThrough,
    adminBase,
    select: 'id, status, created_at',
    applyFilters: (query) => query.eq('status', 'active'),
    getHref: () => `${adminBase}/newsletter/`,
  });
};

export async function getAdminActivitySummary({
  adminUserId,
  lang = 'it',
}: {
  adminUserId?: string | null;
  lang?: 'it' | 'en';
}): Promise<AdminActivitySummary> {
  const adminBase = getAdminBase(lang);
  const emptyCategories = Object.fromEntries(
    adminActivityCategories.map((category) => [
      category,
      emptyCategorySummary(category, null, adminBase),
    ])
  ) as Record<AdminActivityCategory, AdminActivityCategorySummary>;

  if (!adminUserId) {
    return {
      available: false,
      totalUnread: 0,
      categories: emptyCategories,
      error: 'Missing admin user.',
    };
  }

  const seenState = await getSeenMap(adminUserId);

  if (!seenState.available) {
    return {
      available: false,
      totalUnread: 0,
      categories: Object.fromEntries(
        adminActivityCategories.map((category) => [
          category,
          emptyCategorySummary(category, null, adminBase, seenState.error),
        ])
      ) as Record<AdminActivityCategory, AdminActivityCategorySummary>,
      error: seenState.error,
    };
  }

  const entries = await Promise.all(
    adminActivityCategories.map(async (category) => {
      const seenThrough = seenState.seenThroughByCategory.get(category) || epochIso;
      const stats = await getCategoryEventStats(category, seenThrough, adminBase);

      return [
        category,
        {
          category,
          unreadCount: Math.max(0, stats.unreadCount),
          latestAt: stats.latestAt,
          latestHref: stats.latestHref,
          seenThrough,
          error: stats.error,
        } satisfies AdminActivityCategorySummary,
      ] as const;
    })
  );
  const categories = Object.fromEntries(entries) as Record<AdminActivityCategory, AdminActivityCategorySummary>;
  const totalUnread = adminActivityCategories.reduce(
    (sum, category) => sum + categories[category].unreadCount,
    0
  );

  return {
    available: true,
    totalUnread,
    categories,
    error: '',
  };
}

export async function getUnreadAdminActivityCount(adminUserId?: string | null) {
  const summary = await getAdminActivitySummary({ adminUserId });

  return {
    count: summary.available ? summary.totalUnread : 0,
    error: summary.available ? null : summary.error,
  };
}

export async function markAdminActivitySeen({
  adminUserId,
  category,
  seenThrough,
}: {
  adminUserId?: string | null;
  category?: string | null;
  seenThrough?: string | null;
}) {
  const normalizedCategory = normalizeAdminActivityCategory(category);
  const normalizedSeenThrough = normalizeCheckpointTimestamp(seenThrough) || new Date().toISOString();

  if (!adminUserId || !normalizedCategory) {
    return {
      ok: false,
      error: 'Invalid request.',
    };
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('admin_activity_seen')
    .select('seen_through')
    .eq('admin_user_id', adminUserId)
    .eq('category', normalizedCategory)
    .maybeSingle();

  if (existingError) {
    if (!isOptionalDataError(existingError)) {
      logApiError('admin-activity.mark.lookup', existingError);
    }

    return {
      ok: false,
      error: 'Admin activity read state unavailable.',
    };
  }

  const currentSeenThrough = normalizeCheckpointTimestamp(existing?.seen_through);
  const nextSeenThrough = compareTimestamps(currentSeenThrough, normalizedSeenThrough) > 0
    ? currentSeenThrough
    : normalizedSeenThrough;

  if (currentSeenThrough === nextSeenThrough) {
    return {
      ok: true,
      category: normalizedCategory,
      seenThrough: nextSeenThrough,
      unchanged: true,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('admin_activity_seen')
    .upsert({
      admin_user_id: adminUserId,
      category: normalizedCategory,
      seen_through: nextSeenThrough,
    }, {
      onConflict: 'admin_user_id,category',
    })
    .select('category, seen_through')
    .single();

  if (error) {
    if (!isOptionalDataError(error)) {
      logApiError('admin-activity.mark.upsert', error);
    }

    return {
      ok: false,
      error: 'Admin activity read state unavailable.',
    };
  }

  return {
    ok: true,
    category: normalizeAdminActivityCategory(data.category),
    seenThrough: normalizeCheckpointTimestamp(data.seen_through),
    unchanged: false,
  };
}

export async function markAdminActivityCategoryRead({
  adminUserId,
  category,
}: {
  adminUserId?: string | null;
  category?: string | null;
  lang?: 'it' | 'en';
}) {
  const normalizedCategory = normalizeAdminActivityCategory(category);

  if (!adminUserId || !normalizedCategory) {
    return {
      ok: false,
      error: 'Invalid request.',
    };
  }

  // A read action represents the admin checkpoint at the time of the action.
  // Do not reuse the latest event timestamp here: Supabase timestamps can keep
  // microsecond precision, while Date normalization only preserves milliseconds,
  // leaving the latest row falsely counted as unread.
  return markAdminActivitySeen({
    adminUserId,
    category: normalizedCategory,
    seenThrough: new Date().toISOString(),
  });
}

export async function markAllAdminActivityRead({
  adminUserId,
  lang = 'it',
}: {
  adminUserId?: string | null;
  lang?: 'it' | 'en';
}) {
  if (!adminUserId) {
    return {
      ok: false,
      error: 'Invalid request.',
      updated: 0,
    };
  }

  const results = await Promise.all(
    adminActivityCategories.map((category) =>
      markAdminActivityCategoryRead({
        adminUserId,
        category,
        lang,
      })
    )
  );
  const failed = results.find((result) => !result.ok);

  if (failed) {
    return {
      ok: false,
      error: failed.error || 'Admin activity read state unavailable.',
      updated: results.filter((result) => result.ok).length,
    };
  }

  return {
    ok: true,
    updated: results.length,
  };
}
