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
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { urlFor } from '../../lib/image';

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
type AnnotationName = ReferenceAnnotationName | 'pageLink';
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
};

type EditableArticleRating = Record<RatingField, number | null> & {
  summary: string;
};

type EditableArticle = {
  _id: string;
  _rev: string;
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
  closeSettings: string;
  mobileEditingNotice: string;
  backToArticles: string;
  draftStatus: string;
  inspectorArticle: string;
  inspectorSeo: string;
  inspectorRelations: string;
  inspectorFeaturedImage: string;
  inspectorReview: string;
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
  cardExcerpt: string;
  excerpt: string;
  seoTitle: string;
  type: string;
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
  conflict: string;
  genericError: string;
  manualSave: string;
  counters: string;
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
  editImage: string;
  updateImage: string;
  removeImage: string;
  replaceImage: string;
  bodyImageDragHandle: string;
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
  bodyImageCancelSelection: string;
  bodyImageNoPreview: string;
  bodyImageRemoveConfirm: string;
  bodyImageOrphanNotice: string;
  annotationCurrentTarget: string;
  annotationRemove: string;
  annotationClose: string;
  annotationNoSelection: string;
  pageLinkSelectPlaceholder: string;
  preservedObject: string;
  image: string;
  imageRow: string;
  video: string;
  asideBox: string;
  unsupportedObject: string;
  cardExcerptWarning: string;
  excerptWarning: string;
  seoTitleHint: string;
};

