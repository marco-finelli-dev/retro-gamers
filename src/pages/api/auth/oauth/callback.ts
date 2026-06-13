import type { APIRoute } from 'astro';
import {
  createSupabaseOAuthClient,
  ensureOAuthUserProfile,
  normalizeReturnTo,
  oauthCodeVerifierCookie,
} from '../../../../lib/supabase/oauth';

const authCookieOptions = {
  path: '/',
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: 'lax' as const,
};

const redirectToLogin = (origin: string, reason = 'oauth') =>
  Response.redirect(`${origin}/account/login/?oauthError=${encodeURIComponent(reason)}`, 303);

export const GET: APIRoute = async ({ cookies, url }) => {
  const error = url.searchParams.get('error') || url.searchParams.get('error_description');
  const code = url.searchParams.get('code');
  const returnTo = normalizeReturnTo(url.searchParams.get('returnTo'));
  const codeVerifier = cookies.get(oauthCodeVerifierCookie)?.value || '';

  cookies.delete(oauthCodeVerifierCookie, { path: '/api/auth/oauth' });

  if (error) {
    console.error('OAuth provider callback failed:', { message: error });
    return redirectToLogin(url.origin, 'provider');
  }

  if (!code || !codeVerifier) {
    console.error('OAuth callback missing code or verifier:', {
      hasCode: Boolean(code),
      hasCodeVerifier: Boolean(codeVerifier),
    });

    return redirectToLogin(url.origin, 'callback');
  }

  const { client } = createSupabaseOAuthClient(codeVerifier);
  const { data, error: exchangeError } = await client.auth.exchangeCodeForSession(code);
  const session = data.session;
  const user = data.user;

  if (exchangeError || !session || !user) {
    console.error('OAuth session exchange failed:', {
      message: exchangeError?.message,
      hasSession: Boolean(session),
      hasUser: Boolean(user),
    });

    return redirectToLogin(url.origin, 'session');
  }

  const profileResult = await ensureOAuthUserProfile(user);

  if (!profileResult.ok) {
    cookies.delete('rg_access_token', { path: '/' });
    cookies.delete('rg_refresh_token', { path: '/' });

    return redirectToLogin(url.origin, 'profile');
  }

  cookies.set('rg_access_token', session.access_token, {
    ...authCookieOptions,
    maxAge: 60 * 60,
  });

  cookies.set('rg_refresh_token', session.refresh_token, {
    ...authCookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });

  return Response.redirect(new URL(returnTo, url.origin).toString(), 303);
};
