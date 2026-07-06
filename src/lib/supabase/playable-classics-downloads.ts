import { client } from '../sanity';
import { getUserSessionFromCookies } from './auth';
import { supabaseAdmin } from './server';

export const PLAYABLE_CLASSICS_DOWNLOAD_BUCKET =
  String(import.meta.env.SUPABASE_PLAYABLE_CLASSICS_BUCKET || '').trim();

export const PLAYABLE_CLASSICS_SIGNED_URL_EXPIRES_IN = 120;

export type PlayableClassicDownloadRecord = {
  _id: string;
  title?: string;
  slug?: string;
  isPublished?: boolean;
  downloadable?: boolean;
  distributionType?: string;
  requiresLogin?: boolean;
  packageName?: string;
  packageVersion?: string;
  packageSize?: string;
  checksumSha256?: string;
  storagePath?: string;
};

export type PlayableClassicDownloadErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'not_downloadable'
  | 'invalid_distribution'
  | 'login_required'
  | 'missing_storage_path'
  | 'service_unavailable';

export type PlayableClassicDownloadCheck =
  | {
      ok: true;
      status: 200;
      session: Awaited<ReturnType<typeof getUserSessionFromCookies>>;
      classic: PlayableClassicDownloadRecord;
    }
  | {
      ok: false;
      status: 401 | 403 | 404 | 503;
      code: PlayableClassicDownloadErrorCode;
      message: string;
    };

export type PlayableClassicSignedUrlResult =
  | {
      ok: true;
      signedUrl: string;
      expiresIn: number;
    }
  | {
      ok: false;
      status: 503;
      code: 'service_unavailable';
      message: string;
    };

const downloadRecordProjection = `
  _id,
  title,
  "slug": slug.current,
  isPublished,
  downloadable,
  distributionType,
  requiresLogin,
  packageName,
  packageVersion,
  packageSize,
  checksumSha256,
  storagePath
`;

export async function getPlayableClassicDownloadRecord(
  slug: string
): Promise<PlayableClassicDownloadRecord | null> {
  if (!slug) return null;

  const data = await client.fetch(
    `
      *[
        _type == "playableClassic" &&
        defined(slug.current) &&
        !(_id in path("drafts.**")) &&
        slug.current == $slug
      ][0] {
        ${downloadRecordProjection}
      }
    `,
    { slug }
  );

  return data || null;
}

export async function checkPlayableClassicDownloadRequest({
  cookies,
  slug,
}: {
  cookies: any;
  slug: string;
}): Promise<PlayableClassicDownloadCheck> {
  const session = await getUserSessionFromCookies(cookies);

  if (session.error || !session.user || !session.profile) {
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: session.error || 'Authentication required.',
    };
  }

  const classic = await getPlayableClassicDownloadRecord(slug);

  if (!classic || classic.isPublished !== true) {
    return {
      ok: false,
      status: 404,
      code: 'not_found',
      message: 'Playable classic not found.',
    };
  }

  if (classic.downloadable !== true) {
    return {
      ok: false,
      status: 403,
      code: 'not_downloadable',
      message: 'This playable classic is not available for download.',
    };
  }

  if (classic.distributionType !== 'internalDownload') {
    return {
      ok: false,
      status: 403,
      code: 'invalid_distribution',
      message: 'This playable classic is not configured for internal downloads.',
    };
  }

  if (classic.requiresLogin !== true) {
    return {
      ok: false,
      status: 403,
      code: 'login_required',
      message: 'Downloads must require a registered account.',
    };
  }

  if (!classic.storagePath) {
    return {
      ok: false,
      status: 403,
      code: 'missing_storage_path',
      message: 'This playable classic does not have a private storage path configured.',
    };
  }

  return {
    ok: true,
    status: 200,
    session,
    classic,
  };
}

function getStorageUnavailableResponse(): PlayableClassicSignedUrlResult {
  return {
    ok: false,
    status: 503,
    code: 'service_unavailable',
    message: 'Download storage is not configured yet.',
  };
}

export function isPlayableClassicsDownloadStorageConfigured() {
  return Boolean(
    PLAYABLE_CLASSICS_DOWNLOAD_BUCKET &&
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function createPlayableClassicSignedUrl(
  classic: PlayableClassicDownloadRecord
): Promise<PlayableClassicSignedUrlResult> {
  if (!classic.storagePath || !isPlayableClassicsDownloadStorageConfigured()) {
    return getStorageUnavailableResponse();
  }

  const { data, error } = await supabaseAdmin
    .storage
    .from(PLAYABLE_CLASSICS_DOWNLOAD_BUCKET)
    .createSignedUrl(
      classic.storagePath,
      PLAYABLE_CLASSICS_SIGNED_URL_EXPIRES_IN,
      {
        download: classic.packageName || true,
      }
    );

  if (error || !data?.signedUrl) {
    console.warn('Playable Classics signed URL generation failed:', {
      code: error?.name,
      message: error?.message,
    });

    return getStorageUnavailableResponse();
  }

  return {
    ok: true,
    signedUrl: data.signedUrl,
    expiresIn: PLAYABLE_CLASSICS_SIGNED_URL_EXPIRES_IN,
  };
}

export async function logPlayableClassicDownload({
  userId,
  classic,
  userAgent = '',
}: {
  userId: string;
  classic: PlayableClassicDownloadRecord;
  userAgent?: string;
}) {
  if (!classic.storagePath) {
    return { ok: false, error: 'missing_storage_path' };
  }

  const { error } = await supabaseAdmin
    .from('playable_classic_download_logs')
    .insert({
      user_id: userId,
      playable_classic_id: classic._id,
      slug: classic.slug || '',
      package_name: classic.packageName || null,
      package_version: classic.packageVersion || null,
      storage_path: classic.storagePath,
      user_agent: userAgent || null,
    });

  if (error) {
    console.warn('Playable Classics download log failed:', {
      code: error.code,
      message: error.message,
      details: error.details,
    });

    return { ok: false, error };
  }

  return { ok: true, error: null };
}
