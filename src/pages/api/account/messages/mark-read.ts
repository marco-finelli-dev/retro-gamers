import type { APIRoute } from 'astro';
import { normalizeUuid } from '../../../../lib/uuid';
import { markAccountMessageRead } from '../../../../lib/supabase/account-messages';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';

type MarkReadPayload = {
  messageId?: string;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  let payload: MarkReadPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const messageId = normalizeUuid(payload.messageId);

  if (!messageId) {
    return json({ ok: false, error: 'Messaggio non valido.' }, 400);
  }

  const { message, error } = await markAccountMessageRead(session.user.id, messageId);

  if (error) {
    return json({ ok: false, error: 'Messaggio non aggiornato.' }, 500);
  }

  if (!message) {
    return json({ ok: false, error: 'Messaggio non trovato.' }, 404);
  }

  return json({ ok: true, message });
};
