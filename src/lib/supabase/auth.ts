import { supabaseAdmin, supabasePublic } from './server';
import { getAvatarPublicUrl, isMissingAvatarColumnError } from './avatars';

export const authAccessCookie = 'rg_access_token';
export const authRefreshCookie = 'rg_refresh_token';
export const authAccessCookieMaxAge = 60 * 60;
export const authRefreshCookieMaxAge = 60 * 60 * 24 * 30;

const authCookieOptions = {
  path: '/',
  httpOnly: true,
  secure: import.meta.env.PROD,
  sameSite: 'lax' as const,
};

export function isBlockedProfileStatus(status?: string | null) {
  return status === 'blocked' || status === 'suspended' || status === 'banned';
}

export function setAuthSessionCookies(cookies: any, session: { access_token: string; refresh_token?: string }) {
  cookies.set(authAccessCookie, session.access_token, {
    ...authCookieOptions,
    maxAge: authAccessCookieMaxAge,
  });

  if (session.refresh_token) {
    cookies.set(authRefreshCookie, session.refresh_token, {
      ...authCookieOptions,
      maxAge: authRefreshCookieMaxAge,
    });
  }
}

export function clearAuthSessionCookies(cookies: any) {
  cookies.delete(authAccessCookie, { path: '/' });
  cookies.delete(authRefreshCookie, { path: '/' });
}

export async function getUserProfileFromToken(token: string) {
  if (!token) {
    return {
      user: null,
      profile: null,
      error: 'Sessione assente.',
      status: 401,
    };
  }

  const { data: userData, error: userError } = await supabasePublic.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      user: null,
      profile: null,
      error: 'Sessione non valida.',
      status: 401,
    };
  }

  const user = userData.user;

  const profileSelect = `
      id,
      user_id,
      username,
      display_name,
      avatar_path,
      badge_key,
      role,
      status,
      notify_replies_to_my_comments,
      notify_threads_i_join,
      user_badges (
        key,
        label_it,
        label_en,
        image_path
      )
    `;
  const profileSelectFallback = profileSelect.replace('avatar_path,', '');

  let { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(profileSelect)
    .eq('user_id', user.id)
    .maybeSingle();

  if (isMissingAvatarColumnError(profileError)) {
    const fallbackResult = await supabaseAdmin
      .from('profiles')
      .select(profileSelectFallback)
      .eq('user_id', user.id)
      .maybeSingle();

    profile = fallbackResult.data;
    profileError = fallbackResult.error;
  }

  if (profileError) {
    return {
      user,
      profile: null,
      error: profileError.message,
      status: 500,
    };
  }

  if (!profile) {
    return {
      user,
      profile: null,
      error: 'Profilo lettore non trovato.',
      status: 404,
    };
  }

  if (isBlockedProfileStatus(profile.status)) {
    return {
      user,
      profile,
      error: 'Account bloccato.',
      status: 403,
    };
  }

  return {
    user,
    profile: {
      ...profile,
      avatar_url: getAvatarPublicUrl(profile.avatar_path),
    },
    error: null,
    status: 200,
  };
}

export async function getUserSessionFromCookies(cookies: any) {
  const accessToken = cookies.get(authAccessCookie)?.value ?? '';
  const currentSession = await getUserProfileFromToken(accessToken);

  if (!currentSession.error && currentSession.user && currentSession.profile) {
    return {
      ...currentSession,
      refreshed: false,
    };
  }

  const refreshToken = cookies.get(authRefreshCookie)?.value ?? '';

  if (!refreshToken) {
    return {
      ...currentSession,
      refreshed: false,
    };
  }

  const { data, error } = await supabasePublic.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session?.access_token) {
    return {
      user: null,
      profile: null,
      error: 'Sessione scaduta. Accedi di nuovo.',
      status: 401,
      refreshed: false,
    };
  }

  setAuthSessionCookies(cookies, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token || refreshToken,
  });

  const refreshedSession = await getUserProfileFromToken(data.session.access_token);

  return {
    ...refreshedSession,
    refreshed: true,
  };
}

export function isStaffProfile(profile: { role?: string } | null) {
  return profile?.role === 'admin' || profile?.role === 'moderator';
}
