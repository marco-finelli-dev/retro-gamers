const posts = await client.fetch(`
    *[
      _type == "article" &&
      defined(slug.current)
    ] | order(coalesce(publishedAt, _createdAt) desc)[0...10]{
      title,
      "slug": slug.current,
      publishedAt,
      excerpt,
    
      featuredImage {
        asset->{ url }
      },
    
      categories[]->{
        name,
        "slug": slug.current
      },
    
      rating { overall },
    
      gameInfo { releaseYear },
    
      datiRecensione{
        totale,
        releaseYear
      },
    
      developers[]->{ name },
      platforms[]->{ name },
    
      type
    }
    `);