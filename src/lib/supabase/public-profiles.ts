import { supabaseAdmin } from './server';
import { getAvatarPublicUrl, isMissingAvatarColumnError } from './avatars';
import { calculateCommunityPoints } from '../community-points';
import { getUserInterestsForUser, type UserInterestRow } from './user-interests';
import { client as sanityClient } from '../sanity';
import { getCompanyUrl, getPlatformUrl } from '../routes.js';

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
  bio_en?: string | null;
  avatar_path?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
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
  interests: UserInterestRow[];
  approvedCount: number;
  ratingsCount: number;
  likesReceived: number;
  communityPoints: number;
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

const getProfileSelect = (
  includeBio = true,
  includeBioEn = true,
  includeAvatar = true,
  includeCreatedAt = true
) => `
  id,
  user_id,
  username,
  display_name,
  ${includeBio ? 'bio,' : ''}
  ${includeBioEn ? 'bio_en,' : ''}
  ${includeAvatar ? 'avatar_path,' : ''}
  ${includeCreatedAt ? 'created_at,' : ''}
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
    message.includes('bio') &&
    !message.includes('bio_en') &&
    (
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      message.includes('column') ||
      message.includes('schema cache')
    )
  );
};

const isMissingBioEnColumnError = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    message.includes('bio_en') &&
    (
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      message.includes('column') ||
      message.includes('schema cache')
    )
  );
};

const isMissingCreatedAtColumnError = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    message.includes('created_at') &&
    (
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      message.includes('column') ||
      message.includes('schema cache')
    )
  );
};

const isReviewRatingsUnavailable = (error: { code?: string; message?: string; details?: string } | null) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''}`.toLowerCase();

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    message.includes('review_ratings')
  );
};

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const fetchApprovedCommentIds = async (profileId: string) => {
  const ids: string[] = [];
  const pageSize = 1000;

  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('comments')
      .select('id')
      .eq('profile_id', profileId)
      .eq('status', 'approved')
      .range(from, from + pageSize - 1);

    if (error) {
      return { ids: [], error };
    }

    ids.push(...(data ?? []).map((comment) => String(comment.id)).filter(Boolean));

    if ((data ?? []).length < pageSize) {
      break;
    }
  }

  return { ids, error: null };
};

const fetchReviewRatingsCount = async (userId: string) => {
  const { count, error } = await supabaseAdmin
    .from('review_ratings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    if (isReviewRatingsUnavailable(error)) {
      return { count: 0, error: null };
    }

    return { count: 0, error };
  }

  return { count: count ?? 0, error: null };
};

const fetchLikesReceived = async (approvedCommentIds: string[]) => {
  let likesReceived = 0;

  for (const commentIdChunk of chunkArray(approvedCommentIds, 500)) {
    const { count, error } = await supabaseAdmin
      .from('comment_reactions')
      .select('id', { count: 'exact', head: true })
      .eq('reaction', 'like')
      .in('comment_id', commentIdChunk);

    if (error) {
      return { count: 0, error };
    }

    likesReceived += count ?? 0;
  }

  return { count: likesReceived, error: null };
};

const getCreatorUrl = (slug: string | null | undefined, lang: 'it' | 'en') => {
  const safeSlug = String(slug || '').trim();

  if (!safeSlug) return null;

  return lang === 'en'
    ? `/en/creators/${safeSlug}/`
    : `/creatori/${safeSlug}/`;
};

const getCompanyInterestUrl = (slug: string | null | undefined, lang: 'it' | 'en') => {
  const safeSlug = String(slug || '').trim();

  if (!safeSlug) return null;

  return getCompanyUrl({ slug: safeSlug }, lang);
};

