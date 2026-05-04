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
