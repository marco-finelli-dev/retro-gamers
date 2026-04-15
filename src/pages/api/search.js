export async function GET({ url }) {

    const query = url.searchParams.get('q');
  
    if (!query) {
      return new Response(JSON.stringify([]));
    }
  
    const safeQuery = query.replace(/"/g, '\\"');
  
    const res = await fetch(import.meta.env.PUBLIC_WP_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `
        {
          posts(where: { search: "${safeQuery}" }, first: 10) {
            nodes {
              title
              slug
              featuredImage {
                node {
                  sourceUrl
                }
              }
              categories {
                nodes {
                  name
                  slug
                }
              }
            }
          }
        }
        `
      })
    });
  
    const json = await res.json();
  
    return new Response(JSON.stringify(json.data.posts.nodes));
  }