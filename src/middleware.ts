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

function permanentRedirect(url: URL, destination: string) {
  const target = new URL(destination, url.origin);
  return Response.redirect(target, 301);
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const pathname = url.pathname;

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

  return next();
});