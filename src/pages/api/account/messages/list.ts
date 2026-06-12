import type { APIRoute } from 'astro';
import { getAccountMessages, getUnreadAccountMessageCount } from '../../../../lib/supabase/account-messages';
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
    return json({ ok: false, error: session.error }, session.status);
  }

  const [{ messages, error }, unreadResult] = await Promise.all([
    getAccountMessages(session.user.id),
    getUnreadAccountMessageCount(session.user.id),
  ]);

  if (error) {
    return json({ ok: false, error: 'Messaggi non disponibili.' }, 500);
  }

  return json({
    ok: true,
    messages,
    unreadCount: unreadResult.error ? 0 : unreadResult.count,
  });
};
