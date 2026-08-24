import { normalizeSanityRootDocumentId } from './types';
import { getYouTubeVideoId } from '../youtube-video';

export type ArticleWorkflowValidationAction = 'submit' | 'approve' | 'publish';

export type ArticleWorkflowValidationIssue = {
  field: string;
  code: string;
  label: string;
};

export type ArticleWorkflowValidationResult = {
  ok: boolean;
  blockingIssues: ArticleWorkflowValidationIssue[];
  warnings: ArticleWorkflowValidationIssue[];
};

type ArticleWorkflowValidationContext = {
  expectedSanityAuthorId?: string | null;
};

const validArticleTypes = new Set([
  'review',
  'article',
  'guide',
  'interview',
  'news',
  'feature',
  'memories',
  'hardware',
]);

const validArticleLanguages = new Set(['it', 'en']);

const fieldLabels: Record<string, string> = {
  article: 'Article',
  title: 'Title',
  type: 'Content type',
  language: 'Language',
  author: 'Author',
  content: 'Body content',
  slug: 'Slug',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown, maxLength = 2000) {
  if (typeof value !== 'string') return '';

  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maxLength);
}

function getSlugValue(value: unknown) {
  return isPlainObject(value) ? normalizeString(value.current, 120).trim() : '';
}

function getReferenceId(value: unknown) {
  return isPlainObject(value) ? normalizeSanityRootDocumentId(value._ref) : '';
}

function getImageAssetId(value: unknown) {
  if (!isPlainObject(value)) return '';

  const asset = value.asset;
  if (!isPlainObject(asset)) return '';

  return normalizeString(asset._ref || asset._id || asset.url, 300).trim();
}

function hasRenderableYouTubeVideoUrl(value: unknown) {
  return Boolean(getYouTubeVideoId(normalizeString(value, 500).trim()));
}

function textBlockHasContent(block: Record<string, unknown>) {
  if (!Array.isArray(block.children)) return false;

  return block.children.some((child) =>
    isPlainObject(child) &&
      child._type === 'span' &&
      normalizeString(child.text, 2000).trim().length > 0
  );
}

function customBlockHasContent(block: Record<string, unknown>): boolean {
  if (block._type === 'image') {
    return Boolean(getImageAssetId(block));
  }

  if (block._type === 'imageRow') {
    return Array.isArray(block.images) &&
      block.images.some((item) =>
        isPlainObject(item) && getImageAssetId(item.image)
      );
  }

  if (block._type === 'video') {
    return hasRenderableYouTubeVideoUrl(block.url);
  }

  if (block._type === 'videoRow') {
    return Array.isArray(block.videos) &&
      block.videos.some((item) =>
        isPlainObject(item) && hasRenderableYouTubeVideoUrl(item.url)
      );
  }

  if (block._type === 'asideBox') {
    return normalizeString(block.title, 160).trim().length > 0 ||
      hasPortableTextContent(block.content);
  }

  return false;
}

function hasPortableTextContent(value: unknown): boolean {
  if (!Array.isArray(value)) return false;

  return value.some((block) => {
    if (!isPlainObject(block)) return false;

    if (block._type === 'block') {
      return textBlockHasContent(block);
    }

    return customBlockHasContent(block);
  });
}

function addIssue(
  issues: ArticleWorkflowValidationIssue[],
  field: string,
  code: string
) {
  issues.push({
    field,
    code,
    label: fieldLabels[field] || field,
  });
}

function addPortableTextVideoIssues(
  content: unknown,
  blockingIssues: ArticleWorkflowValidationIssue[],
  warnings: ArticleWorkflowValidationIssue[]
) {
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (!isPlainObject(block)) continue;

    if (block._type === 'video') {
      const url = normalizeString(block.url, 500).trim();

      if (!url) {
        addIssue(blockingIssues, 'content', 'missing_video_url');
      } else if (!hasRenderableYouTubeVideoUrl(url)) {
        addIssue(blockingIssues, 'content', 'invalid_video_url');
      }
    }

    if (block._type === 'videoRow') {
      const videos = Array.isArray(block.videos)
        ? block.videos.filter(isPlainObject)
        : [];

      if (videos.length === 0) {
        addIssue(blockingIssues, 'content', 'missing_video_row_videos');
        continue;
      }

      const renderableVideos = videos.filter((video) => hasRenderableYouTubeVideoUrl(video.url));

      if (renderableVideos.length === 0) {
        addIssue(blockingIssues, 'content', 'invalid_video_row_url');
      }

      if (renderableVideos.length < videos.length) {
        addIssue(warnings, 'content', 'invalid_video_row_item_url');
      }

      if (videos.length > 2) {
        addIssue(warnings, 'content', 'too_many_video_row_items');
      }
    }

    if (block._type === 'asideBox') {
      addPortableTextVideoIssues(block.content, blockingIssues, warnings);
    }
  }
}

export function validateArticleForWorkflow(
  article: Record<string, unknown> | null | undefined,
  action: ArticleWorkflowValidationAction,
  context: ArticleWorkflowValidationContext = {}
): ArticleWorkflowValidationResult {
  const blockingIssues: ArticleWorkflowValidationIssue[] = [];
  const warnings: ArticleWorkflowValidationIssue[] = [];

  if (!article || article._type !== 'article') {
    addIssue(blockingIssues, 'article', 'missing_article');

    return {
      ok: false,
      blockingIssues,
      warnings,
    };
  }

  if (!normalizeString(article.title, 300).trim()) {
    addIssue(blockingIssues, 'title', 'missing_title');
  }

  const slug = getSlugValue(article.slug);
  if (!slug) {
    addIssue(blockingIssues, 'slug', 'missing_slug');
  }

  const type = normalizeString(article.type, 80).trim();
  if (!type) {
    addIssue(blockingIssues, 'type', 'missing_type');
  } else if (action !== 'publish' && !validArticleTypes.has(type)) {
    addIssue(blockingIssues, 'type', 'invalid_type');
  }

  const language = normalizeString(article.language, 8).trim();
  if (!validArticleLanguages.has(language)) {
    addIssue(blockingIssues, 'language', 'invalid_language');
  }

  const authorId = getReferenceId(article.author);
  if (!authorId) {
    addIssue(blockingIssues, 'author', 'missing_author');
  }

  if ((action === 'submit' || action === 'approve') && !hasPortableTextContent(article.content)) {
    addIssue(blockingIssues, 'content', 'missing_content');
  }

  addPortableTextVideoIssues(article.content, blockingIssues, warnings);

  const expectedSanityAuthorId = normalizeSanityRootDocumentId(context.expectedSanityAuthorId);
  if (
    (action === 'approve' || action === 'publish') &&
    authorId &&
    expectedSanityAuthorId &&
    authorId !== expectedSanityAuthorId
  ) {
    addIssue(blockingIssues, 'author', 'author_ownership_conflict');
  }

  return {
    ok: blockingIssues.length === 0,
    blockingIssues,
    warnings,
  };
}
