import type { APIRoute } from 'astro';
import { getUserProfileFromToken } from '../../../../lib/supabase/auth';
import {
  getOrCreatePrivateConversationByUsername,
  getOrCreatePrivateConversationByUserId,
} from '../../../../lib/supabase/private-messages';

type StartPayload = {
  username?: string;
  userId?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ cookies, request }) => {
  const token = cookies.get('rg_access_token')?.value ?? '';
  const session = await getUserProfileFromToken(token);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Sessione non valida.' }, session.status || 401);
  }

  let payload: StartPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const username = String(payload.username || '').trim();
  const userId = String(payload.userId || '').trim();
  const result = username
    ? await getOrCreatePrivateConversationByUsername(session.user.id, username)
    : await getOrCreatePrivateConversationByUserId(session.user.id, userId);

  if (!result.conversation) {
    return json({ ok: false, error: result.error || 'Conversazione non disponibile.' }, result.status || 500);
  }

  return json({
    ok: true,
    conversationId: result.conversation.id,
    url: `/account/messages/private/${result.conversation.id}/`,
  }, result.status || 200);
};
