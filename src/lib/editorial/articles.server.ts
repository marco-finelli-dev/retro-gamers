import { logApiError } from '../api-errors';
import { getSanityRawClient, getSanityWriteClient } from '../sanity-write.server';
import { supabaseAdmin } from '../supabase/server';
import {
  canCreateArticle,
  canEditOwnArticle,
  getOwnershipConflict,
  isDocumentOwnedByContext,
} from './permissions';
import { getEditorialSessionFromCookies } from './session.server';
import {
  normalizeSanityRootDocumentId,
  isEditorialWorkflowStatus,
  type EditorialDocumentOwnership,
  type EditorialSessionContext,
  type EditorialWorkflowStatus,
} from './types';

export const editorialArticleTypes = [
  'review',
  'article',
  'guide',
  'interview',
  'news',
  'feature',
  'memories',
  'hardware',
] as const;

export const editorialArticleLanguages = ['it', 'en'] as const;

export const editorialArticleMediaFormats = [
  'cartridge',
  'floppy',
  'tape',
  'cdrom',
  'gdrom',
  'dvdrom',
  'hucard',
  'arcade_pcb',
  'digital',
  'other',
] as const;

const editorialArticleRatingFields = [
  'grafica',
  'sonoro',
  'giocabilita',
  'longevita',
  'overall',
] as const;

type EditorialArticleType = (typeof editorialArticleTypes)[number];
type EditorialArticleLanguage = (typeof editorialArticleLanguages)[number];
type EditorialArticleMediaFormat = (typeof editorialArticleMediaFormats)[number];
type EditorialArticleRatingField = (typeof editorialArticleRatingFields)[number];

type EditorialArticleAuthorInfo = {
  _id: string;
  name: string;
  nickname: string;
  displayName: 'real' | 'nickname';
  label: string;
  role: string;
  slug: string;
};

export type EditorialArticleFeaturedImageAsset = {
  _id: string;
  url: string;
  originalFilename: string;
  size: number | null;
  mimeType: string;
  metadata: {
    dimensions: {
      width: number | null;
      height: number | null;
      aspectRatio: number | null;
    } | null;
  };
};

export type EditorialArticleFeaturedImage = {
  _type: 'image';
  alt: string;
  crop: Record<string, unknown> | null;
  hotspot: Record<string, unknown> | null;
  asset: EditorialArticleFeaturedImageAsset | null;
};

export type EditorialArticleGameInfo = {
  releaseYear: number | null;
  mediaFormat: EditorialArticleMediaFormat[];
};

export type EditorialArticleRating = Record<EditorialArticleRatingField, number | null> & {
  summary: string;
};

type EditableEditorialContext = EditorialSessionContext & {
  user: NonNullable<EditorialSessionContext['user']>;
  editorialProfile: NonNullable<EditorialSessionContext['editorialProfile']>;
};

type EditorialDocumentRow = {
  sanity_document_id: string | null;
  owner_user_id: string | null;
  sanity_author_id: string | null;
  workflow_status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EditorialArticleDraft = {
  _id: string;
  _rev: string;
  title: string;
  subtitle: string;
  cardExcerpt: string;
  excerpt: string;
  seoTitle: string;
  type: EditorialArticleType;
  language: EditorialArticleLanguage;
  slug: string;
  isPublic: boolean;
  reviewStatus: string;
  content: PortableTextBlock[];
  authorId: string;
  author: EditorialArticleAuthorInfo | null;
  featuredImage: EditorialArticleFeaturedImage | null;
  gameInfo: EditorialArticleGameInfo;
  rating: EditorialArticleRating;
  pros: string[];
  cons: string[];
  hasEditorialSeries: boolean;
  seriesOrder: number | null;
  seriesLabel: string;
  updatedAt: string | null;
  createdAt: string | null;
};

export type EditorialArticleListItem = {
  sanityDocumentId: string;
  workflowStatus: EditorialWorkflowStatus;
  updatedAt: string | null;
  createdAt: string | null;
  draft: EditorialArticleDraft | null;
};

type PortableTextBlock = Record<string, unknown>;

const draftStatus: EditorialWorkflowStatus = 'draft';
const rootDocumentIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const keyPattern = /^[A-Za-z0-9_-]{1,128}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validBlockStyles = new Set(['normal', 'h2', 'h3', 'blockquote']);
const validAsideBlockStyles = new Set(['normal', 'h3']);
const validListItems = new Set(['bullet', 'number']);
const validAsideListItems = new Set(['bullet']);
const validDecorators = new Set(['strong', 'em']);
const validImageDisplayModes = new Set(['cover', 'contain', 'wide', 'natural']);
const validImageRowLayouts = new Set(['standard', 'uniformHeight']);
const validAsideTones = new Set(['neutral', 'info', 'highlight']);
const validMediaFormats = new Set<string>(editorialArticleMediaFormats);
const allowedFeaturedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const featuredImageMaxFileSize = 5 * 1024 * 1024;
const validPageLinkPaths = new Set([
  '/',
  '/en/',
  '/archivio/',
  '/en/archive/',
  '/piattaforme/',
  '/en/platforms/',
  '/piattaforme/console/',
  '/en/platforms/consoles/',
  '/piattaforme/computer/',
  '/en/platforms/computers/',
  '/piattaforme/arcade/',
  '/en/platforms/arcade/',
  '/hardware/',
  '/en/hardware/',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown, maxLength = 2000) {
  if (typeof value !== 'string') return '';

  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maxLength);
}

function normalizeOptionalString(value: unknown, maxLength = 2000) {
  const normalized = normalizeString(value, maxLength).trim();

  return normalized ? normalized : null;
}

function normalizeKey(value: unknown) {
  const key = String(value || '').trim();

  if (keyPattern.test(key)) return key;

  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function assertRootDocumentId(value: unknown, label: string) {
  const id = String(value || '').trim();

  if (!id || id.startsWith('drafts.') || !rootDocumentIdPattern.test(id)) {
    throw new Error(`${label}_invalid`);
  }

  return id;
}

function normalizeArticleType(value: unknown): EditorialArticleType {
  const type = String(value || '').trim();

  if (editorialArticleTypes.includes(type as EditorialArticleType)) {
    return type as EditorialArticleType;
  }

  return 'article';
}

function validateArticleType(value: unknown): EditorialArticleType {
  const type = String(value || '').trim();

  if (editorialArticleTypes.includes(type as EditorialArticleType)) {
    return type as EditorialArticleType;
  }

  throw new Error('invalid_article_type');
}

function normalizeArticleLanguage(value: unknown): EditorialArticleLanguage {
  const language = String(value || '').trim();

  return language === 'en' ? 'en' : 'it';
}

function validateArticleLanguage(value: unknown): EditorialArticleLanguage {
  const language = String(value || '').trim();

  if (editorialArticleLanguages.includes(language as EditorialArticleLanguage)) {
    return language as EditorialArticleLanguage;
  }

  throw new Error('invalid_article_language');
}

function normalizeSlug(value: unknown) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!slug) return '';

  if (!slugPattern.test(slug) || slug.length > 96) {
    throw new Error('invalid_slug');
  }

  return slug;
}

