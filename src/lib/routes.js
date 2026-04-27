export function getPostUrl(post) {
  const slug = post?.slug;

  if (!slug) return '/';

  switch (post.type) {
    case 'review':
      return `/recensioni/${slug}/`;

    case 'guide':
      return `/guide/${slug}/`;

    case 'feature':
      return `/speciali/${slug}/`;

    case 'interview':
      return `/interviste/${slug}/`;

    case 'memories':
      return `/memories/${slug}/`;

    case 'news':
      return `/news/${slug}/`;

    case 'hardware':
      return `/hardware/${slug}/`;

    case 'article':
    default:
      return `/articoli/${slug}/`;
  }
}

export function getArchiveUrl(type) {
  switch (type) {
    case 'review':
      return '/recensioni/';

    case 'guide':
      return `/guide/`;

    case 'feature':
      return '/speciali/';

    case 'interview':
      return '/interviste/';

    case 'memories':
      return '/memories/';

    case 'news':
      return '/news/';

    case 'hardware':
      return '/hardware/';

    default:
      return '/articoli/';
  }
}