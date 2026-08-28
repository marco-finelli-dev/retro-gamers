import type { APIRoute } from 'astro';
import { getAdminActivitySummary } from '../../../../lib/admin/activity.server';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

export const GET: APIRoute = async ({ cookies, url }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error || 'Unauthorized.' }, session.status || 401);
  }

  if (session.profile.role !== 'admin' || session.profile.status !== 'active') {
    return json({ ok: false, error: 'Forbidden.', code: 'forbidden' }, 403);
  }

  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'it';
  const summary = await getAdminActivitySummary({
    adminUserId: session.user.id,
    lang,
  });

  return json({
    ok: true,
    unreadCount: summary.totalUnread,
    available: summary.available,
    categories: summary.categories,
  });
};