function normalizeReference(value: unknown) {
  if (!isPlainObject(value)) return null;

  const ref = normalizeSanityRootDocumentId(value._ref);

  if (!ref) return null;

  return {
    _type: 'reference',
    _ref: ref,
    ...(value._weak === true ? { _weak: true } : {}),
  };
}

function normalizeUrl(value: unknown, { allowMailto = false } = {}) {
  const raw = normalizeString(value, 1200).trim();

  if (!raw) return '';

  try {
    const url = new URL(raw);
    const allowed = allowMailto
      ? ['http:', 'https:', 'mailto:']
      : ['http:', 'https:'];

    if (!allowed.includes(url.protocol)) return '';

    return raw;
  } catch {
    return '';
  }
}

function normalizeImageValue(value: unknown) {
  if (!isPlainObject(value)) return null;

  const image: Record<string, unknown> = {
    _type: 'image',
  };

  if (typeof value._key === 'string') {
    image._key = normalizeKey(value._key);
  }

  const asset = normalizeReference(value.asset);
  if (asset) {
    image.asset = asset;
  }

  if (isPlainObject(value.crop)) image.crop = value.crop;
  if (isPlainObject(value.hotspot)) image.hotspot = value.hotspot;

  return image;
}

function normalizeAssetDocument(
  value: Record<string, unknown> | null | undefined,
  fallbackId = ''
): EditorialArticleFeaturedImageAsset | null {
  const assetId = normalizeSanityRootDocumentId(value?._id || fallbackId);
  const url = normalizeString(value?.url, 1200).trim();

  if (!assetId && !url) return null;

  const metadata = isPlainObject(value?.metadata) ? value.metadata : {};
  const dimensions = isPlainObject(metadata.dimensions) ? metadata.dimensions : null;

  return {
    _id: assetId,
    url,
    originalFilename: normalizeString(value?.originalFilename, 500).trim(),
    size: normalizeOptionalNumber(value?.size),
    mimeType: normalizeString(value?.mimeType, 120).trim(),
    metadata: {
      dimensions: dimensions
        ? {
            width: normalizeOptionalNumber(dimensions.width),
            height: normalizeOptionalNumber(dimensions.height),
            aspectRatio: normalizeOptionalNumber(dimensions.aspectRatio),
          }
        : null,
    },
  };
}

function normalizeFeaturedImage(value: unknown): EditorialArticleFeaturedImage | null {
  if (!isPlainObject(value)) return null;

  const assetReference = normalizeReference(value.asset);
  const populatedAsset = isPlainObject(value.asset)
    ? normalizeAssetDocument(value.asset as Record<string, unknown>, assetReference?._ref || '')
    : null;
  const asset = populatedAsset || (assetReference
    ? {
        _id: assetReference._ref,
        url: '',
        originalFilename: '',
        size: null,
        mimeType: '',
        metadata: { dimensions: null },
      }
    : null);

  if (!asset) return null;

  return {
    _type: 'image',
    alt: normalizeString(value.alt, 120).trim(),
    crop: isPlainObject(value.crop) ? value.crop : null,
    hotspot: isPlainObject(value.hotspot) ? value.hotspot : null,
    asset,
  };
}

function normalizeContentImage(block: Record<string, unknown>) {
  const normalized = normalizeImageValue(block);

  if (!normalized) {
    throw new Error('invalid_image_block');
  }

  normalized._key = normalizeKey(block._key);

  const alt = normalizeOptionalString(block.alt, 120);
  const caption = normalizeOptionalString(block.caption, 500);
  const displayMode = normalizeString(block.displayMode, 40).trim();

  if (alt) normalized.alt = alt;
  if (caption) normalized.caption = caption;
  if (validImageDisplayModes.has(displayMode)) normalized.displayMode = displayMode;
  if (block.isWide === true) normalized.isWide = true;

  return normalized;
}

function normalizeImageRowImage(value: unknown) {
  if (!isPlainObject(value)) {
    throw new Error('invalid_image_row_item');
  }

  const image = normalizeImageValue(value.image);
  const item: Record<string, unknown> = {
    _key: normalizeKey(value._key),
    ...(image ? { image } : {}),
  };
  const alt = normalizeOptionalString(value.alt, 120);
  const caption = normalizeOptionalString(value.caption, 500);
  const displayMode = normalizeString(value.displayMode, 40).trim();

  if (alt) item.alt = alt;
  if (caption) item.caption = caption;
  if (validImageDisplayModes.has(displayMode)) item.displayMode = displayMode;

  return item;
}

