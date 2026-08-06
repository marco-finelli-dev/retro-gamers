import type { APIRoute } from 'astro';
import {
  getClearDraftModeCookieHeaders,
  getSafeRedirectPath
} from '../../../lib/sanity-preview';

export const GET: APIRoute = ({ cookies, url }) => {
  const redirectPath = getSafeRedirectPath(
    url.searchParams.get('redirectTo') || url.searchParams.get('returnTo')
  );

  const headers = new Headers({
    'Cache-Control': 'no-store',
    Location: redirectPath
  });

  for (const cookieHeader of getClearDraftModeCookieHeaders()) {
    headers.append('Set-Cookie', cookieHeader);
  }

  return new Response(null, {
    status: 307,
    headers
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
