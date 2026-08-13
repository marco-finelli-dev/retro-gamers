import { randomUUID } from 'node:crypto';
import { logApiError } from '../api-errors';
import { publicFreshClient } from '../sanity';
import { getSanityWriteClient } from '../sanity-write.server';
import { supabaseAdmin } from '../supabase/server';
import { canManageOwnAuthorProfile, canUploadEditorialImages } from './permissions';
import { getEditorialSessionFromCookies } from './session.server';
import {
  normalizeSanityRootDocumentId,
  type EditorialSessionContext,
} from './types';

type ImageAsset = {
  _id?: string | null;
  url?: string | null;
};

type AuthorImage = {
  _type?: 'image';
  asset?: ImageAsset | null;
  alt?: string | null;
  crop?: Record<string, unknown> | null;
  hotspot?: Record<string, unknown> | null;
};

type PortableTextSpan = {
  _type: 'span';
  _key: string;
  text: string;
  marks: string[];
};

type PortableTextBlock = {
  _type: 'block';
  _key: string;
  style: 'normal';
  markDefs: unknown[];
  children: PortableTextSpan[];
};

export type EditorialAuthorProfile = {
  _id: string;
  _rev: string;
  name: string;
  nickname: string;
  displayName: 'real' | 'nickname';
  slug: string;
  role: string;
  bio: PortableTextBlock[];
  bioEn: PortableTextBlock[];
  bioText: string;
  bioEnText: string;
  bioEditable: boolean;
  bioEnEditable: boolean;
  website: string;
  facebook: string;
  twitter: string;
  tiktok: string;
  youtube: string;
  twitch: string;
  image: AuthorImage | null;
  cover: AuthorImage | null;
  publicUrls: {
    it: string | null;
    en: string | null;
  };
  completeness: {
    completed: number;
    total: number;
    label: string;
  };
};

type EditableAuthorFields = {
  name: string;
  nickname: string;
  displayName: 'real' | 'nickname';
  bioText: string;
  bioEnText: string;
  website: string;
  facebook: string;
  twitter: string;
  tiktok: string;
  youtube: string;
  twitch: string;
  imageAlt: string;
  coverAlt: string;
};

type EditableFieldName = keyof EditableAuthorFields;

type WritableAuthorPatch = {
  set: Record<string, unknown>;
  unset: string[];
  fieldsChanged: string[];
};

type SanityMutationError = {
  statusCode?: number;
  response?: {
    statusCode?: number;
    statusMessage?: string;
  };
  message?: string;
};

type EditorialContextWithUser = EditorialSessionContext & {
  user: NonNullable<EditorialSessionContext['user']>;
  editorialProfile: NonNullable<EditorialSessionContext['editorialProfile']>;
  sanityAuthorId: string;
};

const editableFieldNames = new Set<EditableFieldName>([
  'name',
  'nickname',
  'displayName',
  'bioText',
  'bioEnText',
  'website',
  'facebook',
  'twitter',
  'tiktok',
  'youtube',
  'twitch',
  'imageAlt',
  'coverAlt',
]);

const allowedImageMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const urlFields = new Set<EditableFieldName>([
  'website',
  'facebook',
  'twitter',
  'tiktok',
  'youtube',
  'twitch',
]);

const optionalStringFields = new Set<EditableFieldName>([
  'nickname',
  'website',
  'facebook',
  'twitter',
  'tiktok',
  'youtube',
  'twitch',
]);

const maxFileSizeByAssetType = {
  avatar: 2 * 1024 * 1024,
  cover: 5 * 1024 * 1024,
} as const;

const authorProfileQuery = `
  *[
    _type == "author" &&
    _id == $authorId &&
    !(_id in path("drafts.**"))
  ][0] {
    _id,
    _rev,
    name,
    nickname,
    displayName,
    "slug": slug.current,
    role,
    bio,
    bioEn,
    website,
    facebook,
    twitter,
    tiktok,
    youtube,
    twitch,
    image{
      _type,
      alt,
      crop,
      hotspot,
      asset->{ _id, url }
    },
    cover{
      _type,
      alt,
      crop,
      hotspot,
      asset->{ _id, url }
    }
  }
`;

