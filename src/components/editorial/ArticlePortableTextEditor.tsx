import {
  defineBlockObject,
  defineSchema,
  EditorProvider,
  PortableTextEditable,
  useEditor,
  useEditorSelector,
  type AnnotationPath,
  type EditorSelection,
  type PortableTextBlock,
  type PortableTextObject,
  type RenderAnnotationFunction,
  type RenderDecoratorFunction,
  type RenderListItemFunction,
  type RenderStyleFunction,
} from '@portabletext/editor';
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins';
import * as selectors from '@portabletext/editor/selectors';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { urlFor } from '../../lib/image';
import type {
  EditorialArticleCapabilities,
  EditorialArticleWorkflow,
  EditorialWorkflowTransitionPermissions,
} from '../../lib/editorial/types';

type ArticleType =
  | 'review'
  | 'article'
  | 'guide'
  | 'interview'
  | 'news'
  | 'feature'
  | 'memories'
  | 'hardware';

type ArticleLanguage = 'it' | 'en';

type MediaFormat =
  | 'cartridge'
  | 'floppy'
  | 'tape'
  | 'cdrom'
  | 'gdrom'
  | 'dvdrom'
  | 'hucard'
  | 'arcade_pcb'
  | 'digital'
  | 'other';

type RatingField = 'grafica' | 'sonoro' | 'giocabilita' | 'longevita' | 'overall';
type RelationKind =
  | 'categories'
  | 'editorialSeries'
  | 'platforms'
  | 'creators'
  | 'genres'
  | 'developers'
  | 'publishers'
  | 'manufacturer'
  | 'modes'
  | 'series'
  | 'translationOf';
type ReferenceAnnotationName =
  | 'internalLink'
  | 'platformLink'
  | 'creatorLink'
  | 'companyLink'
  | 'taxonomyLink';
type AnnotationName = ReferenceAnnotationName | 'link' | 'pageLink';
type ImageDisplayMode = 'cover' | 'contain' | 'wide' | 'natural';

type BodyImageAssetReference = {
  _type?: 'reference';
  _ref?: string;
};

type BodyImageBlock = PortableTextObject & {
  _type: 'image';
  asset?: BodyImageAssetReference | EditableArticleBodyImageAsset | null;
  crop?: Record<string, unknown>;
  hotspot?: Record<string, unknown>;
  alt?: string;
  caption?: string;
  displayMode?: string;
  isWide?: boolean;
};

type ImageRowLayout = 'standard' | 'uniformHeight';

type ImageRowItem = Record<string, unknown> & {
  _key?: string;
  image?: BodyImageBlock | null;
  alt?: string;
  caption?: string;
  displayMode?: string;
};

type ImageRowBlock = PortableTextObject & {
  _type: 'imageRow';
  images?: ImageRowItem[];
  groupCaption?: string;
  layout?: string;
};

type VideoBlock = PortableTextObject & {
  _type: 'video';
  url?: string;
  title?: string;
};

type AsideTone = 'neutral' | 'info' | 'highlight';

type AsideBoxBlock = PortableTextObject & {
  _type: 'asideBox';
  title?: string;
  content?: PortableTextBlock[];
  tone?: string;
};

type EditableArticleBodyImageAsset = {
  id: string;
  url: string;
  originalFilename: string;
  mimeType: string;
  size: number | null;
  dimensions: {
    width: number | null;
    height: number | null;
    aspectRatio: number | null;
  } | null;
};

type EditableArticleReference = {
  id: string;
  type: 'category' | 'platform' | 'creator' | 'taxonomy' | 'article' | 'playableClassic' | 'emulatorTool';
  label: string;
  slug: string;
  language: ArticleLanguage | null;
  secondaryLabel: string;
  key?: string;
};

type EditableArticleAuthor = {
  _id: string;
  name: string;
  nickname: string;
  displayName: 'real' | 'nickname';
  label: string;
  role: string;
  slug: string;
} | null;

type EditableArticleFeaturedImageAsset = {
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

type EditableArticleFeaturedImage = {
  _type: 'image';
  alt: string;
  crop: Record<string, unknown> | null;
  hotspot: Record<string, unknown> | null;
  asset: EditableArticleFeaturedImageAsset | null;
} | null;

type EditableArticleGameInfo = {
  releaseYear: number | null;
  mediaFormat: MediaFormat[];
  cover: EditableArticleFeaturedImage;
};

type EditableArticleRating = Record<RatingField, number | null> & {
  summary: string;
};

type EditableArticle = {
  _id: string;
  _rev: string;
  rootDocumentId: string;
  documentSource: 'draft' | 'published';
  documentLifecycle: 'draft' | 'revision_draft' | 'published' | 'missing';
  title: string;
  subtitle: string;
  cardExcerpt: string;
  excerpt: string;
  seoTitle: string;
  type: ArticleType;
  language: ArticleLanguage;
  slug: string;
  reviewStatus: string;
  content: PortableTextBlock[];
  author: EditableArticleAuthor;
  featuredImage: EditableArticleFeaturedImage;
  categories: EditableArticleReference[];
  editorialSeries: EditableArticleReference[];
  platforms: EditableArticleReference[];
  creators: EditableArticleReference[];
  genres: EditableArticleReference[];
  developers: EditableArticleReference[];
  publishers: EditableArticleReference[];
  manufacturer: EditableArticleReference[];
  modes: EditableArticleReference[];
  series: EditableArticleReference[];
  translationOf: EditableArticleReference | null;
  gameInfo: EditableArticleGameInfo;
  rating: EditableArticleRating;
  pros: string[];
  cons: string[];
  hasEditorialSeries: boolean;
  seriesOrder: number | null;
  seriesLabel: string;
};

type Labels = {
  title: string;
  subtitle: string;
  content: string;
  sidebar: string;
  settingsButton: string;
  settingsButtonActive: string;
  preview: string;
  closeSettings: string;
  mobileEditingNotice: string;
  backToArticles: string;
  exitConfirmTitle: string;
  exitConfirmText: string;
  exitSaveAndClose: string;
  exitWithoutSaving: string;
  exitCancel: string;
  draftStatus: string;
  inspectorArticle: string;
  inspectorSeo: string;
  inspectorRelations: string;
  inspectorFeaturedImage: string;
  inspectorReview: string;
  inspectorWorkflow: string;
  workflowStatus: string;
  workflowStatusDraft: string;
  workflowStatusSubmitted: string;
  workflowStatusChangesRequested: string;
  workflowStatusApproved: string;
  workflowStatusPublished: string;
  workflowSubmittedAt: string;
  workflowReviewedAt: string;
  workflowReviewer: string;
  documentActions: string;
  workflowSubmit: string;
  workflowRequestChanges: string;
  workflowApprove: string;
  workflowSubmitConfirm: string;
  workflowRequestChangesConfirm: string;
  workflowApproveConfirm: string;
  workflowUpdating: string;
  workflowSubmitSuccess: string;
  workflowRequestChangesSuccess: string;
  workflowApproveSuccess: string;
  workflowConflict: string;
  workflowForbidden: string;
  workflowNotFound: string;
  workflowGenericError: string;
  futureSlot: string;
  featuredImageCurrent: string;
  featuredImageEmpty: string;
  featuredImageUploading: string;
  featuredImageReplace: string;
  featuredImageRemove: string;
  featuredImageRemoving: string;
  featuredImageUploaded: string;
  featuredImageRemoved: string;
  featuredImageAlt: string;
  featuredImageAltWarning: string;
  featuredImageFormats: string;
  featuredImageChooseFile: string;
  featuredImageDropFile: string;
  featuredImageNewPreview: string;
  featuredImageFileReady: string;
  featuredImageCancelSelection: string;
  featuredImageInvalidType: string;
  featuredImageInvalidSize: string;
  featuredImageMissingFile: string;
  featuredImageConflict: string;
  featuredImageGenericError: string;
  featuredImageRemoveConfirm: string;
  featuredImageMetadataUnavailable: string;
  featuredImageAssetId: string;
  inspectorGameCover: string;
  gameCoverCurrent: string;
  gameCoverEmpty: string;
  gameCoverUploading: string;
  gameCoverReplace: string;
  gameCoverRemove: string;
  gameCoverRemoving: string;
  gameCoverUploaded: string;
  gameCoverRemoved: string;
  gameCoverAlt: string;
  gameCoverAltWarning: string;
  gameCoverFormats: string;
  gameCoverChooseFile: string;
  gameCoverDropFile: string;
  gameCoverNewPreview: string;
  gameCoverFileReady: string;
  gameCoverCancelSelection: string;
  gameCoverRemoveConfirm: string;
  gameCoverGenericError: string;
  cardExcerpt: string;
  excerpt: string;
  seoTitle: string;
  type: string;
  typeChangeConfirmTitle: string;
  typeChangeConfirmText: string;
  typeChangeCancel: string;
  typeChangeConfirm: string;
  language: string;
  slug: string;
  author: string;
  authorMissing: string;
  classificationSection: string;
  relationsSection: string;
  categories: string;
  editorialSeries: string;
  platforms: string;
  creators: string;
  genres: string;
  developers: string;
  publishers: string;
  manufacturer: string;
  modes: string;
  gameSeries: string;
  translationOf: string;
  relationSearchPlaceholder: string;
  relationLoading: string;
  relationNoResults: string;
  relationSearchError: string;
  relationRemoveValue: string;
  platformsRecommended: string;
  creatorsRecommended: string;
  developersRecommended: string;
  publishersRecommended: string;
  manufacturerRecommended: string;
  gameData: string;
  releaseYear: string;
  mediaFormat: string;
  multiSelectPlaceholder: string;
  multiSelectRemoveValue: string;
  ratingSection: string;
  grafica: string;
  sonoro: string;
  giocabilita: string;
  longevita: string;
  overall: string;
  ratingSummary: string;
  overallWarning: string;
  pros: string;
  cons: string;
  addItem: string;
  removeItem: string;
  moveUp: string;
  moveDown: string;
  emptyListItem: string;
  editorialSeriesReadOnly: string;
  seriesOrder: string;
  seriesLabel: string;
  save: string;
  saving: string;
  saved: string;
  autosaveSaving: string;
  autosaveSaved: string;
  autosaveError: string;
  conflict: string;
  genericError: string;
  manualSave: string;
  counters: string;
  toolbarStructure: string;
  toolbarText: string;
  toolbarLink: string;
  toolbarInsert: string;
  blockStyle: string;
  normal: string;
  h2: string;
  h3: string;
  quote: string;
  bullet: string;
  number: string;
  bold: string;
  italic: string;
  externalLink: string;
  linkPrompt: string;
  internalLink: string;
  platformLink: string;
  creatorLink: string;
  companyLink: string;
  taxonomyLink: string;
  pageLink: string;
  insertImage: string;
  insertImageRow: string;
  insertVideo: string;
  editVideo: string;
  updateVideo: string;
  removeVideo: string;
  videoMenu: string;
  videoRemoveConfirm: string;
  videoUrl: string;
  videoTitle: string;
  videoUrlRequired: string;
  videoUrlInvalid: string;
  videoUntitled: string;
  videoPreview: string;
  insertAsideBox: string;
  editAsideBox: string;
  updateAsideBox: string;
  removeAsideBox: string;
  asideBoxMenu: string;
  asideBoxRemoveConfirm: string;
  asideTitle: string;
  asideTone: string;
  asideToneNeutral: string;
  asideToneInfo: string;
  asideToneHighlight: string;
  asideContent: string;
  asideContentHelp: string;
  asideEmptyContent: string;
  editImageRow: string;
  updateImageRow: string;
  removeImageRow: string;
  imageRowMenu: string;
  imageRowRemoveConfirm: string;
  imageRowChooseFiles: string;
  imageRowDropFiles: string;
  imageRowFormats: string;
  imageRowSelectedImages: string;
  imageRowImageSettings: string;
  imageRowAddImages: string;
  imageRowRemoveImage: string;
  imageRowMoveLeft: string;
  imageRowMoveRight: string;
  imageRowMinCount: string;
  imageRowMaxCount: string;
  imageRowMissingImages: string;
  imageRowUploading: string;
  imageRowUploadFailed: string;
  imageRowReady: string;
  imageRowLayout: string;
  imageRowLayoutStandard: string;
  imageRowLayoutUniformHeight: string;
  imageRowGroupCaption: string;
  editImage: string;
  updateImage: string;
  removeImage: string;
  replaceImage: string;
  bodyImageDragHandle: string;
  bodyImageMenu: string;
  bodyImageCurrent: string;
  bodyImageNew: string;
  bodyImageAlt: string;
  bodyImageAltWarning: string;
  bodyImageCaption: string;
  bodyImageDisplayMode: string;
  bodyImageDisplayCover: string;
  bodyImageDisplayContain: string;
  bodyImageDisplayWide: string;
  bodyImageDisplayNatural: string;
  bodyImageFormats: string;
  bodyImageChooseFile: string;
  bodyImageDropFile: string;
  bodyImageReady: string;
  bodyImageUploading: string;
  bodyImageUploadFailed: string;
  bodyImageMissingFile: string;
  bodyImageInvalidType: string;
  bodyImageCancelSelection: string;
  bodyImageNoPreview: string;
  bodyImageRemoveConfirm: string;
  bodyImageOrphanNotice: string;
  annotationCurrentTarget: string;
  annotationRemove: string;
  annotationApply: string;
  annotationClose: string;
  annotationNoSelection: string;
  pageLinkSelectPlaceholder: string;
  preservedObject: string;
  image: string;
  imageRow: string;
  video: string;
  asideBox: string;
  imageBlockHeader: string;
  videoBlockHeader: string;
  asideBoxHeader: string;
  unsupportedObject: string;
  cardExcerptWarning: string;
  excerptWarning: string;
  seoTitleHint: string;
};

type Props = {
  article: EditableArticle;
  lang: ArticleLanguage;
  articlesHref: string;
  previewHref: string;
  saveEndpoint: string;
  workflow: EditorialArticleWorkflow;
  workflowPermissions: EditorialWorkflowTransitionPermissions;
  capabilities: EditorialArticleCapabilities;
  labels: Labels;
};

const articleTypes: ArticleType[] = [
  'review',
  'article',
  'guide',
  'interview',
  'news',
  'feature',
  'memories',
  'hardware',
];

const languages: ArticleLanguage[] = ['it', 'en'];
const mediaFormatOptions: MediaFormat[] = [
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
];
const ratingFields: RatingField[] = ['grafica', 'sonoro', 'giocabilita', 'longevita', 'overall'];
const ratingSelectValues = Array.from({ length: 19 }, (_, index) => 1 + index * 0.5);
const releaseYearSelectValues = Array.from({ length: 91 }, (_, index) => 2050 - index);
const allowedFeaturedImageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedBodyImageMimeTypes = new Set([...allowedFeaturedImageMimeTypes, 'image/gif']);
const featuredImageMaxFileSize = 5 * 1024 * 1024;
const imageDisplayModes: ImageDisplayMode[] = ['cover', 'contain', 'wide', 'natural'];
const imageRowLayouts: ImageRowLayout[] = ['standard', 'uniformHeight'];
const asideTones: AsideTone[] = ['neutral', 'info', 'highlight'];
const imageRowMinImages = 2;
const imageRowMaxImages = 8;
const referenceAnnotationControls: Array<{
  name: ReferenceAnnotationName;
  icon: string;
}> = [
  { name: 'internalLink', icon: '📄' },
  { name: 'platformLink', icon: '🖥️' },
  { name: 'creatorLink', icon: '👤' },
  { name: 'companyLink', icon: '🏢' },
  { name: 'taxonomyLink', icon: '🏷️' },
];
const contextualLinkAnnotationOrder: AnnotationName[] = [
  'link',
  'internalLink',
  'platformLink',
  'pageLink',
  'taxonomyLink',
  'creatorLink',
  'companyLink',
];
const pageLinkOptions: Array<{ label: string; path: string }> = [
  { label: 'Home IT', path: '/' },
  { label: 'Home EN', path: '/en/' },
  { label: 'Recensioni IT', path: '/recensioni/' },
  { label: 'Reviews EN', path: '/en/reviews/' },
  { label: 'Speciali IT', path: '/speciali/' },
  { label: 'Features EN', path: '/en/features/' },
  { label: 'Guide IT', path: '/guide/' },
  { label: 'Guides EN', path: '/en/guides/' },
  { label: 'Memories IT', path: '/memories/' },
  { label: 'Memories EN', path: '/en/memories/' },
  { label: 'Archivio IT', path: '/archivio/' },
  { label: 'Archive EN', path: '/en/archive/' },
  { label: 'Piattaforme IT', path: '/piattaforme/' },
  { label: 'Platforms EN', path: '/en/platforms/' },
  { label: 'Console IT', path: '/piattaforme/console/' },
  { label: 'Consoles EN', path: '/en/platforms/consoles/' },
  { label: 'Computer IT', path: '/piattaforme/computer/' },
  { label: 'Computers EN', path: '/en/platforms/computers/' },
  { label: 'Arcade IT', path: '/piattaforme/arcade/' },
  { label: 'Arcade EN', path: '/en/platforms/arcade/' },
  { label: 'Hardware IT', path: '/hardware/' },
  { label: 'Hardware EN', path: '/en/hardware/' },
];

const mediaFormatLabels: Record<ArticleLanguage, Record<MediaFormat, string>> = {
  it: {
    cartridge: 'Cartuccia',
    floppy: 'Floppy disk',
    tape: 'Cassetta / tape',
    cdrom: 'CD-ROM',
    gdrom: 'GD-ROM',
    dvdrom: 'DVD-ROM',
    hucard: 'HuCard',
    arcade_pcb: 'PCB arcade',
    digital: 'Digitale',
    other: 'Altro',
  },
  en: {
    cartridge: 'Cartridge',
    floppy: 'Floppy disk',
    tape: 'Tape',
    cdrom: 'CD-ROM',
    gdrom: 'GD-ROM',
    dvdrom: 'DVD-ROM',
    hucard: 'HuCard',
    arcade_pcb: 'Arcade PCB',
    digital: 'Digital',
    other: 'Other',
  },
};

const annotationSchema = [
  {
    name: 'link',
    fields: [{ name: 'href', type: 'string' }],
  },
  {
    name: 'internalLink',
    fields: [{ name: 'reference', type: 'object' }],
  },
  {
    name: 'platformLink',
    fields: [{ name: 'reference', type: 'object' }],
  },
  {
    name: 'pageLink',
    fields: [{ name: 'path', type: 'string' }],
  },
  {
    name: 'taxonomyLink',
    fields: [{ name: 'reference', type: 'object' }],
  },
  {
    name: 'creatorLink',
    fields: [{ name: 'reference', type: 'object' }],
  },
  {
    name: 'companyLink',
    fields: [{ name: 'reference', type: 'object' }],
  },
];

const imageBlockObjectSchema = {
  name: 'image',
  fields: [
    { name: 'asset', type: 'object' },
    { name: 'crop', type: 'object' },
    { name: 'hotspot', type: 'object' },
    { name: 'alt', type: 'string' },
    { name: 'caption', type: 'string' },
    { name: 'displayMode', type: 'string' },
    { name: 'isWide', type: 'boolean' },
  ],
};

const imageRowBlockObjectSchema = {
  name: 'imageRow',
  fields: [
    {
      name: 'images',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'image',
              type: 'object',
              fields: [
                { name: 'asset', type: 'object' },
                { name: 'crop', type: 'object' },
                { name: 'hotspot', type: 'object' },
              ],
            },
            { name: 'alt', type: 'string' },
            { name: 'caption', type: 'string' },
            { name: 'displayMode', type: 'string' },
          ],
        },
      ],
    },
    { name: 'groupCaption', type: 'text' },
    { name: 'layout', type: 'string' },
  ],
};

const videoBlockObjectSchema = {
  name: 'video',
  fields: [
    { name: 'url', type: 'string' },
    { name: 'title', type: 'string' },
  ],
};

const asideBoxBlockObjectSchema = {
  name: 'asideBox',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'content', type: 'array' },
    { name: 'tone', type: 'string' },
  ],
};

const schemaDefinition = defineSchema({
  decorators: [{ name: 'strong' }, { name: 'em' }],
  styles: [
    { name: 'normal' },
    { name: 'h2' },
    { name: 'h3' },
    { name: 'blockquote' },
  ],
  annotations: annotationSchema,
  lists: [{ name: 'bullet' }, { name: 'number' }],
  inlineObjects: [],
  blockObjects: [
    imageBlockObjectSchema,
    imageRowBlockObjectSchema,
    videoBlockObjectSchema,
    asideBoxBlockObjectSchema,
  ],
});

const asideSchemaDefinition = defineSchema({
  decorators: [{ name: 'strong' }, { name: 'em' }],
  styles: [
    { name: 'normal' },
    { name: 'h3' },
  ],
  annotations: annotationSchema,
  lists: [{ name: 'bullet' }],
  inlineObjects: [],
  blockObjects: [
    imageBlockObjectSchema,
    imageRowBlockObjectSchema,
  ],
});

const getKey = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

const renderStyle: RenderStyleFunction = (props) => {
  if (props.schemaType.value === 'h2') return <h2>{props.children}</h2>;
  if (props.schemaType.value === 'h3') return <h3>{props.children}</h3>;
  if (props.schemaType.value === 'blockquote') return <blockquote>{props.children}</blockquote>;

  return <p>{props.children}</p>;
};

const renderDecorator: RenderDecoratorFunction = (props) => {
  if (props.value === 'strong') return <strong>{props.children}</strong>;
  if (props.value === 'em') return <em>{props.children}</em>;

  return <>{props.children}</>;
};

const renderAnnotation: RenderAnnotationFunction = (props) => (
  <span className="editorial-pte__annotation">{props.children}</span>
);

const renderListItem: RenderListItemFunction = (props) => (
  <span className="editorial-pte__list-item">{props.children}</span>
);

function getObjectLabel(type: string, labels: Labels) {
  if (type === 'image') return labels.image;
  if (type === 'imageRow') return labels.imageRow;
  if (type === 'video') return labels.video;
  if (type === 'asideBox') return labels.asideBox;

  return labels.unsupportedObject;
}

function normalizeHttpUrl(value: string) {
  const url = String(value || '').trim();

  if (!url) return '';

  try {
    const parsedUrl = new URL(url);

    return ['http:', 'https:'].includes(parsedUrl.protocol) ? url : '';
  } catch {
    return '';
  }
}

function getVideoDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function normalizeYouTubeVideoId(value: string) {
  const videoId = value.trim().split(/[/?#&]/)[0] || '';

  return /^[a-zA-Z0-9_-]{6,}$/.test(videoId) ? videoId : '';
}

function getYouTubeVideoId(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '').replace(/^m\./, '');
    const segments = parsedUrl.pathname.split('/').filter(Boolean);

    if (hostname === 'youtu.be') {
      return normalizeYouTubeVideoId(segments[0] || '');
    }

    if (
      hostname === 'youtube.com' ||
      hostname.endsWith('.youtube.com') ||
      hostname === 'youtube-nocookie.com' ||
      hostname.endsWith('.youtube-nocookie.com')
    ) {
      const watchId = parsedUrl.searchParams.get('v');

      if (watchId) {
        return normalizeYouTubeVideoId(watchId);
      }

      if (['embed', 'shorts', 'live', 'v'].includes(segments[0] || '')) {
        return normalizeYouTubeVideoId(segments[1] || '');
      }
    }
  } catch {
    return '';
  }

  return '';
}

function getYouTubeThumbnailUrl(url: string) {
  const videoId = getYouTubeVideoId(url);

  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}

function createVideoBlockValue({ url, title }: { url: string; title: string }) {
  const normalizedTitle = normalizeSingleLineValue(title, 'space').slice(0, 160).trim();

  return {
    url: normalizeHttpUrl(url),
    ...(normalizedTitle ? { title: normalizedTitle } : {}),
  };
}

function normalizeAsideTone(value: unknown): AsideTone {
  return asideTones.includes(value as AsideTone) ? value as AsideTone : 'info';
}

function getAsideToneLabel(tone: AsideTone, labels: Labels) {
  if (tone === 'neutral') return labels.asideToneNeutral;
  if (tone === 'highlight') return labels.asideToneHighlight;

  return labels.asideToneInfo;
}

