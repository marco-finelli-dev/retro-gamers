import type { APIRoute } from 'astro';
import { getUserProfileFromToken } from '../../../../lib/supabase/auth';
import { getPrivateConversations, isPrivateMessagesUnavailable } from '../../../../lib/supabase/private-messages';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const token = cookies.get('rg_access_token')?.value ?? '';
  const session = await getUserProfileFromToken(token);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Sessione non valida.' }, session.status || 401);
  }

  const { conversations, error } = await getPrivateConversations(session.user.id);

  if (error) {
    return json({
      ok: false,
      error: isPrivateMessagesUnavailable(error)
        ? 'Messaggi privati non disponibili. Esegui lo SQL private-messages.sql in Supabase.'
        : 'Conversazioni non disponibili.',
    }, isPrivateMessagesUnavailable(error) ? 503 : 500);
  }

  return json({ ok: true, conversations });
};
