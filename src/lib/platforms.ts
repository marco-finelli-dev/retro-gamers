import { client } from './sanity';

export type PlatformType = 'console' | 'computer' | 'arcade';

export type Platform = {
  _id: string;
  name: string;
  slug: string;
  platformType: PlatformType;
  badgeLabel?: string;

  logo?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };

  cover?: {
    asset?: {
      url?: string;
    };
    alt?: string;
  };

  manufacturer?: {
    name: string;
    slug: string;
    logo?: {
      asset?: {
        url?: string;
      };
      alt?: string;
    };
  };

  specs?: {
    year?: number;
    cpu?: string;
    ram?: string;
    gpu?: string;
    audio?: string;
    resolution?: string;
    media?: string;
  };
};

export const platformTypeLabels = {
  console: 'Console',
  computer: 'Computer',
  arcade: 'Arcade'
};

export const platformTypeDescriptions = {
  console: 'Sistemi da salotto, portatili e macchine nate per il gioco domestico.',
  computer: 'Home computer, personal computer e macchine che hanno fatto la storia dell’informatica domestica.',
  arcade: 'Cabinet, board e sistemi arcade che hanno definito l’esperienza da sala giochi.'
};

export async function getAllPlatforms(): Promise<Platform[]> {
  const data = await client.fetch(`
    *[
      _type == "platform" &&
      defined(slug.current) &&
      defined(platformType) &&
      !(_id in path("drafts.**"))
    ] | order(platformType asc, manufacturer->name asc, name asc) {
      _id,
      name,
      "slug": slug.current,
      platformType,
      badgeLabel,

      logo {
        asset->{ url },
        alt
      },

      cover {
        asset->{ url },
        alt
      },

      manufacturer->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      specs
    }
  `);

  return data || [];
}

export async function getPlatformsByType(type: PlatformType): Promise<Platform[]> {
  const data = await client.fetch(`
    *[
      _type == "platform" &&
      platformType == $type &&
      defined(slug.current) &&
      !(_id in path("drafts.**"))
    ] | order(manufacturer->name asc, name asc) {
      _id,
      name,
      "slug": slug.current,
      platformType,
      badgeLabel,

      logo {
        asset->{ url },
        alt
      },

      cover {
        asset->{ url },
        alt
      },

      manufacturer->{
        name,
        "slug": slug.current,
        logo {
          asset->{ url },
          alt
        }
      },

      specs
    }
  `, { type });

  return data || [];
}

export function groupPlatformsByManufacturer(platforms: Platform[] = []) {
  const groups = new Map<string, {
    manufacturer: Platform['manufacturer'];
    platforms: Platform[];
  }>();

  for (const platform of platforms) {
    const manufacturer = platform.manufacturer;
    const key = manufacturer?.slug || 'unknown';

    if (!groups.has(key)) {
      groups.set(key, {
        manufacturer: manufacturer || {
          name: 'Altro',
          slug: 'altro'
        },
        platforms: []
      });
    }

    groups.get(key)?.platforms.push(platform);
  }

  return Array.from(groups.values()).sort((a, b) =>
    (a.manufacturer?.name || '').localeCompare(b.manufacturer?.name || '')
  );
}

export function getPlatformTypeUrl(type: string) {
  return `/piattaforme/${type}/`;
}

export function getManufacturerUrl(type: string, manufacturerSlug: string) {
  return `/piattaforme/${type}/${manufacturerSlug}/`;
}

export function getPlatformUrl(platform: Platform) {
  const type = platform.platformType;
  const manufacturerSlug = platform.manufacturer?.slug || 'altro';

  return `/piattaforme/${type}/${manufacturerSlug}/${platform.slug}/`;
}

export async function getPlatformsByTypeAndManufacturer(
    type: PlatformType,
    manufacturerSlug: string
  ): Promise<Platform[]> {
    const data = await client.fetch(`
      *[
        _type == "platform" &&
        platformType == $type &&
        manufacturer->slug.current == $manufacturerSlug &&
        defined(slug.current) &&
        !(_id in path("drafts.**"))
      ] | order(name asc) {
        _id,
        name,
        "slug": slug.current,
        platformType,
        badgeLabel,
  
        logo {
          asset->{ url },
          alt
        },
  
        cover {
          asset->{ url },
          alt
        },
  
        manufacturer->{
          name,
          "slug": slug.current,
          logo {
            asset->{ url },
            alt
          }
        },
  
        specs
      }
    `, {
      type,
      manufacturerSlug
    });
  
    return data || [];
  }
  
  export async function getPlatformByPath(
    type: PlatformType,
    manufacturerSlug: string,
    platformSlug: string
  ): Promise<Platform | null> {
    const data = await client.fetch(`
      *[
        _type == "platform" &&
        platformType == $type &&
        manufacturer->slug.current == $manufacturerSlug &&
        slug.current == $platformSlug &&
        !(_id in path("drafts.**"))
      ][0] {
        _id,
        name,
        "slug": slug.current,
        platformType,
        badgeLabel,
  
        logo {
          asset->{ url },
          alt
        },
  
        cover {
          asset->{ url },
          alt
        },
  
        manufacturer->{
          name,
          "slug": slug.current,
          logo {
            asset->{ url },
            alt
          }
        },
  
        specs
      }
    `, {
      type,
      manufacturerSlug,
      platformSlug
    });
  
    return data || null;
  }
  
  export function getPlatformTypeFromParam(type: string | undefined): PlatformType {
    if (type === 'console' || type === 'computer' || type === 'arcade') {
      return type;
    }
  
    return 'console';
  }