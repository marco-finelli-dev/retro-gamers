import {
  defineBlockObject,
  defineSchema,
  EditorProvider,
  PortableTextEditable,
  useEditor,
  useEditorSelector,
  type PortableTextBlock,
  type RenderAnnotationFunction,
  type RenderDecoratorFunction,
  type RenderListItemFunction,
  type RenderStyleFunction,
} from '@portabletext/editor';
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins';
import * as selectors from '@portabletext/editor/selectors';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

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

type EditableArticleReference = {
  id: string;
  type: 'category' | 'platform' | 'creator' | 'taxonomy' | 'article';
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
    { name: 'image' },
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

function ObjectBlock({ attributes, children, node, labels }: any) {
  const type = typeof node?._type === 'string' ? node._type : '';

  return (
    <div {...attributes} className="editorial-pte__object" contentEditable={false}>
      {children}
      <strong>{getObjectLabel(type, labels)}</strong>
      <span>{labels.preservedObject}</span>
    </div>
  );
}

function Toolbar({ labels }: { labels: Labels }) {
  const editor = useEditor();
  const activeStyle = useEditorSelector(editor, selectors.getActiveStyle);
  const activeListItem = useEditorSelector(editor, selectors.getActiveListItem);
  const isBoldActive = useEditorSelector(editor, selectors.isActiveDecorator('strong'));
  const isItalicActive = useEditorSelector(editor, selectors.isActiveDecorator('em'));
  const isBlockquoteActive = useEditorSelector(editor, selectors.isActiveStyle('blockquote'));
  const blockStyle = activeStyle === 'h2' || activeStyle === 'h3' ? activeStyle : 'normal';

  const focus = () => editor.send({ type: 'focus' });
  const send = (event: Parameters<typeof editor.send>[0]) => {
    editor.send(event);
    focus();
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
    <div className="editorial-pte-toolbar" aria-label={labels.content}>
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
          title={labels.externalLink}
          onClick={addExternalLink}
        >
          <ToolbarIcon name="link" />
        </button>
      </div>
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
            <input
              value={value}
              placeholder={labels.emptyListItem}
              aria-label={`${title} ${index + 1}`}
              onChange={(event) => updateItem(index, event.target.value)}
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
  const nodes = useMemo(
    () => [
      defineBlockObject({
        type: 'image',
        render: (props) => <ObjectBlock {...props} labels={labels} />,
      }),
      defineBlockObject({
        type: 'imageRow',
        render: (props) => <ObjectBlock {...props} labels={labels} />,
      }),
      defineBlockObject({
        type: 'video',
        render: (props) => <ObjectBlock {...props} labels={labels} />,
      }),
      defineBlockObject({
        type: 'asideBox',
        render: (props) => <ObjectBlock {...props} labels={labels} />,
      }),
    ],
    [labels]
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
        <a className="editorial-article-editor__back" href={articlesHref}>
          ← {labels.backToArticles}
        </a>
        <p className="editorial-article-editor__state" data-tone={statusTone || undefined} aria-live="polite">
          {status || labels.draftStatus}
        </p>
        <button className="editorial-button" type="button" onClick={saveArticle} disabled={isSaving}>
          {isSaving ? labels.saving : labels.save}
        </button>
      </div>

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
              <Toolbar labels={labels} />
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
        </main>

        <aside className="editorial-article-editor__inspector" aria-label={labels.sidebar}>
          <p className="editorial-kicker">{labels.sidebar}</p>

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
              <input
                value={draft.slug}
                onChange={(event) => updateField('slug', event.target.value)}
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
              <input
                value={draft.seoTitle}
                onChange={(event) => updateField('seoTitle', event.target.value)}
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
                  <input
                    value={featuredImageAlt}
                    maxLength={120}
                    onChange={(event) => updateFeaturedImageAlt(event.target.value)}
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

              <div className="editorial-inspector-subsection">
                <label className="editorial-field">
                  <span>{labels.ratingSummary}</span>
                  <textarea
                    value={draft.rating.summary}
                    rows={5}
                    onChange={(event) => updateRating('summary', event.target.value)}
                  />
                </label>
              </div>

              <div className="editorial-inspector-subsection">
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
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
