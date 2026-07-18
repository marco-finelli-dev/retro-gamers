import type { APIRoute } from 'astro';
import { clearAuthSessionCookies } from '../../../lib/supabase/auth';
import { clearLanguageSessionOverrideCookie } from '../../../lib/preferred-language';

export const POST: APIRoute = async ({ cookies }) => {
  clearAuthSessionCookies(cookies);
  clearLanguageSessionOverrideCookie(cookies);

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
