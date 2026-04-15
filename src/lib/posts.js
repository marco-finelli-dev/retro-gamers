export function getCleanPosts(posts = [], excludeSet = new Set()) {
  const result = [];

  for (const post of posts) {
    if (!post?.slug) continue;

    if (excludeSet.has(post.slug)) continue;

    result.push(post);
    excludeSet.add(post.slug);
  }

  return result;
}