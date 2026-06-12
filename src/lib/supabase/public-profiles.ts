import { supabaseAdmin } from './server';
import { getAvatarPublicUrl, isMissingAvatarColumnError } from './avatars';

export type PublicReaderBadge = {
  key?: string | null;
  label_it?: string | null;
  label_en?: string | null;
  image_path?: string | null;
};

export type PublicReaderProfile = {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  bio?: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
  role: string | null;
  status: string | null;
  badge_key: string | null;
  user_badges?: PublicReaderBadge | null;
};

export type PublicReaderComment = {
  id: string;
  body: string | null;
  created_at: string | null;
  article_title: string | null;
  article_url: string | null;
  article_slug: string | null;
  article_language: 'it' | 'en' | string | null;
};

export type PublicReaderProfileResult = {
  profile: PublicReaderProfile | null;
  comments: PublicReaderComment[];
  approvedCount: number;
  error: string | null;
};

export const normalizePublicUsername = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80);

export const getPublicUserUrl = (username: string, lang: 'it' | 'en' = 'it') => {
  const safeUsername = encodeURIComponent(normalizePublicUsername(username));

  return lang === 'en'
    ? `/en/users/${safeUsername}/`
    : `/utenti/${safeUsername}/`;
};

export const getCommentArticleHref = (comment: PublicReaderComment) => {
  const anchor = `comment-${String(comment.id)}`;

  if (comment.article_url) {
    return `${comment.article_url.split('#')[0]}#${anchor}`;
  }

  if (!comment.article_slug) {
    return '#';
  }

  return comment.article_language === 'en'
    ? `/en/articles/${comment.article_slug}/#${anchor}`
    : `/articoli/${comment.article_slug}/#${anchor}`;
};

export const getCommentExcerpt = (body: string | null, maxLength = 180) => {
  const normalized = String(body || '').replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
};

const getProfileSelect = (includeBio = true, includeAvatar = true) => `
  id,
  user_id,
  username,
  display_name,
  ${includeBio ? 'bio,' : ''}
  ${includeAvatar ? 'avatar_path,' : ''}
  badge_key,
  role,
  status,
  user_badges (
    key,
    label_it,
    label_en,
    image_path
  )
`;

const isMissingBioColumnError = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (message.includes('bio') && (message.includes('column') || message.includes('schema cache')))
  );
};

export async function getPublicReaderProfile(
  username: string,
  commentLimit = 8
): Promise<PublicReaderProfileResult> {
  const normalizedUsername = normalizePublicUsername(username);

  if (!normalizedUsername || !/^[a-z0-9_-]{3,24}$/.test(normalizedUsername)) {
    return {
      profile: null,
      comments: [],
      approvedCount: 0,
      error: 'Profilo non disponibile.',
    };
  }

  let includeBio = true;
  let includeAvatar = true;
  let { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(getProfileSelect(includeBio, includeAvatar))
    .eq('username', normalizedUsername)
    .eq('status', 'active')
    .maybeSingle();

  if (isMissingBioColumnError(profileError) || isMissingAvatarColumnError(profileError)) {
    includeBio = !isMissingBioColumnError(profileError);
    includeAvatar = !isMissingAvatarColumnError(profileError);

    const fallbackResult = await supabaseAdmin
      .from('profiles')
      .select(getProfileSelect(includeBio, includeAvatar))
      .eq('username', normalizedUsername)
      .eq('status', 'active')
      .maybeSingle();

    profile = fallbackResult.data;
    profileError = fallbackResult.error;
  }

  if (isMissingBioColumnError(profileError) || isMissingAvatarColumnError(profileError)) {
    const fallbackResult = await supabaseAdmin
      .from('profiles')
      .select(getProfileSelect(false, false))
      .eq('username', normalizedUsername)
      .eq('status', 'active')
      .maybeSingle();

    profile = fallbackResult.data;
    profileError = fallbackResult.error;
  }

  if (profileError) {
    return {
      profile: null,
      comments: [],
      approvedCount: 0,
      error: profileError.message,
    };
  }

  if (!profile) {
    return {
      profile: null,
      comments: [],
      approvedCount: 0,
      error: 'Profilo non disponibile.',
    };
  }

  const [{ count, error: countError }, { data: comments, error: commentsError }] =
    await Promise.all([
      supabaseAdmin
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profile.id)
        .eq('status', 'approved'),
      supabaseAdmin
        .from('comments')
        .select(`
          id,
          body,
          created_at,
          article_title,
          article_url,
          article_slug,
          article_language
        `)
        .eq('profile_id', profile.id)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(commentLimit),
    ]);

  if (countError || commentsError) {
    return {
      profile,
      comments: [],
      approvedCount: 0,
      error: countError?.message || commentsError?.message || 'Commenti non disponibili.',
    };
  }

  return {
    profile: {
      ...profile,
      avatar_url: getAvatarPublicUrl(profile.avatar_path),
    },
    comments: comments ?? [],
    approvedCount: count ?? 0,
    error: null,
  };
}