function normalizeImageRow(block: Record<string, unknown>) {
  const images = Array.isArray(block.images)
    ? block.images.map((item) => normalizeImageRowImage(item))
    : [];

  if (images.length < 2 || images.length > 8) {
    throw new Error('invalid_image_row_count');
  }

  const normalized: Record<string, unknown> = {
    _key: normalizeKey(block._key),
    _type: 'imageRow',
    images,
  };
  const groupCaption = normalizeOptionalString(block.groupCaption, 800);
  const layout = normalizeString(block.layout, 40).trim();

  if (groupCaption) normalized.groupCaption = groupCaption;
  if (validImageRowLayouts.has(layout)) normalized.layout = layout;

  return normalized;
}

function normalizeVideo(block: Record<string, unknown>) {
  const url = normalizeUrl(block.url);

  if (!url) {
    throw new Error('invalid_video_url');
  }

  const title = normalizeOptionalString(block.title, 160);

  return {
    _key: normalizeKey(block._key),
    _type: 'video',
    url,
    ...(title ? { title } : {}),
  };
}

function normalizeMarkDef(value: unknown) {
  if (!isPlainObject(value)) {
    throw new Error('invalid_mark_def');
  }

  const key = normalizeKey(value._key);
  const type = normalizeString(value._type, 80).trim();

  if (type === 'link') {
    const href = normalizeUrl(value.href, { allowMailto: true });
    if (!href) throw new Error('invalid_external_link');

    return { _key: key, _type: 'link', href };
  }

  if (
    type === 'internalLink' ||
    type === 'platformLink' ||
    type === 'taxonomyLink' ||
    type === 'creatorLink' ||
    type === 'companyLink'
  ) {
    const reference = normalizeReference(value.reference);
    if (!reference) throw new Error('invalid_internal_reference');

    return { _key: key, _type: type, reference };
  }

  if (type === 'pageLink') {
    const path = normalizeString(value.path, 160).trim();
    if (!validPageLinkPaths.has(path)) throw new Error('invalid_page_link');

    return { _key: key, _type: 'pageLink', path };
  }

  throw new Error('unsupported_mark_def');
}

function normalizeSpan(value: unknown, allowedMarks: Set<string>) {
  if (!isPlainObject(value) || value._type !== 'span') {
    throw new Error('invalid_span');
  }

  const marks = Array.isArray(value.marks)
    ? value.marks
        .map((mark) => String(mark || '').trim())
        .filter((mark) => allowedMarks.has(mark))
    : [];

  return {
    _key: normalizeKey(value._key),
    _type: 'span',
    text: normalizeString(value.text, 20000),
    marks,
  };
}

function normalizeTextBlock(
  block: Record<string, unknown>,
  {
    allowedStyles = validBlockStyles,
    allowedLists = validListItems,
  }: {
    allowedStyles?: Set<string>;
    allowedLists?: Set<string>;
  } = {}
) {
  const markDefs = Array.isArray(block.markDefs)
    ? block.markDefs.map((markDef) => normalizeMarkDef(markDef))
    : [];
  const allowedMarks = new Set<string>([...validDecorators, ...markDefs.map((markDef) => markDef._key)]);
  const children = Array.isArray(block.children)
    ? block.children.map((child) => normalizeSpan(child, allowedMarks))
    : [];

  if (children.length === 0) {
    children.push({
      _key: normalizeKey(''),
      _type: 'span',
      text: '',
      marks: [],
    });
  }

  const style = normalizeString(block.style, 40).trim();
  const listItem = normalizeString(block.listItem, 40).trim();
  const level = Number(block.level);
  const normalized: Record<string, unknown> = {
    _key: normalizeKey(block._key),
    _type: 'block',
    style: allowedStyles.has(style) ? style : 'normal',
    children,
    markDefs,
  };

  if (allowedLists.has(listItem)) {
    normalized.listItem = listItem;
    normalized.level = Number.isInteger(level) && level >= 1 && level <= 4 ? level : 1;
  }

  return normalized;
}

function normalizeAsideBox(block: Record<string, unknown>) {
  const content = Array.isArray(block.content)
    ? block.content.map((item) => normalizePortableTextBlock(item, true))
    : [];
  const title = normalizeOptionalString(block.title, 160);
  const tone = normalizeString(block.tone, 40).trim();

  return {
    _key: normalizeKey(block._key),
    _type: 'asideBox',
    ...(title ? { title } : {}),
    content,
    ...(validAsideTones.has(tone) ? { tone } : {}),
  };
}

function normalizePortableTextBlock(value: unknown, isAsideContent = false): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error('invalid_content_block');
  }

  if (value._type === 'block') {
    return normalizeTextBlock(value, isAsideContent
      ? { allowedStyles: validAsideBlockStyles, allowedLists: validAsideListItems }
      : {});
  }

  if (value._type === 'image') {
    return normalizeContentImage(value);
  }

  if (value._type === 'imageRow') {
    return normalizeImageRow(value);
  }

  if (!isAsideContent && value._type === 'video') {
    return normalizeVideo(value);
  }

  if (!isAsideContent && value._type === 'asideBox') {
    return normalizeAsideBox(value);
  }

  throw new Error('unsupported_content_block');
}

export function normalizePortableTextContent(value: unknown): PortableTextBlock[] {
  if (!Array.isArray(value)) return [];

  return value.map((block) => normalizePortableTextBlock(block));
}

