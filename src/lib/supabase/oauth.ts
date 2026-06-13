import { createClient, type User } from '@supabase/supabase-js';
import { logApiError } from '../api-errors';
import { sendNewReaderRegistrationAdminEmail } from './account-emails';
import { createWelcomeAccountMessage } from './account-messages';
import { supabaseAdmin } from './server';

export type SocialOAuthProvider = 'google' | 'facebook';

export const socialOAuthProviders: SocialOAuthProvider[] = ['google', 'facebook'];
export const oauthCodeVerifierCookie = 'rg_oauth_code_verifier';

export const isSocialOAuthProvider = (value: string | null): value is SocialOAuthProvider =>
  value === 'google' || value === 'facebook';

export const getSiteUrl = () =>
  String(import.meta.env.PUBLIC_SITE_URL || import.meta.env.SITE || 'http://localhost:4321')
    .replace(/\/$/, '');

export const normalizeReturnTo = (value?: string | null) => {
  const returnTo = value?.trim() || '/account/';

  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return '/account/';
  }

  return returnTo;
};

const createOAuthStorage = (initialCodeVerifier = '') => {
  let codeVerifier = initialCodeVerifier;

  return {
    storage: {
      getItem(key: string) {
        return key.endsWith('-code-verifier') ? codeVerifier : null;
      },
      setItem(key: string, value: string) {
        if (key.endsWith('-code-verifier')) {
          codeVerifier = value;
        }
      },
      removeItem(key: string) {
        if (key.endsWith('-code-verifier')) {
          codeVerifier = '';
        }
      },
    },
    getCodeVerifier() {
      return codeVerifier;
    },
  };
};

export const createSupabaseOAuthClient = (initialCodeVerifier = '') => {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const oauthStorage = createOAuthStorage(initialCodeVerifier);

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: oauthStorage.storage,
    },
  });

  return {
    client,
    getCodeVerifier: oauthStorage.getCodeVerifier,
  };
};

const normalizeUsername = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 24);

const normalizeDisplayName = (value: string, fallback: string) => {
  const displayName = value.replace(/\s+/g, ' ').trim() || fallback;

  if (displayName.length >= 2 && displayName.length <= 40) {
    return displayName;
  }

  return displayName.slice(0, 40).trim() || fallback;
};

const getOAuthDisplayName = (user: User) => {
  const metadata = user.user_metadata || {};
  const emailName = user.email?.split('@')[0] || '';
  const rawDisplayName = String(
    metadata.full_name ||
    metadata.name ||
    metadata.display_name ||
    metadata.user_name ||
    emailName ||
    'Lettore Retro-Gamers'
  );

  return normalizeDisplayName(rawDisplayName, 'Lettore Retro-Gamers');
};

const getOAuthUsernameBase = (user: User, displayName: string) => {
  const metadata = user.user_metadata || {};
  const emailName = user.email?.split('@')[0] || '';
  const rawUsername = String(
    metadata.preferred_username ||
    metadata.user_name ||
    metadata.username ||
    emailName ||
    displayName ||
    'lettore'
  );
  const normalized = normalizeUsername(rawUsername);

  if (normalized.length >= 3) {
    return normalized;
  }

  return `lettore-${user.id.replace(/-/g, '').slice(0, 8)}`.slice(0, 24);
};

async function createUniqueUsername(user: User, displayName: string) {
  const base = getOAuthUsernameBase(user, displayName);
  const suffix = user.id.replace(/-/g, '').slice(0, 6);
  const candidates = [
    base,
    `${base.slice(0, Math.max(3, 23 - suffix.length))}-${suffix}`,
  ];

  for (const candidate of candidates) {
    const username = candidate.slice(0, 24);
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return username;
    }
  }

  return `lettore-${suffix}`;
}

export async function ensureOAuthUserProfile(user: User) {
  const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
    .from('profiles')
    .select('id, username, display_name, role, status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingProfileError) {
    logApiError('oauth-profile.lookup', existingProfileError);
    return { ok: false, created: false, error: existingProfileError.message };
  }

  if (existingProfile) {
    return { ok: true, created: false, profile: existingProfile };
  }

  const displayName = getOAuthDisplayName(user);
  let username = '';

  try {
    username = await createUniqueUsername(user, displayName);
  } catch (error) {
    logApiError('oauth-profile.username', error);
    return { ok: false, created: false, error: 'Username non disponibile.' };
  }

  const { data: insertedProfile, error: insertProfileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      user_id: user.id,
      username,
      display_name: displayName,
      role: 'user',
      status: 'active',
    })
    .select('id, username, display_name, role, status')
    .single();

  if (insertProfileError) {
    logApiError('oauth-profile.insert', insertProfileError);
    return { ok: false, created: false, error: insertProfileError.message };
  }

  try {
    await createWelcomeAccountMessage({
      userId: user.id,
      displayName,
    });
  } catch (error) {
    console.error('OAuth welcome account message failed:', error);
  }

  try {
    await sendNewReaderRegistrationAdminEmail({
      userId: user.id,
      email: user.email,
      username,
      displayName,
      createdAt: user.created_at,
    });
  } catch (error) {
    console.error('OAuth new reader registration admin notification failed:', error);
  }

  return { ok: true, created: true, profile: insertedProfile };
}
