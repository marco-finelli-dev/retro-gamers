import { client } from '../../lib/sanity';

export async function GET() {

  const data = await client.fetch(`
    {
      "articles": *[_type == "article"]{
        title,
        excerpt,
        "slug": slug.current,
        featuredImage { asset->{ url } },
        categories[]->{
          name
        },
        platforms[]->{
          name
        }
      },

      "platforms": *[_type == "platform"]{
        name,
        "slug": slug.current
      },

      "taxonomies": *[_type == "taxonomy"]{
        name,
        "slug": slug.current
      }
    }
  `);

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
}