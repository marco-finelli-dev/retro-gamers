import type { APIRoute } from 'astro';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';
import { markPrivateConversationRead } from '../../../../lib/supabase/private-messages';

type ReadPayload = {
  conversationId?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ cookies, request }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Sessione non valida.' }, session.status || 401);
  }

  let payload: ReadPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const result = await markPrivateConversationRead(session.user.id, String(payload.conversationId || ''));

  return json({ ok: result.ok, error: result.error }, result.status || 200);
};
