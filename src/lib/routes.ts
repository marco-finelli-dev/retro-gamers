export function getPostUrl(post) {
    switch (post.__typename) {
      case 'Guida':
        return `/guida/${post.slug}`;
      case 'Speciale':
        return `/speciale/${post.slug}`;
      case 'Recensione':
        return `/recensione/${post.slug}`;
      case 'News':
        return `/news/${post.slug}`;
      case 'Intervista':
        return `/intervista/${post.slug}`;
      case 'Memory':
        return `/memoria/${post.slug}`;
      default:
        return `/${post.slug}`; // fallback
    }
  }