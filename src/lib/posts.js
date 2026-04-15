export function getCleanPosts(posts = [], excludeSet = new Set()) {
    const result = [];
  
    for (const post of posts) {
      if (!post?.slug) continue;
  
      // ❌ se già visto → skip
      if (excludeSet.has(post.slug)) continue;
  
      // ✅ aggiungi
      result.push(post);
  
      // 🔒 segna come usato (evita duplicati futuri)
      excludeSet.add(post.slug);
    }
  
    return result;
  }