function normalizeString(value: unknown, maxLength: number) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeMultilineText(value: unknown, maxLength: number) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function hasControlCharacters(value: string) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function normalizeDisplayName(value: unknown): 'real' | 'nickname' {
  return String(value || '').trim() === 'nickname' ? 'nickname' : 'real';
}

function makeKey() {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

function plainTextToPortableText(value: string): PortableTextBlock[] {
  const text = normalizeMultilineText(value, 3000);

  if (!text) return [];

  return text.split(/\n{2,}/).map((paragraph) => ({
    _type: 'block',
    _key: makeKey(),
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: makeKey(),
        text: paragraph.replace(/\n/g, ' ').trim(),
        marks: [],
      },
    ],
  }));
}

function portableTextToPlainText(blocks: unknown) {
  if (!Array.isArray(blocks)) return '';

  return blocks
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const children = (block as { children?: unknown }).children;

      if (!Array.isArray(children)) return '';

      return children
        .map((child) =>
          child && typeof child === 'object'
            ? String((child as { text?: unknown }).text || '')
            : ''
        )
        .join('');
    })
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function isPlainPortableText(blocks: unknown) {
  if (!Array.isArray(blocks) || blocks.length === 0) return true;

  return blocks.every((block) => {
    if (!block || typeof block !== 'object') return false;

    const source = block as {
      _type?: unknown;
      style?: unknown;
      listItem?: unknown;
      level?: unknown;
      markDefs?: unknown;
      children?: unknown;
    };

    if (source._type !== 'block') return false;
    if (source.style && source.style !== 'normal') return false;
    if (source.listItem || source.level) return false;
    if (Array.isArray(source.markDefs) && source.markDefs.length > 0) return false;
    if (!Array.isArray(source.children)) return false;

    return source.children.every((child) => {
      if (!child || typeof child !== 'object') return false;

      const span = child as {
        _type?: unknown;
        marks?: unknown;
      };

      return (
        span._type === 'span' &&
        (!Array.isArray(span.marks) || span.marks.length === 0)
      );
    });
  });
}

function normalizeUrl(value: unknown) {
  const raw = normalizeString(value, 500);

  if (!raw) return '';

  if (hasControlCharacters(raw) || /\s/.test(raw)) {
    throw new Error('invalid_url');
  }

  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('invalid_url');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('invalid_url');
  }

  return parsed.toString();
}

function normalizeImage(image: unknown): AuthorImage | null {
  if (!image || typeof image !== 'object') return null;

  const source = image as {
    _type?: unknown;
    alt?: unknown;
    crop?: Record<string, unknown> | null;
    hotspot?: Record<string, unknown> | null;
    asset?: ImageAsset | null;
  };
  const assetId = normalizeSanityRootDocumentId(source.asset?._id);
  const url = normalizeString(source.asset?.url, 1000);

  if (!assetId && !url) return null;

  return {
    _type: 'image',
    alt: normalizeString(source.alt, 120),
    crop: source.crop || null,
    hotspot: source.hotspot || null,
    asset: {
      _id: assetId,
      url,
    },
  };
}

function getPublicAuthorUrls(slug: string) {
  if (!slug) {
    return {
      it: null,
      en: null,
    };
  }

  return {
    it: `/autori/${slug}/`,
    en: `/en/authors/${slug}/`,
  };
}

