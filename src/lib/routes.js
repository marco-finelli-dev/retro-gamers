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

const getContentRouteSegment = (type, language, routeKind) => {
  const normalizedType = CONTENT_ROUTE_SEGMENTS.aliases[type] || type;

  return (
    CONTENT_ROUTE_SEGMENTS.types[normalizedType]?.[routeKind]?.[language] ||
    CONTENT_ROUTE_SEGMENTS.fallbacks[routeKind]?.[language] ||
    'articoli'
  );
};

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

  const typeMap = {
    console: lang === 'en' ? 'consoles' : 'console',
    computer: lang === 'en' ? 'computers' : 'computer',
    arcade: 'arcade',
    consoles: lang === 'en' ? 'consoles' : 'console',
    computers: lang === 'en' ? 'computers' : 'computer'
  }

  const type = typeMap[platform.platformType] || platform.platformType

  if (!platformSlug || !manufacturerSlug || !type) {
    return lang === 'en' ? '/en/platforms/' : '/piattaforme/'
  }

  if (lang === 'en') {
    return `/en/platforms/${type}/${manufacturerSlug}/${platformSlug}/`
  }

  return `/piattaforme/${type}/${manufacturerSlug}/${platformSlug}/`
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
