import type { APIRoute } from 'astro';
import { getUnreadAccountMessageCount } from '../../../../lib/supabase/account-messages';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';
import { getUnreadPrivateMessageCount } from '../../../../lib/supabase/private-messages';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user) {
    return json({ ok: true, unreadCount: 0 });
  }

  const [accountResult, privateResult] = await Promise.all([
    getUnreadAccountMessageCount(session.user.id),
    getUnreadPrivateMessageCount(session.user.id),
  ]);

  const systemUnreadCount = accountResult.error ? 0 : accountResult.count;
  const privateUnreadCount = privateResult.error ? 0 : privateResult.count;

  return json({
    ok: true,
    unreadCount: systemUnreadCount + privateUnreadCount,
    systemUnreadCount,
    privateUnreadCount,
  });
};
