import type { APIRoute } from 'astro';
import { getUserProfileFromToken, isStaffProfile } from '../../../../lib/supabase/auth';
import { resolvePrivateMessageReport } from '../../../../lib/supabase/private-messages';

type ResolvePayload = {
  reportId?: string;
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

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  let payload: ResolvePayload;

  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Richiesta non valida.' }, 400);
  }

  const result = await resolvePrivateMessageReport(String(payload.reportId || ''), session.user.id);

  return json({ ok: result.ok, error: result.error }, result.status || 200);
};
