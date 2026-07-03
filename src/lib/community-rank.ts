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
    descriptionIt: 'Primo livello della community.',
    descriptionEn: 'The first community level.',
    minPoints: 0,
  },
  {
    key: 'retro_fan',
    label: 'Retro Fan',
    descriptionIt: 'Partecipa alla vita del sito con le prime attività.',
    descriptionEn: 'Taking part in the site through early community activity.',
    minPoints: 25,
  },
  {
    key: 'memory_keeper',
    label: 'Memory Keeper',
    descriptionIt: 'Contribuisce a mantenere vive discussioni e passioni retro.',
    descriptionEn: 'Helping keep retro discussions and passions alive.',
    minPoints: 100,
  },
  {
    key: 'archive_expert',
    label: 'Archive Expert',
    descriptionIt: 'Partecipa con continuità alla community e ai contenuti del sito.',
    descriptionEn: 'Consistently active across the community and the site.',
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
    descriptionIt: 'Uno dei livelli più alti della community.',
    descriptionEn: 'One of the highest community levels.',
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
