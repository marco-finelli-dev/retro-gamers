import { getSanityRawClient } from '../sanity-write.server';
import type { Post } from '../posts';

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
    image {
      alt,
      asset->{ url }
    }
  },

  featuredImage {
    alt,
    asset->{ url }
  },

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
    logo {
      alt,
      asset->{ url }
    },
    logoLight {
      alt,
      asset->{ url }
    }
  },

  creators[]->{
    _id,
    name,
    "slug": slug.current,
    role,
    roleEn,
    portrait {
      alt,
      asset->{ url }
    }
  },

  gameInfo {
    releaseYear,
    mediaFormat,
    cover {
      alt,
      asset->{ url }
    }
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
          portrait {
            alt,
            asset->{ url }
          }
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
      asset->{ url }
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
          asset->{ url }
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
              portrait {
                alt,
                asset->{ url }
              }
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
          asset->{ url }
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
              asset->{ url }
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

export async function fetchEditorialArticlePreviewPost(documentId: string): Promise<Post | null> {
  const id = String(documentId || '').trim();

  if (!id) return null;

  return await getSanityRawClient().fetch<Post | null>(
    `*[_type == "article" && _id == $documentId][0]${editorialArticlePreviewProjection}`,
    { documentId: id }
  );
}
