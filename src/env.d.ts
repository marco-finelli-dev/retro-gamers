/// <reference types="astro/client" />

import type { PreferredLanguage } from './lib/preferred-language';
import type { getUserSessionFromCookies } from './lib/supabase/auth';

declare global {
  namespace App {
    interface Locals {
      userSession?: Awaited<ReturnType<typeof getUserSessionFromCookies>>;
      routeLanguage?: PreferredLanguage;
      effectiveLanguage?: PreferredLanguage;
      languageSessionOverride?: PreferredLanguage | null;
    }
  }
}

export {};
