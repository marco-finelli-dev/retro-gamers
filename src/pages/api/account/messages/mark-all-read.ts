import type { APIRoute } from 'astro';
import { markAllAccountMessagesRead } from '../../../../lib/supabase/account-messages';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  const { error, updatedCount } = await markAllAccountMessagesRead(session.user.id);

  if (error) {
    return json({ ok: false, error: 'Messaggi non aggiornati.' }, 500);
  }

  return json({ ok: true, updatedCount });
};