function getCompleteness(
  author: Pick<
    EditorialAuthorProfile,
    | 'name'
    | 'nickname'
    | 'displayName'
    | 'bioText'
    | 'bioEnText'
    | 'website'
    | 'facebook'
    | 'twitter'
    | 'tiktok'
    | 'youtube'
    | 'twitch'
    | 'image'
    | 'cover'
    | 'slug'
  >
) {
  const hasDisplayIdentity =
    author.displayName === 'real' ||
    Boolean(author.displayName === 'nickname' && author.nickname);
  const hasOnlinePresence = Boolean(
    author.website ||
      author.facebook ||
      author.twitter ||
      author.tiktok ||
      author.youtube ||
      author.twitch
  );
  const hasAvatar = Boolean(
    (author.image?.asset?._id || author.image?.asset?.url) &&
      author.image?.alt
  );
  const hasCover = Boolean(
    (author.cover?.asset?._id || author.cover?.asset?.url) &&
      author.cover?.alt
  );
  const checks = [
    author.name,
    hasDisplayIdentity,
    author.bioText,
    author.bioEnText,
    hasAvatar,
    hasCover,
    hasOnlinePresence,
    author.slug,
  ];
  const completed = checks.filter((value) => String(value || '').trim()).length;
  const total = checks.length;

  return {
    completed,
    total,
    label: `${completed}/${total}`,
  };
}

function normalizeAuthorProfile(author: Partial<EditorialAuthorProfile> | null): EditorialAuthorProfile | null {
  const id = normalizeSanityRootDocumentId(author?._id);
  const rev = normalizeString(author?._rev, 160);
  const name = normalizeString(author?.name, 120);
  const slug = normalizeString(author?.slug, 96);

  if (!id || !rev || !name) return null;

  const bio = Array.isArray(author?.bio) ? author.bio : [];
  const bioEn = Array.isArray(author?.bioEn) ? author.bioEn : [];
  const normalizedAuthor: EditorialAuthorProfile = {
    _id: id,
    _rev: rev,
    name,
    nickname: normalizeString(author?.nickname, 120),
    displayName: normalizeDisplayName(author?.displayName),
    slug,
    role: normalizeString(author?.role, 80),
    bio,
    bioEn,
    bioText: portableTextToPlainText(bio),
    bioEnText: portableTextToPlainText(bioEn),
    bioEditable: isPlainPortableText(bio),
    bioEnEditable: isPlainPortableText(bioEn),
    website: normalizeString(author?.website, 500),
    facebook: normalizeString(author?.facebook, 500),
    twitter: normalizeString(author?.twitter, 500),
    tiktok: normalizeString(author?.tiktok, 500),
    youtube: normalizeString(author?.youtube, 500),
    twitch: normalizeString(author?.twitch, 500),
    image: normalizeImage(author?.image),
    cover: normalizeImage(author?.cover),
    publicUrls: getPublicAuthorUrls(slug),
    completeness: {
      completed: 0,
      total: 8,
      label: '0/8',
    },
  };

  normalizedAuthor.completeness = getCompleteness(normalizedAuthor);

  return normalizedAuthor;
}

function isRevisionConflict(error: unknown) {
  const mutationError = error as SanityMutationError | null;
  const message = String(mutationError?.message || '').toLowerCase();

  return (
    mutationError?.statusCode === 409 ||
    mutationError?.response?.statusCode === 409 ||
    message.includes('revision') ||
    message.includes('conflict')
  );
}

async function recordAuthorAudit({
  actorUserId,
  action,
  sanityAuthorId,
  metadata,
}: {
  actorUserId: string;
  action: 'editorial_profile_updated' | 'image_uploaded';
  sanityAuthorId: string;
  metadata: Record<string, string>;
}) {
  const { error } = await supabaseAdmin
    .from('editorial_audit_log')
    .insert({
      actor_user_id: actorUserId,
      action,
      sanity_document_id: sanityAuthorId,
      metadata,
    });

  if (error) {
    logApiError(`editorial-author-profile.audit.${action}`, error);
    return false;
  }

  return true;
}

function validateRevision(value: unknown) {
  const rev = normalizeString(value, 160);

  if (!rev || hasControlCharacters(rev)) {
    return '';
  }

  return rev;
}

