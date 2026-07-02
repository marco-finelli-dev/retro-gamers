import type { APIRoute } from 'astro';

export const prerender = false;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

// Legacy Sanity comment endpoint. Current comments use /api/comments/create.
export const POST: APIRoute = async () =>
  json({
    ok: false,
    error: 'Endpoint commenti legacy disattivato. Usa /api/comments/create.',
  }, 410);
