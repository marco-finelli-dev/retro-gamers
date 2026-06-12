import type { APIRoute } from 'astro';
import { supabaseAdmin } from '../../../../lib/supabase/server';
import { getUserProfileFromToken, isStaffProfile } from '../../../../lib/supabase/auth';

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

const fetchAllProfiles = async () => {
  const rows = [];
  const pageSize = 1000;

  for (let from = 0; from < 10000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, user_id, username, display_name, role, status, badge_key')
      .range(from, from + pageSize - 1);

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
    const [authUsers, profiles, commentStats] = await Promise.all([
      fetchAllAuthUsers(),
      fetchAllProfiles(),
      fetchCommentStats(),
    ]);

    const authByUserId = new Map(authUsers.map((user) => [user.id, user]));
    const viewerRole = session.profile.role === 'admin' ? 'admin' : 'moderator';

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

      return {
        id: profile.id,
        userId: profile.user_id,
        email: authUser?.email || '',
        username: profile.username || '',
        displayName: profile.display_name || '',
        role,
        status,
        createdAt: authUser?.created_at || null,
        emailConfirmedAt: authUser?.email_confirmed_at || null,
        comments,
        isSelf,
        canManageRole: viewerRole === 'admin' && !isSelf,
        canManageStatus:
          !isSelf && (viewerRole === 'admin' || (viewerRole === 'moderator' && role === 'user')),
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
      users,
      filters: {
        q: search,
      },
    });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : 'Errore caricamento utenti.',
    }, 500);
  }
};