function normalizeOwnership(row: EditorialDocumentRow | null): EditorialDocumentOwnership | null {
  if (!row) return null;

  const sanityDocumentId = normalizeSanityRootDocumentId(row.sanity_document_id);
  const ownerUserId = String(row.owner_user_id || '').trim();
  const sanityAuthorId = normalizeSanityRootDocumentId(row.sanity_author_id);
  const workflowStatus = row.workflow_status as EditorialWorkflowStatus;

  if (!sanityDocumentId || !ownerUserId || !sanityAuthorId || !isEditorialWorkflowStatus(workflowStatus)) {
    return null;
  }

  return {
    sanityDocumentId,
    ownerUserId,
    sanityAuthorId,
    workflowStatus,
  };
}

function getDraftDocumentId(rootDocumentId: string) {
  return `drafts.${rootDocumentId}`;
}

function normalizeEditableArticleRootDocumentId(value: unknown) {
  const documentId = String(value || '').trim();
  const rootDocumentId = documentId.startsWith('drafts.')
    ? documentId.slice('drafts.'.length)
    : documentId;

  return normalizeSanityRootDocumentId(rootDocumentId);
}

function normalizeDisplayNameMode(value: unknown): 'real' | 'nickname' {
  return value === 'nickname' ? 'nickname' : 'real';
}

function normalizeAuthorInfo(
  document: Record<string, unknown> | null,
  fallbackId = ''
): EditorialArticleAuthorInfo | null {
  if (!document || document._type !== 'author') return null;

  const name = normalizeString(document.name, 160).trim();
  const nickname = normalizeString(document.nickname, 160).trim();
  const displayName = normalizeDisplayNameMode(document.displayName);
  const slugValue = isPlainObject(document.slug) ? normalizeString(document.slug.current, 96).trim() : '';
  const label = displayName === 'nickname' && nickname ? nickname : name || nickname || fallbackId;

  return {
    _id: String(document._id || fallbackId || ''),
    name,
    nickname,
    displayName,
    label,
    role: normalizeString(document.role, 80).trim(),
    slug: slugValue,
  };
}

function normalizeOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeGameInfo(value: unknown): EditorialArticleGameInfo {
  const gameInfo = isPlainObject(value) ? value : {};
  const mediaFormat = Array.isArray(gameInfo.mediaFormat)
    ? Array.from(
        new Set(
          gameInfo.mediaFormat
            .map((item) => normalizeString(item, 40).trim())
            .filter((item): item is EditorialArticleMediaFormat =>
              validMediaFormats.has(item)
            )
        )
      )
    : [];

  return {
    releaseYear: normalizeOptionalNumber(gameInfo.releaseYear),
    mediaFormat,
  };
}

function normalizeRating(value: unknown): EditorialArticleRating {
  const rating = isPlainObject(value) ? value : {};

  return {
    grafica: normalizeOptionalNumber(rating.grafica),
    sonoro: normalizeOptionalNumber(rating.sonoro),
    giocabilita: normalizeOptionalNumber(rating.giocabilita),
    longevita: normalizeOptionalNumber(rating.longevita),
    overall: normalizeOptionalNumber(rating.overall),
    summary: normalizeString(rating.summary, 2000).trim(),
  };
}

function normalizeStringArray(value: unknown, maxLength = 220) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeString(item, maxLength).trim())
    .filter(Boolean);
}

function normalizeOptionalPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? value
    : null;
}

function hasEditorialSeriesValue(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

async function fetchAuthorInfo(authorId: string) {
  if (!authorId) return null;

  try {
    const authorDocument = await getSanityRawClient().getDocument<Record<string, unknown>>(authorId);

    return normalizeAuthorInfo(authorDocument || null, authorId);
  } catch (error) {
    logApiError('editorial-article.fetch.author', error);

    return null;
  }
}

async function hydrateFeaturedImage(
  featuredImage: EditorialArticleFeaturedImage | null
): Promise<EditorialArticleFeaturedImage | null> {
  const assetId = featuredImage?.asset?._id || '';

  if (!featuredImage || !assetId || featuredImage.asset?.url) {
    return featuredImage;
  }

  try {
    const assetDocument = await getSanityRawClient().getDocument<Record<string, unknown>>(assetId);
    const asset = normalizeAssetDocument(assetDocument || null, assetId);

    return {
      ...featuredImage,
      asset: asset || featuredImage.asset,
    };
  } catch (error) {
    logApiError('editorial-article.featured-image.asset', error);

    return featuredImage;
  }
}

async function hydrateDraftArticleFeaturedImage(article: EditorialArticleDraft) {
  return {
    ...article,
    featuredImage: await hydrateFeaturedImage(article.featuredImage),
  };
}

function normalizeDraftArticle(
  document: Record<string, unknown> | null,
  author: EditorialArticleAuthorInfo | null = null
): EditorialArticleDraft | null {
  if (!document || document._type !== 'article') return null;

  const slugValue = isPlainObject(document.slug) ? document.slug.current : '';
  const authorReference = isPlainObject(document.author) ? normalizeReference(document.author) : null;

  return {
    _id: String(document._id || ''),
    _rev: String(document._rev || ''),
    title: normalizeString(document.title, 300),
    subtitle: normalizeString(document.subtitle, 500),
    cardExcerpt: normalizeString(document.cardExcerpt, 500),
    excerpt: normalizeString(document.excerpt, 500),
    seoTitle: normalizeString(document.seoTitle, 140),
    type: normalizeArticleType(document.type),
    language: normalizeArticleLanguage(document.language),
    slug: typeof slugValue === 'string' ? slugValue : '',
    isPublic: document.isPublic === true,
    reviewStatus: normalizeString(document.reviewStatus, 80),
    content: normalizePortableTextContent(document.content),
    authorId: authorReference?._ref || '',
    author,
    featuredImage: normalizeFeaturedImage(document.featuredImage),
    gameInfo: normalizeGameInfo(document.gameInfo),
    rating: normalizeRating(document.rating),
    pros: normalizeStringArray(document.pros),
    cons: normalizeStringArray(document.cons),
    hasEditorialSeries: hasEditorialSeriesValue(document.editorialSeries),
    seriesOrder: normalizeOptionalPositiveNumber(document.seriesOrder),
    seriesLabel: normalizeString(document.seriesLabel, 160).trim(),
    updatedAt: typeof document._updatedAt === 'string' ? document._updatedAt : null,
    createdAt: typeof document._createdAt === 'string' ? document._createdAt : null,
  };
}

function validateOptionalFiniteNumber(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`invalid_${field}`);
  }

  return value;
}

