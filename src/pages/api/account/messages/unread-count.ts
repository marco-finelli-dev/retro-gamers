import type { APIRoute } from 'astro';
import { getUnreadAdminActivityCount } from '../../../../lib/admin/activity.server';
import { getUnreadAccountMessageCount } from '../../../../lib/supabase/account-messages';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';
import { getUnreadPrivateMessageCount } from '../../../../lib/supabase/private-messages';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user) {
    return json({ ok: true, unreadCount: 0, adminUnreadCount: 0 });
  }

  const shouldLoadAdminUnread =
    session.profile?.role === 'admin' && session.profile?.status === 'active';
  const [accountResult, privateResult, adminResult] = await Promise.all([
    getUnreadAccountMessageCount(session.user.id),
    getUnreadPrivateMessageCount(session.user.id),
    shouldLoadAdminUnread
      ? getUnreadAdminActivityCount(session.user.id)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  const systemUnreadCount = accountResult.error ? 0 : accountResult.count;
  const privateUnreadCount = privateResult.error ? 0 : privateResult.count;
  const adminUnreadCount = adminResult.error ? 0 : adminResult.count;

  return json({
    ok: true,
    unreadCount: systemUnreadCount + privateUnreadCount,
    systemUnreadCount,
    privateUnreadCount,
    adminUnreadCount,
  });
};
