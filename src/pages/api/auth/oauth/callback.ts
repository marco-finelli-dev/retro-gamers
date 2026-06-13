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

type SerializedCookieOptions = {
  path: string;
  maxAge?: number;
  expires?: Date;
  secure: boolean;
};

const serializeCookie = (
  name: string,
  value: string,
  { expires, maxAge, path, secure }: SerializedCookieOptions
) => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    'SameSite=Lax',
    'HttpOnly',
  ];

  if (typeof maxAge === 'number') {
    parts.push(`Max-Age=${maxAge}`);
  }

  if (expires) {
    parts.push(`Expires=${expires.toUTCString()}`);
  }

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
};

const deleteCookie = (name: string, path: string) =>
  serializeCookie(name, '', {
    path,
    secure: import.meta.env.PROD,
    maxAge: 0,
    expires: new Date(0),
  });

const redirect = (location: string, status = 303, setCookies: string[] = []) =>
  new Response(null, {
    status,
    headers: [
      ['Location', location],
      ...setCookies.map((cookie) => ['Set-Cookie', cookie] as [string, string]),
    ],
  });

const redirectToLogin = (origin: string, reason = 'oauth') =>
  redirect(`${origin}/account/login/?oauthError=${encodeURIComponent(reason)}`, 303, [
    deleteCookie(oauthCodeVerifierCookie, '/api/auth/oauth'),
  ]);

export const GET: APIRoute = async ({ cookies, url }) => {
  const error = url.searchParams.get('error') || url.searchParams.get('error_description');
  const code = url.searchParams.get('code');
  const returnTo = normalizeReturnTo(url.searchParams.get('returnTo'));
  const codeVerifier = cookies.get(oauthCodeVerifierCookie)?.value || '';

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
    return redirect(`${url.origin}/account/login/?oauthError=${encodeURIComponent('profile')}`, 303, [
      deleteCookie(oauthCodeVerifierCookie, '/api/auth/oauth'),
      deleteCookie('rg_access_token', '/'),
      deleteCookie('rg_refresh_token', '/'),
    ]);
  }

  const setCookies = [
    deleteCookie(oauthCodeVerifierCookie, '/api/auth/oauth'),
    serializeCookie('rg_access_token', session.access_token, {
      ...authCookieOptions,
      maxAge: 60 * 60,
    }),
    serializeCookie('rg_refresh_token', session.refresh_token, {
      ...authCookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    }),
  ];

  return redirect(new URL(returnTo, url.origin).toString(), 303, setCookies);
};