type Props = {
  article: EditableArticle;
  lang: ArticleLanguage;
  articlesHref: string;
  saveEndpoint: string;
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
const featuredImageMaxFileSize = 5 * 1024 * 1024;
const imageDisplayModes: ImageDisplayMode[] = ['cover', 'contain', 'wide', 'natural'];
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

const schemaDefinition = defineSchema({
  decorators: [{ name: 'strong' }, { name: 'em' }],
  styles: [
    { name: 'normal' },
    { name: 'h2' },
    { name: 'h3' },
    { name: 'blockquote' },
  ],
  annotations: [
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
  ],
  lists: [{ name: 'bullet' }, { name: 'number' }],
  inlineObjects: [],
  blockObjects: [
    {
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
    },
    { name: 'imageRow' },
    { name: 'video' },
    { name: 'asideBox' },
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
  const previewUrl = getBodyImagePreviewUrl(image, 720, assetPreviewUrls);
  const displayMode = normalizeImageDisplayMode(image.displayMode, image.isWide);

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
  };

  const selectImageBlock = () => {
    editor.send({
      type: 'select.block',
      at: path,
    });
  };

  const removeImageBlock = () => {
    if (!window.confirm(labels.bodyImageRemoveConfirm)) return;

    editor.send({
      type: 'delete.block',
      at: path,
    });
    editor.send({ type: 'focus' });
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
        <div className="editorial-pte__image-chrome" aria-label={labels.image}>
          <span
            className="editorial-pte__image-handle"
            draggable={!readOnly}
            title={labels.bodyImageDragHandle}
            onMouseDown={selectImageBlock}
            onDragStart={selectImageBlock}
            aria-hidden="true"
          >
            ⋮⋮
          </span>
          <div className="editorial-pte__image-move" aria-label={labels.image}>
            <button
              type="button"
              className="editorial-mini-button editorial-mini-button--subtle"
              onClick={() => moveImageBlock('up')}
              aria-label={`${labels.moveUp}: ${labels.image}`}
              title={labels.moveUp}
            >
              ↑
            </button>
            <button
              type="button"
              className="editorial-mini-button editorial-mini-button--subtle"
              onClick={() => moveImageBlock('down')}
              aria-label={`${labels.moveDown}: ${labels.image}`}
              title={labels.moveDown}
            >
              ↓
            </button>
          </div>
        </div>

        <figure className="editorial-pte__image-figure">
          <div className="editorial-pte__image-preview">
            {previewUrl ? (
              <img src={previewUrl} alt={image.alt || ''} loading="lazy" decoding="async" draggable={false} />
            ) : (
              <div className="editorial-current-media__placeholder">{labels.bodyImageNoPreview}</div>
            )}
          </div>
          {image.caption && <figcaption>{image.caption}</figcaption>}
        </figure>

        <div className="editorial-pte__image-meta">
          <span className="editorial-pte__image-mode">
            {getImageDisplayModeLabel(displayMode, labels)}
          </span>
          {!image.alt && <small>{labels.bodyImageAltWarning}</small>}
        </div>

        <div className="editorial-pte__image-actions">
          <button type="button" className="editorial-mini-button" onClick={() => setIsModalOpen(true)}>
            {labels.editImage}
          </button>
          <button type="button" className="editorial-mini-button editorial-mini-button--danger" onClick={removeImageBlock}>
            {labels.removeImage}
          </button>
        </div>
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

function ObjectBlock({
  attributes,
  children,
  node,
  labels,
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

function getAnnotationIcon(annotationName: AnnotationName) {
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

  if (!allowedFeaturedImageMimeTypes.has(file.type)) {
    return labels.featuredImageInvalidType;
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
            accept="image/jpeg,image/png,image/webp"
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

function Toolbar({
  labels,
  language,
  currentArticleId,
  saveEndpoint,
  assetPreviewUrls,
  onAssetPreview,
}: {
  labels: Labels;
  language: ArticleLanguage;
  currentArticleId: string;
  saveEndpoint: string;
  assetPreviewUrls: Record<string, string>;
  onAssetPreview: (assetId: string, url: string) => void;
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
  const blockStyle = activeStyle === 'h2' || activeStyle === 'h3' ? activeStyle : 'normal';
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
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const hasTextSelection = selectedText.trim().length > 0;

  const focus = () => editor.send({ type: 'focus' });
  const send = (event: Parameters<typeof editor.send>[0]) => {
    editor.send(event);
    focus();
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

  const addExternalLink = () => {
    const href = window.prompt(labels.linkPrompt, 'https://');

    if (!href) {
      focus();
      return;
    }

    try {
      const url = new URL(href);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
        focus();
        return;
      }
    } catch {
      focus();
      return;
    }

    send({
      type: 'annotation.add',
      annotation: {
        name: 'link',
        value: { href },
      },
    });
  };

  return (
    <div className="editorial-pte-toolbar" aria-label={labels.content} ref={toolbarRef}>
      <div className="editorial-pte-toolbar__group" role="group" aria-label={labels.blockStyle}>
        <label className="editorial-pte-toolbar__style">
          <span className="sr-only">{labels.blockStyle}</span>
          <select
            value={blockStyle}
            aria-label={labels.blockStyle}
            title={labels.blockStyle}
            onChange={(event) => send({ type: 'style.toggle', style: event.target.value })}
          >
            <option value="normal">{labels.normal}</option>
            <option value="h2">{labels.h2}</option>
            <option value="h3">{labels.h3}</option>
          </select>
        </label>
      </div>

      <div className="editorial-pte-toolbar__group" role="group" aria-label={`${labels.bold} / ${labels.italic}`}>
        <button
          className="editorial-pte-toolbar__button"
          type="button"
          aria-label={labels.bold}
          aria-pressed={isBoldActive}
          title={labels.bold}
          onClick={() => send({ type: 'decorator.toggle', decorator: 'strong' })}
        >
          <span className="editorial-pte-toolbar__letter editorial-pte-toolbar__letter--bold" aria-hidden="true">
            B
          </span>
        </button>
        <button
          className="editorial-pte-toolbar__button"
          type="button"
          aria-label={labels.italic}
          aria-pressed={isItalicActive}
          title={labels.italic}
          onClick={() => send({ type: 'decorator.toggle', decorator: 'em' })}
        >
          <span className="editorial-pte-toolbar__letter editorial-pte-toolbar__letter--italic" aria-hidden="true">
            I
          </span>
        </button>
      </div>

      <div
        className="editorial-pte-toolbar__group"
        role="group"
        aria-label={`${labels.quote} / ${labels.bullet} / ${labels.number}`}
      >
        <button
          className="editorial-pte-toolbar__button"
          type="button"
          aria-label={labels.quote}
          aria-pressed={isBlockquoteActive}
          title={labels.quote}
          onClick={() => send({ type: 'style.toggle', style: 'blockquote' })}
        >
          <ToolbarIcon name="quote" />
        </button>
        <button
          className="editorial-pte-toolbar__button"
          type="button"
          aria-label={labels.bullet}
          aria-pressed={activeListItem === 'bullet'}
          title={labels.bullet}
          onClick={() => send({ type: 'list item.toggle', listItem: 'bullet' })}
        >
          <ToolbarIcon name="bullet" />
        </button>
        <button
          className="editorial-pte-toolbar__button"
          type="button"
          aria-label={labels.number}
          aria-pressed={activeListItem === 'number'}
          title={labels.number}
          onClick={() => send({ type: 'list item.toggle', listItem: 'number' })}
        >
          <ToolbarIcon name="number" />
        </button>
      </div>

      <div className="editorial-pte-toolbar__group" role="group" aria-label={labels.externalLink}>
        <button
          className="editorial-pte-toolbar__button"
          type="button"
          aria-label={labels.externalLink}
          aria-pressed={Boolean(getActiveAnnotation('link'))}
          title={labels.externalLink}
          onClick={addExternalLink}
        >
          <ToolbarIcon name="link" />
        </button>
      </div>

      <div
        className="editorial-pte-toolbar__group"
        role="group"
        aria-label={`${labels.internalLink} / ${labels.platformLink} / ${labels.creatorLink}`}
      >
        {referenceAnnotationControls.map((control) => {
          const label = getAnnotationLabel(control.name, labels);
          const activeAnnotation = getActiveAnnotation(control.name);
          const canOpen = hasTextSelection || Boolean(activeAnnotation);
          const isOpen = annotationModal?.annotationName === control.name;

          return (
            <div className="editorial-pte-toolbar__annotation" key={control.name}>
              <button
                className="editorial-pte-toolbar__button"
                type="button"
                aria-label={label}
                aria-pressed={Boolean(activeAnnotation)}
                aria-expanded={isOpen}
                title={canOpen ? label : labels.annotationNoSelection}
                disabled={!canOpen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  if (isOpen) {
                    closeAnnotationModal();
                  } else {
                    openAnnotationModal(control.name, event.currentTarget);
                  }
                }}
              >
                <span className="editorial-pte-toolbar__emoji" aria-hidden="true">{control.icon}</span>
              </button>
            </div>
          );
        })}

        {(() => {
          const annotationName: AnnotationName = 'pageLink';
          const label = getAnnotationLabel(annotationName, labels);
          const activeAnnotation = getActiveAnnotation(annotationName);
          const canOpen = hasTextSelection || Boolean(activeAnnotation);
          const isOpen = annotationModal?.annotationName === annotationName;

          return (
            <div className="editorial-pte-toolbar__annotation">
              <button
                className="editorial-pte-toolbar__button"
                type="button"
                aria-label={label}
                aria-pressed={Boolean(activeAnnotation)}
                aria-expanded={isOpen}
                title={canOpen ? label : labels.annotationNoSelection}
                disabled={!canOpen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  if (isOpen) {
                    closeAnnotationModal();
                  } else {
                    openAnnotationModal(annotationName, event.currentTarget);
                  }
                }}
              >
                <span className="editorial-pte-toolbar__emoji" aria-hidden="true">📃</span>
              </button>
            </div>
          );
        })()}
      </div>

      <div className="editorial-pte-toolbar__group" role="group" aria-label={labels.insertImage}>
        <button
          className="editorial-pte-toolbar__button"
          type="button"
          aria-label={labels.insertImage}
          aria-expanded={Boolean(imageModal)}
          title={labels.insertImage}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            if (imageModal) {
              closeImageModal();
            } else {
              openImageModal(event.currentTarget);
            }
          }}
        >
          <span className="editorial-pte-toolbar__emoji" aria-hidden="true">🖼️</span>
        </button>
      </div>

      {annotationModal && (
        <AnnotationModal
          title={`${getAnnotationIcon(annotationModal.annotationName)} ${getAnnotationLabel(annotationModal.annotationName, labels)}`}
          labels={labels}
          onClose={closeAnnotationModal}
        >
          {annotationModal.annotationName === 'pageLink' ? (
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
    </div>
  );
}

function ToolbarIcon({ name }: { name: 'quote' | 'bullet' | 'number' | 'link' }) {
  if (name === 'quote') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M8.8 7.2c-1.9 1-3.1 2.6-3.1 4.4h3.6v5.2H4.2v-4.6c0-3.2 1.6-5.7 4.6-7.4v2.4Zm10 0c-1.9 1-3.1 2.6-3.1 4.4h3.6v5.2h-5.1v-4.6c0-3.2 1.6-5.7 4.6-7.4v2.4Z" />
      </svg>
    );
  }

  if (name === 'bullet') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M6.2 8.1a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Zm3.4-2h10.2v1.4H9.6V6.1Zm-3.4 7.3a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Zm3.4-2h10.2v1.4H9.6v-1.4Zm-3.4 7.3a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Zm3.4-2h10.2v1.4H9.6v-1.4Z" />
      </svg>
    );
  }

  if (name === 'number') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M4.6 8V6.9h1V4.8h-.9v-1h2.3v3.1h.8V8H4.6Zm5-3.2h10.2v1.4H9.6V4.8Zm0 3h10.2v1.4H9.6V7.8ZM4.4 15v-.9l1.9-1.7c.2-.2.3-.4.3-.6 0-.3-.2-.5-.6-.5-.4 0-.7.2-1 .5l-.7-.8c.5-.6 1.1-.9 1.8-.9 1 0 1.7.6 1.7 1.5 0 .6-.3 1.1-.8 1.6l-.8.7h1.7V15H4.4Zm5.2-3.3h10.2v1.4H9.6v-1.4Zm0 3h10.2v1.4H9.6v-1.4Zm-5.2 5.4.6-.8c.3.3.7.5 1.1.5.5 0 .8-.2.8-.6 0-.4-.3-.6-.9-.6h-.6v-.9H6c.5 0 .8-.2.8-.6 0-.3-.3-.5-.7-.5-.4 0-.7.2-1 .5l-.6-.8c.4-.5 1-.8 1.7-.8 1 0 1.8.5 1.8 1.4 0 .5-.3.9-.8 1.1.6.2.9.6.9 1.2 0 1-.8 1.6-2 1.6-.7 0-1.3-.2-1.7-.7Zm5.2-2.4h10.2v1.4H9.6v-1.4Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M9.7 14.3a1 1 0 0 1 0-1.4l4.1-4.1a2.5 2.5 0 0 1 3.5 3.5l-1.4 1.4a1 1 0 1 1-1.4-1.4l1.4-1.4a.5.5 0 0 0-.7-.7l-4.1 4.1a1 1 0 0 1-1.4 0Zm-3 3a2.5 2.5 0 0 1 0-3.5l1.4-1.4a1 1 0 0 1 1.4 1.4l-1.4 1.4a.5.5 0 1 0 .7.7l4.1-4.1a1 1 0 0 1 1.4 1.4l-4.1 4.1a2.5 2.5 0 0 1-3.5 0Z" />
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
}: {
  id: string;
  title: string;
  closeLabel: string;
  children: ReactNode;
  onClose: () => void;
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
        {children}
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
    ratingFields.some((field) => article.rating[field] !== null) ||
    article.rating.summary.trim() ||
    article.pros.some((item) => item.trim()) ||
    article.cons.some((item) => item.trim())
  );
}

function getRatingLabel(field: RatingField, labels: Labels) {
  if (field === 'grafica') return labels.grafica;
  if (field === 'sonoro') return labels.sonoro;
  if (field === 'giocabilita') return labels.giocabilita;
  if (field === 'longevita') return labels.longevita;

  return labels.overall;
}

function getAnnotationLabel(annotationName: AnnotationName, labels: Labels) {
  if (annotationName === 'internalLink') return labels.internalLink;
  if (annotationName === 'platformLink') return labels.platformLink;
  if (annotationName === 'creatorLink') return labels.creatorLink;
  if (annotationName === 'companyLink') return labels.companyLink;
  if (annotationName === 'taxonomyLink') return labels.taxonomyLink;

  return labels.pageLink;
}

function getActiveAnnotationTarget(annotation: PortableTextObject | null | undefined) {
  if (!annotation) return '';

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
}: {
  label: string;
  placeholder: string;
  values: Value[];
  options: MultiSelectOption<Value>[];
  onChange: (values: Value[]) => void;
  removeLabel: string;
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

  const selectValue = (value: Value) => {
    if (!values.includes(value)) {
      onChange([...values, value]);
    }
    setIsOpen(false);
  };

  const removeValue = (value: Value) => {
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
                disabled={isSelected}
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
}: {
  label: string;
  kind: RelationKind;
  values: EditableArticleReference[];
  onChange: (values: EditableArticleReference[]) => void;
  language: ArticleLanguage;
  currentArticleId: string;
  multiple?: boolean;
  labels: Labels;
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
    if (selectedIds.has(item.id)) {
      setIsOpen(false);
      return;
    }

    onChange(multiple ? [...values, item] : [item]);
    setIsOpen(false);
    setQuery('');
  };

  const removeItem = (id: string) => {
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
                  disabled={isSelected}
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
}: {
  title: string;
  values: string[];
  labels: Labels;
  onChange: (values: string[]) => void;
}) {
  const [itemKeys, setItemKeys] = useState(() => values.map(() => createUiKey()));

  useEffect(() => {
    setItemKeys((current) => values.map((_, index) => current[index] || createUiKey()));
  }, [values.length]);

  const updateItem = (index: number, value: string) => {
    const nextValues = [...values];
    nextValues[index] = value;
    onChange(nextValues);
  };

  const addItem = () => {
    onChange([...values, '']);
    setItemKeys((current) => [...current, createUiKey()]);
  };

  const removeItem = (index: number) => {
    onChange(values.filter((_, itemIndex) => itemIndex !== index));
    setItemKeys((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
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
        <button type="button" className="editorial-mini-button" onClick={addItem}>
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
              onChange={(nextValue) => updateItem(index, nextValue)}
            />
            <div className="editorial-review-list-editor__actions">
              <button
                type="button"
                className="editorial-mini-button"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                aria-label={`${labels.moveUp}: ${title} ${index + 1}`}
                title={labels.moveUp}
              >
                ↑
              </button>
              <button
                type="button"
                className="editorial-mini-button"
                onClick={() => moveItem(index, 1)}
                disabled={index === values.length - 1}
                aria-label={`${labels.moveDown}: ${title} ${index + 1}`}
                title={labels.moveDown}
              >
                ↓
              </button>
              <button
                type="button"
                className="editorial-mini-button editorial-mini-button--danger"
                onClick={() => removeItem(index)}
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

export default function ArticlePortableTextEditor({ article, lang, articlesHref, saveEndpoint, labels }: Props) {
  const [draft, setDraft] = useState<EditableArticle>(article);
  const [content, setContent] = useState<PortableTextBlock[]>(article.content || []);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error' | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedFeaturedFile, setSelectedFeaturedFile] = useState<SelectedFeaturedImageFile | null>(null);
  const [featuredImageStatus, setFeaturedImageStatus] = useState('');
  const [featuredImageStatusTone, setFeaturedImageStatusTone] = useState<'success' | 'error' | ''>('');
  const [isFeaturedImageUploading, setIsFeaturedImageUploading] = useState(false);
  const [isFeaturedImageRemoving, setIsFeaturedImageRemoving] = useState(false);
  const [isFeaturedImageDragActive, setIsFeaturedImageDragActive] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
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
            saveEndpoint={saveEndpoint}
            assetPreviewUrls={bodyImagePreviewUrls}
            onAssetPreview={rememberBodyImagePreview}
          />
        ),
      }),
    ],
    [bodyImagePreviewUrls, labels, rememberBodyImagePreview, saveEndpoint]
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
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateFeaturedImageAlt = (value: string) => {
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

  const clearSelectedFeaturedFile = () => {
    setSelectedFeaturedFile(null);
    setFeaturedImageStatus('');
    setFeaturedImageStatusTone('');
  };

  const selectFeaturedFile = async (file: File | null | undefined) => {
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

  const syncFeaturedImageArticle = (articleUpdate: EditableArticle) => {
    setDraft((current) => ({
      ...current,
      _rev: articleUpdate._rev,
      featuredImage: articleUpdate.featuredImage,
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

  const removeFeaturedImage = async () => {
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

  const updateGameInfo = <Field extends keyof EditableArticleGameInfo>(
    field: Field,
    value: EditableArticleGameInfo[Field]
  ) => {
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
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === 'editorialSeries' ? { hasEditorialSeries: value.length > 0 } : {}),
    }));
  };

  const updateTranslationOf = (value: EditableArticleReference[]) => {
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

  const saveArticle = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setStatus('');
    setStatusTone('');

    try {
      let articleForSave = draft;

      if (selectedFeaturedFile) {
        const articleAfterImageSave = await persistSelectedFeaturedImage(draft._rev);

        if (articleAfterImageSave) {
          articleForSave = {
            ...draft,
            _rev: articleAfterImageSave._rev,
            featuredImage: articleAfterImageSave.featuredImage,
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

      setDraft(result.article);
      setContent(result.article.content || []);
      setStatus(labels.saved);
      setStatusTone('success');
    } catch (error) {
      const message = error instanceof Error && error.message === 'revision_conflict'
        ? labels.conflict
        : labels.genericError;

      setStatus(message);
      setStatusTone('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="editorial-article-editor" data-editorial-article-editor>
      <div className="editorial-article-editor__topbar">
        <div className="editorial-article-editor__topbar-main">
          <a className="editorial-article-editor__back" href={articlesHref}>
            ← {labels.backToArticles}
          </a>
          <p className="editorial-article-editor__state" data-tone={statusTone || undefined} aria-live="polite">
            <span aria-hidden="true">●</span>
            {status || labels.draftStatus}
          </p>
        </div>
        <div className="editorial-article-editor__actions">
          <button
            className="editorial-mini-button editorial-article-editor__settings-toggle"
            type="button"
            aria-expanded={isInspectorOpen}
            aria-controls={inspectorId}
            data-active={isInspectorOpen ? 'true' : undefined}
            onClick={() => setIsInspectorOpen((value) => !value)}
          >
            ⚙ {isInspectorOpen ? labels.settingsButtonActive : labels.settingsButton}
          </button>
          <button className="editorial-button" type="button" onClick={saveArticle} disabled={isSaving}>
            {isSaving ? labels.saving : labels.save}
          </button>
        </div>
      </div>

      <p className="editorial-mobile-editing-notice">{labels.mobileEditingNotice}</p>

      <div className="editorial-article-editor__shell">
        <main className="editorial-article-editor__canvas">
          <label className="editorial-field editorial-field--title">
            <span>{labels.title}</span>
            <input
              value={draft.title}
              onChange={(event) => updateField('title', event.target.value)}
            />
          </label>

          <label className="editorial-field">
            <span>{labels.subtitle}</span>
            <textarea
              value={draft.subtitle}
              rows={2}
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
              />
              <PortableTextEditable
                className="editorial-pte"
                renderAnnotation={renderAnnotation}
                renderDecorator={renderDecorator}
                renderListItem={renderListItem}
                renderStyle={renderStyle}
                spellCheck
              />
            </EditorProvider>
          </section>

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
                  onChange={(event) => updateRating('summary', event.target.value)}
                />
              </label>

              <div className="editorial-review-main-card__lists">
                <ReviewStringListEditor
                  title={labels.pros}
                  values={draft.pros}
                  labels={labels}
                  onChange={(values) => updateField('pros', values)}
                />
                <ReviewStringListEditor
                  title={labels.cons}
                  values={draft.cons}
                  labels={labels}
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
        >

          <details className="editorial-inspector-section" open>
            <summary>{labels.inspectorArticle}</summary>

            <label className="editorial-field">
              <span>{labels.type}</span>
              <select
                value={draft.type}
                onChange={(event) => updateField('type', event.target.value as ArticleType)}
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

            <div className="editorial-readonly-field">
              <span>{labels.author}</span>
              <p>{draft.author?.label || labels.authorMissing}</p>
              {draft.author?.slug && <code>{draft.author.slug}</code>}
            </div>
          </details>

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
                />
                {['review', 'hardware', 'guide'].includes(draft.type) && draft.platforms.length === 0 && (
                  <p className="editorial-character-count" data-warning="true">
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
                />
                {draft.type === 'interview' && draft.creators.length === 0 && (
                  <p className="editorial-character-count" data-warning="true">
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
                  />
                  {draft.type === 'hardware' && draft.manufacturer.length === 0 && (
                    <p className="editorial-character-count" data-warning="true">
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
                    />
                    {draft.type === 'review' && draft.developers.length === 0 && (
                      <p className="editorial-character-count" data-warning="true">
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
                    />
                    {draft.type === 'review' && draft.publishers.length === 0 && (
                      <p className="editorial-character-count" data-warning="true">
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
                  {featuredImageAsset?._id && (
                    <p className="editorial-file-meta">
                      {labels.featuredImageAssetId}: <code>{featuredImageAsset._id}</code>
                    </p>
                  )}
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
                    <p className="editorial-character-count" data-warning="true">
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
                        setIsFeaturedImageDragActive(true);
                      }}
                      onDragLeave={() => setIsFeaturedImageDragActive(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsFeaturedImageDragActive(false);
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
                      disabled={isFeaturedImageUploading || isFeaturedImageRemoving}
                    >
                      {labels.featuredImageCancelSelection}
                    </button>
                  )}

                  {hasFeaturedImage && !selectedFeaturedFile && (
                    <button
                      type="button"
                      className="editorial-mini-button editorial-mini-button--danger"
                      onClick={removeFeaturedImage}
                      disabled={isFeaturedImageUploading || isFeaturedImageRemoving}
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
                  <p className="editorial-character-count" data-warning="true">
                    {labels.overallWarning}
                  </p>
                )}
              </div>

            </details>
          )}
        </ArticleSettingsDrawer>
      )}
    </div>
  );
}