function validateOptionalPositiveNumber(value: unknown, field: string) {
  const number = validateOptionalFiniteNumber(value, field);

  if (number === null) return null;

  if (number < 1) {
    throw new Error(`invalid_${field}`);
  }

  return number;
}

function validateRatingValue(value: unknown, field: EditorialArticleRatingField) {
  const number = validateOptionalFiniteNumber(value, `rating_${field}`);

  if (number === null) return null;

  if (number < 1 || number > 10 || !Number.isInteger(number * 2)) {
    throw new Error(`invalid_rating_${field}`);
  }

  return number;
}

function validateMediaFormats(value: unknown) {
  if (value === null || value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new Error('invalid_gameInfo_mediaFormat');
  }

  const formats: EditorialArticleMediaFormat[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const format = normalizeString(item, 40).trim();

    if (!validMediaFormats.has(format)) {
      throw new Error('invalid_gameInfo_mediaFormat');
    }

    if (!seen.has(format)) {
      seen.add(format);
      formats.push(format as EditorialArticleMediaFormat);
    }
  }

  return formats;
}

function validateStringArray(value: unknown, field: string, maxLength = 220) {
  if (value === null || value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new Error(`invalid_${field}`);
  }

  return value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new Error(`invalid_${field}`);
      }

      return normalizeString(item, maxLength).trim();
    })
    .filter(Boolean);
}

function getReviewPatchFields(payload: Record<string, unknown>) {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  const hasGameInfo = Object.prototype.hasOwnProperty.call(payload, 'gameInfo');
  const hasRating = Object.prototype.hasOwnProperty.call(payload, 'rating');

  if (hasGameInfo && !isPlainObject(payload.gameInfo)) {
    throw new Error('invalid_gameInfo');
  }

  if (hasRating && !isPlainObject(payload.rating)) {
    throw new Error('invalid_rating');
  }

  const gameInfo = hasGameInfo ? payload.gameInfo as Record<string, unknown> : {};
  const rating = hasRating ? payload.rating as Record<string, unknown> : {};
  const releaseYear = validateOptionalFiniteNumber(gameInfo.releaseYear, 'gameInfo_releaseYear');
  const mediaFormat = validateMediaFormats(gameInfo.mediaFormat);

  if (releaseYear === null) {
    unset.push('gameInfo.releaseYear');
  } else {
    set['gameInfo.releaseYear'] = releaseYear;
  }

  if (mediaFormat.length === 0) {
    unset.push('gameInfo.mediaFormat');
  } else {
    set['gameInfo.mediaFormat'] = mediaFormat;
  }

  for (const field of editorialArticleRatingFields) {
    const value = validateRatingValue(rating[field], field);

    if (value === null) {
      unset.push(`rating.${field}`);
    } else {
      set[`rating.${field}`] = value;
    }
  }

  const summary = normalizeOptionalString(rating.summary, 2000);
  if (summary) {
    set['rating.summary'] = summary;
  } else {
    unset.push('rating.summary');
  }

  const pros = validateStringArray(payload.pros, 'pros', 220);
  const cons = validateStringArray(payload.cons, 'cons', 220);

  if (pros.length > 0) {
    set.pros = pros;
  } else {
    unset.push('pros');
  }

  if (cons.length > 0) {
    set.cons = cons;
  } else {
    unset.push('cons');
  }

  const seriesOrder = validateOptionalPositiveNumber(payload.seriesOrder, 'seriesOrder');
  if (seriesOrder === null) {
    unset.push('seriesOrder');
  } else {
    set.seriesOrder = seriesOrder;
  }

  const seriesLabel = normalizeOptionalString(payload.seriesLabel, 160);
  if (seriesLabel) {
    set.seriesLabel = seriesLabel;
  } else {
    unset.push('seriesLabel');
  }

  return { set, unset };
}

async function fetchOwnership(rootDocumentId: string) {
  const { data, error } = await supabaseAdmin
    .from('editorial_documents')
    .select('sanity_document_id, owner_user_id, sanity_author_id, workflow_status, created_at, updated_at')
    .eq('sanity_document_id', rootDocumentId)
    .maybeSingle();

  if (error) {
    logApiError('editorial-article.ownership', error);
    return { ok: false as const, status: 503, error: 'editorial_database_unavailable' };
  }

  return { ok: true as const, ownership: normalizeOwnership(data as EditorialDocumentRow | null) };
}

export async function requireEditorialArticleContext(
  cookies: Parameters<typeof getEditorialSessionFromCookies>[0]
): Promise<
  | { ok: true; context: EditableEditorialContext }
  | { ok: false; status: number; error: string }
> {
  const context = await getEditorialSessionFromCookies(cookies);

  if (context.authError || !context.user) {
    return {
      ok: false,
      status: context.authStatus || 401,
      error: context.authError || 'unauthorized',
    };
  }

  if (context.editorialProfileError) {
    return { ok: false, status: 503, error: 'editorial_profile_unavailable' };
  }

  if (!context.editorialProfile || !context.sanityAuthorId || !context.isEditorialActive) {
    return {
      ok: false,
      status: 403,
      error: context.editorialProfile?.status === 'suspended'
        ? 'editorial_profile_suspended'
        : 'editorial_profile_required',
    };
  }

  return { ok: true, context: context as EditableEditorialContext };
}

