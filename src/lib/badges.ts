import { supabaseAdmin } from './supabase/server';

export type ReaderBadge = {
  key: string;
  label_it: string | null;
  label_en: string | null;
  image_path: string | null;
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
