const CONTENT_ROUTE_SEGMENTS = {
  types: {
    review: {
      detail: { it: 'recensioni', en: 'reviews' },
      archive: { it: 'recensioni', en: 'reviews' }
    },
    guide: {
      detail: { it: 'guide', en: 'guides' },
      archive: { it: 'guide', en: 'guides' }
    },
    feature: {
      detail: { it: 'speciali', en: 'features' },
      archive: { it: 'speciali', en: 'features' }
    },
    interview: {
      detail: { it: 'interviste', en: 'interviews' },
      archive: { it: 'interviste', en: 'interviews' }
    },
    memories: {
      detail: { it: 'memories', en: 'memories' },
      archive: { it: 'memories', en: 'memories' }
    },
    news: {
      detail: { it: 'news', en: 'news' },
      archive: { it: 'news', en: 'news' }
    },
    hardware: {
      detail: { it: 'hardware', en: 'hardware' },
      archive: { it: 'hardware', en: 'hardware' }
    },
    article: {
      detail: { it: 'articoli', en: 'articles' },
      archive: { it: 'articoli', en: 'archive' }
    }
  },
  aliases: {
    special: 'feature'
  },
  fallbacks: {
    detail: { it: 'articoli', en: 'articles' },
    archive: { it: 'articoli', en: 'articles' }
  }
};

const PLATFORM_ROUTE_SEGMENTS = {
  types: {
    console: { it: 'console', en: 'consoles' },
    computer: { it: 'computer', en: 'computers' },
    arcade: { it: 'arcade', en: 'arcade' }
  },
  aliases: {
    consoles: 'console',
    computers: 'computer'
  }
};

const PLATFORM_ROUTE_BASE_PATHS = {
  it: '/piattaforme',
  en: '/en/platforms'
};

const normalizeContentType = (type) =>
  CONTENT_ROUTE_SEGMENTS.aliases[type] || type;

const getConfiguredContentRouteSegment = (type, language, routeKind) => {
  const normalizedType = normalizeContentType(type);

  return (
    CONTENT_ROUTE_SEGMENTS.types[normalizedType]?.[routeKind]?.[language] ||
    null
  );
};

export function getContentDetailSegment(type, language = 'it') {
  return getConfiguredContentRouteSegment(type, language, 'detail');
}

export function getContentTypeFromRouteSegment(segment, language = 'it') {
  if (!segment) return null;

  const routeEntry = Object.entries(CONTENT_ROUTE_SEGMENTS.types)
    .find(([, routes]) => routes.detail[language] === segment);

  return routeEntry?.[0] || null;
}

export function isContentRouteSegment(segment, language = 'it') {
  return getContentTypeFromRouteSegment(segment, language) !== null;
}

const getContentRouteSegment = (type, language, routeKind) => {
  return (
    getConfiguredContentRouteSegment(type, language, routeKind) ||
    CONTENT_ROUTE_SEGMENTS.fallbacks[routeKind]?.[language] ||
    'articoli'
  );
};

const getRouteLanguage = (language) => language === 'en' ? 'en' : 'it';

const normalizePlatformType = (type) =>
  PLATFORM_ROUTE_SEGMENTS.aliases[type] || type;

const getConfiguredPlatformRouteSegment = (type, language) => {
  const normalizedType = normalizePlatformType(type);
  const routeLanguage = getRouteLanguage(language);

  return PLATFORM_ROUTE_SEGMENTS.types[normalizedType]?.[routeLanguage] || null;
};

export function getPlatformBasePath(language = 'it') {
  return PLATFORM_ROUTE_BASE_PATHS[getRouteLanguage(language)];
}

export function getPlatformRouteSegment(type, language = 'it') {
  return getConfiguredPlatformRouteSegment(type, language) || type;
}

export function getPlatformTypeFromRouteSegment(segment, language = 'it') {
  if (!segment) return null;

  const routeLanguage = getRouteLanguage(language);
  const routeEntry = Object.entries(PLATFORM_ROUTE_SEGMENTS.types)
    .find(([, routes]) => routes[routeLanguage] === segment);

  return routeEntry?.[0] || null;
}

export function isPlatformRouteSegment(segment, language = 'it') {
  return getPlatformTypeFromRouteSegment(segment, language) !== null;
}

export function getPlatformIndexUrl(language = 'it') {
  return `${getPlatformBasePath(language)}/`;
}

export function getPlatformTypeUrl(type, language = 'it') {
  const segment = getPlatformRouteSegment(type, language);

  return segment
    ? `${getPlatformBasePath(language)}/${segment}/`
    : getPlatformIndexUrl(language);
}

export function getPlatformManufacturerUrl(type, manufacturerSlug, language = 'it') {
  if (!type || !manufacturerSlug) return getPlatformIndexUrl(language);

  return `${getPlatformTypeUrl(type, language)}${manufacturerSlug}/`;
}

