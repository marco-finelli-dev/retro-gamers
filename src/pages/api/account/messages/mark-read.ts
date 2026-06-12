import type { APIRoute } from 'astro';
import { markAccountMessageRead } from '../../../../lib/supabase/account-messages';
import { getUserProfileFromToken } from '../../../../lib/supabase/auth';

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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value);

export const POST: APIRoute = async ({ request, cookies }) => {
  const token = cookies.get('rg_access_token')?.value;
  const session = await getUserProfileFromToken(token ?? '');

  if (session.error || !session.user) {
    return json({ ok: false, error: session.error }, session.status);
  }

  let payload: MarkReadPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const messageId = payload.messageId?.trim() ?? '';

  if (!messageId || !isUuid(messageId)) {
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
