import { getSanityRawClient } from '../sanity-write.server';
import { PUBLIC_POST_GROQ_FILTER, type Post } from '../posts';

const editorialPreviewImageProjection = `{
  ...,
  alt,
  asset->{
    _id,
    url
  }
}`;

const editorialPreviewCreatorRefProjection = `{
  _id,
  name,
  "slug": slug.current,
  role,
  roleEn,
  portrait ${editorialPreviewImageProjection}
}`;

const editorialArticlePreviewCardProjection = `{
  _id,
  type,
  isPublic,
  "language": coalesce(language, "it"),
  title,
  subtitle,
  excerpt,
  cardExcerpt,
  "slug": slug.current,
  publishedAt,
  seriesOrder,
  seriesLabel,
  featuredImage ${editorialPreviewImageProjection},
  categories[]->{
    "name": coalesce(name, title),
    "nameEn": coalesce(nameEn, titleEn),
    "slug": slug.current
  },
  platforms[]->{
    name,
    "slug": slug.current,
    platformType,
    badgeLabel,
    manufacturer->{
      name,
      nameEn,
      "slug": slug.current
    }
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
  rating {
    overall
  },
  gameInfo {
    releaseYear,
    cover ${editorialPreviewImageProjection}
  }
}`;

const editorialArticlePreviewProjection = `{
  _id,
  _type,
  type,
  isPublic,
  language,

  translationOf->{
    _id,
    _type,
    type,
    title,
    "slug": slug.current,
    "language": coalesce(language, "it"),
    isPublic
  },

  translatedVersion->{
    _id,
    _type,
    type,
    title,
    "slug": slug.current,
    "language": coalesce(language, "it"),
    isPublic
  },

  title,
  subtitle,
  excerpt,
  cardExcerpt,
  seoTitle,
  "slug": slug.current,
  publishedAt,
  lastUpdated,
  seriesOrder,
  seriesLabel,

  author->{
    name,
    nickname,
    displayName,
    role,
    "slug": slug.current,
    image ${editorialPreviewImageProjection}
  },

  featuredImage ${editorialPreviewImageProjection},

  categories[]->{
    "name": coalesce(name, title),
    "nameEn": coalesce(nameEn, titleEn),
    "slug": slug.current
  },

  platforms[]->{
    name,
    "slug": slug.current,
    platformType,
    badgeLabel,
    manufacturer->{
      name,
      nameEn,
      "slug": slug.current
    }
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

  publishers[]->{
    name,
    nameEn,
    "slug": slug.current
  },

  manufacturer[]->{
    name,
    nameEn,
    "slug": slug.current
  },

  modes[]->{
    name,
    nameEn,
    "slug": slug.current
  },

  series[]->{
    name,
    nameEn,
    "slug": slug.current
  },

  editorialSeries[]->{
    _id,
    name,
    nameEn,
    description,
    descriptionEn,
    "slug": slug.current,
    logo ${editorialPreviewImageProjection},
    logoLight ${editorialPreviewImageProjection}
  },

  creators[]->${editorialPreviewCreatorRefProjection},

  gameInfo {
    releaseYear,
    mediaFormat,
    cover ${editorialPreviewImageProjection}
  },

  rating,
  pros,
  cons,

  monetization {
    isAffiliate,
    productType,
    affiliateUrl,
    affiliateLabel,
    affiliateDescription,
    priceLabel,
    disclaimer,
    priority
  },

  content[]{
    ...,

    markDefs[]{
      ...,

      _type == "internalLink" => {
        ...,
        reference->{
          _type,
          type,
          isPublic,
          language,
          "slug": slug.current
        }
      },

      _type == "platformLink" => {
        ...,
        reference->{
          name,
          nameEn,
          "slug": slug.current,
          platformType,
          manufacturer->{
            name,
            nameEn,
            "slug": slug.current
          }
        }
      },

      _type == "taxonomyLink" => {
        ...,
        reference->{
          name,
          nameEn,
          "slug": slug.current
        }
      },

      _type == "creatorLink" => {
        ...,
        reference->{
          _id,
          name,
          "slug": slug.current,
          role,
          roleEn,
          portrait ${editorialPreviewImageProjection}
        }
      },

      _type == "companyLink" => {
        ...,
        reference->{
          name,
          nameEn,
          "slug": slug.current,
          type
        }
      }
    },

    _type == "image" => {
      ...,
      alt,
      caption,
      displayMode,
      isWide,
      asset->{ url, mimeType, extension, originalFilename }
    },

    _type == "imageRow" => {
      ...,
      layout,
      groupCaption,
      images[]{
        ...,
        alt,
        caption,
        displayMode,
        image{
          asset->{ url, mimeType, extension, originalFilename }
        }
      }
    },

    _type == "asideBox" => {
      ...,
      content[]{
        ...,

        markDefs[]{
          ...,

          _type == "internalLink" => {
            ...,
            reference->{
              _type,
              type,
              isPublic,
              language,
              "slug": slug.current
            }
          },

          _type == "platformLink" => {
            ...,
            reference->{
              name,
              nameEn,
              "slug": slug.current,
              platformType,
              manufacturer->{
                name,
                nameEn,
                "slug": slug.current
              }
            }
          },

          _type == "taxonomyLink" => {
            ...,
            reference->{
              name,
              nameEn,
              "slug": slug.current
            }
          },

          _type == "creatorLink" => {
            ...,
            reference->{
              _id,
              name,
              "slug": slug.current,
              role,
              roleEn,
              portrait ${editorialPreviewImageProjection}
            }
          },

          _type == "companyLink" => {
            ...,
            reference->{
              name,
              nameEn,
              "slug": slug.current,
              type
            }
          }
        },

        _type == "image" => {
          ...,
          alt,
          caption,
          displayMode,
          isWide,
          asset->{ url, mimeType, extension, originalFilename }
        },

        _type == "imageRow" => {
          ...,
          layout,
          groupCaption,
          images[]{
            ...,
            alt,
            caption,
            displayMode,
            image{
              asset->{ url, mimeType, extension, originalFilename }
            }
          }
        }
      }
    },

    _type == "video" => {
      ...,
      url,
      title
    }
  }
}`;

