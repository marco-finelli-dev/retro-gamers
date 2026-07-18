import type { APIRoute } from 'astro';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import {
  getLanguageSessionOverrideFromCookies,
  resolveEffectiveLanguage,
} from '../../../lib/preferred-language';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

export const GET: APIRoute = async ({ cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    if (session.status === 401) {
      return json({
        ok: true,
        isAuthenticated: false,
        user: null,
        profile: null,
      });
    }

    return json({
      ok: false,
      isAuthenticated: false,
      user: null,
      profile: null,
      error: session.error,
    }, session.status);
  }

  const {
    preferred_language: preferredLanguage,
    retro_experience: retroExperience,
    ...profile
  } = session.profile;
  const effectiveLanguage = resolveEffectiveLanguage({
    sessionOverride: getLanguageSessionOverrideFromCookies(cookies),
    profileLanguage: preferredLanguage,
    authenticated: true,
  });

  return json({
    ok: true,
    isAuthenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      emailConfirmedAt: session.user.email_confirmed_at,
    },
    profile,
    preferences: {
      preferredLanguage,
      effectiveLanguage,
      retroExperience,
    },
  });
};
