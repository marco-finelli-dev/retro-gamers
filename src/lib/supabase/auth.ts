import { supabaseAdmin, supabasePublic } from './server';

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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(`
      id,
      user_id,
      username,
      display_name,
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
    `)
    .eq('user_id', user.id)
    .maybeSingle();

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

  if (profile.status === 'blocked') {
    return {
      user,
      profile,
      error: 'Account bloccato.',
      status: 403,
    };
  }

  return {
    user,
    profile,
    error: null,
    status: 200,
  };
}

export function isStaffProfile(profile: { role?: string } | null) {
  return profile?.role === 'admin' || profile?.role === 'moderator';
}
