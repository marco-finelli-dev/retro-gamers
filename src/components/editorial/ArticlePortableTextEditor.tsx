import {
  defineBlockObject,
  defineSchema,
  EditorProvider,
  PortableTextEditable,
  useEditor,
  type PortableTextBlock,
  type RenderAnnotationFunction,
  type RenderDecoratorFunction,
  type RenderListItemFunction,
  type RenderStyleFunction,
} from '@portabletext/editor';
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins';
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
      <button type="button" onClick={() => send({ type: 'decorator.toggle', decorator: 'strong' })}>
        {labels.bold}
      </button>
      <button type="button" onClick={() => send({ type: 'decorator.toggle', decorator: 'em' })}>
        {labels.italic}
      </button>
      <button type="button" onClick={() => send({ type: 'style.toggle', style: 'normal' })}>
        {labels.normal}
      </button>
      <button type="button" onClick={() => send({ type: 'style.toggle', style: 'h2' })}>
        {labels.h2}
      </button>
      <button type="button" onClick={() => send({ type: 'style.toggle', style: 'h3' })}>
        {labels.h3}
      </button>
      <button type="button" onClick={() => send({ type: 'style.toggle', style: 'blockquote' })}>
        {labels.quote}
      </button>
      <button type="button" onClick={() => send({ type: 'list item.toggle', listItem: 'bullet' })}>
        {labels.bullet}
      </button>
      <button type="button" onClick={() => send({ type: 'list item.toggle', listItem: 'number' })}>
        {labels.number}
      </button>
      <button type="button" onClick={addExternalLink}>
        {labels.externalLink}
      </button>
    </div>
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

export default function ArticlePortableTextEditor({ article, lang, saveEndpoint, labels }: Props) {
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
        <p>{labels.manualSave}</p>
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

        <aside className="editorial-article-editor__sidebar" aria-label={labels.sidebar}>
          <section className="editorial-card editorial-card--compact">
            <p className="editorial-kicker">{labels.sidebar}</p>

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
          </section>

          <section className="editorial-card editorial-card--compact">
            <p className="editorial-kicker">{labels.counters}</p>

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
          </section>

          <p className="editorial-message" data-tone={statusTone || undefined} aria-live="polite">
            {status}
          </p>

          <button className="editorial-button editorial-article-editor__save" type="button" onClick={saveArticle} disabled={isSaving}>
            {isSaving ? labels.saving : labels.save}
          </button>
        </aside>
      </div>
    </div>
  );
}
