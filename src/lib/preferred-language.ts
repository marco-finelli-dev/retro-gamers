export const preferredLanguages = ['it', 'en'] as const;

export type PreferredLanguage = (typeof preferredLanguages)[number];

export const defaultPreferredLanguage: PreferredLanguage = 'it';
export const languageSessionOverrideCookie = 'rg-language-session-override';

export function isPreferredLanguage(value: unknown): value is PreferredLanguage {
  return typeof value === 'string' && preferredLanguages.includes(value as PreferredLanguage);
}

export function normalizePreferredLanguage(value: unknown): PreferredLanguage {
  return isPreferredLanguage(value) ? value : defaultPreferredLanguage;
}

export function getRouteLanguage(pathname = '/'): PreferredLanguage {
  return /^\/en(?:\/|$)/.test(pathname) ? 'en' : 'it';
}

type EffectiveLanguageOptions = {
  sessionOverride?: unknown;
  draftLanguage?: unknown;
  profileLanguage?: unknown;
  routeLanguage?: unknown;
  authenticated?: boolean;
};

export function resolveEffectiveLanguage({
  sessionOverride,
  draftLanguage,
  profileLanguage,
  routeLanguage,
  authenticated = false,
}: EffectiveLanguageOptions = {}): PreferredLanguage {
  if (isPreferredLanguage(routeLanguage)) return routeLanguage;
  if (isPreferredLanguage(sessionOverride)) return sessionOverride;
  if (isPreferredLanguage(draftLanguage)) return draftLanguage;
  if (authenticated && isPreferredLanguage(profileLanguage)) return profileLanguage;
  return defaultPreferredLanguage;
}

export function resolveManualRetroLanguage({
  selectedLanguage,
  draftLanguage,
  profileLanguage,
}: {
  selectedLanguage?: unknown;
  draftLanguage?: unknown;
  profileLanguage?: unknown;
} = {}): PreferredLanguage {
  if (isPreferredLanguage(selectedLanguage)) return selectedLanguage;
  if (isPreferredLanguage(draftLanguage)) return draftLanguage;
  return normalizePreferredLanguage(profileLanguage);
}

export function getPreferredHomeUrl(language: PreferredLanguage) {
  return language === 'en' ? '/en/' : '/';
}

export function getLanguageSessionOverrideFromCookies(cookies: any) {
  const value = cookies?.get?.(languageSessionOverrideCookie)?.value;
  return isPreferredLanguage(value) ? value : null;
}

export function clearLanguageSessionOverrideCookie(cookies: any) {
  cookies?.delete?.(languageSessionOverrideCookie, { path: '/' });
}

export function setLanguageSessionOverride(language: unknown) {
  if (typeof document === 'undefined' || !isPreferredLanguage(language)) return;

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${languageSessionOverrideCookie}=${language}; Path=/; SameSite=Lax${secure}`;
}

export function clearLanguageSessionOverride() {
  if (typeof document === 'undefined') return;

  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${languageSessionOverrideCookie}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}