function createEmptyPortableTextBlock(): PortableTextBlock {
  return {
    _type: 'block',
    _key: getKey(),
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: getKey(),
        text: '',
        marks: [],
      },
    ],
  };
}

function normalizeAsideContentForEditor(content: unknown): PortableTextBlock[] {
  return Array.isArray(content) && content.length > 0
    ? content as PortableTextBlock[]
    : [createEmptyPortableTextBlock()];
}

function createAsideBoxBlockValue({
  title,
  tone,
  content,
}: {
  title: string;
  tone: AsideTone;
  content: PortableTextBlock[];
}) {
  const normalizedTitle = normalizeSingleLineValue(title, 'space').slice(0, 160).trim();

  return {
    ...(normalizedTitle ? { title: normalizedTitle } : {}),
    tone,
    content: normalizeAsideContentForEditor(content),
  };
}

function getTextBlockPreview(block: PortableTextBlock) {
  const children = Array.isArray(block.children) ? block.children : [];

  return children
    .map((child) => typeof child?.text === 'string' ? child.text : '')
    .join('')
    .trim();
}

function getBodyImageHeaderTitle(labels: Labels) {
  return labels.imageBlockHeader;
}

function getImageRowHeaderTitle(labels: Labels, imageCount: number) {
  return imageCount > 0 ? `${labels.imageRow} (${imageCount})` : labels.imageRow;
}

function getBodyImageAssetRef(image: BodyImageBlock | null | undefined) {
  const asset = image?.asset;

  if (!asset || typeof asset !== 'object') return '';

  if ('_ref' in asset && typeof asset._ref === 'string') return asset._ref;
  if ('id' in asset && typeof asset.id === 'string') return asset.id;

  return '';
}

function getBodyImageAssetUrl(image: BodyImageBlock | null | undefined) {
  const asset = image?.asset;

  if (asset && typeof asset === 'object' && 'url' in asset && typeof asset.url === 'string') {
    return asset.url;
  }

  return '';
}

function getBodyImagePreviewUrl(
  image: BodyImageBlock | null | undefined,
  width = 980,
  previewUrls: Record<string, string> = {}
) {
  const assetRef = getBodyImageAssetRef(image);

  if (assetRef && previewUrls[assetRef]) return previewUrls[assetRef];

  const directUrl = getBodyImageAssetUrl(image);

  if (directUrl) return directUrl;

  if (!assetRef) return '';

  try {
    return urlFor({
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: assetRef,
      },
      ...(image?.crop ? { crop: image.crop } : {}),
      ...(image?.hotspot ? { hotspot: image.hotspot } : {}),
    })
      .width(width)
      .quality(76)
      .auto('format')
      .url();
  } catch {
    return '';
  }
}

function normalizeImageDisplayMode(value: unknown, isWide?: boolean): ImageDisplayMode {
  return imageDisplayModes.includes(value as ImageDisplayMode)
    ? value as ImageDisplayMode
    : isWide
      ? 'wide'
      : 'cover';
}

function getImageDisplayModeLabel(mode: ImageDisplayMode, labels: Labels) {
  if (mode === 'contain') return labels.bodyImageDisplayContain;
  if (mode === 'wide') return labels.bodyImageDisplayWide;
  if (mode === 'natural') return labels.bodyImageDisplayNatural;

  return labels.bodyImageDisplayCover;
}

function getBodyImageNaturalWidth(image: BodyImageBlock) {
  const asset = image.asset;

  if (asset && 'dimensions' in asset) {
    const width = Number(asset.dimensions?.width);

    return Number.isFinite(width) && width > 0 ? width : null;
  }

  return null;
}

function createBodyImageBlockValue({
  assetId,
  alt,
  caption,
  displayMode,
}: {
  assetId: string;
  alt: string;
  caption: string;
  displayMode: ImageDisplayMode;
}) {
  return {
    asset: {
      _type: 'reference',
      _ref: assetId,
    },
    alt: normalizeSingleLineValue(alt, 'space').slice(0, 120).trim(),
    caption: normalizeSingleLineValue(caption, 'space').slice(0, 500).trim(),
    displayMode,
  };
}

function getBodyImageUploadEndpoint(saveEndpoint: string) {
  return `${saveEndpoint.replace(/\/$/, '')}/assets/image`;
}

