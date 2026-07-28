import type { APIRoute } from 'astro';
import {
  createSupabaseOAuthClient,
  getSiteUrl,
  isSocialOAuthProvider,
  normalizeReturnTo,
  oauthCodeVerifierCookie,
} from '../../../../lib/supabase/oauth';

const redirect = (location: string, status = 302, setCookie?: string) => {
  const headers = new Headers({ Location: location });

  if (setCookie) {
    headers.set('Set-Cookie', setCookie);
  }

  return new Response(null, { status, headers });
};

const serializeCookie = (
  name: string,
  value: string,
  {
    maxAge,
    path,
    secure,
  }: {
    maxAge: number;
    path: string;
    secure: boolean;
  }
) => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
    'HttpOnly',
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
};

const redirectToLogin = (origin: string, reason = 'oauth') =>
  redirect(`${origin}/account/login/?oauthError=${encodeURIComponent(reason)}`, 303);

export const GET: APIRoute = async ({ url }) => {
  const provider = url.searchParams.get('provider');

  if (!isSocialOAuthProvider(provider)) {
    return redirectToLogin(url.origin, 'provider');
  }

  const returnTo = normalizeReturnTo(url.searchParams.get('returnTo'));
  const callbackOrigin =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      ? url.origin
      : getSiteUrl();
  const callbackUrl =
    `${callbackOrigin}/api/auth/oauth/callback?returnTo=${encodeURIComponent(returnTo)}&provider=${encodeURIComponent(provider)}`;
  const { client, getCodeVerifier } = createSupabaseOAuthClient();

  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
    },
  });

  const codeVerifier = getCodeVerifier();

  if (error || !data.url || !codeVerifier) {
    console.error('OAuth start failed:', {
      provider,
      message: error?.message,
      hasUrl: Boolean(data.url),
      hasCodeVerifier: Boolean(codeVerifier),
    });

    return redirectToLogin(url.origin, 'start');
  }

  const verifierCookie = serializeCookie(oauthCodeVerifierCookie, codeVerifier, {
    path: '/api/auth/oauth',
    secure: import.meta.env.PROD,
    maxAge: 10 * 60,
  });

  return redirect(data.url, 302, verifierCookie);
};