function normalizeEditableAuthorFields(payload: Record<string, unknown>, author: EditorialAuthorProfile): WritableAuthorPatch {
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  const fieldsChanged: string[] = [];

  for (const field of editableFieldNames) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;

    let nextValue: unknown;

    if (field === 'name') {
      const name = normalizeString(payload[field], 120);

      if (!name || hasControlCharacters(name)) {
        throw new Error('invalid_name');
      }

      nextValue = name;
    } else if (field === 'displayName') {
      nextValue = normalizeDisplayName(payload[field]);
    } else if (field === 'bioText' || field === 'bioEnText') {
      const text = normalizeMultilineText(payload[field], 3000);
      const path = field === 'bioText' ? 'bio' : 'bioEn';
      const currentText = field === 'bioText' ? author.bioText : author.bioEnText;
      const isEditable = field === 'bioText' ? author.bioEditable : author.bioEnEditable;

      if (hasControlCharacters(text)) {
        throw new Error('invalid_bio');
      }

      if (!isEditable) {
        throw new Error('rich_bio_readonly');
      }

      if (text === currentText) {
        continue;
      }

      if (text) {
        set[path] = plainTextToPortableText(text);
      } else {
        unset.push(path);
      }

      fieldsChanged.push(path);
      continue;
    } else if (urlFields.has(field)) {
      nextValue = normalizeUrl(payload[field]);
    } else if (field === 'imageAlt' || field === 'coverAlt') {
      const alt = normalizeString(payload[field], 120);

      if (hasControlCharacters(alt)) {
        throw new Error('invalid_alt');
      }

      const imageKey = field === 'imageAlt' ? 'image' : 'cover';

      if (!author[imageKey]?.asset?._id && !author[imageKey]?.asset?.url) {
        continue;
      }

      if (alt) {
        set[`${imageKey}.alt`] = alt;
      } else {
        unset.push(`${imageKey}.alt`);
      }

      fieldsChanged.push(`${imageKey}.alt`);
      continue;
    } else {
      const text = normalizeString(payload[field], 120);

      if (hasControlCharacters(text)) {
        throw new Error('invalid_text');
      }

      nextValue = text;
    }

    if (optionalStringFields.has(field) && !nextValue) {
      unset.push(field);
    } else {
      set[field] = nextValue;
    }

    fieldsChanged.push(field);
  }

  return {
    set,
    unset: [...new Set(unset)],
    fieldsChanged: [...new Set(fieldsChanged)],
  };
}

function getChangedPatch(current: EditorialAuthorProfile, patch: WritableAuthorPatch) {
  const changedSet: Record<string, unknown> = {};
  const changedUnset: string[] = [];
  const changedFields: string[] = [];

  for (const [path, value] of Object.entries(patch.set)) {
    const currentValue = path.split('.').reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== 'object') return undefined;

      return (acc as Record<string, unknown>)[key];
    }, current);

    if (JSON.stringify(currentValue || '') !== JSON.stringify(value || '')) {
      changedSet[path] = value;
      changedFields.push(path);
    }
  }

  for (const path of patch.unset) {
    const currentValue = path.split('.').reduce<unknown>((acc, key) => {
      if (!acc || typeof acc !== 'object') return undefined;

      return (acc as Record<string, unknown>)[key];
    }, current);

    if (currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== '') {
      changedUnset.push(path);
      changedFields.push(path);
    }
  }

  return {
    set: changedSet,
    unset: changedUnset,
    fieldsChanged: [...new Set(changedFields)],
  };
}

export async function requireActiveEditorialAuthorContext(cookies: Parameters<typeof getEditorialSessionFromCookies>[0]): Promise<
  | { ok: true; context: EditorialContextWithUser }
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
    return {
      ok: false,
      status: 503,
      error: 'editorial_profile_unavailable',
    };
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

  if (!canManageOwnAuthorProfile(context)) {
    return {
      ok: false,
      status: 403,
      error: 'editorial_profile_forbidden',
    };
  }

  return {
    ok: true,
    context: context as EditorialContextWithUser,
  };
}

