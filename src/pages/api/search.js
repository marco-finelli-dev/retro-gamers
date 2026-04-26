import { client } from '../../lib/sanity';

export async function GET() {
  const data = await client.fetch(`
    {
      "articles": *[
        _type == "article" &&
        defined(slug.current)
      ] | order(coalesce(publishedAt, _createdAt) desc) {
        title,
        excerpt,
        type,
        "slug": slug.current,
        publishedAt,

        featuredImage {
          asset->{ url }
        },

        categories[]->{
          name,
          "slug": slug.current
        },

        platforms[]->{
          name,
          "slug": slug.current
        },

        genres[]->{
          name,
          "slug": slug.current
        },

        developers[]->{
          name,
          "slug": slug.current
        },

        gameInfo {
          releaseYear
        },

        rating {
          overall
        }
      },

      "platforms": *[
        _type == "platform" &&
        defined(slug.current)
      ] | order(name asc) {
        name,
        "slug": slug.current,
        platformType,
        manufacturer->{
          name
        },
        cover {
          asset->{ url }
        },
        specs {
          year
        }
      },

      "taxonomies": *[
        _type == "taxonomy" &&
        defined(slug.current)
      ] | order(name asc) {
        name,
        "slug": slug.current,
        type,
        logo {
          asset->{ url }
        }
      }
    }
  `);

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
}