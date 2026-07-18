export {
  defaultPreferredLanguage,
  getPreferredHomeUrl,
  isPreferredLanguage,
  normalizePreferredLanguage,
  preferredLanguages,
  resolveEffectiveLanguage,
  resolveManualRetroLanguage,
  type PreferredLanguage,
} from './preferred-language';

export const retroExperiences = ['standard', 'amiga', 'monkey'] as const;

export type RetroExperience = (typeof retroExperiences)[number];

export const defaultRetroExperience: RetroExperience = 'standard';

export const retroExperienceEvents = {
  profile: 'retro-experience:profile',
  launch: 'retro-experience:launch',
} as const;

export const retroExperienceSessionKey = 'rg-retro-experience-shown-v1';
export const retroExperienceDesktopMediaQuery =
  '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

let desktopSupportMediaQuery: MediaQueryList | null = null;

export function getRetroExperienceDesktopSupportMediaQuery() {
  if (typeof window === 'undefined') return null;

  desktopSupportMediaQuery ||= window.matchMedia(retroExperienceDesktopMediaQuery);
  return desktopSupportMediaQuery;
}

export function isRetroExperienceDesktopSupported(
  mediaQuery = getRetroExperienceDesktopSupportMediaQuery()
) {
  return mediaQuery?.matches === true;
}

export function isRetroExperience(value: unknown): value is RetroExperience {
  return typeof value === 'string' && retroExperiences.includes(value as RetroExperience);
}

export function normalizeRetroExperience(value: unknown): RetroExperience {
  return isRetroExperience(value) ? value : defaultRetroExperience;
}