export async function fetchEditorialAuthorProfile(authorId: string) {
  const sanityAuthorId = normalizeSanityRootDocumentId(authorId);

  if (!sanityAuthorId) return null;

  const author = await publicFreshClient.fetch<Partial<EditorialAuthorProfile> | null>(
    authorProfileQuery,
    { authorId: sanityAuthorId }
  );

  return normalizeAuthorProfile(author);
}

export async function fetchPublishedArticleCountForAuthor(authorId: string) {
  const sanityAuthorId = normalizeSanityRootDocumentId(authorId);

  if (!sanityAuthorId) return 0;

  const count = await publicFreshClient.fetch<number>(
    `
      count(*[
        _type == "article" &&
        !(_id in path("drafts.**")) &&
        author._ref == $authorId
      ])
    `,
    { authorId: sanityAuthorId }
  );

  return Number.isFinite(Number(count)) ? Number(count) : 0;
}

export async function updateEditorialAuthorProfile({
  context,
  payload,
}: {
  context: EditorialContextWithUser;
  payload: Record<string, unknown>;
}) {
  const revisionId = validateRevision(payload._rev);

  if (!revisionId) {
    return {
      ok: false as const,
      status: 400,
      error: 'missing_revision',
    };
  }

  const currentAuthor = await fetchEditorialAuthorProfile(context.sanityAuthorId);

  if (!currentAuthor) {
    return {
      ok: false as const,
      status: 409,
      error: 'sanity_author_missing',
    };
  }

  if (currentAuthor._rev !== revisionId) {
    return {
      ok: false as const,
      status: 409,
      error: 'revision_conflict',
    };
  }

  let patch: WritableAuthorPatch;

  try {
    patch = getChangedPatch(
      currentAuthor,
      normalizeEditableAuthorFields(payload, currentAuthor)
    );
  } catch (error) {
    return {
      ok: false as const,
      status: 400,
      error: error instanceof Error ? error.message : 'invalid_profile',
    };
  }

  if (patch.fieldsChanged.length === 0) {
    return {
      ok: true as const,
      author: currentAuthor,
      fieldsChanged: [],
      auditLogged: true,
    };
  }

  try {
    let mutation = getSanityWriteClient()
      .patch(context.sanityAuthorId)
      .ifRevisionId(revisionId);

    if (Object.keys(patch.set).length > 0) {
      mutation = mutation.set(patch.set);
    }

    if (patch.unset.length > 0) {
      mutation = mutation.unset(patch.unset);
    }

    const updatedAuthor = await mutation.commit<Partial<EditorialAuthorProfile>>({
      autoGenerateArrayKeys: true,
    });
    const normalizedAuthor = normalizeAuthorProfile(updatedAuthor);

    if (!normalizedAuthor) {
      return {
        ok: false as const,
        status: 502,
        error: 'sanity_author_invalid',
      };
    }

    const auditLogged = await recordAuthorAudit({
      actorUserId: context.user.id,
      action: 'editorial_profile_updated',
      sanityAuthorId: context.sanityAuthorId,
      metadata: {
        target: 'sanity_author_profile',
        fields: patch.fieldsChanged.join(','),
      },
    });

    return {
      ok: true as const,
      author: normalizedAuthor,
      fieldsChanged: patch.fieldsChanged,
      auditLogged,
    };
  } catch (error) {
    if (isRevisionConflict(error)) {
      return {
        ok: false as const,
        status: 409,
        error: 'revision_conflict',
      };
    }

    logApiError('editorial-author-profile.update', error);

    return {
      ok: false as const,
      status: 500,
      error: 'profile_update_failed',
    };
  }
}

export function normalizeAuthorProfileResponse(author: EditorialAuthorProfile, articleCount = 0) {
  return {
    author,
    stats: {
      publishedArticles: articleCount,
    },
  };
}

