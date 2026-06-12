import { supabaseAdmin } from './supabase/server';

export type ReaderBadge = {
  key: string;
  label_it: string | null;
  label_en: string | null;
  image_path: string | null;
};

export type ReaderBadgeAssignment = {
  userId: string;
  badge: ReaderBadge;
  createdAt: string | null;
};

export const fallbackReaderBadges: ReaderBadge[] = [
  { key: 'arcade_kid', label_it: 'Arcade Kid', label_en: 'Arcade Kid', image_path: null },
  { key: 'eight_bit_player', label_it: '8-bit Player', label_en: '8-bit Player', image_path: null },
  { key: 'sixteen_bit_veteran', label_it: '16-bit Veteran', label_en: '16-bit Veteran', image_path: null },
  { key: 'amiga_user', label_it: 'Amiga User', label_en: 'Amiga User', image_path: null },
  { key: 'console_warrior', label_it: 'Console Warrior', label_en: 'Console Warrior', image_path: null },
  { key: 'point_click_lover', label_it: 'Point & Click Lover', label_en: 'Point & Click Lover', image_path: null },
  { key: 'jrpg_explorer', label_it: 'JRPG Explorer', label_en: 'JRPG Explorer', image_path: null },
  { key: 'retro_collector', label_it: 'Retro Collector', label_en: 'Retro Collector', image_path: null },
];

const normalizeBadge = (badge: Partial<ReaderBadge>): ReaderBadge | null => {
  const key = badge.key?.trim();

  if (!key) return null;

  return {
    key,
    label_it: badge.label_it?.trim() || null,
    label_en: badge.label_en?.trim() || null,
    image_path: badge.image_path?.trim() || null,
  };
};

export const getReaderBadgeLabel = (badge: ReaderBadge, lang: 'it' | 'en' = 'it') =>
  lang === 'en'
    ? badge.label_en || badge.label_it || badge.key
    : badge.label_it || badge.label_en || badge.key;

export const getReaderBadgeImageSrc = (imagePath?: string | null) => {
  const value = imagePath?.trim();

  if (!value) return '';

  if (/^https?:\/\//i.test(value) || value.startsWith('/')) {
    return value;
  }

  return `/${value.replace(/^\/+/, '')}`;
};

export const getReaderBadgeInitials = (label: string) =>
  label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

const sortReaderBadges = (badges: ReaderBadge[], lang: 'it' | 'en' = 'it') =>
  [...badges].sort((a, b) => {
    const labelA = getReaderBadgeLabel(a, lang).toLocaleLowerCase(lang);
    const labelB = getReaderBadgeLabel(b, lang).toLocaleLowerCase(lang);

    return labelA.localeCompare(labelB, lang) || a.key.localeCompare(b.key);
  });

export const isBadgeAssignmentsUnavailable = (
  error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined
) => {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    (message.includes('user_badge_assignments') &&
      (message.includes('not exist') ||
        message.includes('schema cache') ||
        message.includes('relation') ||
        message.includes('table')))
  );
};

export async function getActiveReaderBadges(
  options: { fallback?: boolean; lang?: 'it' | 'en' } = {}
) {
  const { fallback = true, lang = 'it' } = options;

  try {
    const { data, error } = await supabaseAdmin
      .from('user_badges')
      .select('key, label_it, label_en, image_path')
      .eq('is_active', true);

    if (error) {
      throw error;
    }

    const badges = (data ?? [])
      .map((badge) => normalizeBadge(badge))
      .filter((badge): badge is ReaderBadge => Boolean(badge));

    if (badges.length > 0) {
      return sortReaderBadges(badges, lang);
    }
  } catch {
    // The registration flow must remain available even if Supabase is temporarily unavailable.
  }

  return fallback ? sortReaderBadges(fallbackReaderBadges, lang) : [];
}

export async function getOwnedReaderBadges(
  userId?: string | null,
  options: { fallbackToActive?: boolean; lang?: 'it' | 'en' } = {}
) {
  const { fallbackToActive = true, lang = 'it' } = options;

  if (!userId) return [];

  try {
    const { data, error } = await supabaseAdmin
      .from('user_badge_assignments')
      .select(`
        badge_key,
        user_badges (
          key,
          label_it,
          label_en,
          image_path,
          is_active
        )
      `)
      .eq('user_id', userId);

    if (error) {
      if (fallbackToActive && isBadgeAssignmentsUnavailable(error)) {
        return getActiveReaderBadges({ fallback: true, lang });
      }

      throw error;
    }

    const badges = (data ?? [])
      .map((row) => {
        const badge = Array.isArray(row.user_badges)
          ? row.user_badges[0]
          : row.user_badges;

        if (!badge?.is_active) return null;

        return normalizeBadge(badge);
      })
      .filter((badge): badge is ReaderBadge => Boolean(badge));

    return sortReaderBadges(badges, lang);
  } catch {
    return fallbackToActive ? getActiveReaderBadges({ fallback: true, lang }) : [];
  }
}

export async function readerOwnsBadge(userId: string, badgeKey: string) {
  const normalizedBadgeKey = badgeKey.trim();

  if (!userId || !normalizedBadgeKey) {
    return { owns: false, assignmentsAvailable: true };
  }

  const { data, error } = await supabaseAdmin
    .from('user_badge_assignments')
    .select('id')
    .eq('user_id', userId)
    .eq('badge_key', normalizedBadgeKey)
    .maybeSingle();

  if (error) {
    return {
      owns: false,
      assignmentsAvailable: !isBadgeAssignmentsUnavailable(error),
      error,
    };
  }

  return {
    owns: Boolean(data),
    assignmentsAvailable: true,
  };
}

export async function assignReaderBadgeToUser(input: {
  userId: string;
  badgeKey: string;
  assignedBy?: string | null;
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('user_badge_assignments')
    .select('id')
    .eq('user_id', input.userId)
    .eq('badge_key', input.badgeKey)
    .maybeSingle();

  if (existingError) {
    return {
      ok: false,
      alreadyAssigned: false,
      assignmentsAvailable: !isBadgeAssignmentsUnavailable(existingError),
      error: existingError,
    };
  }

  if (existing) {
    return {
      ok: true,
      alreadyAssigned: true,
      assignmentsAvailable: true,
    };
  }

  const { error } = await supabaseAdmin
    .from('user_badge_assignments')
    .insert({
      user_id: input.userId,
      badge_key: input.badgeKey,
      assigned_by: input.assignedBy || null,
    });

  if (error) {
    return {
      ok: false,
      alreadyAssigned: false,
      assignmentsAvailable: !isBadgeAssignmentsUnavailable(error),
      error,
    };
  }

  return {
    ok: true,
    alreadyAssigned: false,
    assignmentsAvailable: true,
  };
}

export async function removeReaderBadgeFromUser(userId: string, badgeKey: string) {
  const { error } = await supabaseAdmin
    .from('user_badge_assignments')
    .delete()
    .eq('user_id', userId)
    .eq('badge_key', badgeKey);

  if (error) {
    return {
      ok: false,
      assignmentsAvailable: !isBadgeAssignmentsUnavailable(error),
      error,
    };
  }

  return {
    ok: true,
    assignmentsAvailable: true,
  };
}
