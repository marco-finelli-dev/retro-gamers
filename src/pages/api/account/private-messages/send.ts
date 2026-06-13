import type { APIRoute } from 'astro';
import { getUserProfileFromToken } from '../../../../lib/supabase/auth';
import { sendPrivateMessage } from '../../../../lib/supabase/private-messages';

type SendPayload = {
  conversationId?: string;
  body?: string;
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

  let payload: SendPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const result = await sendPrivateMessage(
    session.user.id,
    String(payload.conversationId || ''),
    String(payload.body || '')
  );

  if (!result.message) {
    return json({ ok: false, error: result.error || 'Messaggio non inviato.' }, result.status || 500);
  }

  return json({ ok: true, message: result.message }, result.status || 201);
};
