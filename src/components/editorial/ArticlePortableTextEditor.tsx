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
import { useMemo, useState } from 'react';

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
  content: PortableTextBlock[];
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
  cardExcerpt: string;
  excerpt: string;
  seoTitle: string;
  type: string;
  language: string;
  slug: string;
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

export default function ArticlePortableTextEditor({ article, lang, articlesHref, saveEndpoint, labels }: Props) {
  const [draft, setDraft] = useState<EditableArticle>(article);
  const [content, setContent] = useState<PortableTextBlock[]>(article.content || []);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error' | ''>('');
  const [isSaving, setIsSaving] = useState(false);
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

  const updateField = (field: keyof EditableArticle, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveArticle = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setStatus('');
    setStatusTone('');

    try {
      const response = await fetch(saveEndpoint, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          _rev: draft._rev,
          title: draft.title,
          subtitle: draft.subtitle,
          cardExcerpt: draft.cardExcerpt,
          excerpt: draft.excerpt,
          seoTitle: draft.seoTitle,
          type: draft.type,
          language: draft.language,
          slug: draft.slug,
          content,
        }),
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

          <details className="editorial-inspector-section">
            <summary>{labels.inspectorRelations}</summary>
            <p className="editorial-inspector-section__placeholder">{labels.futureSlot}</p>
          </details>

          <details className="editorial-inspector-section">
            <summary>{labels.inspectorFeaturedImage}</summary>
            <p className="editorial-inspector-section__placeholder">{labels.futureSlot}</p>
          </details>

          {draft.type === 'review' && (
            <details className="editorial-inspector-section">
              <summary>{labels.inspectorReview}</summary>
              <p className="editorial-inspector-section__placeholder">{labels.futureSlot}</p>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
