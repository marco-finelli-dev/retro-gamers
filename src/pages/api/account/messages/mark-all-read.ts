import type { APIRoute } from 'astro';
import { markAllAccountMessagesRead } from '../../../../lib/supabase/account-messages';
import { getUserProfileFromToken } from '../../../../lib/supabase/auth';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ cookies }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  const { error } = await markAllAccountMessagesRead(session.user.id);

  if (error) {
    return json({ ok: false, error: error.message }, 500);
  }

  return json({ ok: true });
};