const enrichPublicInterests = async (interests: UserInterestRow[]) => {
  const platformIds = interests
    .filter((interest) => interest.target_type === 'platform' && interest.target_id)
    .map((interest) => interest.target_id);

  const platformUrls = new Map<string, { it: string | null; en: string | null }>();

  if (platformIds.length > 0) {
    try {
      const platforms = await sanityClient.fetch(`
        *[
          _type == "platform" &&
          _id in $ids &&
          defined(slug.current) &&
          defined(platformType) &&
          !(_id in path("drafts.**"))
        ] {
          _id,
          "slug": slug.current,
          platformType,
          manufacturer->{
            "slug": slug.current
          }
        }
      `, { ids: platformIds });

      for (const platform of platforms ?? []) {
        const itUrl = getPlatformUrl(platform, 'it');
        const enUrl = getPlatformUrl(platform, 'en');

        platformUrls.set(platform._id, {
          it: itUrl === '/piattaforme/' ? null : itUrl,
          en: enUrl === '/en/platforms/' ? null : enUrl,
        });
      }
    } catch (error) {
      console.error('[public-profile.interests] Could not resolve platform URLs', error);
    }
  }

  return interests.map((interest) => {
    if (interest.target_type === 'platform') {
      const urls = platformUrls.get(interest.target_id);

      return {
        ...interest,
        target_url_it: urls?.it ?? null,
        target_url_en: urls?.en ?? null,
      };
    }

    if (interest.target_type === 'creator') {
      return {
        ...interest,
        target_url_it: getCreatorUrl(interest.target_slug, 'it'),
        target_url_en: getCreatorUrl(interest.target_slug, 'en'),
      };
    }

    if (interest.target_type === 'company') {
      return {
        ...interest,
        target_url_it: getCompanyInterestUrl(interest.target_slug, 'it'),
        target_url_en: getCompanyInterestUrl(interest.target_slug, 'en'),
      };
    }

    return interest;
  });
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
      interests: [],
      approvedCount: 0,
      ratingsCount: 0,
      likesReceived: 0,
      communityPoints: 0,
      error: 'Profilo non disponibile.',
    };
  }

  let includeBio = true;
  let includeBioEn = true;
  let includeAvatar = true;
  let includeCreatedAt = true;
  let { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select(getProfileSelect(includeBio, includeBioEn, includeAvatar, includeCreatedAt))
    .eq('username', normalizedUsername)
    .eq('status', 'active')
    .maybeSingle();

  if (
    isMissingBioColumnError(profileError) ||
    isMissingBioEnColumnError(profileError) ||
    isMissingAvatarColumnError(profileError) ||
    isMissingCreatedAtColumnError(profileError)
  ) {
    includeBio = !isMissingBioColumnError(profileError);
    includeBioEn = !isMissingBioEnColumnError(profileError);
    includeAvatar = !isMissingAvatarColumnError(profileError);
    includeCreatedAt = !isMissingCreatedAtColumnError(profileError);

    const fallbackResult = await supabaseAdmin
      .from('profiles')
      .select(getProfileSelect(includeBio, includeBioEn, includeAvatar, includeCreatedAt))
      .eq('username', normalizedUsername)
      .eq('status', 'active')
      .maybeSingle();

    profile = fallbackResult.data;
    profileError = fallbackResult.error;
  }

  if (
    isMissingBioColumnError(profileError) ||
    isMissingBioEnColumnError(profileError) ||
    isMissingAvatarColumnError(profileError) ||
    isMissingCreatedAtColumnError(profileError)
  ) {
    const fallbackResult = await supabaseAdmin
      .from('profiles')
      .select(getProfileSelect(false, false, false, false))
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
      interests: [],
      approvedCount: 0,
      ratingsCount: 0,
      likesReceived: 0,
      communityPoints: 0,
      error: profileError.message,
    };
  }

  if (!profile) {
    return {
      profile: null,
      comments: [],
      interests: [],
      approvedCount: 0,
      ratingsCount: 0,
      likesReceived: 0,
      communityPoints: 0,
      error: 'Profilo non disponibile.',
    };
  }

  const [
    approvedCommentIdsResult,
    ratingsCountResult,
    interestsResult,
    { data: comments, error: commentsError },
  ] = await Promise.all([
    fetchApprovedCommentIds(profile.id),
    fetchReviewRatingsCount(profile.user_id),
    getUserInterestsForUser(profile.user_id, 'public-profile.interests'),
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

  if (approvedCommentIdsResult.error || ratingsCountResult.error || commentsError) {
    return {
      profile,
      comments: [],
      interests: await enrichPublicInterests(interestsResult.interests),
      approvedCount: 0,
      ratingsCount: 0,
      likesReceived: 0,
      communityPoints: calculateCommunityPoints({}),
      error: approvedCommentIdsResult.error?.message ||
        ratingsCountResult.error?.message ||
        commentsError?.message ||
        'Statistiche non disponibili.',
    };
  }

  const likesResult = await fetchLikesReceived(approvedCommentIdsResult.ids);

  if (likesResult.error) {
    return {
      profile,
      comments: [],
      interests: await enrichPublicInterests(interestsResult.interests),
      approvedCount: 0,
      ratingsCount: 0,
      likesReceived: 0,
      communityPoints: calculateCommunityPoints({}),
      error: likesResult.error.message || 'Statistiche non disponibili.',
    };
  }

  const approvedCount = approvedCommentIdsResult.ids.length;
  const ratingsCount = ratingsCountResult.count;
  const likesReceived = likesResult.count;
  const interests = await enrichPublicInterests(interestsResult.interests);

  return {
    profile: {
      ...profile,
      avatar_url: getAvatarPublicUrl(profile.avatar_path),
    },
    comments: comments ?? [],
    interests,
    approvedCount,
    ratingsCount,
    likesReceived,
    communityPoints: calculateCommunityPoints({
      approvedComments: approvedCount,
      receivedLikes: likesReceived,
      reviewRatings: ratingsCount,
    }),
    error: null,
  };
}