export function getSearchRouteData(language = 'it') {
  const routeLanguage = getRouteLanguage(language);
  const contentSegments = Object.fromEntries([
    ...Object.keys(CONTENT_ROUTE_SEGMENTS.types).map((type) => [
      type,
      getConfiguredContentRouteSegment(type, routeLanguage, 'detail')
    ]),
    ...Object.keys(CONTENT_ROUTE_SEGMENTS.aliases).map((alias) => [
      alias,
      getConfiguredContentRouteSegment(alias, routeLanguage, 'detail')
    ])
  ]);
  const platformSegments = Object.fromEntries([
    ...Object.keys(PLATFORM_ROUTE_SEGMENTS.types).map((type) => [
      type,
      getPlatformRouteSegment(type, routeLanguage)
    ]),
    ...Object.keys(PLATFORM_ROUTE_SEGMENTS.aliases).map((alias) => [
      alias,
      getPlatformRouteSegment(alias, routeLanguage)
    ])
  ]);

  return {
    articles: {
      basePath: routeLanguage === 'en' ? '/en' : '',
      segments: contentSegments,
      fallback: CONTENT_ROUTE_SEGMENTS.fallbacks.detail[routeLanguage]
    },
    platforms: {
      basePath: PLATFORM_ROUTE_BASE_PATHS[routeLanguage],
      segments: platformSegments
    }
  };
}

export function getPostUrl(post) {
  const slug = post?.slug;

  if (!slug) return '/';

  const language = post?.language || 'it';

  const section = getContentRouteSegment(post.type, language, 'detail');

  return language === 'en'
    ? `/en/${section}/${slug}/`
    : `/${section}/${slug}/`;
}

const getSlug = (item) => {
  if (!item) return ''

  return typeof item.slug === 'string'
    ? item.slug
    : item.slug?.current || ''
}

export function getCreatorUrl(creator, lang = 'it') {
  const slug = getSlug(creator)

  if (!slug) {
    return getRouteLanguage(lang) === 'en' ? '/en/creators/' : '/creatori/'
  }

  return getRouteLanguage(lang) === 'en'
    ? `/en/creators/${slug}/`
    : `/creatori/${slug}/`
}

export function getPlayableClassicUrl(item, lang = item?.language || 'it') {
  const slug = getSlug(item)

  if (!slug) {
    return lang === 'en' ? '/en/playable-classics/' : '/classici-giocabili-oggi/'
  }

  return lang === 'en'
    ? `/en/playable-classics/${slug}/`
    : `/classici-giocabili-oggi/${slug}/`
}

export function getEmulatorToolUrl(item, lang = item?.language || 'it') {
  const slug = getSlug(item)

  if (!slug) {
    return lang === 'en' ? '/en/emulators/' : '/emulatori/'
  }

  return lang === 'en'
    ? `/en/emulators/${slug}/`
    : `/emulatori/${slug}/`
}

export function getSanityDocumentUrl(document, fallbackLang = 'it') {
  if (!document) return '#'

  const documentType = document._type || document.documentType || ''
  const language = document.language || fallbackLang || 'it'

  if (documentType === 'playableClassic') {
    return getPlayableClassicUrl(document, language)
  }

  if (documentType === 'emulatorTool') {
    return getEmulatorToolUrl(document, language)
  }

  return getPostUrl({
    ...document,
    type: document.type || 'article',
    language
  })
}

export function getArchiveUrl(type, language = 'it') {
  const section = getContentRouteSegment(type, language, 'archive');

  return language === 'en'
    ? `/en/${section}/`
    : `/${section}/`;
}

export const getPlatformUrl = (platform, lang = 'it') => {
  if (!platform) return '#'

  const platformSlug =
    typeof platform.slug === 'string'
      ? platform.slug
      : platform.slug?.current

  const manufacturerSlug =
    typeof platform.manufacturer?.slug === 'string'
      ? platform.manufacturer.slug
      : platform.manufacturer?.slug?.current

  const routeLanguage = getRouteLanguage(lang)
  if (!platformSlug || !manufacturerSlug || !platform.platformType) {
    return getPlatformIndexUrl(routeLanguage)
  }

  return `${getPlatformManufacturerUrl(platform.platformType, manufacturerSlug, routeLanguage)}${platformSlug}/`
}

export const getCategoryUrl = (category, lang = 'it') => {
  if (!category) {
    return lang === 'en' ? '/en/features/' : '/speciali/'
  }

  const slug =
    typeof category.slug === 'string'
      ? category.slug
      : category.slug?.current

  if (!slug) {
    return lang === 'en' ? '/en/features/' : '/speciali/'
  }

  return lang === 'en'
    ? `/en/categories/${slug}/`
    : `/categorie/${slug}/`
}

export const getCompanyUrl = (company, lang = 'it') => {
  if (!company) {
    return lang === 'en' ? '/en/companies/' : '/aziende/'
  }

  const slug =
    typeof company.slug === 'string'
      ? company.slug
      : company.slug?.current

  if (!slug) {
    return lang === 'en' ? '/en/companies/' : '/aziende/'
  }

  return lang === 'en'
    ? `/en/companies/${slug}/`
    : `/aziende/${slug}/`
}
