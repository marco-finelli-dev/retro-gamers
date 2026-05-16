export function getPostUrl(post) {
  const slug = post?.slug;

  if (!slug) return '/';

  const language = post?.language || 'it';

  const routes = {
    it: {
      review: 'recensioni',
      guide: 'guide',
      feature: 'speciali',
      interview: 'interviste',
      memories: 'memories',
      news: 'news',
      hardware: 'hardware',
      article: 'articoli'
    },

    en: {
      review: 'reviews',
      guide: 'guides',
      feature: 'features',
      interview: 'interviews',
      memories: 'memories',
      news: 'news',
      hardware: 'hardware',
      article: 'articles'
    }
  };

  const section =
    routes[language]?.[post.type] ||
    routes[language]?.article ||
    'articoli';

  return language === 'en'
    ? `/en/${section}/${slug}/`
    : `/${section}/${slug}/`;
}

export function getArchiveUrl(type, language = 'it') {
  const routes = {
    it: {
      review: 'recensioni',
      guide: 'guide',
      feature: 'speciali',
      interview: 'interviste',
      memories: 'memories',
      news: 'news',
      hardware: 'hardware',
      article: 'articoli'
    },

    en: {
      review: 'reviews',
      guide: 'guides',
      feature: 'features',
      interview: 'interviews',
      memories: 'memories',
      news: 'news',
      hardware: 'hardware',
      article: 'articles'
    }
  };

  const section =
    routes[language]?.[type] ||
    routes[language]?.article ||
    'articoli';

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