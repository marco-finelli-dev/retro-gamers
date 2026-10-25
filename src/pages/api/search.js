import { client } from '../../lib/sanity';
import { PUBLIC_POST_GROQ_FILTER } from '../../lib/posts';
import { publicContentResponse, publicContentUnavailable } from '../../lib/public-content-response';

async function getSearchIndex() {
  const data = await client.fetch(`
    {
      "articles": *[
        _type == "article" &&
        defined(slug.current) &&
        ${PUBLIC_POST_GROQ_FILTER} &&
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

  return JSON.stringify(data);
}

export async function GET({ request }) {
  try {
    return publicContentResponse(request, await getSearchIndex(), 'application/json; charset=utf-8', 60);
  } catch {
    return publicContentUnavailable();
  }
}
