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
  downloadPackages?: PlayableClassicDownloadPackageRecord[];
};

export type PlayableClassicDownloadPackageRecord = {
  packageId?: string;
  title?: string;
  packageType?: string;
  language?: string;
  packageVersion?: string;
  packageSize?: string;
  checksumSha256?: string;
  storageProvider?: string;
  storagePath?: string;
  isActive?: boolean;
  requiresLogin?: boolean;
  notes?: string;
};

export type PlayableClassicDownloadErrorCode =
  | 'unauthorized'
  | 'not_found'
  | 'package_required'
  | 'package_not_found'
  | 'package_inactive'
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
      downloadPackage: PlayableClassicDownloadPackageRecord;
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
  downloadPackages[]{
    "packageId": coalesce(packageId.current, packageId),
    title,
    packageType,
    language,
    packageVersion,
    packageSize,
    checksumSha256,
    storageProvider,
    storagePath,
    isActive,
    requiresLogin,
    notes
  }
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

function getConfiguredDownloadPackages(
  classic: PlayableClassicDownloadRecord
): PlayableClassicDownloadPackageRecord[] {
  return (classic.downloadPackages || [])
    .filter((downloadPackage) => downloadPackage?.packageId)
    .map((downloadPackage) => ({
      ...downloadPackage,
      packageId: String(downloadPackage.packageId || '').trim(),
    }));
}

function selectDownloadPackage({
  classic,
  packageId,
}: {
  classic: PlayableClassicDownloadRecord;
  packageId?: string;
}):
  | { ok: true; downloadPackage: PlayableClassicDownloadPackageRecord }
  | {
      ok: false;
      status: 403 | 404;
      code: PlayableClassicDownloadErrorCode;
      message: string;
    } {
  const configuredPackages = getConfiguredDownloadPackages(classic);
  const requestedPackageId = String(packageId || '').trim();

  if (requestedPackageId) {
    const downloadPackage = configuredPackages.find(
      (item) => item.packageId === requestedPackageId
    );

    if (!downloadPackage) {
      return {
        ok: false,
        status: 404,
        code: 'package_not_found',
        message: 'Download package not found.',
      };
    }

    if (downloadPackage.isActive === false) {
      return {
        ok: false,
        status: 403,
        code: 'package_inactive',
        message: 'This download package is not active.',
      };
    }

    return { ok: true, downloadPackage };
  }

  const activePackages = configuredPackages.filter(
    (downloadPackage) => downloadPackage.isActive !== false
  );

  if (activePackages.length === 1) {
    return { ok: true, downloadPackage: activePackages[0] };
  }

  if (activePackages.length > 1) {
    return {
      ok: false,
      status: 403,
      code: 'package_required',
      message: 'Select a download package.',
    };
  }

  return {
    ok: false,
    status: 403,
    code: 'missing_storage_path',
    message: 'This playable classic does not have a private storage path configured.',
  };
}

export async function checkPlayableClassicDownloadRequest({
  cookies,
  slug,
  packageId,
}: {
  cookies: any;
  slug: string;
  packageId?: string;
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

  const selectedPackage = selectDownloadPackage({ classic, packageId });

  if (!selectedPackage.ok) {
    return {
      ok: false,
      status: selectedPackage.status,
      code: selectedPackage.code,
      message: selectedPackage.message,
    };
  }

  if (!selectedPackage.downloadPackage.storagePath) {
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
    downloadPackage: selectedPackage.downloadPackage,
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

function decodeFilenameIfUrlEncoded(filename: string) {
  if (!/%[0-9a-f]{2}/i.test(filename)) {
    return filename;
  }

  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

function getDownloadFilenameFromStoragePath(storagePath?: string) {
  const normalizedPath = String(storagePath || '').replace(/\\/g, '/').trim();
  const basename = normalizedPath.split('/').filter(Boolean).pop() || '';
  const decodedBasename = decodeFilenameIfUrlEncoded(basename);
  const safeBasename = decodedBasename
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/]/g, '-')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[<>:"|?*%]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\.\.+/g, '.')
    .replace(/^\.+/, '')
    .trim();

  const safeFilename = safeBasename || 'download.zip';

  if (/\.zip$/i.test(safeFilename)) {
    return safeFilename.replace(/(\.zip)+$/i, '.zip');
  }

  return `${safeFilename.replace(/\.+$/, '') || 'download'}.zip`;
}

export function isPlayableClassicsDownloadStorageConfigured() {
  return Boolean(
    PLAYABLE_CLASSICS_DOWNLOAD_BUCKET &&
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function createPlayableClassicSignedUrl(
  downloadPackage: PlayableClassicDownloadPackageRecord
): Promise<PlayableClassicSignedUrlResult> {
  if (!downloadPackage.storagePath || !isPlayableClassicsDownloadStorageConfigured()) {
    return getStorageUnavailableResponse();
  }

  const { data, error } = await supabaseAdmin
    .storage
    .from(PLAYABLE_CLASSICS_DOWNLOAD_BUCKET)
    .createSignedUrl(
      downloadPackage.storagePath,
      PLAYABLE_CLASSICS_SIGNED_URL_EXPIRES_IN,
      {
        download: getDownloadFilenameFromStoragePath(downloadPackage.storagePath),
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
  downloadPackage,
  userAgent = '',
}: {
  userId: string;
  classic: PlayableClassicDownloadRecord;
  downloadPackage: PlayableClassicDownloadPackageRecord;
  userAgent?: string;
}) {
  if (!downloadPackage.storagePath) {
    return { ok: false, error: 'missing_storage_path' };
  }

  const logPayload = {
    user_id: userId,
    playable_classic_id: classic._id,
    slug: classic.slug || '',
    package_name: downloadPackage.title || null,
    package_version: downloadPackage.packageVersion || null,
    storage_path: downloadPackage.storagePath,
    user_agent: userAgent || null,
  };

  const { error } = await supabaseAdmin
    .from('playable_classic_download_logs')
    .insert({
      ...logPayload,
      package_id: downloadPackage.packageId || null,
      package_title: downloadPackage.title || null,
    });

  if (error) {
    const missingNewLogColumns =
      error.code === 'PGRST204' ||
      error.code === '42703' ||
      String(error.message || '').includes('package_id') ||
      String(error.message || '').includes('package_title');

    if (missingNewLogColumns) {
      const fallbackResult = await supabaseAdmin
        .from('playable_classic_download_logs')
        .insert(logPayload);

      if (!fallbackResult.error) {
        return { ok: true, error: null };
      }
    }

    console.warn('Playable Classics download log failed:', {
      code: error.code,
      message: error.message,
      details: error.details,
    });

    return { ok: false, error };
  }

  return { ok: true, error: null };
}
