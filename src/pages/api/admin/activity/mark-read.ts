import type { APIRoute } from 'astro';
import {
  markAdminActivityCategoryRead,
  markAdminActivitySeen,
  markAllAdminActivityRead,
  normalizeAdminActivityCategory,
} from '../../../../lib/admin/activity.server';
import { getUserSessionFromCookies } from '../../../../lib/supabase/auth';

const allowedPayloadKeys = new Set(['category', 'seenThrough', 'lang']);

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeLang = (value: unknown) => value === 'en' ? 'en' : 'it';

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.profile || !session.user) {
    return json({ ok: false, error: session.error || 'Unauthorized.' }, session.status || 401);
  }

  if (session.profile.role !== 'admin' || session.profile.status !== 'active') {
    return json({ ok: false, error: 'Forbidden.', code: 'forbidden' }, 403);
  }

  let payload: Record<string, unknown>;

  try {
    const body = await request.json();

    if (!isRecord(body)) {
      return json({ ok: false, error: 'Invalid request.', code: 'invalid_request' }, 400);
    }

    const unexpectedKeys = Object.keys(body).filter((key) => !allowedPayloadKeys.has(key));

    if (unexpectedKeys.length > 0) {
      return json({ ok: false, error: 'Invalid request.', code: 'invalid_request' }, 400);
    }

    payload = body;
  } catch {
    return json({ ok: false, error: 'Invalid request.', code: 'invalid_request' }, 400);
  }

  const rawCategory = String(payload.category || '').trim();
  const lang = normalizeLang(payload.lang);

  if (rawCategory === 'all') {
    const result = await markAllAdminActivityRead({
      adminUserId: session.user.id,
      lang,
    });

    return json(result, result.ok ? 200 : 500);
  }

  const category = normalizeAdminActivityCategory(rawCategory);

  if (!category) {
    return json({ ok: false, error: 'Invalid category.', code: 'invalid_category' }, 400);
  }

  if (typeof payload.seenThrough === 'string' && payload.seenThrough.trim()) {
    const result = await markAdminActivitySeen({
      adminUserId: session.user.id,
      category,
      seenThrough: payload.seenThrough,
    });

    return json(result, result.ok ? 200 : 500);
  }

  const result = await markAdminActivityCategoryRead({
    adminUserId: session.user.id,
    category,
    lang,
  });

  return json(result, result.ok ? 200 : 500);
};
