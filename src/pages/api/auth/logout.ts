import type { APIRoute } from 'astro';
import { clearAuthSessionCookies } from '../../../lib/supabase/auth';

export const POST: APIRoute = async ({ cookies }) => {
  clearAuthSessionCookies(cookies);

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Logout effettuato.',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
};
