import { defineMiddleware } from 'astro:middleware';

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

const legacyArchiveRedirects = new Set([
  '/revnge-120u/',
  '/revnge-121/',
  '/revnge-122/',
  '/revnge-124/',
  '/revnge-127/',
  '/revnge-132/',
  '/revnge-133/',
  '/revnge-135/',
  '/revnge-138/',
  '/revnge-139/',
  '/revnge-142/',
  '/revnge-144/',
  '/revnge-149/',
  '/revnge-154/',
  '/revnge-english-version/',
  '/street-fighter-alpha-2/',
  '/street-fighter-alpha-warriors-dreams/',
  '/street-fighter-iii-new-generation/',
]);

const legacyArticleRedirects: Record<string, string> = {
  '/street-fighter-ii-champion-edition/': '/recensioni/street-fighter-ii/',
  '/street-fighter-ii-hyper-fighting/': '/recensioni/street-fighter-ii/',
};

function permanentRedirect(url: URL, destination: string) {
  const target = new URL(destination, url.origin);
  return Response.redirect(target, 301);
}

function withTrailingSlash(pathname: string) {
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const pathname = url.pathname;
  const normalizedPathname = withTrailingSlash(pathname);

  if (legacyPlatformRedirects[pathname]) {
    return permanentRedirect(url, legacyPlatformRedirects[pathname]);
  }

  if (legacyArchiveRedirects.has(normalizedPathname)) {
    return permanentRedirect(url, '/archivio/');
  }

  if (legacyArticleRedirects[normalizedPathname]) {
    return permanentRedirect(url, legacyArticleRedirects[normalizedPathname]);
  }

  if (/^\/news\/page\/[^/]+\/?$/.test(pathname)) {
    return permanentRedirect(url, '/news/');
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
    pathname.startsWith('/2024/') ||
    pathname.startsWith('/2025/') ||
    pathname.startsWith('/2026/')
  ) {
    return permanentRedirect(url, '/archivio/');
  }

  return next();
});
