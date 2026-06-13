import type { APIRoute } from 'astro';
import {
  createSupabaseOAuthClient,
  getSiteUrl,
  isSocialOAuthProvider,
  normalizeReturnTo,
  oauthCodeVerifierCookie,
} from '../../../../lib/supabase/oauth';

const redirectToLogin = (origin: string, reason = 'oauth') =>
  Response.redirect(`${origin}/account/login/?oauthError=${encodeURIComponent(reason)}`, 303);

export const GET: APIRoute = async ({ cookies, url }) => {
  const provider = url.searchParams.get('provider');

  if (!isSocialOAuthProvider(provider)) {
    return redirectToLogin(url.origin, 'provider');
  }

  const returnTo = normalizeReturnTo(url.searchParams.get('returnTo'));
  const callbackOrigin =
    url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      ? url.origin
      : getSiteUrl();
  const callbackUrl = `${callbackOrigin}/api/auth/oauth/callback?returnTo=${encodeURIComponent(returnTo)}`;
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

  cookies.set(oauthCodeVerifierCookie, codeVerifier, {
    path: '/api/auth/oauth',
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    maxAge: 10 * 60,
  });

  return Response.redirect(data.url, 302);
};
