import { client } from '../../lib/sanity';

export async function GET() {
  const data = await client.fetch(`
    {
      "articles": *[
        _type == "article" &&
        defined(slug.current) &&
        !(_id in path("drafts.**"))
      ] | order(coalesce(publishedAt, _createdAt) desc) {
        title,
        excerpt,
        cardExcerpt,
        type,
        language,
        "slug": slug.current,
        publishedAt,

        featuredImage {
          asset->{ url }
        },

        categories[]->{
          "name": coalesce(name, title),
          "nameEn": coalesce(nameEn, titleEn),
          "slug": slug.current
        },

        platforms[]->{
          name,
          "slug": slug.current
        },

        genres[]->{
          name,
          nameEn,
          "slug": slug.current
        },

        developers[]->{
          name,
          nameEn,
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
        defined(slug.current) &&
        !(_id in path("drafts.**"))
      ] | order(name asc) {
        name,
        "slug": slug.current,
        platformType,
        history,
        historyEn,

        manufacturer->{
          name,
          "slug": slug.current
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
        defined(slug.current) &&
        !(_id in path("drafts.**"))
      ] | order(name asc) {
        name,
        nameEn,
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