function normalizeAssetType(value: unknown): keyof typeof maxFileSizeByAssetType | '' {
  const assetType = String(value || '').trim();

  return assetType === 'avatar' || assetType === 'cover' ? assetType : '';
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

function getSafeFilename(file: File, assetType: keyof typeof maxFileSizeByAssetType) {
  const extension = file.type === 'image/png'
    ? 'png'
    : file.type === 'image/webp'
      ? 'webp'
      : 'jpg';

  return `editorial-${assetType}-${Date.now()}.${extension}`;
}

export async function uploadEditorialAuthorImage({
  context,
  formData,
}: {
  context: EditorialContextWithUser;
  formData: FormData;
}) {
  if (!canUploadEditorialImages(context)) {
    return {
      ok: false as const,
      status: 403,
      error: 'upload_forbidden',
    };
  }

  const assetType = normalizeAssetType(formData.get('assetType') || formData.get('type'));
  const revisionId = validateRevision(formData.get('_rev'));
  const alt = normalizeString(formData.get('alt'), 120);
  const file = formData.get('file');

  if (!assetType) {
    return {
      ok: false as const,
      status: 400,
      error: 'invalid_asset_type',
    };
  }

  if (!revisionId) {
    return {
      ok: false as const,
      status: 400,
      error: 'missing_revision',
    };
  }

  if (!alt || hasControlCharacters(alt)) {
    return {
      ok: false as const,
      status: 400,
      error: 'invalid_alt',
    };
  }

  if (!isUploadFile(file)) {
    return {
      ok: false as const,
      status: 400,
      error: 'missing_file',
    };
  }

  if (!allowedImageMimeTypes.has(file.type)) {
    return {
      ok: false as const,
      status: 400,
      error: 'invalid_file_type',
    };
  }

  if (file.size <= 0 || file.size > maxFileSizeByAssetType[assetType]) {
    return {
      ok: false as const,
      status: 400,
      error: 'invalid_file_size',
    };
  }

  const currentAuthor = await fetchEditorialAuthorProfile(context.sanityAuthorId);

  if (!currentAuthor) {
    return {
      ok: false as const,
      status: 409,
      error: 'sanity_author_missing',
    };
  }

  if (currentAuthor._rev !== revisionId) {
    return {
      ok: false as const,
      status: 409,
      error: 'revision_conflict',
    };
  }

  let uploadedAssetId = '';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const asset = await getSanityWriteClient().assets.upload(
      'image',
      Buffer.from(arrayBuffer),
      {
        filename: getSafeFilename(file, assetType),
        contentType: file.type,
      }
    );
    uploadedAssetId = asset._id;
    const imageField = assetType === 'avatar' ? 'image' : 'cover';
    const imageValue = {
      _type: 'image',
      asset: {
        _type: 'reference',
        _ref: asset._id,
      },
      alt,
    };
    const updatedAuthor = await getSanityWriteClient()
      .patch(context.sanityAuthorId)
      .ifRevisionId(revisionId)
      .set({ [imageField]: imageValue })
      .commit<Partial<EditorialAuthorProfile>>();
    const normalizedAuthor = normalizeAuthorProfile(updatedAuthor);

    if (!normalizedAuthor) {
      return {
        ok: false as const,
        status: 502,
        error: 'sanity_author_invalid',
      };
    }

    const auditLogged = await recordAuthorAudit({
      actorUserId: context.user.id,
      action: 'image_uploaded',
      sanityAuthorId: context.sanityAuthorId,
      metadata: {
        target: 'sanity_author_profile',
        assetType,
      },
    });

    return {
      ok: true as const,
      author: normalizedAuthor,
      assetType,
      auditLogged,
    };
  } catch (error) {
    if (isRevisionConflict(error)) {
      return {
        ok: false as const,
        status: 409,
        error: 'revision_conflict',
        assetUploaded: Boolean(uploadedAssetId),
        profileUpdated: false,
      };
    }

    logApiError('editorial-author-profile.upload', error);

    return {
      ok: false as const,
      status: 500,
      error: 'asset_upload_failed',
      assetUploaded: Boolean(uploadedAssetId),
      profileUpdated: false,
    };
  }
}
