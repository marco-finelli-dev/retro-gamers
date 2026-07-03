export type CommunityRankKey =
  | 'rookie'
  | 'retro_fan'
  | 'memory_keeper'
  | 'archive_expert'
  | 'veteran'
  | 'grand_master';

export type CommunityRankDefinition = {
  key: CommunityRankKey;
  label: string;
  descriptionIt: string;
  descriptionEn: string;
  minPoints: number;
};

export type CommunityRank = CommunityRankDefinition & {
  points: number;
  nextRank: CommunityRankDefinition | null;
  progressToNext: number;
};

export const communityRankThresholds: CommunityRankDefinition[] = [
  {
    key: 'rookie',
    label: 'Rookie',
    descriptionIt: 'Ha appena iniziato il suo percorso nella community.',
    descriptionEn: 'Just starting their journey in the community.',
    minPoints: 0,
  },
  {
    key: 'retro_fan',
    label: 'Retro Fan',
    descriptionIt: 'Partecipa alla vita del sito con i primi commenti, voti e interessi.',
    descriptionEn: 'Taking part in the site with early comments, ratings and interests.',
    minPoints: 25,
  },
  {
    key: 'memory_keeper',
    label: 'Memory Keeper',
    descriptionIt: 'Contribuisce a tenere vivi ricordi, discussioni e passioni retro.',
    descriptionEn: 'Helping keep retro memories, discussions and passions alive.',
    minPoints: 100,
  },
  {
    key: 'archive_expert',
    label: 'Archive Expert',
    descriptionIt: 'Partecipa con continuità e conosce bene gli angoli dell’archivio.',
    descriptionEn: 'Consistently active and familiar with the archive.',
    minPoints: 250,
  },
  {
    key: 'veteran',
    label: 'Veteran',
    descriptionIt: 'Una presenza solida nella community di Retro-Gamers.',
    descriptionEn: 'A solid presence in the Retro-Gamers community.',
    minPoints: 500,
  },
  {
    key: 'grand_master',
    label: 'Grand Master',
    descriptionIt: 'Un membro storico e molto attivo della community.',
    descriptionEn: 'A long-standing and highly active member of the community.',
    minPoints: 1000,
  },
];

export const getCommunityRank = (points: number | null | undefined): CommunityRank => {
  const safePoints = Math.max(0, Math.floor(Number(points || 0)));
  let currentIndex = 0;

  for (let index = 0; index < communityRankThresholds.length; index += 1) {
    if (safePoints >= communityRankThresholds[index].minPoints) {
      currentIndex = index;
    }
  }

  const currentRank = communityRankThresholds[currentIndex];
  const nextRank = communityRankThresholds[currentIndex + 1] || null;
  const progressToNext = nextRank
    ? Math.min(
        100,
        Math.max(
          0,
          ((safePoints - currentRank.minPoints) /
            (nextRank.minPoints - currentRank.minPoints)) * 100
        )
      )
    : 100;

  return {
    ...currentRank,
    points: safePoints,
    nextRank,
    progressToNext,
  };
};