type PreviewPostCandidateRow = {
  published?: Post | null;
  draft?: Post | null;
};

function mergePreviewPostCandidate(row: PreviewPostCandidateRow): Post | null {
  const published = row?.published || null;
  const draft = row?.draft || null;

  if (!published && !draft) return null;
  if (!draft) return published;
  if (!published) return draft;

  return {
    ...published,
    ...draft,
    isPublic: published.isPublic,
  };
}

function mergePreviewPostCandidateRows(rows: PreviewPostCandidateRow[] = []): Post[] {
  return rows
    .map(mergePreviewPostCandidate)
    .filter((post): post is Post => Boolean(post));
}

export async function fetchEditorialArticlePreviewPost(documentId: string): Promise<Post | null> {
  const id = String(documentId || '').trim();

  if (!id) return null;

  return await getSanityRawClient().fetch<Post | null>(
    `*[_type == "article" && _id == $documentId][0]${editorialArticlePreviewProjection}`,
    { documentId: id }
  );
}

export async function fetchEditorialArticlePreviewSeriesPosts({
  seriesId,
  language,
}: {
  seriesId: string;
  language: 'it' | 'en';
}): Promise<Post[]> {
  const normalizedSeriesId = String(seriesId || '').trim();
  const normalizedLanguage = language === 'en' ? 'en' : 'it';

  if (!normalizedSeriesId) return [];

  const rows = await getSanityRawClient().fetch<PreviewPostCandidateRow[]>(
    `*[
      _type == "article" &&
      defined(slug.current) &&
      !(_id in path("drafts.**")) &&
      ${PUBLIC_POST_GROQ_FILTER} &&
      coalesce(language, "it") == $language &&
      references($seriesId)
    ] | order(coalesce(seriesOrder, 999) asc, coalesce(publishedAt, _createdAt) asc) {
      "published": ${editorialArticlePreviewCardProjection},
      "draft": *[_id == "drafts." + ^._id][0]${editorialArticlePreviewCardProjection}
    }`,
    {
      seriesId: normalizedSeriesId,
      language: normalizedLanguage,
    }
  ) || [];

  return mergePreviewPostCandidateRows(rows);
}

export async function fetchEditorialArticlePreviewRelatedPostCandidates(): Promise<Post[]> {
  const rows = await getSanityRawClient().fetch<PreviewPostCandidateRow[]>(
    `*[
      _type == "article" &&
      defined(slug.current) &&
      !(_id in path("drafts.**")) &&
      ${PUBLIC_POST_GROQ_FILTER}
    ] | order(coalesce(publishedAt, _createdAt) desc) {
      "published": ${editorialArticlePreviewCardProjection},
      "draft": *[_id == "drafts." + ^._id][0]${editorialArticlePreviewCardProjection}
    }`
  ) || [];

  return mergePreviewPostCandidateRows(rows);
}
