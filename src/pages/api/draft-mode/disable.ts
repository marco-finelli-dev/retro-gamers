import type { APIRoute } from 'astro';
import { clearDraftModeCookies, getSafeRedirectPath } from '../../../lib/sanity-preview';

export const GET: APIRoute = ({ cookies, url }) => {
  const redirectPath = getSafeRedirectPath(
    url.searchParams.get('redirectTo') || url.searchParams.get('returnTo')
  );

  clearDraftModeCookies(cookies);

  return new Response(null, {
    status: 307,
    headers: {
      'Cache-Control': 'no-store',
      Location: redirectPath
    }
  });
};

export const ALL: APIRoute = () =>
  new Response('Method not allowed.', {
    status: 405,
    headers: {
      Allow: 'GET',
      'Cache-Control': 'no-store'
    }
  });
