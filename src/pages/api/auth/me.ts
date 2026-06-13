import type { APIRoute } from 'astro';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return json({ ok: false, error: session.error }, session.status);
  }

  return json({
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      emailConfirmedAt: session.user.email_confirmed_at,
    },
    profile: session.profile,
  });
};
