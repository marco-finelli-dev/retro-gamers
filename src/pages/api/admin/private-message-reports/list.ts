import type { APIRoute } from 'astro';
import { getUserProfileFromToken, isStaffProfile } from '../../../../lib/supabase/auth';
import { getPrivateMessageReports, isPrivateMessagesUnavailable } from '../../../../lib/supabase/private-messages';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies, url }) => {
  const token = cookies.get('rg_access_token')?.value ?? '';
  const session = await getUserProfileFromToken(token);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error || 'Sessione non valida.' }, session.status || 401);
  }

  if (!isStaffProfile(session.profile)) {
    return json({ ok: false, error: 'Permessi insufficienti.' }, 403);
  }

  const status = String(url.searchParams.get('status') || 'open');
  const safeStatus = status === 'resolved' || status === 'all' ? status : 'open';
  const { reports, error } = await getPrivateMessageReports(safeStatus);

  if (error) {
    return json({
      ok: false,
      error: isPrivateMessagesUnavailable(error)
        ? 'Segnalazioni non disponibili. Esegui lo SQL private-messages.sql in Supabase.'
        : 'Segnalazioni non disponibili.',
    }, isPrivateMessagesUnavailable(error) ? 503 : 500);
  }

  return json({ ok: true, reports, filters: { status: safeStatus } });
};
