import type { APIRoute } from 'astro';
import { getUnreadAccountMessageCount } from '../../../../lib/supabase/account-messages';
import { getUserProfileFromToken } from '../../../../lib/supabase/auth';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.user) {
    return json({ ok: true, unreadCount: 0 });
  }

  const { count, error } = await getUnreadAccountMessageCount(session.user.id);

  if (error) {
    return json({ ok: true, unreadCount: 0, warning: error.message });
  }

  return json({ ok: true, unreadCount: count });
};
