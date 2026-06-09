import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ cookies }) => {
  cookies.delete('rg_access_token', { path: '/' });
  cookies.delete('rg_refresh_token', { path: '/' });

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