async function recordArticleAudit({
  actorUserId,
  action,
  sanityDocumentId,
  previousWorkflowStatus = null,
  nextWorkflowStatus = draftStatus,
  metadata = {},
}: {
  actorUserId: string;
  action: 'article_created' | 'article_saved';
  sanityDocumentId: string;
  previousWorkflowStatus?: EditorialWorkflowStatus | null;
  nextWorkflowStatus?: EditorialWorkflowStatus | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const { error } = await supabaseAdmin
    .from('editorial_audit_log')
    .insert({
      actor_user_id: actorUserId,
      action,
      sanity_document_id: sanityDocumentId,
      previous_workflow_status: previousWorkflowStatus,
      next_workflow_status: nextWorkflowStatus,
      metadata,
    });

  if (error) {
    logApiError(`editorial-article.audit.${action}`, error);
    return false;
  }

  return true;
}

export async function createEditorialArticle({
  context,
  language,
  type,
}: {
  context: EditableEditorialContext;
  language: unknown;
  type: unknown;
}) {
  if (!canCreateArticle(context)) {
    return { ok: false as const, status: 403, error: 'article_create_forbidden' };
  }

  let articleLanguage: EditorialArticleLanguage;
  let articleType: EditorialArticleType;

  try {
    articleLanguage = validateArticleLanguage(language);
    articleType = validateArticleType(type);
  } catch (error) {
    return {
      ok: false as const,
      status: 400,
      error: error instanceof Error ? error.message : 'invalid_article',
    };
  }

  const rootDocumentId = crypto.randomUUID();
  const draftDocumentId = getDraftDocumentId(rootDocumentId);
  const writeClient = getSanityWriteClient();
  let sanityCreated = false;

  try {
    await writeClient.create({
      _id: draftDocumentId,
      _type: 'article',
      type: articleType,
      language: articleLanguage,
      isPublic: false,
      reviewStatus: 'todo',
      author: {
        _type: 'reference',
        _ref: context.sanityAuthorId,
      },
      content: [
        {
          _key: normalizeKey(''),
          _type: 'block',
          style: 'normal',
          children: [
            {
              _key: normalizeKey(''),
              _type: 'span',
              text: '',
              marks: [],
            },
          ],
          markDefs: [],
        },
      ],
    });
    sanityCreated = true;

    const { error } = await supabaseAdmin
      .from('editorial_documents')
      .insert({
        sanity_document_id: rootDocumentId,
        owner_user_id: context.user.id,
        sanity_author_id: context.sanityAuthorId,
        workflow_status: draftStatus,
      });

    if (error) {
      logApiError('editorial-article.create.ownership', error);

      if (sanityCreated) {
        try {
          await writeClient.delete(draftDocumentId);
        } catch (cleanupError) {
          logApiError('editorial-article.create.cleanup', cleanupError);
        }
      }

      return { ok: false as const, status: 503, error: 'article_create_failed' };
    }

    const auditLogged = await recordArticleAudit({
      actorUserId: context.user.id,
      action: 'article_created',
      sanityDocumentId: rootDocumentId,
      metadata: {
        language: articleLanguage,
        type: articleType,
      },
    });

    return {
      ok: true as const,
      sanityDocumentId: rootDocumentId,
      draftDocumentId,
      auditLogged,
      language: articleLanguage,
      type: articleType,
    };
  } catch (error) {
    logApiError('editorial-article.create', error);

    return { ok: false as const, status: 500, error: 'article_create_failed' };
  }
}

export async function fetchOwnEditorialArticles(context: EditableEditorialContext) {
  const { data, error } = await supabaseAdmin
    .from('editorial_documents')
    .select('sanity_document_id, owner_user_id, sanity_author_id, workflow_status, created_at, updated_at')
    .eq('owner_user_id', context.user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    logApiError('editorial-article.list', error);
    return { ok: false as const, status: 503, error: 'editorial_database_unavailable' };
  }

  const rows = (data || []) as EditorialDocumentRow[];
  const items: EditorialArticleListItem[] = [];
  const rawClient = getSanityRawClient();

  for (const row of rows) {
    const ownership = normalizeOwnership(row);
    if (!ownership) continue;

    let draft: EditorialArticleDraft | null = null;

    try {
      const document = await rawClient.getDocument<Record<string, unknown>>(getDraftDocumentId(ownership.sanityDocumentId));
      draft = normalizeDraftArticle(document || null);
    } catch (error) {
      logApiError('editorial-article.list.draft', error);
    }

    items.push({
      sanityDocumentId: ownership.sanityDocumentId,
      workflowStatus: ownership.workflowStatus,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      draft,
    });
  }

  return { ok: true as const, items };
}

export async function fetchEditableEditorialArticle({
  context,
  rootDocumentId,
}: {
  context: EditableEditorialContext;
  rootDocumentId: unknown;
}) {
  const sanityDocumentId = normalizeEditableArticleRootDocumentId(rootDocumentId);

  if (!sanityDocumentId) {
    return { ok: false as const, status: 400, error: 'invalid_article_id' };
  }

  const ownershipResult = await fetchOwnership(sanityDocumentId);
  if (!ownershipResult.ok) return ownershipResult;

  const ownership = ownershipResult.ownership;

  if (!ownership) {
    return { ok: false as const, status: 404, error: 'article_not_found' };
  }

  if (!isDocumentOwnedByContext(context, ownership) || !canEditOwnArticle(context, ownership)) {
    return { ok: false as const, status: 403, error: 'article_forbidden' };
  }

  if (ownership.sanityAuthorId !== context.sanityAuthorId) {
    return { ok: false as const, status: 409, error: 'author_ownership_conflict' };
  }

  try {
    const document = await getSanityRawClient().getDocument<Record<string, unknown>>(getDraftDocumentId(sanityDocumentId));
    let draft: EditorialArticleDraft | null;

    try {
      draft = normalizeDraftArticle(document || null);
    } catch (error) {
      logApiError('editorial-article.fetch.normalize', error);

      return { ok: false as const, status: 422, error: 'malformed_draft' };
    }

    if (!draft) {
      return { ok: false as const, status: 404, error: 'sanity_draft_missing' };
    }

    const conflict = getOwnershipConflict(ownership, draft.authorId);
    if (conflict.hasConflict || draft.authorId !== context.sanityAuthorId) {
      return {
        ok: false as const,
        status: 409,
        error: 'author_ownership_conflict',
        conflict,
      };
    }

    if (draft.isPublic) {
      return { ok: false as const, status: 409, error: 'public_flag_conflict' };
    }

    const author = await fetchAuthorInfo(draft.authorId);
    const article = await hydrateDraftArticleFeaturedImage({ ...draft, author });

    return { ok: true as const, ownership, article };
  } catch (error) {
    logApiError('editorial-article.fetch', error);
    return { ok: false as const, status: 500, error: 'article_fetch_failed' };
  }
}

function getPatchFromPayload(payload: Record<string, unknown>, currentArticle: EditorialArticleDraft) {
  const revisionId = normalizeString(payload._rev, 160).trim();

  if (!revisionId || revisionId !== currentArticle._rev) {
    throw new Error('revision_conflict');
  }

  const nextContent = normalizePortableTextContent(payload.content);
  const nextSlug = normalizeSlug(payload.slug);
  const set: Record<string, unknown> = {
    title: normalizeString(payload.title, 300).trim(),
    subtitle: normalizeString(payload.subtitle, 500).trim(),
    cardExcerpt: normalizeString(payload.cardExcerpt, 500).trim(),
    excerpt: normalizeString(payload.excerpt, 500).trim(),
    seoTitle: normalizeString(payload.seoTitle, 140).trim(),
    type: validateArticleType(payload.type),
    language: validateArticleLanguage(payload.language),
    content: nextContent,
  };
  const unset: string[] = [];
  const reviewPatch = getReviewPatchFields(payload);

  Object.assign(set, reviewPatch.set);
  unset.push(...reviewPatch.unset);

  if (Object.prototype.hasOwnProperty.call(payload, 'featuredImageAlt') && currentArticle.featuredImage?.asset) {
    const featuredImageAlt = normalizeString(payload.featuredImageAlt, 120).trim();

    if (featuredImageAlt) {
      set['featuredImage.alt'] = featuredImageAlt;
    } else {
      unset.push('featuredImage.alt');
    }
  }

  if (nextSlug) {
    set.slug = {
      _type: 'slug',
      current: nextSlug,
    };
  } else {
    unset.push('slug');
  }

  return { set, unset };
}

function isRevisionConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const maybeError = error as { statusCode?: number; message?: string };
  const message = String(maybeError.message || '').toLowerCase();

  return maybeError.statusCode === 409 || message.includes('revision') || message.includes('conflict');
}

