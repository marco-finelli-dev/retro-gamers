export function buildFilters(posts) {
    const getUnique = (items) =>
      [...new Map(items.map(i => [i.slug, i])).values()];
  
    return {
      piattaforme: getUnique(posts.flatMap(p => p.platforms?.nodes || [])),
      sviluppatori: getUnique(posts.flatMap(p => p.developers?.nodes || [])),
      generi: getUnique(posts.flatMap(p => p.genres?.nodes || [])),
  
      // ✅ FIX ANNI (ACF, non tassonomia)
      anni: [
        ...new Set(
          posts
            .map(p => String(p.datiRecensione?.releaseYear))
            .filter(Boolean)
        )
      ].sort((a, b) => b - a),
    };
  }