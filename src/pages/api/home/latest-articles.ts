import type { APIRoute } from 'astro';
import {
  HOME_LATEST_PAGE_SIZE,
  getHomeLatestPage,
  toHomeLatestItem
} from '../../../lib/home-latest';
import {
  attachApprovedCommentCounts,
  getApprovedCommentCountMap
} from '../../../lib/supabase/comment-counts';

const maxExcludedIds = 160;

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }
});

const normalizeLanguage = (value: string | null) => value === 'en' ? 'en' : value === 'it' ? 'it' : null;

const normalizeExcludedIds = (value: string | null) => {
  if (!value) return [];

  return [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))].slice(0, maxExcludedIds);
};

export const GET: APIRoute = async ({ url }) => {
  const language = normalizeLanguage(url.searchParams.get('lang'));

  if (!language) return json({ ok: false, error: 'invalid_request' }, 400);

  const excludedIds = normalizeExcludedIds(url.searchParams.get('exclude'));

  try {
    const posts = await getHomeLatestPage(language, excludedIds, HOME_LATEST_PAGE_SIZE + 1);
    const pagePosts = posts.slice(0, HOME_LATEST_PAGE_SIZE);
    const commentCountMap = await getApprovedCommentCountMap(pagePosts, language);
    const items = attachApprovedCommentCounts(pagePosts, commentCountMap, language)
      .map((post) => toHomeLatestItem(post, language));

    return json({
      ok: true,
      items,
      hasMore: posts.length > HOME_LATEST_PAGE_SIZE
    });
  } catch {
    return json({ ok: false, error: 'unavailable' }, 500);
  }
};
