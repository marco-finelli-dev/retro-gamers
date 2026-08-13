import { getUserSessionFromCookies } from '../supabase/auth';
import { supabaseAdmin } from '../supabase/server';
import { getEditorialPermissions } from './permissions';
import {
  isEditorialRole,
  isEditorialStatus,
  normalizeSanityRootDocumentId,
  type EditorialProfile,
  type EditorialSessionContext,
} from './types';

type EditorialProfileRow = {
  user_id: string | null;
  sanity_author_id: string | null;
  editorial_role: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const missingEditorialSchemaSignals = [
  'editorial_profiles',
  'schema cache',
  'relation',
  'does not exist',
];

function isMissingEditorialProfilesTableError(error: {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null | undefined) {
  if (!error) return false;

  const message = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();

  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST204' ||
    missingEditorialSchemaSignals.every((signal) => message.includes(signal))
  );
}

function normalizeEditorialProfile(row: EditorialProfileRow | null): {
  editorialProfile: EditorialProfile | null;
  error: string | null;
} {
  if (!row) {
    return {
      editorialProfile: null,
      error: null,
    };
  }

  const userId = String(row.user_id || '').trim();
  const sanityAuthorId = normalizeSanityRootDocumentId(row.sanity_author_id);

  if (!userId || !sanityAuthorId) {
    return {
      editorialProfile: null,
      error: 'Profilo editoriale non valido.',
    };
  }

  if (!isEditorialRole(row.editorial_role)) {
    return {
      editorialProfile: null,
      error: 'Ruolo editoriale non valido.',
    };
  }

  if (!isEditorialStatus(row.status)) {
    return {
      editorialProfile: null,
      error: 'Stato editoriale non valido.',
    };
  }

  return {
    editorialProfile: {
      userId,
      sanityAuthorId,
      editorialRole: row.editorial_role,
      status: row.status,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    },
    error: null,
  };
}

function createEditorialContext({
  user,
  profile,
  authError = null,
  authStatus = 200,
  editorialProfile = null,
  editorialProfileError = null,
}: Omit<EditorialSessionContext, 'editorialRole' | 'sanityAuthorId' | 'isEditorialActive' | 'permissions'>): EditorialSessionContext {
  const editorialRole = editorialProfile?.editorialRole || null;
  const sanityAuthorId = editorialProfile?.sanityAuthorId || null;
  const isEditorialActive = editorialProfile?.status === 'active';
  const permissions = getEditorialPermissions(editorialRole, editorialProfile?.status || null);

  return {
    user,
    profile,
    authError,
    authStatus,
    editorialProfile,
    editorialProfileError,
    editorialRole,
    sanityAuthorId,
    isEditorialActive,
    permissions,
  };
}

export async function getEditorialSessionFromCookies(cookies: Parameters<typeof getUserSessionFromCookies>[0]) {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return createEditorialContext({
      user: null,
      profile: null,
      authError: session.error || 'Sessione non valida.',
      authStatus: session.status || 401,
      editorialProfile: null,
      editorialProfileError: null,
    });
  }

  const { data, error } = await supabaseAdmin
    .from('editorial_profiles')
    .select('user_id, sanity_author_id, editorial_role, status, created_at, updated_at')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    const editorialProfileError = isMissingEditorialProfilesTableError(error)
      ? 'Schema editoriale non installato.'
      : error.message;

    return createEditorialContext({
      user: session.user,
      profile: session.profile,
      authError: null,
      authStatus: 200,
      editorialProfile: null,
      editorialProfileError,
    });
  }

  const normalized = normalizeEditorialProfile(data as EditorialProfileRow | null);

  return createEditorialContext({
    user: session.user,
    profile: session.profile,
    authError: null,
    authStatus: 200,
    editorialProfile: normalized.editorialProfile,
    editorialProfileError: normalized.error,
  });
}
