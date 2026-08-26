import type { APIRoute } from 'astro';
import { getUserSessionFromCookies } from '../../../lib/supabase/auth';
import { getEditorialSessionForUserSession } from '../../../lib/editorial/session.server';

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
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
    retro_experience: retroExperience,
    ...profile
  } = session.profile;
  delete (profile as Record<string, unknown>).preferred_language;
  const editorialSession = await getEditorialSessionForUserSession(session);

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
      preferredLanguage: null,
      effectiveLanguage: null,
      retroExperience,
    },
    editorial: {
      hasAccess: editorialSession.isEditorialActive,
    },
  });
};
