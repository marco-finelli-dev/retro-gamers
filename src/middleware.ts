import { defineMiddleware } from 'astro:middleware';
import { getRouteLanguage } from './lib/preferred-language';
import { getUserSessionFromCookies } from './lib/supabase/auth';

const legacyPlatformRedirects: Record<string, string> = {
  '/piattaforma/master-system/': '/piattaforme/console/sega/master-system/',
  '/piattaforma/mega-drive/': '/piattaforme/console/sega/mega-drive/',
  '/piattaforma/super-nintendo/': '/piattaforme/console/nintendo/super-nintendo/',
  '/piattaforma/amiga-500/': '/piattaforme/computer/commodore/amiga-500/',
  '/piattaforma/ms-dos/': '/piattaforme/computer/microsoft/ms-dos/',
  '/piattaforma/nintendo-64/': '/piattaforme/console/nintendo/nintendo-64/',
  '/piattaforma/game-boy/': '/piattaforme/console/nintendo/game-boy/',
  '/piattaforma/arcade/': '/piattaforme/arcade/',

  '/sega-master-system/': '/piattaforme/console/sega/master-system/',
  '/commodore-64/': '/piattaforme/computer/commodore/commodore-64/',
};

const legacyArticleRedirects: Record<string, string> = {
  '/home': '/',
  '/home/': '/',
  '/2025/10/27/hello-world': '/',
  '/2025/10/27/hello-world/': '/',

  '/interviste/dynabyte-la-storia-raccontantata-da-massimo-magnasciutti':
    '/interviste/dynabyte-nippon-safes-intervista-massimo-magnasciutti/',
  '/interviste/dynabyte-la-storia-raccontantata-da-massimo-magnasciutti/':
    '/interviste/dynabyte-nippon-safes-intervista-massimo-magnasciutti/',

  '/intervista/luigi-marrone-di-ludenz/':
    '/interviste/luigi-marrone-ludenz-intervista-rabdomantica-game-culture/',
  '/intervista/luigi-marrone-di-ludenz':
    '/interviste/luigi-marrone-ludenz-intervista-rabdomantica-game-culture/',
  '/interviste/luigi-marrone-di-ludenz/':
    '/interviste/luigi-marrone-ludenz-intervista-rabdomantica-game-culture/',
  '/interviste/luigi-marrone-di-ludenz':
    '/interviste/luigi-marrone-ludenz-intervista-rabdomantica-game-culture/',

  '/recensioni/pang-commodore-amiga/': '/recensioni/pang/',
  '/recensioni/pang-commodore-amiga': '/recensioni/pang/',

  '/speciale/speciale-kiss-videogiochi-psycho-circus-tony-hawk-cameo/':
    '/speciali/speciale-kiss-videogiochi-psycho-circus-tony-hawk/',
  '/speciale/speciale-kiss-videogiochi-psycho-circus-tony-hawk-cameo':
    '/speciali/speciale-kiss-videogiochi-psycho-circus-tony-hawk/',

  '/guida/installare-cf-su-amiga-come-hard-disk/':
    '/guide/compact-flash-amiga-guida-completa-hard-disk-a500-a1200-whdload/',
  '/guida/installare-cf-su-amiga-come-hard-disk':
    '/guide/compact-flash-amiga-guida-completa-hard-disk-a500-a1200-whdload/',
  '/guida/compact-flash-amiga-come-hard-disk/':
    '/guide/compact-flash-amiga-guida-completa-hard-disk-a500-a1200-whdload/',
  '/guida/compact-flash-amiga-come-hard-disk':
    '/guide/compact-flash-amiga-guida-completa-hard-disk-a500-a1200-whdload/',
  '/guida/compact-flash-amiga-come-hd/':
    '/guide/compact-flash-amiga-guida-completa-hard-disk-a500-a1200-whdload/',
  '/guida/compact-flash-amiga-come-hd':
    '/guide/compact-flash-amiga-guida-completa-hard-disk-a500-a1200-whdload/',
  '/guide/installare-cf-su-amiga-come-hard-disk/':
    '/guide/compact-flash-amiga-guida-completa-hard-disk-a500-a1200-whdload/',
  '/guide/installare-cf-su-amiga-come-hard-disk':
    '/guide/compact-flash-amiga-guida-completa-hard-disk-a500-a1200-whdload/',
  '/guide/usare-il-gotek-drive-esternamente-come-df0/':
    '/guide/gotek-amiga-esterno-df0-guida/',
  '/guide/usare-il-gotek-drive-esternamente-come-df0':
    '/guide/gotek-amiga-esterno-df0-guida/',
};

function permanentRedirect(url: URL, destination: string) {
  const target = new URL(destination, url.origin);

  return new Response(null, {
    status: 301,
    headers: {
      Location: target.toString(),
    },
  });
}

function isPageRequest(request: Request, pathname: string) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (pathname.startsWith('/api/') || pathname.startsWith('/_')) return false;

  return request.headers.get('accept')?.includes('text/html') === true;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const pathname = url.pathname;

  if (legacyArticleRedirects[pathname]) {
    return permanentRedirect(url, legacyArticleRedirects[pathname]);
  }

  if (legacyPlatformRedirects[pathname]) {
    return permanentRedirect(url, legacyPlatformRedirects[pathname]);
  }

  if (pathname.startsWith('/recensione/')) {
    return permanentRedirect(url, pathname.replace('/recensione/', '/recensioni/'));
  }

  if (pathname.startsWith('/speciale/')) {
    return permanentRedirect(url, pathname.replace('/speciale/', '/speciali/'));
  }

  if (pathname.startsWith('/intervista/')) {
    return permanentRedirect(url, pathname.replace('/intervista/', '/interviste/'));
  }

  if (pathname.startsWith('/guida/')) {
    return permanentRedirect(url, pathname.replace('/guida/', '/guide/'));
  }

  if (
    pathname.startsWith('/tag/') ||
    pathname.startsWith('/category/') ||
    pathname.startsWith('/author/')
  ) {
    return permanentRedirect(url, '/archivio/');
  }

  if (
    pathname === '/feed/' ||
    pathname === '/comments/feed/' ||
    pathname === '/sample-page/'
  ) {
    return permanentRedirect(url, '/');
  }

  if (
    pathname.startsWith('/2020/') ||
    pathname.startsWith('/2021/') ||
    pathname.startsWith('/2022/') ||
    pathname.startsWith('/2023/') ||
    pathname.startsWith('/2024/')
  ) {
    return permanentRedirect(url, '/archivio/');
  }

  if (isPageRequest(request, pathname)) {
    const session = await getUserSessionFromCookies(context.cookies);
    const routeLanguage = getRouteLanguage(pathname);

    context.locals.userSession = session;
    context.locals.routeLanguage = routeLanguage;
    context.locals.effectiveLanguage = routeLanguage;
    context.locals.languageSessionOverride = null;
  }

  return next();
});
