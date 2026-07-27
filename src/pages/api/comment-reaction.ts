import type { APIRoute } from 'astro';

export const prerender = false;

const gone = () =>
  new Response(JSON.stringify({ error: 'This endpoint is no longer available.' }), {
    status: 410,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

export const ALL: APIRoute = () => gone();
