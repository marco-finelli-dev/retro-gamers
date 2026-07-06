import { client } from '../sanity';
import { getUserSessionFromCookies } from './auth';

export const PLAYABLE_CLASSICS_DOWNLOAD_BUCKET =
  import.meta.env.SUPABASE_PLAYABLE_CLASSICS_BUCKET || 'playable-classics';

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

export function getPlayableClassicsStorageUnavailableResponse() {
  /*
    V0 intentionally does not generate signed URLs.
    A future milestone can replace this hard stop with a Supabase Storage
    signed URL after bucket, policy and download logging have been reviewed.
  */
  return {
    ok: false as const,
    status: 503 as const,
    code: 'service_unavailable' as const,
    message: 'Download storage is not configured yet.',
  };
}
