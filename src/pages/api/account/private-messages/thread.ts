import type { APIRoute } from 'astro';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';
import { getPrivateConversationThread, isPrivateMessagesUnavailable } from '../../../../lib/supabase/private-messages';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies, url }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Sessione non valida.' }, session.status || 401);
  }

  const conversationId = String(url.searchParams.get('conversationId') || '').trim();

  if (!conversationId) {
    return json({ ok: false, error: 'Conversazione obbligatoria.' }, 400);
  }

  const { thread, error } = await getPrivateConversationThread(conversationId, session.user.id);

  if (error) {
    return json({
      ok: false,
      error: isPrivateMessagesUnavailable(error)
        ? 'Messaggi privati non disponibili. Esegui lo SQL private-messages.sql in Supabase.'
        : 'Conversazione non disponibile.',
    }, isPrivateMessagesUnavailable(error) ? 503 : 500);
  }

  if (!thread) {
    return json({ ok: false, error: 'Conversazione non trovata.' }, 404);
  }

  return json({ ok: true, thread });
};
