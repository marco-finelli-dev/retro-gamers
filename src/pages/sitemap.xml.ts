import { getAllPosts } from '../lib/posts';
import {
  getCategoryUrl,
  getCompanyUrl,
  getCreatorUrl,
  getEmulatorToolUrl,
  getPlatformUrl,
  getPlayableClassicUrl,
  getPostUrl
} from '../lib/routes';
import { client } from '../lib/sanity';
import { getAllCreators } from '../lib/creators';
import {
  getAllPlatforms
} from '../lib/platforms';
import {
  getAllCompanies
} from '../lib/companies';
import {
  getPlayableClassicRoutes
} from '../lib/playable-classics';
import {
  getEmulatorToolSlugs
} from '../lib/emulator-tools';

const SITE_URL = 'https://www.retro-gamers.it';

type SitemapAuthor = {
  _id?: string;
  name?: string;
  slug?: string;
  _updatedAt?: string;
};

function absoluteUrl(path = '') {
  if (path.startsWith('http')) return path;

  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlEntry({
  loc,
  lastmod,
  changefreq = 'weekly',
  priority = '0.7'
}: {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}) {
  return `
  <url>
    <loc>${escapeXml(loc)}</loc>
    ${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function getPostLastmod(post: any) {
  const lastmodSource =
    post.lastUpdated ||
    post.updatedAt ||
    post._updatedAt ||
    post.publishedAt;

  return lastmodSource
    ? new Date(lastmodSource).toISOString()
    : undefined;
}

function getAuthorUrl(author: SitemapAuthor, language = 'it') {
  const slug = author?.slug;

  if (!slug) {
    return language === 'en' ? '/en/authors/' : '/autori/';
  }

  return language === 'en'
    ? `/en/authors/${slug}/`
    : `/autori/${slug}/`;
}

async function getSitemapAuthors(): Promise<SitemapAuthor[]> {
  const data = await client.fetch(`
    *[
      _type == "author" &&
      defined(slug.current) &&
      !(_id in path("drafts.**"))
    ] | order(name asc) {
      _id,
      name,
      "slug": slug.current,
      _updatedAt
    }
  `);

  return data || [];
}

export async function GET() {
  const posts = await getAllPosts();
  const creators = await getAllCreators();
  const authors = await getSitemapAuthors();
  const platforms = await getAllPlatforms();
  const companies = await getAllCompanies();
  const playableClassics = await getPlayableClassicRoutes();
  const emulatorTools = await getEmulatorToolSlugs();

  const staticPages = [
    {
      loc: absoluteUrl('/'),
      changefreq: 'daily',
      priority: '1.0'
    },
    {
      loc: absoluteUrl('/recensioni/'),
      changefreq: 'weekly',
      priority: '0.9'
    },
    {
      loc: absoluteUrl('/news/'),
      changefreq: 'daily',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/speciali/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/guide/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/memories/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/community/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/interviste/'),
      changefreq: 'monthly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/hardware/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/archivio/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/articoli/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/piattaforme/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/piattaforme/console/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/piattaforme/computer/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/piattaforme/arcade/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/creatori/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/autori/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/badges/'),
      changefreq: 'monthly',
      priority: '0.5'
    },
    {
      loc: absoluteUrl('/regolamento-commenti/'),
      changefreq: 'yearly',
      priority: '0.3'
    },
    {
      loc: absoluteUrl('/aziende/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/chi-siamo/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/come-lavoriamo/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/risorse/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/collaborazioni/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/contatti/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/newsletter/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/classici-giocabili-oggi/'),
      changefreq: 'monthly',
      priority: '0.6'
    },
    {
      loc: absoluteUrl('/classici-giocabili-oggi/policy/'),
      changefreq: 'yearly',
      priority: '0.3'
    },
    {
      loc: absoluteUrl('/emulatori/'),
      changefreq: 'monthly',
      priority: '0.5'
    },
    {
      loc: absoluteUrl('/privacy-policy/'),
      changefreq: 'yearly',
      priority: '0.2'
    },
    {
      loc: absoluteUrl('/cookie-policy/'),
      changefreq: 'yearly',
      priority: '0.2'
    },

    {
      loc: absoluteUrl('/en/'),
      changefreq: 'daily',
      priority: '0.9'
    },
    {
      loc: absoluteUrl('/en/reviews/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/en/news/'),
      changefreq: 'daily',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/features/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/en/guides/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/memories/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/community/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/interviews/'),
      changefreq: 'monthly',
      priority: '0.6'
    },
    {
      loc: absoluteUrl('/en/hardware/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/archive/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/how-we-work/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/resources/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/platforms/'),
      changefreq: 'weekly',
      priority: '0.8'
    },
    {
      loc: absoluteUrl('/en/platforms/consoles/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/platforms/computers/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/platforms/arcade/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/creators/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/authors/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/badges/'),
      changefreq: 'monthly',
      priority: '0.5'
    },
    {
      loc: absoluteUrl('/en/comment-rules/'),
      changefreq: 'yearly',
      priority: '0.3'
    },
    {
      loc: absoluteUrl('/en/companies/'),
      changefreq: 'weekly',
      priority: '0.7'
    },
    {
      loc: absoluteUrl('/en/about/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/collaborations/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/contact/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/newsletter/'),
      changefreq: 'monthly',
      priority: '0.4'
    },
    {
      loc: absoluteUrl('/en/playable-classics/'),
      changefreq: 'monthly',
      priority: '0.5'
    },
    {
      loc: absoluteUrl('/en/playable-classics/policy/'),
      changefreq: 'yearly',
      priority: '0.3'
    },
    {
      loc: absoluteUrl('/en/emulators/'),
      changefreq: 'monthly',
      priority: '0.5'
    },
    {
      loc: absoluteUrl('/en/privacy-policy/'),
      changefreq: 'yearly',
      priority: '0.2'
    },
    {
      loc: absoluteUrl('/en/cookie-policy/'),
      changefreq: 'yearly',
      priority: '0.2'
    }
  ];

  const postPages = posts
    .filter((post) => post?.slug && post?.type)
    .map((post) => ({
      loc: absoluteUrl(getPostUrl(post)),
      lastmod: getPostLastmod(post),
      changefreq: post.type === 'news' ? 'monthly' : 'yearly',
      priority: post.type === 'review' ? '0.8' : '0.7'
    }));

  const platformPagesIt = platforms
    .filter((platform) => platform?.slug && platform?.platformType)
    .map((platform) => ({
      loc: absoluteUrl(getPlatformUrl(platform, 'it')),
      changefreq: 'monthly',
      priority: '0.7'
    }));

  const platformPagesEn = platforms
    .filter((platform) => platform?.slug && platform?.platformType)
    .map((platform) => ({
      loc: absoluteUrl(getPlatformUrl(platform, 'en')),
      changefreq: 'monthly',
      priority: '0.7'
    }));

  const categorySlugsIt = new Set<string>();
  const categorySlugsEn = new Set<string>();

  posts.forEach((post: any) => {
    const categories = post.categories || [];

    categories.forEach((category: any) => {
      if (!category?.slug) return;

      if (post.language === 'en') {
        categorySlugsEn.add(category.slug);
      } else {
        categorySlugsIt.add(category.slug);
      }
    });
  });

  const categoryPagesIt = Array.from(categorySlugsIt).map((slug) => ({
    loc: absoluteUrl(getCategoryUrl({ slug }, 'it')),
    changefreq: 'weekly',
    priority: '0.6'
  }));

  const categoryPagesEn = Array.from(categorySlugsEn).map((slug) => ({
    loc: absoluteUrl(getCategoryUrl({ slug }, 'en')),
    changefreq: 'weekly',
    priority: '0.6'
  }));

  const companyPagesIt = companies
    .filter((company) => company?.slug)
    .map((company) => ({
      loc: absoluteUrl(getCompanyUrl(company, 'it')),
      changefreq: 'monthly',
      priority: '0.6'
    }));

  const companyPagesEn = companies
    .filter((company) => company?.slug)
    .map((company) => ({
      loc: absoluteUrl(getCompanyUrl(company, 'en')),
      changefreq: 'monthly',
      priority: '0.6'
    }));

  const creatorPagesIt = creators
    .filter((creator) => creator?.slug)
    .map((creator) => ({
      loc: absoluteUrl(getCreatorUrl(creator, 'it')),
      changefreq: 'monthly',
      priority: '0.5'
    }));

  const creatorPagesEn = creators
    .filter((creator) => creator?.slug)
    .map((creator) => ({
      loc: absoluteUrl(getCreatorUrl(creator, 'en')),
      changefreq: 'monthly',
      priority: '0.5'
    }));

  const authorPagesIt = authors
    .filter((author) => author?.slug)
    .map((author) => ({
      loc: absoluteUrl(getAuthorUrl(author, 'it')),
      lastmod: getPostLastmod(author),
      changefreq: 'monthly',
      priority: '0.5'
    }));

  const authorPagesEn = authors
    .filter((author) => author?.slug)
    .map((author) => ({
      loc: absoluteUrl(getAuthorUrl(author, 'en')),
      lastmod: getPostLastmod(author),
      changefreq: 'monthly',
      priority: '0.5'
    }));

  const playableClassicPages = playableClassics
    .filter((classic) => classic?.slug)
    .map((classic) => ({
      loc: absoluteUrl(getPlayableClassicUrl(classic, classic.language || 'it')),
      lastmod: getPostLastmod(classic),
      changefreq: 'monthly',
      priority: '0.6'
    }));

  const emulatorToolPages = emulatorTools
    .filter((tool) => tool?.slug)
    .map((tool) => ({
      loc: absoluteUrl(getEmulatorToolUrl(tool, tool.language || 'it')),
      lastmod: getPostLastmod(tool),
      changefreq: 'monthly',
      priority: '0.5'
    }));

  const urls = [
    ...staticPages,
    ...postPages,
    ...platformPagesIt,
    ...platformPagesEn,
    ...categoryPagesIt,
    ...categoryPagesEn,
    ...companyPagesIt,
    ...companyPagesEn,
    ...creatorPagesIt,
    ...creatorPagesEn,
    ...authorPagesIt,
    ...authorPagesEn,
    ...playableClassicPages,
    ...emulatorToolPages
  ];

  const uniqueUrls = Array.from(
    new Map(urls.map((item) => [item.loc, item])).values()
  );

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${uniqueUrls.map(urlEntry).join('')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}