export async function updateEditableEditorialArticle({
  context,
  rootDocumentId,
  payload,
}: {
  context: EditableEditorialContext;
  rootDocumentId: unknown;
  payload: Record<string, unknown>;
}) {
  const fetchResult = await fetchEditableEditorialArticle({ context, rootDocumentId });

  if (!fetchResult.ok) return fetchResult;

  let patch;

  try {
    patch = getPatchFromPayload(payload, fetchResult.article);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_article';

    return {
      ok: false as const,
      status: message === 'revision_conflict' ? 409 : 400,
      error: message === 'revision_conflict' ? 'revision_conflict' : message,
    };
  }

  const draftDocumentId = getDraftDocumentId(fetchResult.ownership.sanityDocumentId);

  try {
    let sanityPatch = getSanityWriteClient()
      .patch(draftDocumentId)
      .ifRevisionId(fetchResult.article._rev)
      .set(patch.set);

    if (patch.unset.length > 0) {
      sanityPatch = sanityPatch.unset(patch.unset);
    }

    const updated = await sanityPatch.commit<Record<string, unknown>>({
      autoGenerateArrayKeys: true,
    });
    const normalizedArticle = normalizeDraftArticle(updated, fetchResult.article.author);

    if (!normalizedArticle) {
      return { ok: false as const, status: 502, error: 'sanity_article_invalid' };
    }
    const article = await hydrateDraftArticleFeaturedImage(normalizedArticle);

    const auditLogged = await recordArticleAudit({
      actorUserId: context.user.id,
      action: 'article_saved',
      sanityDocumentId: fetchResult.ownership.sanityDocumentId,
      previousWorkflowStatus: fetchResult.ownership.workflowStatus,
      nextWorkflowStatus: fetchResult.ownership.workflowStatus,
      metadata: {
        fields:
          'title,subtitle,cardExcerpt,excerpt,seoTitle,type,language,slug,content,featuredImage.alt,gameInfo.releaseYear,gameInfo.mediaFormat,rating,pros,cons,seriesOrder,seriesLabel',
      },
    });

    return {
      ok: true as const,
      article,
      auditLogged,
    };
  } catch (error) {
    if (isRevisionConflict(error)) {
      return { ok: false as const, status: 409, error: 'revision_conflict' };
    }

    logApiError('editorial-article.update', error);
    return { ok: false as const, status: 500, error: 'article_save_failed' };
  }
}

function isUploadFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as File).arrayBuffer === 'function' &&
      typeof (value as File).type === 'string' &&
      typeof (value as File).size === 'number' &&
      typeof (value as File).name === 'string'
  );
}

function getSafeFeaturedImageFilename(file: File) {
  const extension = file.type === 'image/png'
    ? 'png'
    : file.type === 'image/webp'
      ? 'webp'
      : 'jpg';

  return `editorial-article-featured-${Date.now()}.${extension}`;
}

function getFeaturedImageAltFromFormData(
  formData: FormData,
  currentArticle: EditorialArticleDraft
) {
  if (formData.has('alt')) {
    return normalizeString(formData.get('alt'), 120).trim();
  }

  return currentArticle.featuredImage?.alt || '';
}

export async function updateEditorialArticleFeaturedImage({
  context,
  rootDocumentId,
  formData,
}: {
  context: EditableEditorialContext;
  rootDocumentId: unknown;
  formData: FormData;
}) {
  const action = normalizeString(formData.get('action'), 40).trim() || 'replace';
  const revisionId = normalizeString(formData.get('_rev'), 160).trim();

  if (!revisionId) {
    return { ok: false as const, status: 400, error: 'missing_revision' };
  }

  if (action !== 'replace' && action !== 'remove') {
    return { ok: false as const, status: 400, error: 'invalid_featured_image_action' };
  }

  const fetchResult = await fetchEditableEditorialArticle({ context, rootDocumentId });

  if (!fetchResult.ok) return fetchResult;

  if (fetchResult.article._rev !== revisionId) {
    return { ok: false as const, status: 409, error: 'revision_conflict' };
  }

  const draftDocumentId = getDraftDocumentId(fetchResult.ownership.sanityDocumentId);
  let assetUploaded = false;
  let articleUpdated = false;

  try {
    if (action === 'remove') {
      const updated = await getSanityWriteClient()
        .patch(draftDocumentId)
        .ifRevisionId(revisionId)
        .unset(['featuredImage'])
        .commit<Record<string, unknown>>();
      articleUpdated = true;
      const normalizedArticle = normalizeDraftArticle(updated, fetchResult.article.author);

      if (!normalizedArticle) {
        return {
          ok: false as const,
          status: 502,
          error: 'sanity_article_invalid',
          assetUploaded,
          articleUpdated,
        };
      }

      const article = await hydrateDraftArticleFeaturedImage(normalizedArticle);
      const auditLogged = await recordArticleAudit({
        actorUserId: context.user.id,
        action: 'article_saved',
        sanityDocumentId: fetchResult.ownership.sanityDocumentId,
        previousWorkflowStatus: fetchResult.ownership.workflowStatus,
        nextWorkflowStatus: fetchResult.ownership.workflowStatus,
        metadata: {
          fields: 'featuredImage',
          imageAction: 'remove',
        },
      });

      return {
        ok: true as const,
        article,
        action,
        assetUploaded,
        articleUpdated,
        auditLogged,
      };
    }

    const file = formData.get('file');

    if (!isUploadFile(file)) {
      return { ok: false as const, status: 400, error: 'missing_file' };
    }

    if (!allowedFeaturedImageMimeTypes.has(file.type)) {
      return { ok: false as const, status: 400, error: 'invalid_file_type' };
    }

    if (file.size <= 0 || file.size > featuredImageMaxFileSize) {
      return { ok: false as const, status: 400, error: 'invalid_file_size' };
    }

    const alt = getFeaturedImageAltFromFormData(formData, fetchResult.article);
    const arrayBuffer = await file.arrayBuffer();
    const asset = await getSanityWriteClient().assets.upload(
      'image',
      Buffer.from(arrayBuffer),
      {
        filename: getSafeFeaturedImageFilename(file),
        contentType: file.type,
      }
    );
    assetUploaded = true;
    const imageValue: Record<string, unknown> = {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: asset._id,
      },
    };

    if (alt) {
      imageValue.alt = alt;
    }

    const updated = await getSanityWriteClient()
      .patch(draftDocumentId)
      .ifRevisionId(revisionId)
      .set({ featuredImage: imageValue })
      .commit<Record<string, unknown>>();
    articleUpdated = true;
    const normalizedArticle = normalizeDraftArticle(updated, fetchResult.article.author);

    if (!normalizedArticle) {
      return {
        ok: false as const,
        status: 502,
        error: 'sanity_article_invalid',
        assetUploaded,
        articleUpdated,
      };
    }

    const article = await hydrateDraftArticleFeaturedImage(normalizedArticle);
    const auditLogged = await recordArticleAudit({
      actorUserId: context.user.id,
      action: 'article_saved',
      sanityDocumentId: fetchResult.ownership.sanityDocumentId,
      previousWorkflowStatus: fetchResult.ownership.workflowStatus,
      nextWorkflowStatus: fetchResult.ownership.workflowStatus,
      metadata: {
        fields: 'featuredImage',
        imageAction: 'replace',
      },
    });

    return {
      ok: true as const,
      article,
      action,
      assetUploaded,
      articleUpdated,
      auditLogged,
    };
  } catch (error) {
    if (isRevisionConflict(error)) {
      return {
        ok: false as const,
        status: 409,
        error: 'revision_conflict',
        assetUploaded,
        articleUpdated,
      };
    }

    logApiError('editorial-article.featured-image.update', error);

    return {
      ok: false as const,
      status: 500,
      error: assetUploaded ? 'featured_image_update_failed' : 'featured_image_upload_failed',
      assetUploaded,
      articleUpdated,
    };
  }
}

export function getEditorialArticleEditPath(id: string, language: 'it' | 'en') {
  return language === 'en'
    ? `/en/account/editor/articles/${encodeURIComponent(id)}/`
    : `/account/editor/articles/${encodeURIComponent(id)}/`;
}
