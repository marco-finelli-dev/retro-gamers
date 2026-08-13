import { logApiError } from '../api-errors';
import { publicFreshClient } from '../sanity';
import { getSanityWriteClient } from '../sanity-write.server';
import { supabaseAdmin } from '../supabase/server';
import { canManageEditorialMappings } from './permissions';
import { getEditorialSessionFromCookies } from './session.server';
import {
  isEditorialRole,
  isEditorialStatus,
  normalizeSanityRootDocumentId,
  type EditorialProfile,
  type EditorialRole,
  type EditorialSessionContext,
  type EditorialStatus,
} from './types';

type ApiErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type CommunityProfileRow = {
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  role?: string | null;
  status?: string | null;
};

type EditorialProfileRow = {
  user_id: string | null;
  sanity_author_id: string | null;
  editorial_role: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SanityAuthorSummary = {
  _id: string;
  name: string;
  nickname: string;
  displayName: string;
  slug: string;
  role: string;
  imagePreviewUrl: string;
};

export type EditorialProfileSummary = {
  userId: string;
  sanityAuthorId: string;
  editorialRole: EditorialRole;
  status: EditorialStatus;
  author: SanityAuthorSummary | null;
};

type EditorialAdminContext = EditorialSessionContext & {
  user: NonNullable<EditorialSessionContext['user']>;
  profile: NonNullable<EditorialSessionContext['profile']>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeUuid(value: unknown) {
  const uuid = String(value || '').trim();

  return uuidPattern.test(uuid) ? uuid : '';
}

export function normalizeEditorialRole(value: unknown): EditorialRole | null {
  const role = String(value || '').trim();

  return isEditorialRole(role) ? role : null;
}

export function normalizeEditorialStatus(value: unknown): EditorialStatus | null {
  const status = String(value || '').trim();

  return isEditorialStatus(status) ? status : null;
}

export function isEditorialSchemaUnavailable(error: unknown) {
  const apiError = error as ApiErrorLike | null;
  if (!apiError) return false;

  const message = `${apiError.message || ''} ${apiError.details || ''} ${apiError.hint || ''}`.toLowerCase();

  return (
    apiError.code === '42P01' ||
    apiError.code === 'PGRST205' ||
    apiError.code === 'PGRST204' ||
    (
      message.includes('editorial_') &&
      (
        message.includes('schema cache') ||
        message.includes('relation') ||
        message.includes('does not exist') ||
        message.includes('could not find')
      )
    )
  );
}

function isUniqueViolation(error: unknown) {
  return (error as ApiErrorLike | null)?.code === '23505';
}

function getEditorialProfileUniqueViolationError(error: unknown) {
  const apiError = error as ApiErrorLike | null;
  const message = `${apiError?.message || ''} ${apiError?.details || ''}`.toLowerCase();

  if (
    message.includes('sanity_author_id') ||
    message.includes('editorial_profiles_sanity_author_id_unique')
  ) {
    return 'author_already_linked';
  }

  if (
    message.includes('user_id') ||
    message.includes('editorial_profiles_pkey') ||
    message.includes('editorial_profiles_user_id')
  ) {
    return 'mapping_already_exists';
  }

  return 'mapping_already_exists';
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function slugifyAuthorName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 96);
}

export function normalizeAuthorSlug(value: unknown, fallback: unknown = '') {
  const source = String(value || '').trim();
  const slug = source ? slugifyAuthorName(source) : slugifyAuthorName(fallback);

  if (!slug || slug.length > 96 || !slugPattern.test(slug)) {
    return '';
  }

  return slug;
}

function normalizeAuthorDisplayName(value: unknown, nickname: string) {
  const displayName = String(value || '').trim();

  if (displayName === 'nickname' && nickname) {
    return 'nickname';
  }

  return 'real';
}

function normalizeEditorialProfileRow(row: EditorialProfileRow | null): EditorialProfile | null {
  if (!row) return null;

  const userId = normalizeUuid(row.user_id);
  const sanityAuthorId = normalizeSanityRootDocumentId(row.sanity_author_id);

  if (!userId || !sanityAuthorId || !isEditorialRole(row.editorial_role) || !isEditorialStatus(row.status)) {
    return null;
  }

  return {
    userId,
    sanityAuthorId,
    editorialRole: row.editorial_role,
    status: row.status,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeSanityAuthor(author: Partial<SanityAuthorSummary> | null | undefined): SanityAuthorSummary | null {
  const id = normalizeSanityRootDocumentId(author?._id);
  const name = normalizeText(author?.name, 120);
  const slug = normalizeText(author?.slug, 96);

  if (!id || !name) {
    return null;
  }

  return {
    _id: id,
    name,
    nickname: normalizeText(author?.nickname, 120),
    displayName: normalizeText(author?.displayName, 24),
    slug,
    role: normalizeText(author?.role, 80),
    imagePreviewUrl: normalizeText(author?.imagePreviewUrl, 500),
  };
}

function serializeEditorialProfile(
  profile: EditorialProfile,
  authorById: Map<string, SanityAuthorSummary>
): EditorialProfileSummary {
  return {
    userId: profile.userId,
    sanityAuthorId: profile.sanityAuthorId,
    editorialRole: profile.editorialRole,
    status: profile.status,
    author: authorById.get(profile.sanityAuthorId) || null,
  };
}

export async function requireEditorialMappingManager(cookies: Parameters<typeof getEditorialSessionFromCookies>[0]): Promise<
  | { ok: true; context: EditorialAdminContext }
  | { ok: false; status: number; error: string }
> {
  const context = await getEditorialSessionFromCookies(cookies);

  if (context.authError || !context.user || !context.profile) {
    return {
      ok: false,
      status: context.authStatus || 401,
      error: context.authError || 'unauthorized',
    };
  }

  if (!canManageEditorialMappings(context)) {
    return {
      ok: false,
      status: 403,
      error: context.profile.role === 'admin' && context.profile.status !== 'active'
        ? 'suspended_admin'
        : 'unauthorized',
    };
  }

  return {
    ok: true,
    context: context as EditorialAdminContext,
  };
}

export async function fetchTargetCommunityProfile(userId: string): Promise<
  | { ok: true; profile: CommunityProfileRow }
  | { ok: false; status: number; error: string }
> {
  const targetUserId = normalizeUuid(userId);

  if (!targetUserId) {
    return { ok: false, status: 400, error: 'target_user_missing' };
  }

  const authResult = await supabaseAdmin.auth.admin.getUserById(targetUserId);

  if (authResult.error || !authResult.data?.user) {
    return { ok: false, status: 404, error: 'target_user_missing' };
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id, username, display_name, role, status')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (error) {
    logApiError('editorial-target-profile', error);
    return { ok: false, status: 500, error: 'target_user_unavailable' };
  }

  if (!data) {
    return { ok: false, status: 404, error: 'target_user_missing' };
  }

  return { ok: true, profile: data as CommunityProfileRow };
}

export async function fetchSanityAuthorsByIds(authorIds: string[]) {
  const ids = [...new Set(authorIds.map((id) => normalizeSanityRootDocumentId(id)).filter(Boolean))];

  if (ids.length === 0) {
    return new Map<string, SanityAuthorSummary>();
  }

  const authors = await publicFreshClient.fetch<SanityAuthorSummary[]>(
    `
      *[
        _type == "author" &&
        _id in $ids &&
        !(_id in path("drafts.**"))
      ] {
        _id,
        name,
        nickname,
        displayName,
        "slug": slug.current,
        role,
        "imagePreviewUrl": image.asset->url
      }
    `,
    { ids }
  );

  return new Map(
    (authors || [])
      .map((author) => normalizeSanityAuthor(author))
      .filter((author): author is SanityAuthorSummary => Boolean(author))
      .map((author) => [author._id, author])
  );
}

export async function searchSanityAuthors(query: string) {
  const normalizedQuery = normalizeText(query, 80);
  const searchQuery = normalizedQuery ? `${normalizedQuery}*` : '*';
  const authors = await publicFreshClient.fetch<SanityAuthorSummary[]>(
    `
      *[
        _type == "author" &&
        !(_id in path("drafts.**")) &&
        (
          $isEmpty ||
          name match $query ||
          nickname match $query ||
          slug.current match $query
        )
      ] | order(name asc)[0...12] {
        _id,
        name,
        nickname,
        displayName,
        "slug": slug.current,
        role,
        "imagePreviewUrl": image.asset->url
      }
    `,
    {
      query: searchQuery,
      isEmpty: !normalizedQuery,
    }
  );

  return (authors || [])
    .map((author) => normalizeSanityAuthor(author))
    .filter((author): author is SanityAuthorSummary => Boolean(author));
}

export async function verifySanityAuthor(authorId: string) {
  const sanityAuthorId = normalizeSanityRootDocumentId(authorId);

  if (!sanityAuthorId) return null;

  const author = await publicFreshClient.fetch<SanityAuthorSummary | null>(
    `
      *[
        _type == "author" &&
        _id == $authorId &&
        !(_id in path("drafts.**"))
      ][0] {
        _id,
        name,
        nickname,
        displayName,
        "slug": slug.current,
        role,
        "imagePreviewUrl": image.asset->url
      }
    `,
    { authorId: sanityAuthorId }
  );

  return normalizeSanityAuthor(author);
}

export async function fetchEditorialProfilesByUserIds(userIds: string[]): Promise<{
  available: boolean;
  profilesByUserId: Map<string, EditorialProfileSummary>;
  error: string | null;
}> {
  const ids = [...new Set(userIds.map((id) => normalizeUuid(id)).filter(Boolean))];

  if (ids.length === 0) {
    return {
      available: true,
      profilesByUserId: new Map(),
      error: null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('editorial_profiles')
    .select('user_id, sanity_author_id, editorial_role, status, created_at, updated_at')
    .in('user_id', ids);

  if (error) {
    if (isEditorialSchemaUnavailable(error)) {
      return {
        available: false,
        profilesByUserId: new Map(),
        error: 'Editorial database not initialized',
      };
    }

    throw error;
  }

  const profiles = (data || [])
    .map((row) => normalizeEditorialProfileRow(row as EditorialProfileRow))
    .filter((profile): profile is EditorialProfile => Boolean(profile));
  const authorById = await fetchSanityAuthorsByIds(profiles.map((profile) => profile.sanityAuthorId));

  return {
    available: true,
    profilesByUserId: new Map(
      profiles.map((profile) => [profile.userId, serializeEditorialProfile(profile, authorById)])
    ),
    error: null,
  };
}

async function fetchEditorialProfileByUserId(userId: string): Promise<
  | { available: true; profile: EditorialProfile | null }
  | { available: false; error: string }
> {
  const { data, error } = await supabaseAdmin
    .from('editorial_profiles')
    .select('user_id, sanity_author_id, editorial_role, status, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (isEditorialSchemaUnavailable(error)) {
      return { available: false, error: 'Editorial database not initialized' };
    }

    throw error;
  }

  return {
    available: true,
    profile: normalizeEditorialProfileRow(data as EditorialProfileRow | null),
  };
}

async function fetchProfileByAuthorId(sanityAuthorId: string): Promise<
  | { available: true; userId: string | null }
  | { available: false; error: string }
> {
  const { data, error } = await supabaseAdmin
    .from('editorial_profiles')
    .select('user_id')
    .eq('sanity_author_id', sanityAuthorId)
    .maybeSingle();

  if (error) {
    if (isEditorialSchemaUnavailable(error)) {
      return { available: false, error: 'Editorial database not initialized' };
    }

    throw error;
  }

  return {
    available: true,
    userId: normalizeUuid((data as { user_id?: string | null } | null)?.user_id),
  };
}

async function recordEditorialAudit({
  actorUserId,
  action,
  metadata,
}: {
  actorUserId: string;
  action: 'editorial_profile_linked' | 'editorial_profile_updated' | 'editorial_profile_suspended' | 'editorial_author_created';
  metadata: Record<string, string>;
}) {
  const { error } = await supabaseAdmin
    .from('editorial_audit_log')
    .insert({
      actor_user_id: actorUserId,
      action,
      metadata,
    });

  if (error) {
    logApiError(`editorial-audit.${action}`, error);
    return false;
  }

  return true;
}

export async function linkEditorialProfile({
  actorUserId,
  targetUserId,
  sanityAuthorId,
  editorialRole,
}: {
  actorUserId: string;
  targetUserId: string;
  sanityAuthorId: string;
  editorialRole: EditorialRole;
}): Promise<
  | { ok: true; profile: EditorialProfile; auditLogged: boolean }
  | { ok: false; status: number; error: string }
> {
  const existingProfileResult = await fetchEditorialProfileByUserId(targetUserId);

  if (!existingProfileResult.available) {
    return { ok: false, status: 503, error: 'editorial_database_not_initialized' };
  }

  if (
    existingProfileResult.profile &&
    existingProfileResult.profile.sanityAuthorId !== sanityAuthorId
  ) {
    return { ok: false, status: 409, error: 'mapping_already_exists' };
  }

  const linkedAuthorResult = await fetchProfileByAuthorId(sanityAuthorId);

  if (!linkedAuthorResult.available) {
    return { ok: false, status: 503, error: 'editorial_database_not_initialized' };
  }

  if (linkedAuthorResult.userId && linkedAuthorResult.userId !== targetUserId) {
    return { ok: false, status: 409, error: 'author_already_linked' };
  }

  const nowPayload = {
    sanity_author_id: sanityAuthorId,
    editorial_role: editorialRole,
    status: 'active',
    updated_by: actorUserId,
  };
  const mutation = existingProfileResult.profile
    ? supabaseAdmin
        .from('editorial_profiles')
        .update(nowPayload)
        .eq('user_id', targetUserId)
        .select('user_id, sanity_author_id, editorial_role, status, created_at, updated_at')
        .single()
    : supabaseAdmin
        .from('editorial_profiles')
        .insert({
          user_id: targetUserId,
          created_by: actorUserId,
          ...nowPayload,
        })
        .select('user_id, sanity_author_id, editorial_role, status, created_at, updated_at')
        .single();

  const { data, error } = await mutation;

  if (error) {
    if (isEditorialSchemaUnavailable(error)) {
      return { ok: false, status: 503, error: 'editorial_database_not_initialized' };
    }

    if (isUniqueViolation(error)) {
      return {
        ok: false,
        status: 409,
        error: getEditorialProfileUniqueViolationError(error),
      };
    }

    logApiError('editorial-profile-link', error);
    return { ok: false, status: 500, error: 'mapping_failed' };
  }

  const profile = normalizeEditorialProfileRow(data as EditorialProfileRow | null);

  if (!profile) {
    return { ok: false, status: 500, error: 'mapping_failed' };
  }

  const auditLogged = await recordEditorialAudit({
    actorUserId,
    action: 'editorial_profile_linked',
    metadata: {
      targetUserId,
      sanityAuthorId,
      editorialRole,
    },
  });

  return { ok: true, profile, auditLogged };
}

export async function updateEditorialProfile({
  actorUserId,
  targetUserId,
  editorialRole,
  status,
}: {
  actorUserId: string;
  targetUserId: string;
  editorialRole?: EditorialRole | null;
  status?: EditorialStatus | null;
}): Promise<
  | { ok: true; profile: EditorialProfile; auditLogged: boolean }
  | { ok: false; status: number; error: string }
> {
  const existingProfileResult = await fetchEditorialProfileByUserId(targetUserId);

  if (!existingProfileResult.available) {
    return { ok: false, status: 503, error: 'editorial_database_not_initialized' };
  }

  if (!existingProfileResult.profile) {
    return { ok: false, status: 404, error: 'editorial_profile_missing' };
  }

  const nextRole = editorialRole || existingProfileResult.profile.editorialRole;
  const nextStatus = status || existingProfileResult.profile.status;

  const { data, error } = await supabaseAdmin
    .from('editorial_profiles')
    .update({
      editorial_role: nextRole,
      status: nextStatus,
      updated_by: actorUserId,
    })
    .eq('user_id', targetUserId)
    .select('user_id, sanity_author_id, editorial_role, status, created_at, updated_at')
    .single();

  if (error) {
    if (isEditorialSchemaUnavailable(error)) {
      return { ok: false, status: 503, error: 'editorial_database_not_initialized' };
    }

    logApiError('editorial-profile-update', error);
    return { ok: false, status: 500, error: 'mapping_failed' };
  }

  const profile = normalizeEditorialProfileRow(data as EditorialProfileRow | null);

  if (!profile) {
    return { ok: false, status: 500, error: 'mapping_failed' };
  }

  const auditLogged = await recordEditorialAudit({
    actorUserId,
    action: nextStatus === 'suspended' ? 'editorial_profile_suspended' : 'editorial_profile_updated',
    metadata: {
      targetUserId,
      sanityAuthorId: profile.sanityAuthorId,
      editorialRole: profile.editorialRole,
      status: profile.status,
    },
  });

  return { ok: true, profile, auditLogged };
}

export async function createSanityAuthorAndLinkProfile({
  actorUserId,
  targetUserId,
  name,
  nickname,
  displayName,
  slug,
  editorialRole,
}: {
  actorUserId: string;
  targetUserId: string;
  name: unknown;
  nickname: unknown;
  displayName: unknown;
  slug: unknown;
  editorialRole: EditorialRole;
}): Promise<
  | { ok: true; author: SanityAuthorSummary; profile: EditorialProfile; auditLogged: boolean }
  | { ok: false; status: number; error: string; sanityAuthorId?: string }
> {
  const normalizedName = normalizeText(name, 120);
  const normalizedNickname = normalizeText(nickname, 120);
  const normalizedSlug = normalizeAuthorSlug(slug, normalizedNickname || normalizedName);
  const normalizedDisplayName = normalizeAuthorDisplayName(displayName, normalizedNickname);

  if (!normalizedName || normalizedName.length < 2 || !normalizedSlug) {
    return { ok: false, status: 400, error: 'invalid_author' };
  }

  const existingProfileResult = await fetchEditorialProfileByUserId(targetUserId);

  if (!existingProfileResult.available) {
    return { ok: false, status: 503, error: 'editorial_database_not_initialized' };
  }

  if (existingProfileResult.profile) {
    return { ok: false, status: 409, error: 'mapping_already_exists' };
  }

  const slugCollisionCount = await publicFreshClient.fetch<number>(
    'count(*[_type == "author" && slug.current == $slug])',
    { slug: normalizedSlug }
  );

  if (Number(slugCollisionCount || 0) > 0) {
    return { ok: false, status: 409, error: 'slug_already_exists' };
  }

  const writeClient = getSanityWriteClient();
  let createdAuthor: SanityAuthorSummary | null = null;

  try {
    const created = await writeClient.create({
      _type: 'author',
      name: normalizedName,
      ...(normalizedNickname ? { nickname: normalizedNickname } : {}),
      displayName: normalizedDisplayName,
      slug: {
        _type: 'slug',
        current: normalizedSlug,
      },
    });
    createdAuthor = normalizeSanityAuthor({
      _id: created._id,
      name: created.name as string,
      nickname: created.nickname as string,
      displayName: created.displayName as string,
      slug: (created.slug as { current?: string } | undefined)?.current || normalizedSlug,
      role: '',
      imagePreviewUrl: '',
    });

    if (!createdAuthor) {
      return { ok: false, status: 500, error: 'Sanity unavailable' };
    }

    const linkResult = await linkEditorialProfile({
      actorUserId,
      targetUserId,
      sanityAuthorId: createdAuthor._id,
      editorialRole,
    });

    if (!linkResult.ok) {
      const referenceCount = await writeClient.fetch<number>('count(*[references($authorId)])', {
        authorId: createdAuthor._id,
      });

      if (Number(referenceCount || 0) === 0) {
        try {
          await writeClient.delete(createdAuthor._id);
        } catch (cleanupError) {
          logApiError('editorial-author-cleanup', cleanupError);
        }
      }

      return {
        ok: false,
        status: linkResult.status,
        error: linkResult.error === 'mapping_failed' ? 'mapping_failed' : linkResult.error,
        sanityAuthorId: createdAuthor._id,
      };
    }

    const authorAuditLogged = await recordEditorialAudit({
      actorUserId,
      action: 'editorial_author_created',
      metadata: {
        targetUserId,
        sanityAuthorId: createdAuthor._id,
      },
    });

    return {
      ok: true,
      author: createdAuthor,
      profile: linkResult.profile,
      auditLogged: linkResult.auditLogged && authorAuditLogged,
    };
  } catch (error) {
    logApiError('editorial-author-create', error);

    return {
      ok: false,
      status: 500,
      error: createdAuthor ? 'mapping_failed' : 'Sanity unavailable',
      sanityAuthorId: createdAuthor?._id,
    };
  }
}
