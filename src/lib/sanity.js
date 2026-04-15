import { createClient } from '@sanity/client'

export const client = createClient({
  projectId: 'y88ky0mu',
  dataset: 'production',
  apiVersion: '2024-01-01',
  useCdn: true
})

export async function getArticles() {
    return client.fetch(`
      *[_type == "article"]{
        title,
        "slug": slug.current,
        "image": mainImage.asset->url,
        "category": category->{
          title
        },
        body
      }
    `)
  }