import type { APIRoute } from 'astro';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';
import { reportPrivateMessage } from '../../../../lib/supabase/private-messages';

type ReportPayload = {
  conversationId?: string;
  messageId?: string;
  reason?: string;
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

  let payload: ReportPayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const result = await reportPrivateMessage(
    session.user.id,
    String(payload.conversationId || ''),
    {
      messageId: payload.messageId || null,
      reason: payload.reason || null,
    }
  );

  return json(
    {
      ok: result.ok,
      reportId: result.reportId,
      error: result.error,
    },
    result.status || 200
  );
};