function getBodyImageMetadataLabel(image: BodyImageBlock | null | undefined, labels: Labels) {
  const asset = image?.asset;

  if (!asset || typeof asset !== 'object') return labels.featuredImageMetadataUnavailable;

  if ('dimensions' in asset) {
    const bodyAsset = asset as EditableArticleBodyImageAsset;
    const parts = [
      bodyAsset.dimensions?.width && bodyAsset.dimensions?.height
        ? `${bodyAsset.dimensions.width} × ${bodyAsset.dimensions.height}px`
        : '',
      formatFileSize(bodyAsset.size),
      bodyAsset.mimeType,
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(' · ');
  }

  if ('metadata' in asset) {
    const featuredAsset = asset as EditableArticleFeaturedImageAsset;
    const parts = [
      featuredAsset.metadata.dimensions?.width && featuredAsset.metadata.dimensions?.height
        ? `${featuredAsset.metadata.dimensions.width} × ${featuredAsset.metadata.dimensions.height}px`
        : '',
      formatFileSize(featuredAsset.size),
      featuredAsset.mimeType,
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(' · ');
  }

  const assetRef = getBodyImageAssetRef(image);

  return assetRef ? assetRef : labels.featuredImageMetadataUnavailable;
}

function normalizeImageRowLayout(value: unknown): ImageRowLayout {
  return imageRowLayouts.includes(value as ImageRowLayout) ? value as ImageRowLayout : 'standard';
}

function getImageRowLayoutLabel(layout: ImageRowLayout, labels: Labels) {
  return layout === 'uniformHeight' ? labels.imageRowLayoutUniformHeight : labels.imageRowLayoutStandard;
}

function getImageRowItemImage(item: ImageRowItem | null | undefined): BodyImageBlock | null {
  return item?.image && typeof item.image === 'object' ? item.image : null;
}

function getImageRowItemKey(item: ImageRowItem | null | undefined) {
  return typeof item?._key === 'string' && item._key.trim() ? item._key : getKey();
}

function createImageRowImageValue({
  source,
  assetId,
  alt,
  caption,
  displayMode,
  resetCropHotspot = false,
}: {
  source?: ImageRowItem | null;
  assetId: string;
  alt: string;
  caption: string;
  displayMode: ImageDisplayMode;
  resetCropHotspot?: boolean;
}) {
  const sourceImage = getImageRowItemImage(source);
  const sourceImageObject = sourceImage && typeof sourceImage === 'object' ? sourceImage : {};
  const image = {
    ...(resetCropHotspot ? {} : sourceImageObject),
    _type: 'image',
    asset: {
      _type: 'reference',
      _ref: assetId,
    },
  };

  if (resetCropHotspot) {
    delete (image as Record<string, unknown>).crop;
    delete (image as Record<string, unknown>).hotspot;
  }

  return {
    ...(source || {}),
    _key: getImageRowItemKey(source),
    image,
    alt: normalizeSingleLineValue(alt, 'space').slice(0, 120).trim(),
    caption: normalizeSingleLineValue(caption, 'space').slice(0, 500).trim(),
    displayMode,
  };
}

function createImageRowBlockValue({
  images,
  groupCaption,
  layout,
}: {
  images: ImageRowItem[];
  groupCaption: string;
  layout: ImageRowLayout;
}) {
  return {
    images,
    groupCaption: groupCaption.slice(0, 800).trim(),
    layout,
  };
}

function getImageRowRows(images: ImageRowItem[]) {
  const total = images.length;

  if (total <= 4) return [images];
  if (total === 5 || total === 6) return [images.slice(0, 3), images.slice(3)];
  if (total === 7 || total === 8) return [images.slice(0, 4), images.slice(4)];

  const rows: ImageRowItem[][] = [];
  let index = 0;
  let remaining = total;

  while (remaining > 0) {
    const take = remaining === 5 || remaining === 6 ? 3 : 4;
    rows.push(images.slice(index, index + take));
    index += take;
    remaining -= take;
  }

  return rows;
}

function MediaBlockHeader({
  icon,
  title,
  menuLabel,
  isMenuOpen,
  menuRef,
  onToggleMenu,
  children,
}: {
  icon: string;
  title: string;
  menuLabel: string;
  isMenuOpen: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onToggleMenu: () => void;
  children: ReactNode;
}) {
  return (
    <div className="editorial-pte__media-header">
      <span className="editorial-pte__media-header-icon" aria-hidden="true">{icon}</span>
      <strong className="editorial-pte__media-header-title" title={title}>
        {title}
      </strong>
      <div className="editorial-pte__image-menu" ref={menuRef}>
        <button
          type="button"
          className="editorial-pte__image-menu-button"
          aria-label={menuLabel}
          title={menuLabel}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={onToggleMenu}
        >
          <BlockOptionsIcon />
        </button>
        <div className="editorial-pte__image-menu-panel" role="menu" hidden={!isMenuOpen}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ImageObjectBlock({
  attributes,
  children,
  node,
  path,
  focused,
  selected,
  labels,
  saveEndpoint,
  assetPreviewUrls,
  onAssetPreview,
  readOnly,
}: any) {
  const editor = useEditor();
  const image = node as BodyImageBlock;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const previewUrl = getBodyImagePreviewUrl(image, 720, assetPreviewUrls);
  const displayMode = normalizeImageDisplayMode(image.displayMode, image.isWide);
  const naturalWidth = getBodyImageNaturalWidth(image);
  const previewMaxWidth = naturalWidth ? `min(${Math.min(naturalWidth, 720)}px, 100%)` : undefined;
  const showDisplayMode = displayMode !== 'cover';

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const applyImageUpdate = (value: Record<string, unknown>, resetCropHotspot = false) => {
    if (resetCropHotspot) {
      editor.send({
        type: 'block.unset',
        at: path,
        props: ['crop', 'hotspot'],
      });
    }

    editor.send({
      type: 'block.set',
      at: path,
      props: value,
    });
    editor.send({ type: 'focus' });
    setIsModalOpen(false);
  };

  const moveImageBlock = (direction: 'up' | 'down') => {
    editor.send({
      type: direction === 'up' ? 'move.block up' : 'move.block down',
      at: path,
    });
    editor.send({ type: 'focus' });
    setIsMenuOpen(false);
  };

  const selectImageBlock = () => {
    editor.send({
      type: 'select.block',
      at: path,
    });
  };

  const startImageDrag = (event: DragEvent<HTMLElement>) => {
    selectImageBlock();
    event.dataTransfer.effectAllowed = 'move';
  };

  const openImageModal = () => {
    setIsMenuOpen(false);
    setIsModalOpen(true);
  };

  const removeImageBlock = () => {
    if (!window.confirm(labels.bodyImageRemoveConfirm)) return;

    editor.send({
      type: 'delete.block',
      at: path,
    });
    editor.send({ type: 'focus' });
    setIsMenuOpen(false);
  };

  return (
    <div
      {...attributes}
      className="editorial-pte__object editorial-pte__image-object"
      data-focused={focused ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-display-mode={displayMode}
    >
      {children}
      <div className="editorial-pte__image-content" contentEditable={false}>
        <MediaBlockHeader
          icon="🖼"
          title={getBodyImageHeaderTitle(labels)}
          menuLabel={labels.bodyImageMenu}
          isMenuOpen={isMenuOpen}
          menuRef={menuRef}
          onToggleMenu={() => setIsMenuOpen((value) => !value)}
        >
          <button type="button" role="menuitem" onClick={openImageModal}>
            {labels.editImage}
          </button>
          <button type="button" role="menuitem" onClick={() => moveImageBlock('up')}>
            {labels.moveUp}
          </button>
          <button type="button" role="menuitem" onClick={() => moveImageBlock('down')}>
            {labels.moveDown}
          </button>
          <button type="button" role="menuitem" className="editorial-pte__image-menu-danger" onClick={removeImageBlock}>
            {labels.removeImage}
          </button>
        </MediaBlockHeader>

        <figure
          className="editorial-pte__image-figure"
          draggable={!readOnly}
          title={labels.bodyImageDragHandle}
          onMouseDown={selectImageBlock}
          onDragStart={startImageDrag}
        >
          <div className="editorial-pte__image-preview" style={previewMaxWidth ? { maxWidth: previewMaxWidth } : undefined}>
            {previewUrl ? (
              <img src={previewUrl} alt={image.alt || ''} loading="lazy" decoding="async" draggable={false} />
            ) : (
              <div className="editorial-current-media__placeholder">{labels.bodyImageNoPreview}</div>
            )}
          </div>
          {image.caption && <figcaption>{image.caption}</figcaption>}
        </figure>

        {showDisplayMode && (
          <div className="editorial-pte__image-meta">
          <span className="editorial-pte__image-mode">
            {getImageDisplayModeLabel(displayMode, labels)}
          </span>
          </div>
        )}
      </div>

      {isModalOpen && (
        <BodyImageModal
          mode="edit"
          labels={labels}
          saveEndpoint={saveEndpoint}
          initialImage={image}
          assetPreviewUrls={assetPreviewUrls}
          onAssetPreview={onAssetPreview}
          onApply={applyImageUpdate}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

function ImageRowObjectBlock({
  attributes,
  children,
  node,
  path,
  focused,
  selected,
  labels,
  saveEndpoint,
  assetPreviewUrls,
  onAssetPreview,
  readOnly,
}: any) {
  const editor = useEditor();
  const imageRow = node as ImageRowBlock;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const images = Array.isArray(imageRow.images) ? imageRow.images : [];
  const layout = normalizeImageRowLayout(imageRow.layout);
  const rows = layout === 'uniformHeight' ? [images] : getImageRowRows(images);
  const groupCaption = typeof imageRow.groupCaption === 'string' ? imageRow.groupCaption.trim() : '';

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const applyImageRowUpdate = (value: Record<string, unknown>) => {
    editor.send({
      type: 'block.set',
      at: path,
      props: value,
    });
    editor.send({ type: 'focus' });
    setIsModalOpen(false);
  };

  const moveImageRowBlock = (direction: 'up' | 'down') => {
    editor.send({
      type: direction === 'up' ? 'move.block up' : 'move.block down',
      at: path,
    });
    editor.send({ type: 'focus' });
    setIsMenuOpen(false);
  };

  const selectImageRowBlock = () => {
    editor.send({
      type: 'select.block',
      at: path,
    });
  };

  const startImageRowDrag = (event: DragEvent<HTMLElement>) => {
    selectImageRowBlock();
    event.dataTransfer.effectAllowed = 'move';
  };

  const openImageRowModal = () => {
    setIsMenuOpen(false);
    setIsModalOpen(true);
  };

  const removeImageRowBlock = () => {
    if (!window.confirm(labels.imageRowRemoveConfirm)) return;

    editor.send({
      type: 'delete.block',
      at: path,
    });
    editor.send({ type: 'focus' });
    setIsMenuOpen(false);
  };

  return (
    <div
      {...attributes}
      className="editorial-pte__object editorial-pte__image-object editorial-pte__image-row-object"
      data-focused={focused ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-layout={layout}
    >
      {children}
      <div className="editorial-pte__image-content editorial-pte__image-row-content" contentEditable={false}>
        <MediaBlockHeader
          icon="🖼"
          title={getImageRowHeaderTitle(labels, images.length)}
          menuLabel={labels.imageRowMenu}
          isMenuOpen={isMenuOpen}
          menuRef={menuRef}
          onToggleMenu={() => setIsMenuOpen((value) => !value)}
        >
          <button type="button" role="menuitem" onClick={openImageRowModal}>
            {labels.editImageRow}
          </button>
          <button type="button" role="menuitem" onClick={() => moveImageRowBlock('up')}>
            {labels.moveUp}
          </button>
          <button type="button" role="menuitem" onClick={() => moveImageRowBlock('down')}>
            {labels.moveDown}
          </button>
          <button type="button" role="menuitem" className="editorial-pte__image-menu-danger" onClick={removeImageRowBlock}>
            {labels.removeImageRow}
          </button>
        </MediaBlockHeader>

        <div
          className={`editorial-pte__image-row-gallery${layout === 'uniformHeight' ? ' editorial-pte__image-row-gallery--uniform-height' : ''}`}
          draggable={!readOnly}
          title={labels.bodyImageDragHandle}
          onMouseDown={selectImageRowBlock}
          onDragStart={startImageRowDrag}
        >
          {rows.map((row, rowIndex) => (
            <div
              className={`editorial-pte__image-row editorial-pte__image-row--${row.length}`}
              style={{ '--editorial-image-row-count': row.length } as Record<string, number>}
              key={`row-${rowIndex}`}
            >
              {row.map((item) => {
                const image = getImageRowItemImage(item);
                const previewUrl = getBodyImagePreviewUrl(image, 540, assetPreviewUrls);
                const displayMode = normalizeImageDisplayMode(item.displayMode);

                return (
                  <figure className={`editorial-pte__image-row-item editorial-pte__image-row-item--${displayMode}`} key={getImageRowItemKey(item)}>
                    <div className="editorial-pte__image-row-preview">
                      {previewUrl ? (
                        <img src={previewUrl} alt={item.alt || ''} loading="lazy" decoding="async" draggable={false} />
                      ) : (
                        <div className="editorial-current-media__placeholder">{labels.bodyImageNoPreview}</div>
                      )}
                    </div>
                    {item.caption && <figcaption>{item.caption}</figcaption>}
                  </figure>
                );
              })}
            </div>
          ))}
          {groupCaption && <p className="editorial-pte__image-row-caption">{groupCaption}</p>}
          {layout === 'uniformHeight' && (
            <div className="editorial-pte__image-meta">
              <span className="editorial-pte__image-mode">{getImageRowLayoutLabel(layout, labels)}</span>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <ImageRowModal
          mode="edit"
          labels={labels}
          saveEndpoint={saveEndpoint}
          initialRow={imageRow}
          assetPreviewUrls={assetPreviewUrls}
          onAssetPreview={onAssetPreview}
          onApply={applyImageRowUpdate}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

function VideoObjectBlock({
  attributes,
  children,
  node,
  path,
  focused,
  selected,
  labels,
  readOnly,
}: any) {
  const editor = useEditor();
  const video = node as VideoBlock;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const url = typeof video.url === 'string' ? video.url.trim() : '';
  const domain = getVideoDomain(url);
  const thumbnailUrl = getYouTubeThumbnailUrl(url);
  const videoTitle = typeof video.title === 'string' ? video.title.trim() : '';
  const previewTitle = videoTitle || domain || labels.videoPreview;

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const applyVideoUpdate = (value: Record<string, unknown>) => {
    if (!('title' in value)) {
      editor.send({
        type: 'block.unset',
        at: path,
        props: ['title'],
      });
    }

    editor.send({
      type: 'block.set',
      at: path,
      props: value,
    });
    editor.send({ type: 'focus' });
    setIsModalOpen(false);
  };

  const moveVideoBlock = (direction: 'up' | 'down') => {
    editor.send({
      type: direction === 'up' ? 'move.block up' : 'move.block down',
      at: path,
    });
    editor.send({ type: 'focus' });
    setIsMenuOpen(false);
  };

  const selectVideoBlock = () => {
    editor.send({
      type: 'select.block',
      at: path,
    });
  };

  const startVideoDrag = (event: DragEvent<HTMLElement>) => {
    selectVideoBlock();
    event.dataTransfer.effectAllowed = 'move';
  };

  const openVideoModal = () => {
    setIsMenuOpen(false);
    setIsModalOpen(true);
  };

  const removeVideoBlock = () => {
    if (!window.confirm(labels.videoRemoveConfirm)) return;

    editor.send({
      type: 'delete.block',
      at: path,
    });
    editor.send({ type: 'focus' });
    setIsMenuOpen(false);
  };

  return (
    <div
      {...attributes}
      className="editorial-pte__object editorial-pte__image-object editorial-pte__custom-object editorial-pte__video-object"
      data-focused={focused ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
    >
      {children}
      <div className="editorial-pte__image-content editorial-pte__custom-content" contentEditable={false}>
        <MediaBlockHeader
          icon="▶"
          title={labels.videoBlockHeader}
          menuLabel={labels.videoMenu}
          isMenuOpen={isMenuOpen}
          menuRef={menuRef}
          onToggleMenu={() => setIsMenuOpen((value) => !value)}
        >
          <button type="button" role="menuitem" onClick={openVideoModal}>
            {labels.editVideo}
          </button>
          <button type="button" role="menuitem" onClick={() => moveVideoBlock('up')}>
            {labels.moveUp}
          </button>
          <button type="button" role="menuitem" onClick={() => moveVideoBlock('down')}>
            {labels.moveDown}
          </button>
          <button type="button" role="menuitem" className="editorial-pte__image-menu-danger" onClick={removeVideoBlock}>
            {labels.removeVideo}
          </button>
        </MediaBlockHeader>

        <article
          className={`editorial-pte__video-card${thumbnailUrl ? ' editorial-pte__video-card--with-thumbnail' : ''}`}
          draggable={!readOnly}
          title={labels.bodyImageDragHandle}
          onMouseDown={selectVideoBlock}
          onDragStart={startVideoDrag}
        >
          {thumbnailUrl ? (
            <span className="editorial-pte__video-thumbnail" aria-hidden="true">
              <img src={thumbnailUrl} alt="" loading="lazy" decoding="async" draggable={false} />
              <span className="editorial-pte__video-play" aria-hidden="true">▶</span>
            </span>
          ) : (
            <span className="editorial-pte__video-icon" aria-hidden="true">▶️</span>
          )}
          <div className="editorial-pte__video-copy">
            <span className="editorial-pte__video-kicker">{labels.videoPreview}</span>
            <strong>{previewTitle}</strong>
            {url && <span className="editorial-pte__video-url">{domain ? `${domain} · ${url}` : url}</span>}
          </div>
        </article>
      </div>

      {isModalOpen && (
        <VideoModal
          mode="edit"
          labels={labels}
          initialVideo={video}
          onApply={applyVideoUpdate}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

function AsideContentPreview({
  content,
  labels,
  assetPreviewUrls,
}: {
  content: PortableTextBlock[];
  labels: Labels;
  assetPreviewUrls: Record<string, string>;
}) {
  const renderedItems: ReactNode[] = [];

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;

    if (block._type === 'block') {
      const text = getTextBlockPreview(block);
      if (!text) continue;

      const key = typeof block._key === 'string' ? block._key : `${renderedItems.length}`;

      if (block.style === 'h3') {
        renderedItems.push(<h4 key={key}>{text}</h4>);
      } else if (block.listItem === 'bullet') {
        renderedItems.push(<p className="editorial-pte__aside-preview-bullet" key={key}>{text}</p>);
      } else {
        renderedItems.push(<p key={key}>{text}</p>);
      }
    }

    if (block._type === 'image') {
      const image = block as BodyImageBlock;
      const previewUrl = getBodyImagePreviewUrl(image, 360, assetPreviewUrls);
      const key = typeof image._key === 'string' ? image._key : `${renderedItems.length}`;

      renderedItems.push(
        <figure className="editorial-pte__aside-preview-image" key={key}>
          {previewUrl ? (
            <img src={previewUrl} alt={image.alt || ''} loading="lazy" decoding="async" draggable={false} />
          ) : (
            <div className="editorial-current-media__placeholder">{labels.bodyImageNoPreview}</div>
          )}
        </figure>
      );
    }

    if (block._type === 'imageRow') {
      const row = block as ImageRowBlock;
      const images = Array.isArray(row.images) ? row.images.slice(0, 4) : [];
      const key = typeof row._key === 'string' ? row._key : `${renderedItems.length}`;

      if (images.length > 0) {
        renderedItems.push(
          <div
            className="editorial-pte__aside-preview-row"
            style={{ '--editorial-aside-preview-count': images.length } as Record<string, number>}
            key={key}
          >
            {images.map((item) => {
              const image = getImageRowItemImage(item);
              const previewUrl = getBodyImagePreviewUrl(image, 260, assetPreviewUrls);

              return (
                <figure className="editorial-pte__aside-preview-row-item" key={getImageRowItemKey(item)}>
                  {previewUrl ? (
                    <img src={previewUrl} alt={item.alt || ''} loading="lazy" decoding="async" draggable={false} />
                  ) : (
                    <div className="editorial-current-media__placeholder">{labels.bodyImageNoPreview}</div>
                  )}
                </figure>
              );
            })}
          </div>
        );
      }
    }

    if (renderedItems.length >= 5) break;
  }

  if (renderedItems.length === 0) {
    return <p className="editorial-pte__aside-preview-empty">{labels.asideEmptyContent}</p>;
  }

  return <div className="editorial-pte__aside-preview-content">{renderedItems}</div>;
}

function AsideBoxObjectBlock({
  attributes,
  children,
  node,
  path,
  focused,
  selected,
  labels,
  language,
  currentArticleId,
  saveEndpoint,
  assetPreviewUrls,
  onAssetPreview,
  readOnly,
}: any) {
  const editor = useEditor();
  const asideBox = node as AsideBoxBlock;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tone = normalizeAsideTone(asideBox.tone);
  const content = normalizeAsideContentForEditor(asideBox.content);

  useEffect(() => {
    if (!isMenuOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMenuOpen]);

  const applyAsideBoxUpdate = (value: Record<string, unknown>) => {
    if (!('title' in value)) {
      editor.send({
        type: 'block.unset',
        at: path,
        props: ['title'],
      });
    }

    editor.send({
      type: 'block.set',
      at: path,
      props: value,
    });
    editor.send({ type: 'focus' });
    setIsModalOpen(false);
  };

  const moveAsideBoxBlock = (direction: 'up' | 'down') => {
    editor.send({
      type: direction === 'up' ? 'move.block up' : 'move.block down',
      at: path,
    });
    editor.send({ type: 'focus' });
    setIsMenuOpen(false);
  };

  const selectAsideBoxBlock = () => {
    editor.send({
      type: 'select.block',
      at: path,
    });
  };

  const startAsideBoxDrag = (event: DragEvent<HTMLElement>) => {
    selectAsideBoxBlock();
    event.dataTransfer.effectAllowed = 'move';
  };

  const openAsideBoxModal = () => {
    setIsMenuOpen(false);
    setIsModalOpen(true);
  };

  const removeAsideBoxBlock = () => {
    if (!window.confirm(labels.asideBoxRemoveConfirm)) return;

    editor.send({
      type: 'delete.block',
      at: path,
    });
    editor.send({ type: 'focus' });
    setIsMenuOpen(false);
  };

  return (
    <div
      {...attributes}
      className="editorial-pte__object editorial-pte__image-object editorial-pte__custom-object editorial-pte__aside-object"
      data-focused={focused ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      data-tone={tone}
    >
      {children}
      <div className="editorial-pte__image-content editorial-pte__custom-content" contentEditable={false}>
        <MediaBlockHeader
          icon="💬"
          title={labels.asideBoxHeader}
          menuLabel={labels.asideBoxMenu}
          isMenuOpen={isMenuOpen}
          menuRef={menuRef}
          onToggleMenu={() => setIsMenuOpen((value) => !value)}
        >
          <button type="button" role="menuitem" onClick={openAsideBoxModal}>
            {labels.editAsideBox}
          </button>
          <button type="button" role="menuitem" onClick={() => moveAsideBoxBlock('up')}>
            {labels.moveUp}
          </button>
          <button type="button" role="menuitem" onClick={() => moveAsideBoxBlock('down')}>
            {labels.moveDown}
          </button>
          <button type="button" role="menuitem" className="editorial-pte__image-menu-danger" onClick={removeAsideBoxBlock}>
            {labels.removeAsideBox}
          </button>
        </MediaBlockHeader>

        <aside
          className="editorial-pte__aside-card"
          draggable={!readOnly}
          title={labels.bodyImageDragHandle}
          onMouseDown={selectAsideBoxBlock}
          onDragStart={startAsideBoxDrag}
        >
          <div className="editorial-pte__aside-card-header">
            <span className="editorial-pte__aside-kicker">{getAsideToneLabel(tone, labels)}</span>
          </div>
          <AsideContentPreview content={content} labels={labels} assetPreviewUrls={assetPreviewUrls} />
        </aside>
      </div>

      {isModalOpen && (
        <AsideBoxModal
          mode="edit"
          labels={labels}
          language={language}
          currentArticleId={currentArticleId}
          saveEndpoint={saveEndpoint}
          initialAside={asideBox}
          assetPreviewUrls={assetPreviewUrls}
          onAssetPreview={onAssetPreview}
          onApply={applyAsideBoxUpdate}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
}

function ObjectBlock({
  attributes,
  children,
  node,
  labels,
  language,
  currentArticleId,
  saveEndpoint,
  assetPreviewUrls,
  onAssetPreview,
  ...props
}: any) {
  const type = typeof node?._type === 'string' ? node._type : '';

  if (type === 'image') {
    return (
      <ImageObjectBlock
        attributes={attributes}
        labels={labels}
        node={node}
        saveEndpoint={saveEndpoint}
        assetPreviewUrls={assetPreviewUrls}
        onAssetPreview={onAssetPreview}
        {...props}
      >
        {children}
      </ImageObjectBlock>
    );
  }

  if (type === 'imageRow') {
    return (
      <ImageRowObjectBlock
        attributes={attributes}
        labels={labels}
        node={node}
        saveEndpoint={saveEndpoint}
        assetPreviewUrls={assetPreviewUrls}
        onAssetPreview={onAssetPreview}
        {...props}
      >
        {children}
      </ImageRowObjectBlock>
    );
  }

  if (type === 'video') {
    return (
      <VideoObjectBlock
        attributes={attributes}
        labels={labels}
        node={node}
        {...props}
      >
        {children}
      </VideoObjectBlock>
    );
  }

  if (type === 'asideBox') {
    return (
      <AsideBoxObjectBlock
        attributes={attributes}
        labels={labels}
        node={node}
        language={language}
        currentArticleId={currentArticleId}
        saveEndpoint={saveEndpoint}
        assetPreviewUrls={assetPreviewUrls}
        onAssetPreview={onAssetPreview}
        {...props}
      >
        {children}
      </AsideBoxObjectBlock>
    );
  }

  return (
    <div {...attributes} className="editorial-pte__object" contentEditable={false}>
      {children}
      <strong>{getObjectLabel(type, labels)}</strong>
      <span>{labels.preservedObject}</span>
    </div>
  );
}

function ReferenceAnnotationPicker({
  annotationName,
  label,
  activeAnnotation,
  currentArticleId,
  language,
  labels,
  onApply,
  onRemove,
}: {
  annotationName: ReferenceAnnotationName;
  label: string;
  activeAnnotation: PortableTextObject | null;
  currentArticleId: string;
  language: ArticleLanguage;
  labels: Labels;
  onApply: (value: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<EditableArticleReference[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const searchId = useId();
  const listboxId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const currentTarget = getActiveAnnotationTarget(activeAnnotation);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setStatus('loading');

      try {
        const params = new URLSearchParams({
          kind: annotationName,
          q: query,
          language,
          limit: '12',
          currentArticleId,
        });
        const response = await fetch(`/api/editor/references?${params.toString()}`, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        const result = await response.json();

        if (!response.ok || !result?.ok || !Array.isArray(result.items)) {
          throw new Error(result?.error || 'reference_search_failed');
        }

        setItems(result.items);
        setStatus('idle');
      } catch (error) {
        if (controller.signal.aborted) return;
        setItems([]);
        setStatus('error');
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [annotationName, currentArticleId, language, query]);

  const selectItem = (item: EditableArticleReference) => {
    onApply({
      reference: {
        _type: 'reference',
        _ref: item.id,
      },
    });
  };

  return (
    <>
      {currentTarget && (
        <p className="editorial-pte-modal__current">
          {labels.annotationCurrentTarget}: <code>{currentTarget}</code>
        </p>
      )}

      <label className="editorial-relation-picker__search" htmlFor={searchId}>
        <span className="sr-only">{label}</span>
        <input
          ref={searchInputRef}
          id={searchId}
          value={query}
          placeholder={labels.relationSearchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div
        className="editorial-relation-picker__menu"
        id={listboxId}
        role="listbox"
        aria-label={label}
      >
        {status === 'loading' && (
          <p className="editorial-relation-picker__state">{labels.relationLoading}</p>
        )}
        {status === 'error' && (
          <p className="editorial-relation-picker__state" data-tone="error">
            {labels.relationSearchError}
          </p>
        )}
        {status !== 'loading' && status !== 'error' && items.length === 0 && (
          <p className="editorial-relation-picker__state">{labels.relationNoResults}</p>
        )}
        {status !== 'error' && items.map((item) => {
          const isSelected = currentTarget === item.id;

          return (
            <button
              type="button"
              className="editorial-relation-picker__option"
              key={item.id}
              onClick={() => selectItem(item)}
              aria-selected={isSelected}
              role="option"
            >
              <span>{item.label}</span>
              {item.secondaryLabel && <small>{item.secondaryLabel}</small>}
            </button>
          );
        })}
      </div>

      {activeAnnotation && (
        <button
          type="button"
          className="editorial-mini-button editorial-mini-button--danger"
          onClick={onRemove}
        >
          {labels.annotationRemove}
        </button>
      )}
    </>
  );
}

function PageLinkPicker({
  label,
  activeAnnotation,
  labels,
  onApply,
  onRemove,
}: {
  label: string;
  activeAnnotation: PortableTextObject | null;
  labels: Labels;
  onApply: (value: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const currentTarget = getActiveAnnotationTarget(activeAnnotation);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  return (
    <>
      {currentTarget && (
        <p className="editorial-pte-modal__current">
          {labels.annotationCurrentTarget}: <code>{currentTarget}</code>
        </p>
      )}

      <div className="editorial-relation-picker__menu" role="listbox" aria-label={label}>
        <p className="editorial-relation-picker__state">{labels.pageLinkSelectPlaceholder}</p>
        {pageLinkOptions.map((item) => (
          <button
            ref={item.path === pageLinkOptions[0]?.path ? firstButtonRef : undefined}
            type="button"
            className="editorial-relation-picker__option"
            key={item.path}
            onClick={() => onApply({ path: item.path })}
            aria-selected={currentTarget === item.path}
            role="option"
          >
            <span>{item.label}</span>
            <small>{item.path}</small>
          </button>
        ))}
      </div>

      {activeAnnotation && (
        <button
          type="button"
          className="editorial-mini-button editorial-mini-button--danger"
          onClick={onRemove}
        >
          {labels.annotationRemove}
        </button>
      )}
    </>
  );
}

function ExternalLinkPicker({
  label,
  activeAnnotation,
  labels,
  onApply,
  onRemove,
}: {
  label: string;
  activeAnnotation: PortableTextObject | null;
  labels: Labels;
  onApply: (value: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const currentTarget = getActiveAnnotationTarget(activeAnnotation);
  const [href, setHref] = useState(currentTarget || 'https://');
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const applyExternalLink = () => {
    const value = href.trim();

    try {
      const url = new URL(value);

      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
        throw new Error('unsupported_protocol');
      }
    } catch {
      inputRef.current?.setCustomValidity(labels.linkPrompt);
      inputRef.current?.reportValidity();
      return;
    }

    inputRef.current?.setCustomValidity('');
    onApply({ href: value });
  };

  return (
    <>
      {currentTarget && (
        <p className="editorial-pte-modal__current">
          {labels.annotationCurrentTarget}: <code>{currentTarget}</code>
        </p>
      )}

      <label className="editorial-field" htmlFor={inputId}>
        <span>{label}</span>
        <input
          ref={inputRef}
          id={inputId}
          type="url"
          value={href}
          placeholder="https://"
          onChange={(event) => {
            event.currentTarget.setCustomValidity('');
            setHref(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyExternalLink();
            }
          }}
        />
      </label>

      <div className="editorial-exit-modal__actions">
        {activeAnnotation && (
          <button
            type="button"
            className="editorial-mini-button editorial-mini-button--danger"
            onClick={onRemove}
          >
            {labels.annotationRemove}
          </button>
        )}
        <button type="button" className="editorial-button" onClick={applyExternalLink}>
          {labels.annotationApply}
        </button>
      </div>
    </>
  );
}

function getAnnotationIcon(annotationName: AnnotationName) {
  if (annotationName === 'link') return '🔗';
  if (annotationName === 'pageLink') return '📃';

  return referenceAnnotationControls.find((control) => control.name === annotationName)?.icon || '';
}

function AnnotationModal({
  title,
  labels,
  children,
  onClose,
  panelClassName = '',
}: {
  title: string;
  labels: Labels;
  children: ReactNode;
  onClose: () => void;
  panelClassName?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="editorial-pte-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`editorial-pte-modal__panel${panelClassName ? ` ${panelClassName}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="editorial-pte-modal__header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="editorial-pte-modal__close"
            aria-label={labels.annotationClose}
            title={labels.annotationClose}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="editorial-pte-modal__body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

type SelectedBodyImageFile = {
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
};

function getBodyImageFileValidationError(file: File | null | undefined, labels: Labels) {
  if (!file) return labels.bodyImageMissingFile;

  if (!allowedBodyImageMimeTypes.has(file.type)) {
    return labels.bodyImageInvalidType;
  }

  if (file.size <= 0 || file.size > featuredImageMaxFileSize) {
    return labels.featuredImageInvalidSize;
  }

  return '';
}

function getSelectedBodyImageMetadataLabel(selection: SelectedBodyImageFile | null) {
  if (!selection) return '';

  const parts = [
    selection.width && selection.height ? `${selection.width} × ${selection.height}px` : '',
    formatFileSize(selection.file.size),
    selection.file.type,
  ].filter(Boolean);

  return parts.join(' · ');
}

function BodyImageModal({
  mode,
  labels,
  saveEndpoint,
  initialImage = null,
  assetPreviewUrls = {},
  onAssetPreview,
  onApply,
  onClose,
}: {
  mode: 'insert' | 'edit';
  labels: Labels;
  saveEndpoint: string;
  initialImage?: BodyImageBlock | null;
  assetPreviewUrls?: Record<string, string>;
  onAssetPreview?: (assetId: string, url: string) => void;
  onApply: (value: Record<string, unknown>, resetCropHotspot?: boolean) => void;
  onClose: () => void;
}) {
  const fileInputId = useId();
  const altId = useId();
  const captionId = useId();
  const displayModeId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedBodyImageFile | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error' | ''>('');
  const [alt, setAlt] = useState(initialImage?.alt || '');
  const [caption, setCaption] = useState(initialImage?.caption || '');
  const [displayMode, setDisplayMode] = useState<ImageDisplayMode>(
    normalizeImageDisplayMode(initialImage?.displayMode, initialImage?.isWide)
  );
  const currentPreviewUrl = getBodyImagePreviewUrl(initialImage, 720, assetPreviewUrls);
  const selectedMetadata = getSelectedBodyImageMetadataLabel(selectedFile);
  const currentMetadata = getBodyImageMetadataLabel(initialImage, labels);
  const title = mode === 'insert' ? labels.insertImage : labels.editImage;
  const submitLabel = mode === 'insert' ? labels.insertImage : labels.updateImage;

  useEffect(() => () => {
    if (selectedFile?.previewUrl) {
      URL.revokeObjectURL(selectedFile.previewUrl);
    }
  }, [selectedFile]);

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setStatus('');
    setStatusTone('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const selectFile = async (file: File | null | undefined) => {
    const error = getBodyImageFileValidationError(file, labels);

    if (error || !file) {
      setStatus(error);
      setStatusTone('error');
      return;
    }

    const dimensions = await getImageDimensions(file);

    setSelectedFile({
      file,
      previewUrl: URL.createObjectURL(file),
      width: dimensions.width,
      height: dimensions.height,
    });
    setStatus(labels.bodyImageReady);
    setStatusTone('success');
  };

  const uploadSelectedFile = async () => {
    if (!selectedFile) return null;

    const formData = new FormData();
    formData.set('file', selectedFile.file);

    const response = await fetch(getBodyImageUploadEndpoint(saveEndpoint), {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();

    if (!response.ok || !result?.ok || !result.asset?.id) {
      throw new Error(result?.error || 'body_image_upload_failed');
    }

    return result.asset as EditableArticleBodyImageAsset;
  };

  const applyImage = async () => {
    if (isUploading) return;

    let assetId = getBodyImageAssetRef(initialImage);
    let resetCropHotspot = false;

    setIsUploading(true);
    setStatus(selectedFile ? labels.bodyImageUploading : '');
    setStatusTone('');

    try {
      if (selectedFile) {
        const uploadedAsset = await uploadSelectedFile();
        assetId = uploadedAsset?.id || '';
        if (assetId && uploadedAsset?.url) {
          onAssetPreview?.(assetId, uploadedAsset.url);
        }
        resetCropHotspot = Boolean(initialImage);
      }

      if (!assetId) {
        setStatus(labels.bodyImageMissingFile);
        setStatusTone('error');
        return;
      }

      onApply(
        createBodyImageBlockValue({
          assetId,
          alt,
          caption,
          displayMode,
        }),
        resetCropHotspot
      );
    } catch {
      setStatus(labels.bodyImageUploadFailed);
      setStatusTone('error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AnnotationModal
      title={`🖼️ ${title}`}
      labels={labels}
      onClose={onClose}
      panelClassName="editorial-pte-modal__panel--image"
    >
      <div className="editorial-body-image-modal">
        {mode === 'edit' && (
          <div className="editorial-current-media editorial-current-media--body-image">
            <span>{labels.bodyImageCurrent}</span>
            <div className="editorial-current-media__frame editorial-current-media__frame--body-image">
              {currentPreviewUrl ? (
                <img src={currentPreviewUrl} alt={initialImage?.alt || ''} loading="lazy" decoding="async" />
              ) : (
                <div className="editorial-current-media__placeholder">{labels.bodyImageNoPreview}</div>
              )}
            </div>
            <p className="editorial-file-meta">{currentMetadata}</p>
          </div>
        )}

        <label
          className="editorial-dropzone editorial-dropzone--body-image"
          data-drag-active={isDragActive ? 'true' : undefined}
          htmlFor={fileInputId}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragActive(false);
            void selectFile(event.dataTransfer.files?.[0]);
          }}
        >
          <span>{mode === 'edit' ? labels.replaceImage : labels.bodyImageChooseFile}</span>
          <small>{labels.bodyImageDropFile}</small>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => void selectFile(event.currentTarget.files?.[0])}
          />
        </label>
        <p className="editorial-file-meta">{labels.bodyImageFormats}</p>

        {selectedFile && (
          <div className="editorial-local-preview editorial-local-preview--body-image">
            <span>{labels.bodyImageNew}</span>
            <div className="editorial-local-preview__frame editorial-local-preview__frame--body-image">
              <img src={selectedFile.previewUrl} alt="" />
            </div>
            {selectedMetadata && <p className="editorial-file-meta">{selectedMetadata}</p>}
          </div>
        )}

        <label className="editorial-field" htmlFor={altId}>
          <span>{labels.bodyImageAlt}</span>
          <AutoGrowTextField
            id={altId}
            value={alt}
            rows={2}
            maxRows={4}
            maxLength={120}
            ariaLabel={labels.bodyImageAlt}
            singleLine
            onChange={setAlt}
          />
        </label>
        <CharacterCounter value={alt} max={120} warning={labels.cardExcerptWarning} />
        {(selectedFile || initialImage) && !alt.trim() && (
          <p className="editorial-file-advice editorial-file-advice--subtle-warning">
            {labels.bodyImageAltWarning}
          </p>
        )}

        <label className="editorial-field" htmlFor={captionId}>
          <span>{labels.bodyImageCaption}</span>
          <AutoGrowTextField
            id={captionId}
            value={caption}
            rows={2}
            maxRows={4}
            maxLength={500}
            ariaLabel={labels.bodyImageCaption}
            singleLine
            onChange={setCaption}
          />
        </label>

        <label className="editorial-field" htmlFor={displayModeId}>
          <span>{labels.bodyImageDisplayMode}</span>
          <select
            id={displayModeId}
            value={displayMode}
            onChange={(event) => setDisplayMode(normalizeImageDisplayMode(event.target.value))}
          >
            {imageDisplayModes.map((modeOption) => (
              <option key={modeOption} value={modeOption}>
                {getImageDisplayModeLabel(modeOption, labels)}
              </option>
            ))}
          </select>
        </label>

        <p className="editorial-file-meta">{labels.bodyImageOrphanNotice}</p>

        {status && (
          <p className="editorial-file-advice" data-tone={statusTone || undefined} aria-live="polite">
            {status}
          </p>
        )}

        <div className="editorial-body-image-modal__actions">
          {selectedFile && (
            <button type="button" className="editorial-mini-button" onClick={clearSelectedFile} disabled={isUploading}>
              {labels.bodyImageCancelSelection}
            </button>
          )}
          <button type="button" className="editorial-mini-button" onClick={onClose} disabled={isUploading}>
            {labels.annotationClose}
          </button>
          <button
            type="button"
            className="editorial-button editorial-body-image-modal__submit"
            onClick={applyImage}
            disabled={isUploading || (mode === 'insert' && !selectedFile)}
          >
            {isUploading ? labels.bodyImageUploading : submitLabel}
          </button>
        </div>
      </div>
    </AnnotationModal>
  );
}

type ImageRowDraftItem = {
  key: string;
  source: ImageRowItem | null;
  image: BodyImageBlock | null;
  alt: string;
  caption: string;
  displayMode: ImageDisplayMode;
  selectedFile: SelectedBodyImageFile | null;
};

function createImageRowDraftItem(item: ImageRowItem): ImageRowDraftItem {
  const image = getImageRowItemImage(item);

  return {
    key: getImageRowItemKey(item),
    source: item,
    image,
    alt: typeof item.alt === 'string' ? item.alt : '',
    caption: typeof item.caption === 'string' ? item.caption : '',
    displayMode: normalizeImageDisplayMode(item.displayMode),
    selectedFile: null,
  };
}

function revokeImageRowDraftItemPreview(item: ImageRowDraftItem) {
  if (item.selectedFile?.previewUrl) {
    URL.revokeObjectURL(item.selectedFile.previewUrl);
  }
}

function getImageRowDraftItemPreviewUrl(
  item: ImageRowDraftItem,
  assetPreviewUrls: Record<string, string>
) {
  if (item.selectedFile?.previewUrl) return item.selectedFile.previewUrl;

  return getBodyImagePreviewUrl(item.image, 540, assetPreviewUrls);
}

function getImageRowDraftItemMetadataLabel(item: ImageRowDraftItem, labels: Labels) {
  if (item.selectedFile) return getSelectedBodyImageMetadataLabel(item.selectedFile);

  const image = item.image;
  const asset = image?.asset;

  if (asset && typeof asset === 'object' && ('dimensions' in asset || 'metadata' in asset)) {
    return getBodyImageMetadataLabel(image, labels);
  }

  return labels.featuredImageMetadataUnavailable;
}

function ImageRowModal({
  mode,
  labels,
  saveEndpoint,
  initialRow = null,
  assetPreviewUrls = {},
  onAssetPreview,
  onApply,
  onClose,
}: {
  mode: 'insert' | 'edit';
  labels: Labels;
  saveEndpoint: string;
  initialRow?: ImageRowBlock | null;
  assetPreviewUrls?: Record<string, string>;
  onAssetPreview?: (assetId: string, url: string) => void;
  onApply: (value: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const fileInputId = useId();
  const rowItemFieldId = useId();
  const layoutId = useId();
  const groupCaptionId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<ImageRowDraftItem[]>(() =>
    Array.isArray(initialRow?.images) ? initialRow.images.map(createImageRowDraftItem) : []
  );
  const itemsRef = useRef(items);
  const [layout, setLayout] = useState<ImageRowLayout>(normalizeImageRowLayout(initialRow?.layout));
  const [groupCaption, setGroupCaption] = useState(typeof initialRow?.groupCaption === 'string' ? initialRow.groupCaption : '');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error' | ''>('');
  const title = mode === 'insert' ? labels.insertImageRow : labels.editImageRow;
  const submitLabel = mode === 'insert' ? labels.insertImageRow : labels.updateImageRow;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => () => {
    itemsRef.current.forEach(revokeImageRowDraftItemPreview);
  }, []);

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const setItemAt = (index: number, patch: Partial<ImageRowDraftItem>) => {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (patch.selectedFile && item.selectedFile?.previewUrl) {
        URL.revokeObjectURL(item.selectedFile.previewUrl);
      }

      return {
        ...item,
        ...patch,
      };
    }));
  };

  const createDraftItemFromFile = async (file: File) => {
    const dimensions = await getImageDimensions(file);

    return {
      key: getKey(),
      source: null,
      image: null,
      alt: '',
      caption: '',
      displayMode: 'cover' as ImageDisplayMode,
      selectedFile: {
        file,
        previewUrl: URL.createObjectURL(file),
        width: dimensions.width,
        height: dimensions.height,
      },
    };
  };

  const addFiles = async (fileList: FileList | File[] | null | undefined) => {
    const files = Array.from(fileList || []);

    if (files.length === 0) return;
    if (items.length + files.length > imageRowMaxImages) {
      setStatus(labels.imageRowMaxCount);
      setStatusTone('error');
      resetFileInput();
      return;
    }

    for (const file of files) {
      const error = getBodyImageFileValidationError(file, labels);

      if (error) {
        setStatus(error);
        setStatusTone('error');
        resetFileInput();
        return;
      }
    }

    const nextItems = await Promise.all(files.map(createDraftItemFromFile));

    setItems((current) => [...current, ...nextItems]);
    setStatus(labels.imageRowReady);
    setStatusTone('success');
    resetFileInput();
  };

  const replaceItemFile = async (index: number, file: File | null | undefined) => {
    if (!items[index] || !file) return;

    const error = getBodyImageFileValidationError(file, labels);

    if (error) {
      setStatus(error);
      setStatusTone('error');
      resetFileInput();
      return;
    }

    const dimensions = await getImageDimensions(file);
    setItemAt(index, {
      selectedFile: {
        file,
        previewUrl: URL.createObjectURL(file),
        width: dimensions.width,
        height: dimensions.height,
      },
    });
    setStatus(labels.imageRowReady);
    setStatusTone('success');
    resetFileInput();
  };

  const removeItem = (index: number) => {
    if (items.length <= imageRowMinImages) {
      setStatus(labels.imageRowMinCount);
      setStatusTone('error');
      return;
    }

    setItems((current) => {
      const item = current[index];
      if (item) revokeImageRowDraftItemPreview(item);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    setStatus('');
    setStatusTone('');
  };

  const moveItem = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= items.length) return;

    setItems((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next;
    });
  };

  const uploadItemFile = async (item: ImageRowDraftItem) => {
    if (!item.selectedFile) return null;

    const formData = new FormData();
    formData.set('file', item.selectedFile.file);

    const response = await fetch(getBodyImageUploadEndpoint(saveEndpoint), {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();

    if (!response.ok || !result?.ok || !result.asset?.id) {
      throw new Error(result?.error || 'image_row_upload_failed');
    }

    return result.asset as EditableArticleBodyImageAsset;
  };

  const applyImageRow = async () => {
    if (isUploading) return;

    if (items.length < imageRowMinImages) {
      setStatus(labels.imageRowMissingImages);
      setStatusTone('error');
      return;
    }

    if (items.length > imageRowMaxImages) {
      setStatus(labels.imageRowMaxCount);
      setStatusTone('error');
      return;
    }

    setIsUploading(true);
    setStatus(labels.imageRowUploading);
    setStatusTone('');

    try {
      const nextImages: ImageRowItem[] = [];

      for (const item of items) {
        const uploadedAsset = await uploadItemFile(item);
        const assetId = uploadedAsset?.id || getBodyImageAssetRef(item.image);

        if (uploadedAsset?.id && uploadedAsset.url) {
          onAssetPreview?.(uploadedAsset.id, uploadedAsset.url);
        }

        if (!assetId) {
          setStatus(labels.imageRowMissingImages);
          setStatusTone('error');
          return;
        }

        nextImages.push(createImageRowImageValue({
          source: item.source || { _key: item.key, image: item.image || undefined },
          assetId,
          alt: item.alt,
          caption: item.caption,
          displayMode: item.displayMode,
          resetCropHotspot: Boolean(uploadedAsset),
        }));
      }

      onApply(createImageRowBlockValue({
        images: nextImages,
        groupCaption,
        layout,
      }));
    } catch {
      setStatus(labels.imageRowUploadFailed);
      setStatusTone('error');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AnnotationModal
      title={`🖼️🖼️ ${title}`}
      labels={labels}
      onClose={onClose}
      panelClassName="editorial-pte-modal__panel--image-row"
    >
      <div className="editorial-image-row-modal">
        <label
          className="editorial-dropzone editorial-dropzone--body-image"
          data-drag-active={isDragActive ? 'true' : undefined}
          htmlFor={fileInputId}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragActive(false);
            void addFiles(event.dataTransfer.files);
          }}
        >
          <span>{items.length > 0 ? labels.imageRowAddImages : labels.imageRowChooseFiles}</span>
          <small>{labels.imageRowDropFiles}</small>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => void addFiles(event.currentTarget.files)}
          />
        </label>
        <p className="editorial-file-meta">{labels.imageRowFormats}</p>

        <section className="editorial-image-row-modal__section" aria-label={labels.imageRowSelectedImages}>
          <div className="editorial-image-row-modal__section-header">
            <span>{labels.imageRowSelectedImages}</span>
            <small>{items.length} / {imageRowMaxImages}</small>
          </div>

          {items.length > 0 ? (
            <div className="editorial-image-row-modal__items">
              {items.map((item, index) => {
                const previewUrl = getImageRowDraftItemPreviewUrl(item, assetPreviewUrls);
                const metadata = getImageRowDraftItemMetadataLabel(item, labels);
                const altFieldId = `${rowItemFieldId}-${item.key}-alt`;
                const captionFieldId = `${rowItemFieldId}-${item.key}-caption`;
                const displayModeFieldId = `${rowItemFieldId}-${item.key}-display-mode`;
                const replaceFieldId = `${rowItemFieldId}-${item.key}-replace`;

                return (
                  <article className="editorial-image-row-modal__item" key={item.key}>
                    <div className="editorial-image-row-modal__item-heading">
                      <span>{labels.imageRowImageSettings}</span>
                      <small>{index + 1} / {items.length}</small>
                    </div>

                    <div className="editorial-image-row-modal__item-preview">
                      {previewUrl ? (
                        <img src={previewUrl} alt={item.alt || ''} loading="lazy" decoding="async" />
                      ) : (
                        <span>{labels.bodyImageNoPreview}</span>
                      )}
                    </div>

                    {metadata && <p className="editorial-file-meta">{metadata}</p>}

                    <label className="editorial-field" htmlFor={altFieldId}>
                      <span>{labels.bodyImageAlt}</span>
                      <AutoGrowTextField
                        id={altFieldId}
                        value={item.alt}
                        rows={2}
                        maxRows={4}
                        maxLength={120}
                        ariaLabel={labels.bodyImageAlt}
                        singleLine
                        onChange={(value) => setItemAt(index, { alt: value })}
                      />
                    </label>
                    <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                      {labels.bodyImageAltWarning}
                    </p>
                    <CharacterCounter value={item.alt} max={120} warning={labels.cardExcerptWarning} />

                    <label className="editorial-field" htmlFor={captionFieldId}>
                      <span>{labels.bodyImageCaption}</span>
                      <AutoGrowTextField
                        id={captionFieldId}
                        value={item.caption}
                        rows={2}
                        maxRows={4}
                        maxLength={500}
                        ariaLabel={labels.bodyImageCaption}
                        singleLine
                        onChange={(value) => setItemAt(index, { caption: value })}
                      />
                    </label>

                    <label className="editorial-field" htmlFor={displayModeFieldId}>
                      <span>{labels.bodyImageDisplayMode}</span>
                      <select
                        id={displayModeFieldId}
                        value={item.displayMode}
                        onChange={(event) => setItemAt(index, { displayMode: normalizeImageDisplayMode(event.target.value) })}
                      >
                        {imageDisplayModes.map((modeOption) => (
                          <option key={modeOption} value={modeOption}>
                            {getImageDisplayModeLabel(modeOption, labels)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="editorial-image-row-modal__item-actions">
                      <button
                        type="button"
                        className="editorial-image-row-modal__icon-button"
                        aria-label={labels.imageRowMoveLeft}
                        title={labels.imageRowMoveLeft}
                        onClick={() => moveItem(index, 'left')}
                        disabled={isUploading || index === 0}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="editorial-image-row-modal__icon-button"
                        aria-label={labels.imageRowMoveRight}
                        title={labels.imageRowMoveRight}
                        onClick={() => moveItem(index, 'right')}
                        disabled={isUploading || index === items.length - 1}
                      >
                        →
                      </button>
                      <label
                        className="editorial-mini-button editorial-image-row-modal__replace-control"
                        htmlFor={replaceFieldId}
                        data-disabled={isUploading ? 'true' : undefined}
                      >
                        <span>{labels.replaceImage}</span>
                        <input
                          id={replaceFieldId}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={isUploading}
                          onChange={(event) => {
                            void replaceItemFile(index, event.currentTarget.files?.[0]);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="editorial-mini-button editorial-mini-button--danger"
                        onClick={() => removeItem(index)}
                        disabled={isUploading}
                      >
                        {labels.imageRowRemoveImage}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="editorial-file-meta">{labels.imageRowMissingImages}</p>
          )}
        </section>

        <label className="editorial-field" htmlFor={layoutId}>
          <span>{labels.imageRowLayout}</span>
          <select
            id={layoutId}
            value={layout}
            onChange={(event) => setLayout(normalizeImageRowLayout(event.target.value))}
          >
            {imageRowLayouts.map((layoutOption) => (
              <option key={layoutOption} value={layoutOption}>
                {getImageRowLayoutLabel(layoutOption, labels)}
              </option>
            ))}
          </select>
        </label>

        <label className="editorial-field" htmlFor={groupCaptionId}>
          <span>{labels.imageRowGroupCaption}</span>
          <AutoGrowTextField
            id={groupCaptionId}
            value={groupCaption}
            rows={2}
            maxRows={4}
            maxLength={800}
            ariaLabel={labels.imageRowGroupCaption}
            onChange={setGroupCaption}
          />
        </label>

        <p className="editorial-file-meta">{labels.bodyImageOrphanNotice}</p>

        {status && (
          <p className="editorial-file-advice" data-tone={statusTone || undefined} aria-live="polite">
            {status}
          </p>
        )}

        <div className="editorial-body-image-modal__actions">
          <button type="button" className="editorial-mini-button" onClick={onClose} disabled={isUploading}>
            {labels.annotationClose}
          </button>
          <button
            type="button"
            className="editorial-button editorial-body-image-modal__submit"
            onClick={applyImageRow}
            disabled={isUploading || items.length < imageRowMinImages || items.length > imageRowMaxImages}
          >
            {isUploading ? labels.imageRowUploading : submitLabel}
          </button>
        </div>
      </div>
    </AnnotationModal>
  );
}

function VideoModal({
  mode,
  labels,
  initialVideo = null,
  onApply,
  onClose,
}: {
  mode: 'insert' | 'edit';
  labels: Labels;
  initialVideo?: VideoBlock | null;
  onApply: (value: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const urlId = useId();
  const titleId = useId();
  const [url, setUrl] = useState(typeof initialVideo?.url === 'string' ? initialVideo.url : '');
  const [title, setTitle] = useState(typeof initialVideo?.title === 'string' ? initialVideo.title : '');
  const [status, setStatus] = useState('');
  const modalTitle = mode === 'insert' ? labels.insertVideo : labels.editVideo;
  const submitLabel = mode === 'insert' ? labels.insertVideo : labels.updateVideo;

  const applyVideo = () => {
    const normalizedUrl = normalizeHttpUrl(url);

    if (!url.trim()) {
      setStatus(labels.videoUrlRequired);
      return;
    }

    if (!normalizedUrl) {
      setStatus(labels.videoUrlInvalid);
      return;
    }

    onApply(createVideoBlockValue({
      url: normalizedUrl,
      title,
    }));
  };

  return (
    <AnnotationModal
      title={`▶️ ${modalTitle}`}
      labels={labels}
      onClose={onClose}
      panelClassName="editorial-pte-modal__panel--video"
    >
      <div className="editorial-video-modal">
        <label className="editorial-field" htmlFor={urlId}>
          <span>{labels.videoUrl}</span>
          <input
            id={urlId}
            value={url}
            type="url"
            inputMode="url"
            placeholder="https://"
            onChange={(event) => {
              setUrl(event.target.value);
              setStatus('');
            }}
          />
        </label>

        <label className="editorial-field" htmlFor={titleId}>
          <span>{labels.videoTitle}</span>
          <AutoGrowTextField
            id={titleId}
            value={title}
            rows={2}
            maxRows={3}
            maxLength={160}
            ariaLabel={labels.videoTitle}
            singleLine
            onChange={setTitle}
          />
        </label>

        {status && (
          <p className="editorial-file-advice" data-tone="error" aria-live="polite">
            {status}
          </p>
        )}

        <div className="editorial-body-image-modal__actions">
          <button type="button" className="editorial-mini-button" onClick={onClose}>
            {labels.annotationClose}
          </button>
          <button type="button" className="editorial-button editorial-body-image-modal__submit" onClick={applyVideo}>
            {submitLabel}
          </button>
        </div>
      </div>
    </AnnotationModal>
  );
}

function AsideContentEditor({
  content,
  labels,
  language,
  currentArticleId,
  saveEndpoint,
  assetPreviewUrls,
  onAssetPreview,
  onChange,
}: {
  content: PortableTextBlock[];
  labels: Labels;
  language: ArticleLanguage;
  currentArticleId: string;
  saveEndpoint: string;
  assetPreviewUrls: Record<string, string>;
  onAssetPreview: (assetId: string, url: string) => void;
  onChange: (content: PortableTextBlock[]) => void;
}) {
  const nestedNodes = useMemo(
    () => [
      defineBlockObject({
        type: 'image',
        render: (props) => (
          <ObjectBlock
            {...props}
            labels={labels}
            language={language}
            currentArticleId={currentArticleId}
            saveEndpoint={saveEndpoint}
            assetPreviewUrls={assetPreviewUrls}
            onAssetPreview={onAssetPreview}
          />
        ),
      }),
      defineBlockObject({
        type: 'imageRow',
        render: (props) => (
          <ObjectBlock
            {...props}
            labels={labels}
            language={language}
            currentArticleId={currentArticleId}
            saveEndpoint={saveEndpoint}
            assetPreviewUrls={assetPreviewUrls}
            onAssetPreview={onAssetPreview}
          />
        ),
      }),
    ],
    [assetPreviewUrls, currentArticleId, labels, language, onAssetPreview, saveEndpoint]
  );

  return (
    <EditorProvider
      initialConfig={{
        schemaDefinition: asideSchemaDefinition,
        initialValue: content,
        keyGenerator: getKey,
      }}
    >
      <EventListenerPlugin
        on={(event) => {
          if (event.type === 'mutation') {
            onChange(event.value || []);
          }
        }}
      />
      <NodePlugin nodes={nestedNodes} />
      <Toolbar
        variant="aside"
        labels={labels}
        language={language}
        currentArticleId={currentArticleId}
        saveEndpoint={saveEndpoint}
        assetPreviewUrls={assetPreviewUrls}
        onAssetPreview={onAssetPreview}
      />
      <PortableTextEditable
        className="editorial-pte editorial-pte--nested"
        renderAnnotation={renderAnnotation}
        renderDecorator={renderDecorator}
        renderListItem={renderListItem}
        renderStyle={renderStyle}
        spellCheck
      />
    </EditorProvider>
  );
}

function AsideBoxModal({
  mode,
  labels,
  language,
  currentArticleId,
  saveEndpoint,
  initialAside = null,
  assetPreviewUrls = {},
  onAssetPreview,
  onApply,
  onClose,
}: {
  mode: 'insert' | 'edit';
  labels: Labels;
  language: ArticleLanguage;
  currentArticleId: string;
  saveEndpoint: string;
  initialAside?: AsideBoxBlock | null;
  assetPreviewUrls?: Record<string, string>;
  onAssetPreview: (assetId: string, url: string) => void;
  onApply: (value: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const toneId = useId();
  const [title, setTitle] = useState(typeof initialAside?.title === 'string' ? initialAside.title : '');
  const [tone, setTone] = useState<AsideTone>(normalizeAsideTone(initialAside?.tone));
  const [content, setContent] = useState<PortableTextBlock[]>(() => normalizeAsideContentForEditor(initialAside?.content));
  const modalTitle = mode === 'insert' ? labels.insertAsideBox : labels.editAsideBox;
  const submitLabel = mode === 'insert' ? labels.insertAsideBox : labels.updateAsideBox;

  const applyAsideBox = () => {
    onApply(createAsideBoxBlockValue({
      title,
      tone,
      content,
    }));
  };

  return (
    <AnnotationModal
      title={`💬 ${modalTitle}`}
      labels={labels}
      onClose={onClose}
      panelClassName="editorial-pte-modal__panel--aside"
    >
      <div className="editorial-aside-modal">
        <label className="editorial-field" htmlFor={titleId}>
          <span>{labels.asideTitle}</span>
          <AutoGrowTextField
            id={titleId}
            value={title}
            rows={2}
            maxRows={3}
            maxLength={160}
            ariaLabel={labels.asideTitle}
            singleLine
            onChange={setTitle}
          />
        </label>

        <label className="editorial-field" htmlFor={toneId}>
          <span>{labels.asideTone}</span>
          <select
            id={toneId}
            value={tone}
            onChange={(event) => setTone(normalizeAsideTone(event.target.value))}
          >
            {asideTones.map((toneOption) => (
              <option key={toneOption} value={toneOption}>
                {getAsideToneLabel(toneOption, labels)}
              </option>
            ))}
          </select>
        </label>

        <section className="editorial-aside-modal__content" aria-label={labels.asideContent}>
          <div className="editorial-aside-modal__heading">
            <span>{labels.asideContent}</span>
            <small>{labels.asideContentHelp}</small>
          </div>
          <AsideContentEditor
            content={content}
            labels={labels}
            language={language}
            currentArticleId={currentArticleId}
            saveEndpoint={saveEndpoint}
            assetPreviewUrls={assetPreviewUrls}
            onAssetPreview={onAssetPreview}
            onChange={setContent}
          />
        </section>

        <div className="editorial-body-image-modal__actions">
          <button type="button" className="editorial-mini-button" onClick={onClose}>
            {labels.annotationClose}
          </button>
          <button type="button" className="editorial-button editorial-body-image-modal__submit" onClick={applyAsideBox}>
            {submitLabel}
          </button>
        </div>
      </div>
    </AnnotationModal>
  );
}

type ToolbarMenu = 'structure' | 'text' | 'link' | 'insert' | 'document' | 'contextLink';
type SaveMode = 'manual' | 'autosave';
type WorkflowAction = 'submit' | 'request_changes' | 'approve';
type TypeChangeRequest = {
  nextType: ArticleType;
  cleanupItems: string[];
};

const AUTOSAVE_IDLE_DELAY_MS = 12000;

function createEmptyGameInfo(): EditableArticleGameInfo {
  return {
    releaseYear: null,
    mediaFormat: [],
    cover: null,
  };
}

function createEmptyRating(): EditableArticleRating {
  return {
    grafica: null,
    sonoro: null,
    giocabilita: null,
    longevita: null,
    overall: null,
    summary: '',
  };
}

function getEditableArticleSnapshot(articleDraft: EditableArticle, contentValue: PortableTextBlock[]) {
  return JSON.stringify({
    title: articleDraft.title,
    subtitle: articleDraft.subtitle,
    cardExcerpt: articleDraft.cardExcerpt,
    excerpt: articleDraft.excerpt,
    seoTitle: articleDraft.seoTitle,
    type: articleDraft.type,
    language: articleDraft.language,
    slug: articleDraft.slug,
    featuredImageAlt: articleDraft.featuredImage?.alt || '',
    categories: articleDraft.categories,
    editorialSeries: articleDraft.editorialSeries,
    platforms: articleDraft.platforms,
    creators: articleDraft.creators,
    genres: articleDraft.genres,
    developers: articleDraft.developers,
    publishers: articleDraft.publishers,
    manufacturer: articleDraft.manufacturer,
    modes: articleDraft.modes,
    series: articleDraft.series,
    translationOf: articleDraft.translationOf,
    gameInfo: articleDraft.gameInfo,
    rating: articleDraft.rating,
    pros: articleDraft.pros,
    cons: articleDraft.cons,
    seriesOrder: articleDraft.seriesOrder,
    seriesLabel: articleDraft.seriesLabel,
    content: contentValue,
  });
}

function getWorkflowStatusLabel(
  workflowStatus: EditorialArticleWorkflow['workflowStatus'],
  labels: Labels
) {
  const statusLabels: Record<EditorialArticleWorkflow['workflowStatus'], string> = {
    draft: labels.workflowStatusDraft,
    submitted: labels.workflowStatusSubmitted,
    changes_requested: labels.workflowStatusChangesRequested,
    approved: labels.workflowStatusApproved,
    published: labels.workflowStatusPublished,
  };

  return statusLabels[workflowStatus] || workflowStatus;
}

function formatWorkflowDate(value: string | null, language: ArticleLanguage) {
  if (!value) return '';

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return '';

  return new Intl.DateTimeFormat(language === 'en' ? 'en' : 'it', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getWorkflowActionLabel(action: WorkflowAction, labels: Labels) {
  if (action === 'submit') return labels.workflowSubmit;
  if (action === 'request_changes') return labels.workflowRequestChanges;

  return labels.workflowApprove;
}

function getWorkflowActionConfirmMessage(action: WorkflowAction, labels: Labels) {
  if (action === 'submit') return labels.workflowSubmitConfirm;
  if (action === 'request_changes') return labels.workflowRequestChangesConfirm;

  return labels.workflowApproveConfirm;
}

function getWorkflowActionSuccessMessage(action: WorkflowAction, labels: Labels) {
  if (action === 'submit') return labels.workflowSubmitSuccess;
  if (action === 'request_changes') return labels.workflowRequestChangesSuccess;

  return labels.workflowApproveSuccess;
}

function getWorkflowErrorMessage(error: string, labels: Labels) {
  if (error === 'workflow_conflict') return labels.workflowConflict;
  if (error === 'article_not_found') return labels.workflowNotFound;

  if (
    error === 'article_submit_forbidden' ||
    error === 'article_request_changes_forbidden' ||
    error === 'article_approve_forbidden' ||
    error === 'editorial_profile_required' ||
    error === 'editorial_profile_suspended' ||
    error === 'unauthorized'
  ) {
    return labels.workflowForbidden;
  }

  return labels.workflowGenericError;
}

function ExitConfirmationModal({
  labels,
  isSaving,
  onSaveAndClose,
  onDiscard,
  onCancel,
}: {
  labels: Labels;
  isSaving: boolean;
  onSaveAndClose: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <AnnotationModal
      title={labels.exitConfirmTitle}
      labels={labels}
      onClose={onCancel}
      panelClassName="editorial-pte-modal__panel--exit"
    >
      <div className="editorial-exit-modal">
        <p>{labels.exitConfirmText}</p>

        <div className="editorial-exit-modal__actions">
          <button type="button" className="editorial-button" onClick={onSaveAndClose} disabled={isSaving}>
            {isSaving ? labels.saving : labels.exitSaveAndClose}
          </button>
          <button type="button" className="editorial-mini-button" onClick={onDiscard} disabled={isSaving}>
            {labels.exitWithoutSaving}
          </button>
          <button type="button" className="editorial-mini-button" onClick={onCancel} disabled={isSaving}>
            {labels.exitCancel}
          </button>
        </div>
      </div>
    </AnnotationModal>
  );
}

function TypeChangeConfirmationModal({
  labels,
  cleanupItems,
  onConfirm,
  onCancel,
}: {
  labels: Labels;
  cleanupItems: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnnotationModal
      title={labels.typeChangeConfirmTitle}
      labels={labels}
      onClose={onCancel}
      panelClassName="editorial-pte-modal__panel--exit"
    >
      <div className="editorial-exit-modal">
        <p>{labels.typeChangeConfirmText}</p>

        {cleanupItems.length > 0 && (
          <ul>
            {cleanupItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}

        <div className="editorial-exit-modal__actions">
          <button type="button" className="editorial-mini-button" onClick={onCancel}>
            {labels.typeChangeCancel}
          </button>
          <button type="button" className="editorial-mini-button editorial-mini-button--danger" onClick={onConfirm}>
            {labels.typeChangeConfirm}
          </button>
        </div>
      </div>
    </AnnotationModal>
  );
}

function Toolbar({
  labels,
  language,
  currentArticleId,
  saveEndpoint,
  assetPreviewUrls,
  onAssetPreview,
  articlesHref = '',
  previewHref = '',
  status = '',
  statusTone = '',
  inspectorId = '',
  isInspectorOpen = false,
  isSaving = false,
  isLocked = false,
  isWorkflowUpdating = false,
  workflowActions = [],
  hasUnsavedChanges = false,
  onToggleInspector,
  onSave,
  onRequestExit,
  onWorkflowAction,
  variant = 'body',
  capabilities,
}: {
  labels: Labels;
  language: ArticleLanguage;
  currentArticleId: string;
  saveEndpoint: string;
  assetPreviewUrls: Record<string, string>;
  onAssetPreview: (assetId: string, url: string) => void;
  articlesHref?: string;
  previewHref?: string;
  status?: string;
  statusTone?: 'success' | 'error' | '';
  inspectorId?: string;
  isInspectorOpen?: boolean;
  isSaving?: boolean;
  isLocked?: boolean;
  isWorkflowUpdating?: boolean;
  workflowActions?: WorkflowAction[];
  hasUnsavedChanges?: boolean;
  onToggleInspector?: () => void;
  onSave?: () => void | Promise<boolean | void>;
  onRequestExit?: () => void;
  onWorkflowAction?: (action: WorkflowAction) => void | Promise<void>;
  variant?: 'body' | 'aside';
  capabilities?: EditorialArticleCapabilities;
}) {
  const editor = useEditor();
  const activeStyle = useEditorSelector(editor, selectors.getActiveStyle);
  const activeListItem = useEditorSelector(editor, selectors.getActiveListItem);
  const activeAnnotations = useEditorSelector(editor, selectors.getActiveAnnotations);
  const selection = useEditorSelector(editor, selectors.getSelection);
  const selectedText = useEditorSelector(editor, selectors.getSelectionText);
  const selectedTextBlocks = useEditorSelector(editor, selectors.getSelectedTextBlocks);
  const isBoldActive = useEditorSelector(editor, selectors.isActiveDecorator('strong'));
  const isItalicActive = useEditorSelector(editor, selectors.isActiveDecorator('em'));
  const isBlockquoteActive = useEditorSelector(editor, selectors.isActiveStyle('blockquote'));
  const isBodyToolbar = variant === 'body';
  const blockStyle = activeStyle === 'h3' || (isBodyToolbar && activeStyle === 'h2') ? activeStyle : 'normal';
  const [annotationModal, setAnnotationModal] = useState<{
    annotationName: AnnotationName;
    activeAnnotation: PortableTextObject | null;
    activePath: AnnotationPath | null;
    selection: EditorSelection;
    hasTextSelection: boolean;
    trigger: HTMLButtonElement | null;
  } | null>(null);
  const [imageModal, setImageModal] = useState<{
    selection: EditorSelection;
    trigger: HTMLButtonElement | null;
  } | null>(null);
  const [imageRowModal, setImageRowModal] = useState<{
    selection: EditorSelection;
    trigger: HTMLButtonElement | null;
  } | null>(null);
  const [videoModal, setVideoModal] = useState<{
    selection: EditorSelection;
    trigger: HTMLButtonElement | null;
  } | null>(null);
  const [asideBoxModal, setAsideBoxModal] = useState<{
    selection: EditorSelection;
    trigger: HTMLButtonElement | null;
  } | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const contextualToolbarRef = useRef<HTMLDivElement | null>(null);
  const hasTextSelection = String(selectedText || '').trim().length > 0;
  const [openMenu, setOpenMenu] = useState<ToolbarMenu | null>(null);
  const [contextualToolbarPosition, setContextualToolbarPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const canUseContextualToolbar = Boolean(
    isBodyToolbar &&
    selection &&
    hasTextSelection &&
    !isLocked &&
    !annotationModal &&
    !imageModal &&
    !imageRowModal &&
    !videoModal &&
    !asideBoxModal
  );

  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && toolbarRef.current?.contains(target)) return;
      if (target instanceof Node && contextualToolbarRef.current?.contains(target)) return;

      setOpenMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  useEffect(() => {
    if (isLocked || isWorkflowUpdating) {
      setOpenMenu(null);
      setContextualToolbarPosition(null);
    }
  }, [isLocked, isWorkflowUpdating]);

  const updateContextualToolbarPosition = useCallback(() => {
    if (!canUseContextualToolbar || typeof window === 'undefined') {
      setContextualToolbarPosition(null);
      return;
    }

    const domSelection = window.getSelection();

    if (!domSelection || domSelection.rangeCount === 0 || domSelection.isCollapsed) {
      setContextualToolbarPosition(null);
      return;
    }

    const range = domSelection.getRangeAt(0);
    const boundingRect = range.getBoundingClientRect();
    const fallbackRect = Array.from(range.getClientRects()).find((rect) => rect.width > 0 || rect.height > 0);
    const targetRect = boundingRect.width > 0 || boundingRect.height > 0 ? boundingRect : fallbackRect;

    if (!targetRect) {
      setContextualToolbarPosition(null);
      return;
    }

    const toolbarWidth = contextualToolbarRef.current?.offsetWidth || 230;
    const toolbarHeight = contextualToolbarRef.current?.offsetHeight || 42;
    const viewportMargin = 12;
    const placeAbove = targetRect.top >= toolbarHeight + viewportMargin + 8;
    const rawTop = placeAbove ? targetRect.top - toolbarHeight - 8 : targetRect.bottom + 8;
    const top = Math.min(
      Math.max(viewportMargin, rawTop),
      Math.max(viewportMargin, window.innerHeight - toolbarHeight - viewportMargin)
    );
    const selectionCenter = targetRect.left + targetRect.width / 2;
    const left = Math.min(
      Math.max(viewportMargin + toolbarWidth / 2, selectionCenter),
      Math.max(viewportMargin + toolbarWidth / 2, window.innerWidth - toolbarWidth / 2 - viewportMargin)
    );

    setContextualToolbarPosition({ top, left });
  }, [canUseContextualToolbar]);

  useEffect(() => {
    if (!canUseContextualToolbar) {
      setContextualToolbarPosition(null);
      if (openMenu === 'contextLink') {
        setOpenMenu(null);
      }
      return undefined;
    }

    let frameId = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateContextualToolbarPosition);
    };

    scheduleUpdate();
    document.addEventListener('selectionchange', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('selectionchange', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
    };
  }, [canUseContextualToolbar, openMenu, selectedText, updateContextualToolbarPosition]);

  const focus = () => editor.send({ type: 'focus' });
  const send = (event: Parameters<typeof editor.send>[0]) => {
    editor.send(event);
    focus();
  };
  const toggleMenu = (menu: ToolbarMenu) => {
    if (isLocked) return;

    setOpenMenu((current) => current === menu ? null : menu);
  };
  const runToolbarAction = (action: () => void) => {
    if (isLocked) return;

    setOpenMenu(null);
    action();
  };
  const runDocumentAction = (action: WorkflowAction) => {
    if (isLocked || isWorkflowUpdating) return;

    setOpenMenu(null);
    onWorkflowAction?.(action);
  };
  const runContextualTextAction = (action: () => void) => {
    if (!canUseContextualToolbar || !selection) return;

    setOpenMenu(null);
    restoreSelection(selection);
    action();
  };
  const openContextualAnnotationModal = (annotationName: AnnotationName, trigger: HTMLButtonElement) => {
    if (!canUseContextualToolbar || !selection) return;

    setOpenMenu(null);
    restoreSelection(selection);
    openAnnotationModal(annotationName, trigger);
  };
  const handleExitClick = () => {
    if (isLocked) return;

    if (onRequestExit) {
      onRequestExit();
      return;
    }

    if (articlesHref) {
      window.location.assign(articlesHref);
    }
  };
  const getActiveAnnotation = (annotationName: AnnotationName | 'link') =>
    activeAnnotations.find((annotation) => annotation._type === annotationName) || null;
  const getActiveAnnotationPath = (annotation: PortableTextObject | null): AnnotationPath | null => {
    const key = typeof annotation?._key === 'string' ? annotation._key : '';
    if (!key) return null;

    for (const block of selectedTextBlocks) {
      const markDefs = Array.isArray(block.node.markDefs) ? block.node.markDefs : [];
      if (markDefs.some((markDef) => markDef?._key === key)) {
        return [...block.path, 'markDefs', { _key: key }] as AnnotationPath;
      }
    }

    return null;
  };
  const restoreSelection = (selectionSnapshot: EditorSelection) => {
    if (selectionSnapshot) {
      editor.send({
        type: 'select',
        at: selectionSnapshot,
      });
    }
  };
  const openAnnotationModal = (annotationName: AnnotationName, trigger: HTMLButtonElement) => {
    const activeAnnotation = getActiveAnnotation(annotationName);
    const canOpen = hasTextSelection || Boolean(activeAnnotation);

    if (!canOpen) return;

    setAnnotationModal({
      annotationName,
      activeAnnotation,
      activePath: getActiveAnnotationPath(activeAnnotation),
      selection,
      hasTextSelection,
      trigger,
    });
  };
  const closeAnnotationModal = () => {
    const trigger = annotationModal?.trigger;
    setAnnotationModal(null);

    window.setTimeout(() => {
      trigger?.focus();
    }, 0);
  };
  const applyAnnotation = (value: Record<string, unknown>) => {
    if (!annotationModal) return;

    restoreSelection(annotationModal.selection);

    if (annotationModal.activePath) {
      send({
        type: 'annotation.set',
        at: annotationModal.activePath,
        props: value,
      });
    } else if (annotationModal.hasTextSelection && annotationModal.selection) {
      send({
        type: 'annotation.add',
        at: annotationModal.selection,
        annotation: {
          name: annotationModal.annotationName,
          value,
        },
      });
    }

    setAnnotationModal(null);
  };
  const removeAnnotation = () => {
    if (!annotationModal) return;

    restoreSelection(annotationModal.selection);
    send({
      type: 'annotation.remove',
      ...(annotationModal.selection ? { at: annotationModal.selection } : {}),
      annotation: {
        name: annotationModal.annotationName,
      },
    });
    setAnnotationModal(null);
  };
  const openImageModal = (trigger: HTMLButtonElement) => {
    setImageModal({
      selection,
      trigger,
    });
  };
  const closeImageModal = () => {
    const trigger = imageModal?.trigger;
    setImageModal(null);

    window.setTimeout(() => {
      trigger?.focus();
    }, 0);
  };
  const openImageRowModal = (trigger: HTMLButtonElement) => {
    setImageRowModal({
      selection,
      trigger,
    });
  };
  const closeImageRowModal = () => {
    const trigger = imageRowModal?.trigger;
    setImageRowModal(null);

    window.setTimeout(() => {
      trigger?.focus();
    }, 0);
  };
  const openVideoModal = (trigger: HTMLButtonElement) => {
    if (!isBodyToolbar) return;

    setVideoModal({
      selection,
      trigger,
    });
  };
  const closeVideoModal = () => {
    const trigger = videoModal?.trigger;
    setVideoModal(null);

    window.setTimeout(() => {
      trigger?.focus();
    }, 0);
  };
  const openAsideBoxModal = (trigger: HTMLButtonElement) => {
    if (!isBodyToolbar) return;

    setAsideBoxModal({
      selection,
      trigger,
    });
  };
  const closeAsideBoxModal = () => {
    const trigger = asideBoxModal?.trigger;
    setAsideBoxModal(null);

    window.setTimeout(() => {
      trigger?.focus();
    }, 0);
  };
  const insertImageBlock = (value: Record<string, unknown>) => {
    if (!imageModal) return;

    restoreSelection(imageModal.selection);
    editor.send({
      type: 'insert.block object',
      placement: 'after',
      blockObject: {
        name: 'image',
        value,
      },
    });
    editor.send({ type: 'focus' });
    setImageModal(null);
  };
  const insertImageRowBlock = (value: Record<string, unknown>) => {
    if (!imageRowModal) return;

    restoreSelection(imageRowModal.selection);
    editor.send({
      type: 'insert.block object',
      placement: 'after',
      blockObject: {
        name: 'imageRow',
        value,
      },
    });
    editor.send({ type: 'focus' });
    setImageRowModal(null);
  };
  const insertVideoBlock = (value: Record<string, unknown>) => {
    if (!videoModal || !isBodyToolbar) return;

    restoreSelection(videoModal.selection);
    editor.send({
      type: 'insert.block object',
      placement: 'after',
      blockObject: {
        name: 'video',
        value,
      },
    });
    editor.send({ type: 'focus' });
    setVideoModal(null);
  };
  const insertAsideBoxBlock = (value: Record<string, unknown>) => {
    if (!asideBoxModal || !isBodyToolbar) return;

    restoreSelection(asideBoxModal.selection);
    editor.send({
      type: 'insert.block object',
      placement: 'after',
      blockObject: {
        name: 'asideBox',
        value,
      },
    });
    editor.send({ type: 'focus' });
    setAsideBoxModal(null);
  };
  const insertMenuLabels = language === 'en'
    ? {
      image: 'Image',
      imageRow: 'Image series',
      video: 'Video',
      asideBox: 'Info box',
    }
    : {
      image: 'Immagine',
      imageRow: 'Serie immagini',
      video: 'Video',
      asideBox: 'Box informativo',
    };

  return (
    <div
      className={`editorial-pte-toolbar editorial-pte-toolbar--${variant}`}
      role="toolbar"
      aria-label={labels.content}
      data-can-edit-workflow={capabilities?.canEditWorkflow ? 'true' : undefined}
      data-can-publish={capabilities?.canPublish ? 'true' : undefined}
      data-can-unpublish={capabilities?.canUnpublish ? 'true' : undefined}
      data-save-locked={isLocked ? 'true' : undefined}
      ref={toolbarRef}
    >
      <div className="editorial-pte-toolbar__content-tools">
        <div className="editorial-pte-toolbar__menu">
        <button
          className="editorial-pte-toolbar__menu-trigger"
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'structure'}
          title={labels.toolbarStructure}
          disabled={isLocked}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMenu('structure')}
        >
          {labels.toolbarStructure}
          <span aria-hidden="true">▾</span>
        </button>
        <div className="editorial-pte-toolbar__menu-panel" role="menu" hidden={openMenu !== 'structure'}>
          <button
            className="editorial-pte-toolbar__menu-item"
            type="button"
            role="menuitem"
            aria-pressed={blockStyle === 'normal'}
            data-active={blockStyle === 'normal' ? 'true' : undefined}
            disabled={isLocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runToolbarAction(() => send({ type: 'style.toggle', style: 'normal' }))}
          >
            {labels.normal}
          </button>
          <button
            className="editorial-pte-toolbar__menu-item"
            type="button"
            role="menuitem"
            aria-pressed={blockStyle === 'h3'}
            data-active={blockStyle === 'h3' ? 'true' : undefined}
            disabled={isLocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runToolbarAction(() => send({ type: 'style.toggle', style: 'h3' }))}
          >
            {labels.h3}
          </button>
          {isBodyToolbar && (
            <button
              className="editorial-pte-toolbar__menu-item"
              type="button"
              role="menuitem"
              aria-pressed={blockStyle === 'h2'}
              data-active={blockStyle === 'h2' ? 'true' : undefined}
              disabled={isLocked}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runToolbarAction(() => send({ type: 'style.toggle', style: 'h2' }))}
            >
              {labels.h2}
            </button>
          )}
        </div>
        </div>

        <div className="editorial-pte-toolbar__menu">
        <button
          className="editorial-pte-toolbar__menu-trigger"
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'text'}
          title={labels.toolbarText}
          disabled={isLocked}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMenu('text')}
        >
          {labels.toolbarText}
          <span aria-hidden="true">▾</span>
        </button>
        <div className="editorial-pte-toolbar__menu-panel" role="menu" hidden={openMenu !== 'text'}>
          <button
            className="editorial-pte-toolbar__menu-item"
            type="button"
            role="menuitem"
            aria-pressed={isBoldActive}
            data-active={isBoldActive ? 'true' : undefined}
            title={labels.bold}
            disabled={isLocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runToolbarAction(() => send({ type: 'decorator.toggle', decorator: 'strong' }))}
          >
            {labels.bold}
          </button>
          <button
            className="editorial-pte-toolbar__menu-item"
            type="button"
            role="menuitem"
            aria-pressed={isItalicActive}
            data-active={isItalicActive ? 'true' : undefined}
            title={labels.italic}
            disabled={isLocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runToolbarAction(() => send({ type: 'decorator.toggle', decorator: 'em' }))}
          >
            {labels.italic}
          </button>
          {isBodyToolbar && (
            <button
              className="editorial-pte-toolbar__menu-item"
              type="button"
              role="menuitem"
              aria-pressed={isBlockquoteActive}
              data-active={isBlockquoteActive ? 'true' : undefined}
              title={labels.quote}
              disabled={isLocked}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runToolbarAction(() => send({ type: 'style.toggle', style: 'blockquote' }))}
          >
              {labels.quote}
            </button>
          )}
          <button
            className="editorial-pte-toolbar__menu-item"
            type="button"
            role="menuitem"
            aria-pressed={activeListItem === 'bullet'}
            data-active={activeListItem === 'bullet' ? 'true' : undefined}
            title={labels.bullet}
            disabled={isLocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runToolbarAction(() => send({ type: 'list item.toggle', listItem: 'bullet' }))}
          >
            {labels.bullet}
          </button>
          {isBodyToolbar && (
            <button
              className="editorial-pte-toolbar__menu-item"
              type="button"
              role="menuitem"
              aria-pressed={activeListItem === 'number'}
              data-active={activeListItem === 'number' ? 'true' : undefined}
              title={labels.number}
              disabled={isLocked}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runToolbarAction(() => send({ type: 'list item.toggle', listItem: 'number' }))}
            >
              {labels.number}
            </button>
          )}
        </div>
        </div>

        <div className="editorial-pte-toolbar__menu">
        <button
          className="editorial-pte-toolbar__menu-trigger"
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'link'}
          title={labels.toolbarLink}
          disabled={isLocked}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMenu('link')}
        >
          {labels.toolbarLink}
          <span aria-hidden="true">▾</span>
        </button>
        <div className="editorial-pte-toolbar__menu-panel" role="menu" hidden={openMenu !== 'link'}>
          <button
            className="editorial-pte-toolbar__menu-item"
            type="button"
            role="menuitem"
            aria-pressed={Boolean(getActiveAnnotation('link'))}
            data-active={getActiveAnnotation('link') ? 'true' : undefined}
            title={labels.externalLink}
            disabled={isLocked || !(hasTextSelection || Boolean(getActiveAnnotation('link')))}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => runToolbarAction(() => openAnnotationModal('link', event.currentTarget))}
          >
            {labels.externalLink}
          </button>

          {referenceAnnotationControls.map((control) => {
            const label = getAnnotationLabel(control.name, labels);
            const activeAnnotation = getActiveAnnotation(control.name);
            const canOpen = hasTextSelection || Boolean(activeAnnotation);
            const isOpen = annotationModal?.annotationName === control.name;

            return (
              <button
                className="editorial-pte-toolbar__menu-item"
                type="button"
                role="menuitem"
                key={control.name}
                aria-pressed={Boolean(activeAnnotation)}
                aria-expanded={isOpen}
                data-active={activeAnnotation ? 'true' : undefined}
                title={canOpen ? label : labels.annotationNoSelection}
                disabled={isLocked || !canOpen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => runToolbarAction(() => {
                  if (isOpen) {
                    closeAnnotationModal();
                  } else {
                    openAnnotationModal(control.name, event.currentTarget);
                  }
                })}
              >
                {label}
              </button>
            );
          })}

          {(() => {
            const annotationName: AnnotationName = 'pageLink';
            const label = getAnnotationLabel(annotationName, labels);
            const activeAnnotation = getActiveAnnotation(annotationName);
            const canOpen = hasTextSelection || Boolean(activeAnnotation);
            const isOpen = annotationModal?.annotationName === annotationName;

            return (
              <button
                className="editorial-pte-toolbar__menu-item"
                type="button"
                role="menuitem"
                aria-pressed={Boolean(activeAnnotation)}
                aria-expanded={isOpen}
                data-active={activeAnnotation ? 'true' : undefined}
                title={canOpen ? label : labels.annotationNoSelection}
                disabled={isLocked || !canOpen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => runToolbarAction(() => {
                  if (isOpen) {
                    closeAnnotationModal();
                  } else {
                    openAnnotationModal(annotationName, event.currentTarget);
                  }
                })}
              >
                {label}
              </button>
            );
          })()}
        </div>
        </div>

        <div className="editorial-pte-toolbar__menu">
        <button
          className="editorial-pte-toolbar__menu-trigger"
          type="button"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'insert'}
          title={labels.toolbarInsert}
          disabled={isLocked}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMenu('insert')}
        >
          {labels.toolbarInsert}
          <span aria-hidden="true">▾</span>
        </button>
        <div className="editorial-pte-toolbar__menu-panel editorial-pte-toolbar__menu-panel--end" role="menu" hidden={openMenu !== 'insert'}>
          <button
            className="editorial-pte-toolbar__menu-item"
            type="button"
            role="menuitem"
            aria-expanded={Boolean(imageModal)}
            title={insertMenuLabels.image}
            disabled={isLocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => runToolbarAction(() => openImageModal(event.currentTarget))}
          >
            {insertMenuLabels.image}
          </button>
          <button
            className="editorial-pte-toolbar__menu-item"
            type="button"
            role="menuitem"
            aria-expanded={Boolean(imageRowModal)}
            title={insertMenuLabels.imageRow}
            disabled={isLocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => runToolbarAction(() => openImageRowModal(event.currentTarget))}
          >
            {insertMenuLabels.imageRow}
          </button>
          {isBodyToolbar && (
            <>
              <button
                className="editorial-pte-toolbar__menu-item"
                type="button"
                role="menuitem"
                aria-expanded={Boolean(videoModal)}
                title={insertMenuLabels.video}
                disabled={isLocked}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => runToolbarAction(() => openVideoModal(event.currentTarget))}
              >
                {insertMenuLabels.video}
              </button>
              <button
                className="editorial-pte-toolbar__menu-item"
                type="button"
                role="menuitem"
                aria-expanded={Boolean(asideBoxModal)}
                title={insertMenuLabels.asideBox}
                disabled={isLocked}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => runToolbarAction(() => openAsideBoxModal(event.currentTarget))}
              >
                {insertMenuLabels.asideBox}
              </button>
            </>
          )}
        </div>
        </div>
      </div>

      {isBodyToolbar && (
        <div className="editorial-pte-toolbar__document-actions">
          <p className="editorial-article-editor__state" data-tone={statusTone || undefined} aria-live="polite">
            <span aria-hidden="true">●</span>
            {status || labels.draftStatus}
          </p>
          <button
            className="editorial-article-editor__settings-toggle"
            type="button"
            aria-expanded={isInspectorOpen}
            aria-controls={inspectorId || undefined}
            data-active={isInspectorOpen ? 'true' : undefined}
            disabled={isLocked}
            onClick={onToggleInspector}
          >
            {isInspectorOpen ? labels.settingsButtonActive : labels.settingsButton}
          </button>
          <a
            className="editorial-article-editor__settings-toggle editorial-article-editor__preview-action"
            href={previewHref}
            aria-disabled={isLocked ? 'true' : undefined}
            onClick={(event) => {
              if (isLocked) {
                event.preventDefault();
              }
            }}
          >
            {labels.preview}
          </a>
          <button className="editorial-button" type="button" onClick={onSave} disabled={isSaving || isLocked}>
            {isLocked ? labels.saving : labels.save}
          </button>
          {workflowActions.length > 0 && (
            <div className="editorial-pte-toolbar__menu editorial-pte-toolbar__document-menu">
              <button
                className="editorial-pte-toolbar__menu-trigger editorial-pte-toolbar__menu-trigger--icon"
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === 'document'}
                aria-label={labels.documentActions}
                title={labels.documentActions}
                disabled={isLocked || isWorkflowUpdating}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleMenu('document')}
              >
                <BlockOptionsIcon />
              </button>
              <div
                className="editorial-pte-toolbar__menu-panel editorial-pte-toolbar__menu-panel--end"
                role="menu"
                hidden={openMenu !== 'document'}
              >
                {workflowActions.map((action) => (
                  <button
                    className="editorial-pte-toolbar__menu-item"
                    type="button"
                    role="menuitem"
                    key={action}
                    disabled={isLocked || isWorkflowUpdating}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runDocumentAction(action)}
                  >
                    {isWorkflowUpdating ? labels.workflowUpdating : getWorkflowActionLabel(action, labels)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className="editorial-article-editor__exit"
            type="button"
            aria-label={labels.backToArticles}
            title={labels.backToArticles}
            data-dirty={hasUnsavedChanges ? 'true' : undefined}
            disabled={isLocked}
            onClick={handleExitClick}
          >
            ✕
          </button>
        </div>
      )}

      {canUseContextualToolbar && contextualToolbarPosition && (
        <div
          ref={contextualToolbarRef}
          className="editorial-pte-context-toolbar"
          style={{
            top: `${contextualToolbarPosition.top}px`,
            left: `${contextualToolbarPosition.left}px`,
          }}
          role="toolbar"
          aria-label={labels.toolbarText}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            className="editorial-pte-context-toolbar__button"
            type="button"
            aria-label={labels.bold}
            title={labels.bold}
            aria-pressed={isBoldActive}
            data-active={isBoldActive ? 'true' : undefined}
            onClick={() => runContextualTextAction(() => send({ type: 'decorator.toggle', decorator: 'strong' }))}
          >
            <strong aria-hidden="true">B</strong>
          </button>
          <button
            className="editorial-pte-context-toolbar__button"
            type="button"
            aria-label={labels.italic}
            title={labels.italic}
            aria-pressed={isItalicActive}
            data-active={isItalicActive ? 'true' : undefined}
            onClick={() => runContextualTextAction(() => send({ type: 'decorator.toggle', decorator: 'em' }))}
          >
            <em aria-hidden="true">I</em>
          </button>
          <div className="editorial-pte-context-toolbar__menu">
            <button
              className="editorial-pte-context-toolbar__button editorial-pte-context-toolbar__button--link"
              type="button"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'contextLink'}
              aria-label={labels.toolbarLink}
              title={labels.toolbarLink}
              data-active={contextualLinkAnnotationOrder.some((annotationName) => getActiveAnnotation(annotationName)) ? 'true' : undefined}
              onClick={() => toggleMenu('contextLink')}
            >
              {labels.toolbarLink}
              <span aria-hidden="true">▾</span>
            </button>
            <div
              className="editorial-pte-context-toolbar__menu-panel"
              role="menu"
              hidden={openMenu !== 'contextLink'}
            >
              {contextualLinkAnnotationOrder.map((annotationName) => {
                const label = getAnnotationLabel(annotationName, labels);
                const activeAnnotation = getActiveAnnotation(annotationName);
                const isOpen = annotationModal?.annotationName === annotationName;

                return (
                  <button
                    className="editorial-pte-toolbar__menu-item"
                    type="button"
                    role="menuitem"
                    key={annotationName}
                    aria-pressed={Boolean(activeAnnotation)}
                    aria-expanded={isOpen}
                    data-active={activeAnnotation ? 'true' : undefined}
                    title={label}
                    onClick={(event) => openContextualAnnotationModal(annotationName, event.currentTarget)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {annotationModal && (
        <AnnotationModal
          title={`${getAnnotationIcon(annotationModal.annotationName)} ${getAnnotationLabel(annotationModal.annotationName, labels)}`}
          labels={labels}
          onClose={closeAnnotationModal}
        >
          {annotationModal.annotationName === 'link' ? (
            <ExternalLinkPicker
              label={getAnnotationLabel(annotationModal.annotationName, labels)}
              activeAnnotation={annotationModal.activeAnnotation}
              labels={labels}
              onApply={applyAnnotation}
              onRemove={removeAnnotation}
            />
          ) : annotationModal.annotationName === 'pageLink' ? (
            <PageLinkPicker
              label={getAnnotationLabel(annotationModal.annotationName, labels)}
              activeAnnotation={annotationModal.activeAnnotation}
              labels={labels}
              onApply={applyAnnotation}
              onRemove={removeAnnotation}
            />
          ) : (
            <ReferenceAnnotationPicker
              annotationName={annotationModal.annotationName}
              label={getAnnotationLabel(annotationModal.annotationName, labels)}
              activeAnnotation={annotationModal.activeAnnotation}
              currentArticleId={currentArticleId}
              language={language}
              labels={labels}
              onApply={applyAnnotation}
              onRemove={removeAnnotation}
            />
          )}
        </AnnotationModal>
      )}

      {imageModal && (
        <BodyImageModal
          mode="insert"
          labels={labels}
          saveEndpoint={saveEndpoint}
          assetPreviewUrls={assetPreviewUrls}
          onAssetPreview={onAssetPreview}
          onApply={insertImageBlock}
          onClose={closeImageModal}
        />
      )}
      {imageRowModal && (
        <ImageRowModal
          mode="insert"
          labels={labels}
          saveEndpoint={saveEndpoint}
          assetPreviewUrls={assetPreviewUrls}
          onAssetPreview={onAssetPreview}
          onApply={insertImageRowBlock}
          onClose={closeImageRowModal}
        />
      )}
      {videoModal && isBodyToolbar && (
        <VideoModal
          mode="insert"
          labels={labels}
          onApply={insertVideoBlock}
          onClose={closeVideoModal}
        />
      )}
      {asideBoxModal && isBodyToolbar && (
        <AsideBoxModal
          mode="insert"
          labels={labels}
          language={language}
          currentArticleId={currentArticleId}
          saveEndpoint={saveEndpoint}
          assetPreviewUrls={assetPreviewUrls}
          onAssetPreview={onAssetPreview}
          onApply={insertAsideBoxBlock}
          onClose={closeAsideBoxModal}
        />
      )}
    </div>
  );
}

function BlockOptionsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <circle cx="7" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="17" cy="12" r="1.8" />
    </svg>
  );
}

function countCharacters(value: string) {
  return [...String(value || '')].length;
}

function CharacterCounter({
  value,
  max,
  warning,
}: {
  value: string;
  max: number;
  warning: string;
}) {
  const count = countCharacters(value);
  const isWarning = count > max;

  return (
    <p className="editorial-character-count" data-warning={isWarning ? 'true' : 'false'}>
      {count} / {max}
      {isWarning ? ` · ${warning}` : ''}
    </p>
  );
}

function normalizeSingleLineValue(value: string, newlineReplacement: 'space' | 'remove') {
  const replacement = newlineReplacement === 'space' ? ' ' : '';

  return value.replace(/[\r\n]+/g, replacement);
}

function AutoGrowTextField({
  id,
  value,
  onChange,
  rows = 2,
  maxRows = 6,
  maxLength,
  ariaLabel,
  placeholder,
  singleLine = false,
  newlineReplacement = 'space',
  className = '',
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxRows?: number;
  maxLength?: number;
  ariaLabel?: string;
  placeholder?: string;
  singleLine?: boolean;
  newlineReplacement?: 'space' | 'remove';
  className?: string;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';

    const styles = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
    const verticalChrome = textarea.offsetHeight - textarea.clientHeight;
    const maxHeight = (lineHeight * maxRows) + verticalChrome;
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxRows, value]);

  return (
    <textarea
      ref={textareaRef}
      id={id}
      className={`editorial-autogrow-field${className ? ` ${className}` : ''}`}
      value={value}
      rows={rows}
      maxLength={maxLength}
      aria-label={ariaLabel}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={(event) => {
        if (singleLine && event.key === 'Enter') {
          event.preventDefault();
        }
      }}
      onChange={(event) => {
        const nextValue = singleLine
          ? normalizeSingleLineValue(event.target.value, newlineReplacement)
          : event.target.value;

        onChange(nextValue);
      }}
    />
  );
}

function ArticleSettingsDrawer({
  id,
  title,
  closeLabel,
  children,
  onClose,
  disabled = false,
}: {
  id: string;
  title: string;
  closeLabel: string;
  children: ReactNode;
  onClose: () => void;
  disabled?: boolean;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="editorial-article-editor__drawer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        className="editorial-article-editor__inspector"
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <div className="editorial-article-editor__drawer-header">
          <div>
            <p className="editorial-kicker">{title}</p>
            <h2 id={`${id}-title`}>{title}</h2>
          </div>
          <button
            type="button"
            className="editorial-mini-button editorial-article-editor__drawer-close"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
          >
            ×
          </button>
        </div>
        <fieldset className="editorial-article-editor__drawer-fieldset" disabled={disabled}>
          {children}
        </fieldset>
      </aside>
    </div>,
    document.body
  );
}

type SelectedFeaturedImageFile = {
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
};

function formatFileSize(size: number | null | undefined) {
  if (!size || !Number.isFinite(size)) return '';

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: null, height: null });
    };

    image.src = objectUrl;
  });
}

function getFileValidationError(file: File | null | undefined, labels: Labels) {
  if (!file) return labels.featuredImageMissingFile;

  if (!allowedFeaturedImageMimeTypes.has(file.type)) {
    return labels.featuredImageInvalidType;
  }

  if (file.size <= 0 || file.size > featuredImageMaxFileSize) {
    return labels.featuredImageInvalidSize;
  }

  return '';
}

function getAssetMetadataLabel(asset: EditableArticleFeaturedImageAsset | null, labels: Labels) {
  if (!asset) return labels.featuredImageMetadataUnavailable;

  const dimensions = asset.metadata.dimensions;
  const parts = [
    dimensions?.width && dimensions?.height ? `${dimensions.width} × ${dimensions.height}px` : '',
    formatFileSize(asset.size),
    asset.mimeType,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : labels.featuredImageMetadataUnavailable;
}

function getSelectedFileMetadataLabel(selection: SelectedFeaturedImageFile | null) {
  if (!selection) return '';

  const parts = [
    selection.width && selection.height ? `${selection.width} × ${selection.height}px` : '',
    formatFileSize(selection.file.size),
    selection.file.type,
  ].filter(Boolean);

  return parts.join(' · ');
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function createUiKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasReviewData(article: EditableArticle) {
  return Boolean(
    article.gameInfo.releaseYear !== null ||
    article.gameInfo.mediaFormat.length > 0 ||
    article.gameInfo.cover?.asset ||
    article.gameInfo.cover?.alt.trim() ||
    ratingFields.some((field) => article.rating[field] !== null) ||
    article.rating.summary.trim() ||
    article.pros.some((item) => item.trim()) ||
    article.cons.some((item) => item.trim())
  );
}

function getTypeChangeCleanupItems(
  article: EditableArticle,
  nextType: ArticleType,
  labels: Labels,
  hasPendingGameCoverFile: boolean
) {
  const items = new Set<string>();

  if (nextType !== 'review') {
    if (
      article.gameInfo.releaseYear !== null ||
      article.gameInfo.mediaFormat.length > 0 ||
      article.gameInfo.cover?.asset ||
      article.gameInfo.cover?.alt.trim() ||
      hasPendingGameCoverFile
    ) {
      items.add(labels.gameData);
    }

    if (ratingFields.some((field) => article.rating[field] !== null) || article.rating.summary.trim()) {
      items.add(labels.ratingSection);
    }

    if (article.pros.some((item) => item.trim())) items.add(labels.pros);
    if (article.cons.some((item) => item.trim())) items.add(labels.cons);
    if (article.genres.length > 0) items.add(labels.genres);
    if (article.developers.length > 0) items.add(labels.developers);
    if (article.publishers.length > 0) items.add(labels.publishers);
    if (article.modes.length > 0) items.add(labels.modes);
    if (article.series.length > 0) items.add(labels.gameSeries);
  }

  if (nextType !== 'hardware' && article.manufacturer.length > 0) {
    items.add(labels.manufacturer);
  }

  return Array.from(items);
}

function applyTypeSpecificCleanup(article: EditableArticle, nextType: ArticleType): EditableArticle {
  return {
    ...article,
    type: nextType,
    ...(nextType !== 'review'
      ? {
          genres: [],
          developers: [],
          publishers: [],
          modes: [],
          series: [],
          gameInfo: createEmptyGameInfo(),
          rating: createEmptyRating(),
          pros: [],
          cons: [],
        }
      : {}),
    ...(nextType !== 'hardware' ? { manufacturer: [] } : {}),
  };
}

function getRatingLabel(field: RatingField, labels: Labels) {
  if (field === 'grafica') return labels.grafica;
  if (field === 'sonoro') return labels.sonoro;
  if (field === 'giocabilita') return labels.giocabilita;
  if (field === 'longevita') return labels.longevita;

  return labels.overall;
}

function getAnnotationLabel(annotationName: AnnotationName, labels: Labels) {
  if (annotationName === 'link') return labels.externalLink;
  if (annotationName === 'internalLink') return labels.internalLink;
  if (annotationName === 'platformLink') return labels.platformLink;
  if (annotationName === 'creatorLink') return labels.creatorLink;
  if (annotationName === 'companyLink') return labels.companyLink;
  if (annotationName === 'taxonomyLink') return labels.taxonomyLink;

  return labels.pageLink;
}

function getActiveAnnotationTarget(annotation: PortableTextObject | null | undefined) {
  if (!annotation) return '';

  if (annotation._type === 'link') {
    return typeof annotation.href === 'string' ? annotation.href : '';
  }

  if (annotation._type === 'pageLink') {
    return typeof annotation.path === 'string' ? annotation.path : '';
  }

  const reference = annotation.reference;
  if (reference && typeof reference === 'object' && '_ref' in reference) {
    return typeof reference._ref === 'string' ? reference._ref : '';
  }

  return '';
}

type MultiSelectOption<Value extends string> = {
  value: Value;
  label: string;
};

function getMultiSelectSummary<Value extends string>(
  values: Value[],
  options: MultiSelectOption<Value>[],
  placeholder: string
) {
  const labels = values
    .map((value) => options.find((option) => option.value === value)?.label || '')
    .filter(Boolean);

  if (labels.length === 0) return placeholder;
  if (labels.length <= 2) return labels.join(', ');

  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
}

function MultiSelect<Value extends string>({
  label,
  placeholder,
  values,
  options,
  onChange,
  removeLabel,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  values: Value[];
  options: MultiSelectOption<Value>[];
  onChange: (values: Value[]) => void;
  removeLabel: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const summary = getMultiSelectSummary(values, options, placeholder);
  const selectedOptions = options.filter((option) => values.includes(option.value));

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  const selectValue = (value: Value) => {
    if (disabled) return;

    if (!values.includes(value)) {
      onChange([...values, value]);
    }
    setIsOpen(false);
  };

  const removeValue = (value: Value) => {
    if (disabled) return;

    onChange(values.filter((item) => item !== value));
  };

  return (
    <div className="editorial-multiselect" ref={rootRef}>
      <button
        type="button"
        className="editorial-multiselect__trigger"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{summary}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {isOpen && (
        <div
          className="editorial-multiselect__menu"
          id={menuId}
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
        >
          {options.map((option) => {
            const isSelected = values.includes(option.value);

            return (
              <button
                type="button"
                className="editorial-multiselect__option"
                key={option.value}
                onClick={() => selectValue(option.value)}
                disabled={disabled || isSelected}
                aria-selected={isSelected}
                role="option"
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {selectedOptions.length > 0 && (
        <div className="editorial-multiselect__chips" aria-label={label}>
          {selectedOptions.map((option) => (
            <button
              type="button"
              className="editorial-multiselect__chip"
              key={option.value}
              onClick={() => removeValue(option.value)}
              disabled={disabled}
              aria-label={`${removeLabel}: ${option.label}`}
            >
              <span>{option.label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getRootArticleId(value: string) {
  return value.startsWith('drafts.') ? value.slice('drafts.'.length) : value;
}

function RelationPicker({
  label,
  kind,
  values,
  onChange,
  language,
  currentArticleId,
  multiple = true,
  labels,
  disabled = false,
}: {
  label: string;
  kind: RelationKind;
  values: EditableArticleReference[];
  onChange: (values: EditableArticleReference[]) => void;
  language: ArticleLanguage;
  currentArticleId: string;
  multiple?: boolean;
  labels: Labels;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<EditableArticleReference[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();
  const searchId = useId();
  const selectedIds = useMemo(() => new Set(values.map((value) => value.id)), [values]);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setStatus('loading');

      try {
        const params = new URLSearchParams({
          kind,
          q: query,
          language,
          limit: '12',
          currentArticleId,
        });
        const response = await fetch(`/api/editor/references?${params.toString()}`, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        const result = await response.json();

        if (!response.ok || !result?.ok || !Array.isArray(result.items)) {
          throw new Error(result?.error || 'reference_search_failed');
        }

        setItems(result.items);
        setStatus('idle');
      } catch (error) {
        if (controller.signal.aborted) return;
        setItems([]);
        setStatus('error');
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [currentArticleId, isOpen, kind, language, query]);

  const summary = values.length > 0
    ? values.map((value) => value.label).slice(0, 2).join(', ') + (values.length > 2 ? ` +${values.length - 2}` : '')
    : labels.relationSearchPlaceholder;

  const selectItem = (item: EditableArticleReference) => {
    if (disabled) return;

    if (selectedIds.has(item.id)) {
      setIsOpen(false);
      return;
    }

    onChange(multiple ? [...values, item] : [item]);
    setIsOpen(false);
    setQuery('');
  };

  const removeItem = (id: string) => {
    if (disabled) return;

    onChange(values.filter((value) => value.id !== id));
  };

  return (
    <div className="editorial-relation-picker" ref={rootRef}>
      <button
        type="button"
        className="editorial-multiselect__trigger"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{summary}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {values.length > 0 && (
        <div className="editorial-relation-picker__chips" aria-label={label}>
          {values.map((value) => (
            <button
              type="button"
              className="editorial-relation-picker__chip"
              key={value.id}
              onClick={() => removeItem(value.id)}
              disabled={disabled}
              aria-label={`${labels.relationRemoveValue}: ${value.label}`}
            >
              <span>{value.label}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && (
        <div className="editorial-relation-picker__panel">
          <label className="editorial-relation-picker__search" htmlFor={searchId}>
            <span className="sr-only">{label}</span>
            <input
              id={searchId}
              value={query}
              placeholder={labels.relationSearchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div
            className="editorial-relation-picker__menu"
            id={listboxId}
            role="listbox"
            aria-label={label}
            aria-multiselectable={multiple ? 'true' : undefined}
          >
            {status === 'loading' && (
              <p className="editorial-relation-picker__state">{labels.relationLoading}</p>
            )}
            {status === 'error' && (
              <p className="editorial-relation-picker__state" data-tone="error">
                {labels.relationSearchError}
              </p>
            )}
            {status !== 'loading' && status !== 'error' && items.length === 0 && (
              <p className="editorial-relation-picker__state">{labels.relationNoResults}</p>
            )}
            {status !== 'error' && items.map((item) => {
              const isSelected = selectedIds.has(item.id);

              return (
                <button
                  type="button"
                  className="editorial-relation-picker__option"
                  key={item.id}
                  onClick={() => selectItem(item)}
                  disabled={disabled || isSelected}
                  aria-selected={isSelected}
                  role="option"
                >
                  <span>{item.label}</span>
                  {item.secondaryLabel && <small>{item.secondaryLabel}</small>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewStringListEditor({
  title,
  values,
  labels,
  onChange,
  disabled = false,
}: {
  title: string;
  values: string[];
  labels: Labels;
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const [itemKeys, setItemKeys] = useState(() => values.map(() => createUiKey()));

  useEffect(() => {
    setItemKeys((current) => values.map((_, index) => current[index] || createUiKey()));
  }, [values.length]);

  const updateItem = (index: number, value: string) => {
    if (disabled) return;

    const nextValues = [...values];
    nextValues[index] = value;
    onChange(nextValues);
  };

  const addItem = () => {
    if (disabled) return;

    onChange([...values, '']);
    setItemKeys((current) => [...current, createUiKey()]);
  };

  const removeItem = (index: number) => {
    if (disabled) return;

    onChange(values.filter((_, itemIndex) => itemIndex !== index));
    setItemKeys((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    if (disabled) return;

    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= values.length) return;

    const nextValues = [...values];
    const nextKeys = [...itemKeys];
    [nextValues[index], nextValues[nextIndex]] = [nextValues[nextIndex], nextValues[index]];
    [nextKeys[index], nextKeys[nextIndex]] = [nextKeys[nextIndex], nextKeys[index]];
    onChange(nextValues);
    setItemKeys(nextKeys);
  };

  return (
    <div className="editorial-review-list-editor">
      <div className="editorial-review-list-editor__header">
        <span>{title}</span>
        <button type="button" className="editorial-mini-button" onClick={addItem} disabled={disabled}>
          + {labels.addItem}
        </button>
      </div>

      <div className="editorial-review-list-editor__items">
        {values.map((value, index) => (
          <div className="editorial-review-list-editor__item" key={itemKeys[index] || index}>
            <AutoGrowTextField
              value={value}
              placeholder={labels.emptyListItem}
              ariaLabel={`${title} ${index + 1}`}
              rows={2}
              maxRows={4}
              singleLine
              disabled={disabled}
              onChange={(nextValue) => updateItem(index, nextValue)}
            />
            <div className="editorial-review-list-editor__actions">
              <button
                type="button"
                className="editorial-mini-button"
                onClick={() => moveItem(index, -1)}
                disabled={disabled || index === 0}
                aria-label={`${labels.moveUp}: ${title} ${index + 1}`}
                title={labels.moveUp}
              >
                ↑
              </button>
              <button
                type="button"
                className="editorial-mini-button"
                onClick={() => moveItem(index, 1)}
                disabled={disabled || index === values.length - 1}
                aria-label={`${labels.moveDown}: ${title} ${index + 1}`}
                title={labels.moveDown}
              >
                ↓
              </button>
              <button
                type="button"
                className="editorial-mini-button editorial-mini-button--danger"
                onClick={() => removeItem(index)}
                disabled={disabled}
                aria-label={`${labels.removeItem}: ${title} ${index + 1}`}
                title={labels.removeItem}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ArticlePortableTextEditor({
  article,
  lang,
  articlesHref,
  previewHref,
  saveEndpoint,
  workflow,
  workflowPermissions,
  capabilities,
  labels,
}: Props) {
  const [draft, setDraft] = useState<EditableArticle>(article);
  const [content, setContent] = useState<PortableTextBlock[]>(article.content || []);
  const [currentWorkflow, setCurrentWorkflow] = useState<EditorialArticleWorkflow>(workflow);
  const [currentWorkflowPermissions, setCurrentWorkflowPermissions] =
    useState<EditorialWorkflowTransitionPermissions>(workflowPermissions);
  const savedSnapshotRef = useRef(getEditableArticleSnapshot(article, article.content || []));
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error' | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isManualSaveLocked, setIsManualSaveLocked] = useState(false);
  const [isWorkflowUpdating, setIsWorkflowUpdating] = useState(false);
  const isSavingRef = useRef(false);
  const lastAutosaveAttemptSignatureRef = useRef('');
  const [selectedFeaturedFile, setSelectedFeaturedFile] = useState<SelectedFeaturedImageFile | null>(null);
  const [featuredImageStatus, setFeaturedImageStatus] = useState('');
  const [featuredImageStatusTone, setFeaturedImageStatusTone] = useState<'success' | 'error' | ''>('');
  const [isFeaturedImageUploading, setIsFeaturedImageUploading] = useState(false);
  const [isFeaturedImageRemoving, setIsFeaturedImageRemoving] = useState(false);
  const [isFeaturedImageDragActive, setIsFeaturedImageDragActive] = useState(false);
  const [selectedGameCoverFile, setSelectedGameCoverFile] = useState<SelectedFeaturedImageFile | null>(null);
  const [gameCoverStatus, setGameCoverStatus] = useState('');
  const [gameCoverStatusTone, setGameCoverStatusTone] = useState<'success' | 'error' | ''>('');
  const [isGameCoverUploading, setIsGameCoverUploading] = useState(false);
  const [isGameCoverRemoving, setIsGameCoverRemoving] = useState(false);
  const [isGameCoverDragActive, setIsGameCoverDragActive] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [typeChangeRequest, setTypeChangeRequest] = useState<TypeChangeRequest | null>(null);
  const [bodyImagePreviewUrls, setBodyImagePreviewUrls] = useState<Record<string, string>>({});
  const inspectorId = useId();
  const rememberBodyImagePreview = useCallback((assetId: string, url: string) => {
    if (!assetId || !url) return;

    setBodyImagePreviewUrls((current) => ({
      ...current,
      [assetId]: url,
    }));
  }, []);
  const nodes = useMemo(
    () => [
      defineBlockObject({
        type: 'image',
        render: (props) => (
          <ObjectBlock
            {...props}
            labels={labels}
            language={draft.language}
            currentArticleId={getRootArticleId(draft._id)}
            saveEndpoint={saveEndpoint}
            assetPreviewUrls={bodyImagePreviewUrls}
            onAssetPreview={rememberBodyImagePreview}
          />
        ),
      }),
      defineBlockObject({
        type: 'imageRow',
        render: (props) => (
          <ObjectBlock
            {...props}
            labels={labels}
            language={draft.language}
            currentArticleId={getRootArticleId(draft._id)}
            saveEndpoint={saveEndpoint}
            assetPreviewUrls={bodyImagePreviewUrls}
            onAssetPreview={rememberBodyImagePreview}
          />
        ),
      }),
      defineBlockObject({
        type: 'video',
        render: (props) => (
          <ObjectBlock
            {...props}
            labels={labels}
            language={draft.language}
            currentArticleId={getRootArticleId(draft._id)}
            saveEndpoint={saveEndpoint}
            assetPreviewUrls={bodyImagePreviewUrls}
            onAssetPreview={rememberBodyImagePreview}
          />
        ),
      }),
      defineBlockObject({
        type: 'asideBox',
        render: (props) => (
          <ObjectBlock
            {...props}
            labels={labels}
            language={draft.language}
            currentArticleId={getRootArticleId(draft._id)}
            saveEndpoint={saveEndpoint}
            assetPreviewUrls={bodyImagePreviewUrls}
            onAssetPreview={rememberBodyImagePreview}
          />
        ),
      }),
    ],
    [bodyImagePreviewUrls, draft._id, draft.language, labels, rememberBodyImagePreview, saveEndpoint]
  );
  const mediaFormatSelectOptions = useMemo<MultiSelectOption<MediaFormat>[]>(
    () => mediaFormatOptions.map((format) => ({
      value: format,
      label: mediaFormatLabels[lang][format],
    })),
    [lang]
  );

  useEffect(() => () => {
    if (selectedFeaturedFile?.previewUrl) {
      URL.revokeObjectURL(selectedFeaturedFile.previewUrl);
    }
  }, [selectedFeaturedFile]);

  useEffect(() => () => {
    if (selectedGameCoverFile?.previewUrl) {
      URL.revokeObjectURL(selectedGameCoverFile.previewUrl);
    }
  }, [selectedGameCoverFile]);

  useEffect(() => {
    if (draft.type !== 'review' && selectedGameCoverFile) {
      setSelectedGameCoverFile(null);
      setGameCoverStatus('');
      setGameCoverStatusTone('');
    }
  }, [draft.type, selectedGameCoverFile]);

  useEffect(() => {
    if (!isInspectorOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsInspectorOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInspectorOpen]);

  const updateField = <Field extends keyof EditableArticle>(field: Field, value: EditableArticle[Field]) => {
    if (isManualSaveLocked) return;

    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const applyTypeChange = (nextType: ArticleType) => {
    if (isManualSaveLocked) return;

    setDraft((current) => applyTypeSpecificCleanup(current, nextType));

    if (nextType !== 'review') {
      setSelectedGameCoverFile(null);
      setGameCoverStatus('');
      setGameCoverStatusTone('');
    }
  };

  const requestTypeChange = (nextType: ArticleType) => {
    if (isManualSaveLocked) return;

    if (nextType === draft.type) return;

    const cleanupItems = getTypeChangeCleanupItems(draft, nextType, labels, Boolean(selectedGameCoverFile));

    if (cleanupItems.length === 0) {
      applyTypeChange(nextType);
      return;
    }

    setTypeChangeRequest({
      nextType,
      cleanupItems,
    });
  };

  const confirmTypeChange = () => {
    if (!typeChangeRequest) return;

    applyTypeChange(typeChangeRequest.nextType);
    setTypeChangeRequest(null);
  };

  const updateFeaturedImageAlt = (value: string) => {
    if (isManualSaveLocked) return;

    const alt = value.slice(0, 120);

    setDraft((current) => ({
      ...current,
      featuredImage: current.featuredImage
        ? {
            ...current.featuredImage,
            alt,
          }
        : {
            _type: 'image',
            alt,
            crop: null,
            hotspot: null,
            asset: null,
          },
    }));
  };

  const updateGameCoverAlt = (value: string) => {
    if (isManualSaveLocked) return;

    const alt = value.slice(0, 120);

    setDraft((current) => ({
      ...current,
      gameInfo: {
        ...current.gameInfo,
        cover: current.gameInfo.cover
          ? {
              ...current.gameInfo.cover,
              alt,
            }
          : {
              _type: 'image',
              alt,
              crop: null,
              hotspot: null,
              asset: null,
            },
      },
    }));
  };

  const clearSelectedFeaturedFile = () => {
    if (isManualSaveLocked) return;

    setSelectedFeaturedFile(null);
    setFeaturedImageStatus('');
    setFeaturedImageStatusTone('');
  };

  const clearSelectedGameCoverFile = () => {
    if (isManualSaveLocked) return;

    setSelectedGameCoverFile(null);
    setGameCoverStatus('');
    setGameCoverStatusTone('');
  };

  const selectFeaturedFile = async (file: File | null | undefined) => {
    if (isManualSaveLocked) return;

    const error = getFileValidationError(file, labels);

    if (error || !file) {
      setFeaturedImageStatus(error);
      setFeaturedImageStatusTone('error');
      return;
    }

    const dimensions = await getImageDimensions(file);

    setSelectedFeaturedFile({
      file,
      previewUrl: URL.createObjectURL(file),
      width: dimensions.width,
      height: dimensions.height,
    });
    setFeaturedImageStatus(labels.featuredImageFileReady);
    setFeaturedImageStatusTone('success');
  };

  const selectGameCoverFile = async (file: File | null | undefined) => {
    if (isManualSaveLocked) return;

    const error = getFileValidationError(file, labels);

    if (error || !file) {
      setGameCoverStatus(error);
      setGameCoverStatusTone('error');
      return;
    }

    const dimensions = await getImageDimensions(file);

    setSelectedGameCoverFile({
      file,
      previewUrl: URL.createObjectURL(file),
      width: dimensions.width,
      height: dimensions.height,
    });
    setGameCoverStatus(labels.gameCoverFileReady);
    setGameCoverStatusTone('success');
  };

  const syncFeaturedImageArticle = (articleUpdate: EditableArticle) => {
    setDraft((current) => ({
      ...current,
      _rev: articleUpdate._rev,
      rootDocumentId: articleUpdate.rootDocumentId,
      documentSource: articleUpdate.documentSource,
      documentLifecycle: articleUpdate.documentLifecycle,
      featuredImage: articleUpdate.featuredImage,
    }));
  };

  const syncGameCoverArticle = (articleUpdate: EditableArticle) => {
    setDraft((current) => ({
      ...current,
      _rev: articleUpdate._rev,
      rootDocumentId: articleUpdate.rootDocumentId,
      documentSource: articleUpdate.documentSource,
      documentLifecycle: articleUpdate.documentLifecycle,
      gameInfo: {
        ...current.gameInfo,
        cover: articleUpdate.gameInfo.cover,
      },
    }));
  };

  const persistSelectedFeaturedImage = async (revisionId: string) => {
    if (!selectedFeaturedFile) return null;

    setIsFeaturedImageUploading(true);
    setFeaturedImageStatus(labels.featuredImageUploading);
    setFeaturedImageStatusTone('');

    try {
      const formData = new FormData();
      formData.set('action', 'replace');
      formData.set('_rev', revisionId);
      formData.set('alt', draft.featuredImage?.alt || '');
      formData.set('file', selectedFeaturedFile.file);
      const response = await fetch(`${saveEndpoint.replace(/\/$/, '')}/featured-image`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || !result?.ok || !result.article) {
        throw new Error(result?.error || 'featured_image_upload_failed');
      }

      syncFeaturedImageArticle(result.article);
      setSelectedFeaturedFile(null);
      setFeaturedImageStatus(labels.featuredImageUploaded);
      setFeaturedImageStatusTone('success');

      return result.article as EditableArticle;
    } catch (error) {
      const message = error instanceof Error && error.message === 'revision_conflict'
        ? labels.featuredImageConflict
        : labels.featuredImageGenericError;

      setFeaturedImageStatus(message);
      setFeaturedImageStatusTone('error');
      throw error;
    } finally {
      setIsFeaturedImageUploading(false);
    }
  };

  const persistSelectedGameCover = async (revisionId: string) => {
    if (!selectedGameCoverFile) return null;

    setIsGameCoverUploading(true);
    setGameCoverStatus(labels.gameCoverUploading);
    setGameCoverStatusTone('');

    try {
      const formData = new FormData();
      formData.set('action', 'replace');
      formData.set('_rev', revisionId);
      formData.set('alt', draft.gameInfo.cover?.alt || '');
      formData.set('file', selectedGameCoverFile.file);
      const response = await fetch(`${saveEndpoint.replace(/\/$/, '')}/game-cover`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || !result?.ok || !result.article) {
        throw new Error(result?.error || 'game_cover_upload_failed');
      }

      syncGameCoverArticle(result.article);
      setSelectedGameCoverFile(null);
      setGameCoverStatus(labels.gameCoverUploaded);
      setGameCoverStatusTone('success');

      return result.article as EditableArticle;
    } catch (error) {
      const message = error instanceof Error && error.message === 'revision_conflict'
        ? labels.featuredImageConflict
        : labels.gameCoverGenericError;

      setGameCoverStatus(message);
      setGameCoverStatusTone('error');
      throw error;
    } finally {
      setIsGameCoverUploading(false);
    }
  };

  const removeFeaturedImage = async () => {
    if (isManualSaveLocked) return;

    if (isFeaturedImageRemoving || !draft.featuredImage?.asset) return;

    if (!window.confirm(labels.featuredImageRemoveConfirm)) return;

    setIsFeaturedImageRemoving(true);
    setFeaturedImageStatus('');
    setFeaturedImageStatusTone('');

    try {
      const formData = new FormData();
      formData.set('action', 'remove');
      formData.set('_rev', draft._rev);
      const response = await fetch(`${saveEndpoint.replace(/\/$/, '')}/featured-image`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || !result?.ok || !result.article) {
        throw new Error(result?.error || 'featured_image_remove_failed');
      }

      syncFeaturedImageArticle(result.article);
      setSelectedFeaturedFile(null);
      setFeaturedImageStatus(labels.featuredImageRemoved);
      setFeaturedImageStatusTone('success');
    } catch (error) {
      const message = error instanceof Error && error.message === 'revision_conflict'
        ? labels.featuredImageConflict
        : labels.featuredImageGenericError;

      setFeaturedImageStatus(message);
      setFeaturedImageStatusTone('error');
    } finally {
      setIsFeaturedImageRemoving(false);
    }
  };

  const removeGameCover = async () => {
    if (isManualSaveLocked) return;

    if (isGameCoverRemoving || !draft.gameInfo.cover?.asset) return;

    if (!window.confirm(labels.gameCoverRemoveConfirm)) return;

    setIsGameCoverRemoving(true);
    setGameCoverStatus('');
    setGameCoverStatusTone('');

    try {
      const formData = new FormData();
      formData.set('action', 'remove');
      formData.set('_rev', draft._rev);
      const response = await fetch(`${saveEndpoint.replace(/\/$/, '')}/game-cover`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();

      if (!response.ok || !result?.ok || !result.article) {
        throw new Error(result?.error || 'game_cover_remove_failed');
      }

      syncGameCoverArticle(result.article);
      setSelectedGameCoverFile(null);
      setGameCoverStatus(labels.gameCoverRemoved);
      setGameCoverStatusTone('success');
    } catch (error) {
      const message = error instanceof Error && error.message === 'revision_conflict'
        ? labels.featuredImageConflict
        : labels.gameCoverGenericError;

      setGameCoverStatus(message);
      setGameCoverStatusTone('error');
    } finally {
      setIsGameCoverRemoving(false);
    }
  };

  const updateGameInfo = <Field extends keyof EditableArticleGameInfo>(
    field: Field,
    value: EditableArticleGameInfo[Field]
  ) => {
    if (isManualSaveLocked) return;

    setDraft((current) => ({
      ...current,
      gameInfo: {
        ...current.gameInfo,
        [field]: value,
      },
    }));
  };

  const updateRating = <Field extends keyof EditableArticleRating>(
    field: Field,
    value: EditableArticleRating[Field]
  ) => {
    if (isManualSaveLocked) return;

    setDraft((current) => ({
      ...current,
      rating: {
        ...current.rating,
        [field]: value,
      },
    }));
  };

  const updateRelationField = (
    field: Exclude<RelationKind, 'translationOf'>,
    value: EditableArticleReference[]
  ) => {
    if (isManualSaveLocked) return;

    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === 'editorialSeries' ? { hasEditorialSeries: value.length > 0 } : {}),
    }));
  };

  const updateTranslationOf = (value: EditableArticleReference[]) => {
    if (isManualSaveLocked) return;

    setDraft((current) => ({
      ...current,
      translationOf: value[0] || null,
    }));
  };

  const showReviewSection = draft.type === 'review' || hasReviewData(draft);
  const isReviewEditoriallyActive =
    draft.type === 'review' && ['inProgress', 'done'].includes(draft.reviewStatus);
  const showSeriesFields =
    draft.editorialSeries.length > 0 ||
    draft.seriesOrder !== null ||
    Boolean(draft.seriesLabel.trim());
  const hasReviewRelations = [
    draft.genres,
    draft.developers,
    draft.publishers,
    draft.modes,
    draft.series,
  ].some((values) => values.length > 0);
  const showReviewRelations = draft.type === 'review' || hasReviewRelations;
  const showHardwareRelations = draft.type === 'hardware' || draft.manufacturer.length > 0;
  const featuredImage = draft.featuredImage;
  const featuredImageAsset = featuredImage?.asset || null;
  const hasFeaturedImage = Boolean(featuredImageAsset?._id || featuredImageAsset?.url);
  const featuredImageAlt = featuredImage?.alt || '';
  const selectedFeaturedFileMetadata = getSelectedFileMetadataLabel(selectedFeaturedFile);
  const gameCover = draft.gameInfo.cover;
  const gameCoverAsset = gameCover?.asset || null;
  const hasGameCover = Boolean(gameCoverAsset?._id || gameCoverAsset?.url);
  const gameCoverAlt = gameCover?.alt || '';
  const selectedGameCoverFileMetadata = getSelectedFileMetadataLabel(selectedGameCoverFile);
  const hasPendingGameCoverFile = draft.type === 'review' && Boolean(selectedGameCoverFile);
  const currentSnapshot = useMemo(() => getEditableArticleSnapshot(draft, content), [draft, content]);
  const hasUnsavedChanges =
    Boolean(selectedFeaturedFile) ||
    hasPendingGameCoverFile ||
    currentSnapshot !== savedSnapshotRef.current;
  const autosaveSignature = useMemo(() => JSON.stringify({
    currentSnapshot,
    selectedFeaturedFile: selectedFeaturedFile
      ? {
          name: selectedFeaturedFile.file.name,
          size: selectedFeaturedFile.file.size,
          lastModified: selectedFeaturedFile.file.lastModified,
        }
      : null,
    selectedGameCoverFile: hasPendingGameCoverFile && selectedGameCoverFile
      ? {
          name: selectedGameCoverFile.file.name,
          size: selectedGameCoverFile.file.size,
          lastModified: selectedGameCoverFile.file.lastModified,
        }
      : null,
  }), [currentSnapshot, hasPendingGameCoverFile, selectedFeaturedFile, selectedGameCoverFile]);

  const getArticleSavePayload = (articleDraft: EditableArticle) => ({
    _rev: articleDraft._rev,
    title: articleDraft.title,
    subtitle: articleDraft.subtitle,
    cardExcerpt: articleDraft.cardExcerpt,
    excerpt: articleDraft.excerpt,
    seoTitle: articleDraft.seoTitle,
    type: articleDraft.type,
    language: articleDraft.language,
    slug: articleDraft.slug,
    featuredImageAlt: articleDraft.featuredImage?.alt || '',
    ...(articleDraft.type === 'review' ? { gameCoverAlt: articleDraft.gameInfo.cover?.alt || '' } : {}),
    categories: articleDraft.categories,
    editorialSeries: articleDraft.editorialSeries,
    platforms: articleDraft.platforms,
    creators: articleDraft.creators,
    genres: articleDraft.genres,
    developers: articleDraft.developers,
    publishers: articleDraft.publishers,
    manufacturer: articleDraft.manufacturer,
    modes: articleDraft.modes,
    series: articleDraft.series,
    translationOf: articleDraft.translationOf,
    gameInfo: articleDraft.gameInfo,
    rating: articleDraft.rating,
    pros: articleDraft.pros,
    cons: articleDraft.cons,
    seriesOrder: articleDraft.seriesOrder,
    seriesLabel: articleDraft.seriesLabel,
    content,
  });

  const saveArticle = async (mode: SaveMode = 'manual') => {
    if (isSavingRef.current) return false;

    const isAutosave = mode === 'autosave';
    const isManualSave = mode === 'manual';

    isSavingRef.current = true;
    setIsSaving(true);
    setIsManualSaveLocked(isManualSave);
    setStatus(isAutosave ? labels.autosaveSaving : labels.saving);
    setStatusTone('');

    try {
      let articleForSave = draft;

      if (selectedFeaturedFile) {
        const articleAfterImageSave = await persistSelectedFeaturedImage(articleForSave._rev);

        if (articleAfterImageSave) {
          articleForSave = {
            ...articleForSave,
            _rev: articleAfterImageSave._rev,
            featuredImage: articleAfterImageSave.featuredImage,
          };
        }
      }

      if (articleForSave.type === 'review' && selectedGameCoverFile) {
        const articleAfterGameCoverSave = await persistSelectedGameCover(articleForSave._rev);

        if (articleAfterGameCoverSave) {
          articleForSave = {
            ...articleForSave,
            _rev: articleAfterGameCoverSave._rev,
            gameInfo: {
              ...articleForSave.gameInfo,
              cover: articleAfterGameCoverSave.gameInfo.cover,
            },
          };
        }
      }

      const response = await fetch(saveEndpoint, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(getArticleSavePayload(articleForSave)),
      });
      const result = await response.json();

      if (!response.ok || !result?.ok || !result.article) {
        throw new Error(result?.error || 'article_save_failed');
      }

      const savedContent = result.article.content || [];

      setDraft(result.article);
      setContent(savedContent);
      savedSnapshotRef.current = getEditableArticleSnapshot(result.article, savedContent);
      lastAutosaveAttemptSignatureRef.current = '';
      setStatus(isAutosave ? labels.autosaveSaved : labels.saved);
      setStatusTone('success');
      return true;
    } catch (error) {
      const message = error instanceof Error && error.message === 'revision_conflict'
        ? labels.conflict
        : labels.genericError;

      setStatus(isAutosave ? labels.autosaveError : message);
      setStatusTone('error');
      return false;
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
      setIsManualSaveLocked(false);
    }
  };

  const workflowActions = useMemo<WorkflowAction[]>(() => {
    const actions: WorkflowAction[] = [];

    if (currentWorkflowPermissions.canSubmit) {
      actions.push('submit');
    }

    if (currentWorkflowPermissions.canRequestChanges) {
      actions.push('request_changes');
    }

    if (currentWorkflowPermissions.canApprove) {
      actions.push('approve');
    }

    return actions;
  }, [currentWorkflowPermissions]);

  const runWorkflowAction = async (action: WorkflowAction) => {
    if (isWorkflowUpdating) return;

    if (!window.confirm(getWorkflowActionConfirmMessage(action, labels))) {
      return;
    }

    setIsWorkflowUpdating(true);
    setStatus(labels.workflowUpdating);
    setStatusTone('');

    try {
      const response = await fetch(`${saveEndpoint}/workflow`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok || !result.workflow) {
        throw new Error(result?.error || 'workflow_update_failed');
      }

      setCurrentWorkflow(result.workflow);

      if (result.permissions) {
        setCurrentWorkflowPermissions(result.permissions);
      }

      setStatus(getWorkflowActionSuccessMessage(action, labels));
      setStatusTone('success');
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : 'workflow_update_failed';

      setStatus(getWorkflowErrorMessage(errorCode, labels));
      setStatusTone('error');
    } finally {
      setIsWorkflowUpdating(false);
    }
  };

  useEffect(() => {
    if (!hasUnsavedChanges) {
      lastAutosaveAttemptSignatureRef.current = '';
      return undefined;
    }

    if (isSaving || lastAutosaveAttemptSignatureRef.current === autosaveSignature) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      lastAutosaveAttemptSignatureRef.current = autosaveSignature;
      void saveArticle('autosave');
    }, AUTOSAVE_IDLE_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [autosaveSignature, hasUnsavedChanges, isSaving]);

  const requestExit = () => {
    if (hasUnsavedChanges) {
      setIsExitModalOpen(true);
      return;
    }

    window.location.assign(articlesHref);
  };

  const saveAndExit = async () => {
    const saved = await saveArticle('manual');

    if (saved) {
      window.location.assign(articlesHref);
    }
  };

  const discardAndExit = () => {
    window.location.assign(articlesHref);
  };

  return (
    <div
      className="editorial-article-editor"
      data-editorial-article-editor
      aria-busy={isManualSaveLocked ? 'true' : undefined}
      data-save-locked={isManualSaveLocked ? 'true' : undefined}
      data-can-change-author={capabilities.canChangeAuthor ? 'true' : undefined}
      data-can-edit-monetization={capabilities.canEditMonetization ? 'true' : undefined}
      data-can-edit-legacy={capabilities.canEditLegacy ? 'true' : undefined}
      data-can-edit-editor-notes={capabilities.canEditEditorNotes ? 'true' : undefined}
    >
      <p className="editorial-mobile-editing-notice">{labels.mobileEditingNotice}</p>

      <div className="editorial-article-editor__shell">
        <main className="editorial-article-editor__canvas">
          <EditorProvider
            initialConfig={{
              schemaDefinition,
              initialValue: content,
              keyGenerator: getKey,
            }}
          >
            <EventListenerPlugin
              on={(event) => {
                if (event.type === 'mutation') {
                  if (isManualSaveLocked) return;

                  setContent(event.value || []);
                }
              }}
            />
            <NodePlugin nodes={nodes} />
            <Toolbar
              labels={labels}
              language={draft.language}
              currentArticleId={getRootArticleId(draft._id)}
              saveEndpoint={saveEndpoint}
              assetPreviewUrls={bodyImagePreviewUrls}
              onAssetPreview={rememberBodyImagePreview}
              articlesHref={articlesHref}
              previewHref={previewHref}
              status={status}
              statusTone={statusTone}
              inspectorId={inspectorId}
              isInspectorOpen={isInspectorOpen}
              isSaving={isSaving}
              isLocked={isManualSaveLocked}
              isWorkflowUpdating={isWorkflowUpdating}
              workflowActions={workflowActions}
              hasUnsavedChanges={hasUnsavedChanges}
              onToggleInspector={() => setIsInspectorOpen((value) => !value)}
              onSave={() => saveArticle('manual')}
              onRequestExit={requestExit}
              onWorkflowAction={runWorkflowAction}
              capabilities={capabilities}
            />

            <label className="editorial-field editorial-field--title">
              <span>{labels.title}</span>
              <input
                value={draft.title}
                disabled={isManualSaveLocked}
                onChange={(event) => updateField('title', event.target.value)}
              />
            </label>

            <label className="editorial-field">
              <span>{labels.subtitle}</span>
              <textarea
                value={draft.subtitle}
                rows={2}
                disabled={isManualSaveLocked}
                onChange={(event) => updateField('subtitle', event.target.value)}
              />
            </label>

            <section className="editorial-pte-card" aria-labelledby="editorial-pte-title">
              <div className="editorial-pte-card__header">
                <div>
                  <p className="editorial-kicker">{labels.content}</p>
                  <h2 id="editorial-pte-title">{labels.content}</h2>
                </div>
              </div>

              <PortableTextEditable
                className="editorial-pte"
                renderAnnotation={renderAnnotation}
                renderDecorator={renderDecorator}
                renderListItem={renderListItem}
                renderStyle={renderStyle}
                readOnly={isManualSaveLocked}
                spellCheck
              />
            </section>
          </EditorProvider>

          {showReviewSection && (
            <section className="editorial-pte-card editorial-review-main-card" aria-labelledby="editorial-review-main-title">
              <div className="editorial-pte-card__header">
                <div>
                  <p className="editorial-kicker">{labels.inspectorReview}</p>
                  <h2 id="editorial-review-main-title">{labels.ratingSummary}</h2>
                </div>
              </div>

              <label className="editorial-field">
                <span>{labels.ratingSummary}</span>
                <textarea
                  value={draft.rating.summary}
                  rows={5}
                  disabled={isManualSaveLocked}
                  onChange={(event) => updateRating('summary', event.target.value)}
                />
              </label>

              <div className="editorial-review-main-card__lists">
                <ReviewStringListEditor
                  title={labels.pros}
                  values={draft.pros}
                  labels={labels}
                  disabled={isManualSaveLocked}
                  onChange={(values) => updateField('pros', values)}
                />
                <ReviewStringListEditor
                  title={labels.cons}
                  values={draft.cons}
                  labels={labels}
                  disabled={isManualSaveLocked}
                  onChange={(values) => updateField('cons', values)}
                />
              </div>
            </section>
          )}
        </main>
      </div>

      {isInspectorOpen && (
        <ArticleSettingsDrawer
          id={inspectorId}
          title={labels.sidebar}
          closeLabel={labels.closeSettings}
          onClose={() => setIsInspectorOpen(false)}
          disabled={isManualSaveLocked}
        >

          <details className="editorial-inspector-section" open>
            <summary>{labels.inspectorArticle}</summary>

            <label className="editorial-field">
              <span>{labels.type}</span>
              <select
                value={draft.type}
                onChange={(event) => requestTypeChange(event.target.value as ArticleType)}
              >
                {articleTypes.map((type) => (
                  <option value={type} key={type}>{type}</option>
                ))}
              </select>
            </label>

            <label className="editorial-field">
              <span>{labels.language}</span>
              <select
                value={draft.language}
                onChange={(event) => updateField('language', event.target.value as ArticleLanguage)}
              >
                {languages.map((language) => (
                  <option value={language} key={language}>{language.toUpperCase()}</option>
                ))}
              </select>
            </label>

            <label className="editorial-field">
              <span>{labels.slug}</span>
              <AutoGrowTextField
                value={draft.slug}
                rows={2}
                maxRows={4}
                singleLine
                newlineReplacement="remove"
                onChange={(value) => updateField('slug', value)}
              />
            </label>

            {capabilities.canChangeAuthor ? (
              <div
                className="editorial-field editorial-field--author"
                data-capability="change-author"
              >
                <span>{labels.author}</span>
                <div className="editorial-relation-picker editorial-relation-picker--author">
                  <div
                    className="editorial-multiselect__trigger"
                    role="group"
                    aria-label={labels.author}
                  >
                    <span>{draft.author?.label || labels.authorMissing}</span>
                    <span aria-hidden="true">▾</span>
                  </div>
                  {draft.author?.slug && (
                    <div className="editorial-relation-picker__chips" aria-label={labels.author}>
                      <span className="editorial-relation-picker__chip">
                        <span>{draft.author.slug}</span>
                      </span>
                    </div>
                  )}
                </div>
                <p className="editorial-file-meta">{labels.futureSlot}</p>
              </div>
            ) : (
              <div className="editorial-readonly-field">
                <span>{labels.author}</span>
                <p>{draft.author?.label || labels.authorMissing}</p>
                {draft.author?.slug && <code>{draft.author.slug}</code>}
              </div>
            )}
          </details>

          {capabilities.canEditWorkflow && (
            <details className="editorial-inspector-section" open>
              <summary>{labels.inspectorWorkflow}</summary>

              <div className="editorial-readonly-field">
                <span>{labels.workflowStatus}</span>
                <p>{getWorkflowStatusLabel(currentWorkflow.workflowStatus, labels)}</p>
              </div>

              {currentWorkflow.submittedAt && (
                <div className="editorial-readonly-field">
                  <span>{labels.workflowSubmittedAt}</span>
                  <p>{formatWorkflowDate(currentWorkflow.submittedAt, lang)}</p>
                </div>
              )}

              {currentWorkflow.reviewedAt && (
                <div className="editorial-readonly-field">
                  <span>{labels.workflowReviewedAt}</span>
                  <p>{formatWorkflowDate(currentWorkflow.reviewedAt, lang)}</p>
                </div>
              )}

              {currentWorkflow.reviewedBy && (
                <div className="editorial-readonly-field">
                  <span>{labels.workflowReviewer}</span>
                  <p>{currentWorkflow.reviewedBy}</p>
                </div>
              )}

              <p className="editorial-file-meta">{labels.futureSlot}</p>
            </details>
          )}

          <details className="editorial-inspector-section" open>
            <summary>{labels.inspectorSeo}</summary>

            <label className="editorial-field">
              <span>{labels.cardExcerpt}</span>
              <textarea
                value={draft.cardExcerpt}
                rows={4}
                onChange={(event) => updateField('cardExcerpt', event.target.value)}
              />
              <CharacterCounter
                value={draft.cardExcerpt}
                max={220}
                warning={labels.cardExcerptWarning}
              />
            </label>

            <label className="editorial-field">
              <span>{labels.excerpt}</span>
              <textarea
                value={draft.excerpt}
                rows={4}
                onChange={(event) => updateField('excerpt', event.target.value)}
              />
              <CharacterCounter
                value={draft.excerpt}
                max={160}
                warning={labels.excerptWarning}
              />
            </label>

            <label className="editorial-field">
              <span>{labels.seoTitle}</span>
              <AutoGrowTextField
                value={draft.seoTitle}
                rows={2}
                maxRows={4}
                singleLine
                onChange={(value) => updateField('seoTitle', value)}
              />
              <p className="editorial-character-count">{labels.seoTitleHint}</p>
            </label>
          </details>

          <details className="editorial-inspector-section" open>
            <summary>{labels.inspectorRelations}</summary>

            <div className="editorial-inspector-subsection">
              <h3>{labels.classificationSection}</h3>

              <label className="editorial-field">
                <span>{labels.categories}</span>
                <RelationPicker
                  label={labels.categories}
                  kind="categories"
                  values={draft.categories}
                  onChange={(values) => updateRelationField('categories', values)}
                  language={draft.language}
                  currentArticleId={getRootArticleId(draft._id)}
                  labels={labels}
                  disabled={isManualSaveLocked}
                />
              </label>

              <label className="editorial-field">
                <span>{labels.editorialSeries}</span>
                <RelationPicker
                  label={labels.editorialSeries}
                  kind="editorialSeries"
                  values={draft.editorialSeries}
                  onChange={(values) => updateRelationField('editorialSeries', values)}
                  language={draft.language}
                  currentArticleId={getRootArticleId(draft._id)}
                  labels={labels}
                  disabled={isManualSaveLocked}
                />
              </label>

              {showSeriesFields && (
                <>
                  <label className="editorial-field">
                    <span>{labels.seriesOrder}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.seriesOrder ?? ''}
                      onChange={(event) => updateField('seriesOrder', parseOptionalNumber(event.target.value))}
                    />
                  </label>
                  <label className="editorial-field">
                    <span>{labels.seriesLabel}</span>
                    <input
                      value={draft.seriesLabel}
                      onChange={(event) => updateField('seriesLabel', event.target.value)}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="editorial-inspector-subsection">
              <h3>{labels.relationsSection}</h3>

              <label className="editorial-field">
                <span>{labels.platforms}</span>
                <RelationPicker
                  label={labels.platforms}
                  kind="platforms"
                  values={draft.platforms}
                  onChange={(values) => updateRelationField('platforms', values)}
                  language={draft.language}
                  currentArticleId={getRootArticleId(draft._id)}
                  labels={labels}
                  disabled={isManualSaveLocked}
                />
                {['review', 'hardware', 'guide'].includes(draft.type) && draft.platforms.length === 0 && (
                  <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                    {labels.platformsRecommended}
                  </p>
                )}
              </label>

              <label className="editorial-field">
                <span>{labels.creators}</span>
                <RelationPicker
                  label={labels.creators}
                  kind="creators"
                  values={draft.creators}
                  onChange={(values) => updateRelationField('creators', values)}
                  language={draft.language}
                  currentArticleId={getRootArticleId(draft._id)}
                  labels={labels}
                  disabled={isManualSaveLocked}
                />
                {draft.type === 'interview' && draft.creators.length === 0 && (
                  <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                    {labels.creatorsRecommended}
                  </p>
                )}
              </label>

              <label className="editorial-field">
                <span>{labels.translationOf}</span>
                <RelationPicker
                  label={labels.translationOf}
                  kind="translationOf"
                  values={draft.translationOf ? [draft.translationOf] : []}
                  onChange={updateTranslationOf}
                  language={draft.language}
                  currentArticleId={getRootArticleId(draft._id)}
                  multiple={false}
                  labels={labels}
                  disabled={isManualSaveLocked}
                />
              </label>

              {showHardwareRelations && (
                <label className="editorial-field">
                  <span>{labels.manufacturer}</span>
                  <RelationPicker
                    label={labels.manufacturer}
                    kind="manufacturer"
                    values={draft.manufacturer}
                    onChange={(values) => updateRelationField('manufacturer', values)}
                    language={draft.language}
                    currentArticleId={getRootArticleId(draft._id)}
                    labels={labels}
                    disabled={isManualSaveLocked}
                  />
                  {draft.type === 'hardware' && draft.manufacturer.length === 0 && (
                    <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                      {labels.manufacturerRecommended}
                    </p>
                  )}
                </label>
              )}

              {showReviewRelations && (
                <div className="editorial-inspector-subsection editorial-inspector-subsection--nested">
                  <h3>{labels.inspectorReview}</h3>

                  <label className="editorial-field">
                    <span>{labels.genres}</span>
                    <RelationPicker
                      label={labels.genres}
                      kind="genres"
                      values={draft.genres}
                      onChange={(values) => updateRelationField('genres', values)}
                      language={draft.language}
                      currentArticleId={getRootArticleId(draft._id)}
                      labels={labels}
                      disabled={isManualSaveLocked}
                    />
                  </label>

                  <label className="editorial-field">
                    <span>{labels.developers}</span>
                    <RelationPicker
                      label={labels.developers}
                      kind="developers"
                      values={draft.developers}
                      onChange={(values) => updateRelationField('developers', values)}
                      language={draft.language}
                      currentArticleId={getRootArticleId(draft._id)}
                      labels={labels}
                      disabled={isManualSaveLocked}
                    />
                    {draft.type === 'review' && draft.developers.length === 0 && (
                      <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                        {labels.developersRecommended}
                      </p>
                    )}
                  </label>

                  <label className="editorial-field">
                    <span>{labels.publishers}</span>
                    <RelationPicker
                      label={labels.publishers}
                      kind="publishers"
                      values={draft.publishers}
                      onChange={(values) => updateRelationField('publishers', values)}
                      language={draft.language}
                      currentArticleId={getRootArticleId(draft._id)}
                      labels={labels}
                      disabled={isManualSaveLocked}
                    />
                    {draft.type === 'review' && draft.publishers.length === 0 && (
                      <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                        {labels.publishersRecommended}
                      </p>
                    )}
                  </label>

                  <label className="editorial-field">
                    <span>{labels.modes}</span>
                    <RelationPicker
                      label={labels.modes}
                      kind="modes"
                      values={draft.modes}
                      onChange={(values) => updateRelationField('modes', values)}
                      language={draft.language}
                      currentArticleId={getRootArticleId(draft._id)}
                      labels={labels}
                      disabled={isManualSaveLocked}
                    />
                  </label>

                  <label className="editorial-field">
                    <span>{labels.gameSeries}</span>
                    <RelationPicker
                      label={labels.gameSeries}
                      kind="series"
                      values={draft.series}
                      onChange={(values) => updateRelationField('series', values)}
                      language={draft.language}
                      currentArticleId={getRootArticleId(draft._id)}
                      labels={labels}
                      disabled={isManualSaveLocked}
                    />
                  </label>
                </div>
              )}
            </div>
          </details>

          <details className="editorial-inspector-section" open>
            <summary>{labels.inspectorFeaturedImage}</summary>

            <div className="editorial-featured-image-control">
              {selectedFeaturedFile && (
                <div className="editorial-local-preview editorial-local-preview--featured">
                  <span>{labels.featuredImageNewPreview}</span>
                  <div className="editorial-local-preview__frame editorial-local-preview__frame--featured">
                    <img src={selectedFeaturedFile.previewUrl} alt="" aria-hidden="true" />
                  </div>
                  {selectedFeaturedFileMetadata && (
                    <p className="editorial-file-meta">{selectedFeaturedFileMetadata}</p>
                  )}
                </div>
              )}

              {(!selectedFeaturedFile && hasFeaturedImage) && (
                <div className="editorial-current-media editorial-current-media--featured">
                  <span>{labels.featuredImageCurrent}</span>
                  <div className="editorial-current-media__frame editorial-current-media__frame--featured">
                    <img
                      src={featuredImageAsset?.url || ''}
                      alt={featuredImageAlt || labels.inspectorFeaturedImage}
                    />
                  </div>
                  <p className="editorial-file-meta">
                    {getAssetMetadataLabel(featuredImageAsset, labels)}
                  </p>
                </div>
              )}

              {(hasFeaturedImage || selectedFeaturedFile) && (
                <label className="editorial-field">
                  <span>{labels.featuredImageAlt}</span>
                  <AutoGrowTextField
                    value={featuredImageAlt}
                    maxLength={120}
                    rows={2}
                    maxRows={4}
                    singleLine
                    onChange={updateFeaturedImageAlt}
                  />
                  <CharacterCounter
                    value={featuredImageAlt}
                    max={120}
                    warning={labels.cardExcerptWarning}
                  />
                  {hasFeaturedImage && !featuredImageAlt.trim() && (
                    <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                      {labels.featuredImageAltWarning}
                    </p>
                  )}
                </label>
              )}

              {selectedFeaturedFile && featuredImageStatus && (
                <p
                  className="editorial-message"
                  data-tone={featuredImageStatusTone || undefined}
                  aria-live="polite"
                >
                  {featuredImageStatus}
                </p>
              )}

              <div className="editorial-featured-image-control__actions">
                {!selectedFeaturedFile && (
                  <>
                    <label
                      className="editorial-dropzone editorial-dropzone--compact"
                      data-drag-active={isFeaturedImageDragActive ? 'true' : 'false'}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (isManualSaveLocked) return;
                        setIsFeaturedImageDragActive(true);
                      }}
                      onDragLeave={() => setIsFeaturedImageDragActive(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsFeaturedImageDragActive(false);
                        if (isManualSaveLocked) return;
                        selectFeaturedFile(event.dataTransfer.files?.[0]);
                      }}
                    >
                      <span>
                        {hasFeaturedImage ? labels.featuredImageReplace : labels.featuredImageChooseFile}
                      </span>
                      <small>{labels.featuredImageDropFile}</small>
                      <input
                        key={selectedFeaturedFile?.previewUrl || 'featured-image-input'}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={isManualSaveLocked}
                        onChange={(event) => selectFeaturedFile(event.target.files?.[0])}
                      />
                    </label>

                    <p className="editorial-file-meta">{labels.featuredImageFormats}</p>
                  </>
                )}

                <div className="editorial-featured-image-control__buttons">
                  {selectedFeaturedFile && (
                    <button
                      type="button"
                      className="editorial-mini-button"
                      onClick={clearSelectedFeaturedFile}
                      disabled={isManualSaveLocked || isFeaturedImageUploading || isFeaturedImageRemoving}
                    >
                      {labels.featuredImageCancelSelection}
                    </button>
                  )}

                  {hasFeaturedImage && !selectedFeaturedFile && (
                    <button
                      type="button"
                      className="editorial-mini-button editorial-mini-button--danger"
                      onClick={removeFeaturedImage}
                      disabled={isManualSaveLocked || isFeaturedImageUploading || isFeaturedImageRemoving}
                    >
                      {isFeaturedImageRemoving ? labels.featuredImageRemoving : labels.featuredImageRemove}
                    </button>
                  )}
                </div>

                {!selectedFeaturedFile && featuredImageStatus && (
                  <p
                    className="editorial-message"
                    data-tone={featuredImageStatusTone || undefined}
                    aria-live="polite"
                  >
                    {featuredImageStatus}
                  </p>
                )}
              </div>
            </div>
          </details>

          {showReviewSection && (
            <details className="editorial-inspector-section" open>
              <summary>{labels.inspectorReview}</summary>

              <div className="editorial-inspector-subsection">
                <h3>{labels.gameData}</h3>
                {draft.type === 'review' && (
                  <div className="editorial-field">
                    <span>{labels.inspectorGameCover}</span>
                    <div className="editorial-featured-image-control">
                      {selectedGameCoverFile && (
                        <div className="editorial-local-preview editorial-local-preview--featured">
                          <span>{labels.gameCoverNewPreview}</span>
                          <div className="editorial-local-preview__frame editorial-local-preview__frame--featured">
                            <img src={selectedGameCoverFile.previewUrl} alt="" aria-hidden="true" />
                          </div>
                          {selectedGameCoverFileMetadata && (
                            <p className="editorial-file-meta">{selectedGameCoverFileMetadata}</p>
                          )}
                        </div>
                      )}

                      {(!selectedGameCoverFile && hasGameCover) && (
                        <div className="editorial-current-media editorial-current-media--featured">
                          <span>{labels.gameCoverCurrent}</span>
                          <div className="editorial-current-media__frame editorial-current-media__frame--featured">
                            <img
                              src={gameCoverAsset?.url || ''}
                              alt={gameCoverAlt || labels.inspectorGameCover}
                            />
                          </div>
                          <p className="editorial-file-meta">
                            {getAssetMetadataLabel(gameCoverAsset, labels)}
                          </p>
                        </div>
                      )}

                      {(!selectedGameCoverFile && !hasGameCover) && (
                        <p className="editorial-file-meta">{labels.gameCoverEmpty}</p>
                      )}

                      {(hasGameCover || selectedGameCoverFile) && (
                        <label className="editorial-field">
                          <span>{labels.gameCoverAlt}</span>
                          <AutoGrowTextField
                            value={gameCoverAlt}
                            maxLength={120}
                            rows={2}
                            maxRows={4}
                            singleLine
                            onChange={updateGameCoverAlt}
                          />
                          <CharacterCounter
                            value={gameCoverAlt}
                            max={120}
                            warning={labels.cardExcerptWarning}
                          />
                          {hasGameCover && !gameCoverAlt.trim() && (
                            <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                              {labels.gameCoverAltWarning}
                            </p>
                          )}
                        </label>
                      )}

                      {selectedGameCoverFile && gameCoverStatus && (
                        <p
                          className="editorial-message"
                          data-tone={gameCoverStatusTone || undefined}
                          aria-live="polite"
                        >
                          {gameCoverStatus}
                        </p>
                      )}

                      <div className="editorial-featured-image-control__actions">
                        {!selectedGameCoverFile && (
                          <>
                            <label
                              className="editorial-dropzone editorial-dropzone--compact"
                              data-drag-active={isGameCoverDragActive ? 'true' : 'false'}
                              onDragOver={(event) => {
                                event.preventDefault();
                                if (isManualSaveLocked) return;
                                setIsGameCoverDragActive(true);
                              }}
                              onDragLeave={() => setIsGameCoverDragActive(false)}
                              onDrop={(event) => {
                                event.preventDefault();
                                setIsGameCoverDragActive(false);
                                if (isManualSaveLocked) return;
                                selectGameCoverFile(event.dataTransfer.files?.[0]);
                              }}
                            >
                              <span>
                                {hasGameCover ? labels.gameCoverReplace : labels.gameCoverChooseFile}
                              </span>
                              <small>{labels.gameCoverDropFile}</small>
                              <input
                                key={selectedGameCoverFile?.previewUrl || 'game-cover-input'}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={isManualSaveLocked}
                                onChange={(event) => selectGameCoverFile(event.target.files?.[0])}
                              />
                            </label>

                            <p className="editorial-file-meta">{labels.gameCoverFormats}</p>
                          </>
                        )}

                        <div className="editorial-featured-image-control__buttons">
                          {selectedGameCoverFile && (
                            <button
                              type="button"
                              className="editorial-mini-button"
                              onClick={clearSelectedGameCoverFile}
                              disabled={isManualSaveLocked || isGameCoverUploading || isGameCoverRemoving}
                            >
                              {labels.gameCoverCancelSelection}
                            </button>
                          )}

                          {hasGameCover && !selectedGameCoverFile && (
                            <button
                              type="button"
                              className="editorial-mini-button editorial-mini-button--danger"
                              onClick={removeGameCover}
                              disabled={isManualSaveLocked || isGameCoverUploading || isGameCoverRemoving}
                            >
                              {isGameCoverRemoving ? labels.gameCoverRemoving : labels.gameCoverRemove}
                            </button>
                          )}
                        </div>

                        {!selectedGameCoverFile && gameCoverStatus && (
                          <p
                            className="editorial-message"
                            data-tone={gameCoverStatusTone || undefined}
                            aria-live="polite"
                          >
                            {gameCoverStatus}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <label className="editorial-field">
                  <span>{labels.releaseYear}</span>
                  <select
                    value={draft.gameInfo.releaseYear ?? ''}
                    onChange={(event) => updateGameInfo('releaseYear', parseOptionalNumber(event.target.value))}
                  >
                    <option value="">—</option>
                    {releaseYearSelectValues.map((year) => (
                      <option value={year} key={year}>{year}</option>
                    ))}
                  </select>
                </label>

                <div className="editorial-field">
                  <span>{labels.mediaFormat}</span>
                  <MultiSelect
                    label={labels.mediaFormat}
                    placeholder={labels.multiSelectPlaceholder}
                    values={draft.gameInfo.mediaFormat}
                    options={mediaFormatSelectOptions}
                    removeLabel={labels.multiSelectRemoveValue}
                    disabled={isManualSaveLocked}
                    onChange={(values) => updateGameInfo('mediaFormat', values)}
                  />
                </div>
              </div>

              <div className="editorial-inspector-subsection">
                <h3>{labels.ratingSection}</h3>
                <div className="editorial-rating-grid">
                  {ratingFields.map((field) => (
                    <label className="editorial-field" key={field}>
                      <span>{getRatingLabel(field, labels)}</span>
                      <select
                        value={draft.rating[field] ?? ''}
                        onChange={(event) => updateRating(field, parseOptionalNumber(event.target.value))}
                      >
                        <option value="">—</option>
                        {ratingSelectValues.map((rating) => (
                          <option value={rating} key={rating}>
                            {lang === 'it' ? String(rating).replace('.', ',') : rating}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {isReviewEditoriallyActive && draft.rating.overall === null && (
                  <p className="editorial-file-advice editorial-file-advice--subtle-warning">
                    {labels.overallWarning}
                  </p>
                )}
              </div>

            </details>
          )}
        </ArticleSettingsDrawer>
      )}

      {isExitModalOpen && (
        <ExitConfirmationModal
          labels={labels}
          isSaving={isSaving}
          onSaveAndClose={saveAndExit}
          onDiscard={discardAndExit}
          onCancel={() => setIsExitModalOpen(false)}
        />
      )}

      {typeChangeRequest && (
        <TypeChangeConfirmationModal
          labels={labels}
          cleanupItems={typeChangeRequest.cleanupItems}
          onConfirm={confirmTypeChange}
          onCancel={() => setTypeChangeRequest(null)}
        />
      )}
    </div>
  );
}
