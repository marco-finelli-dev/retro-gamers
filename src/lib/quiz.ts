import { publicClient, publicFreshClient } from './sanity';

export type QuizLanguage = 'it' | 'en';

export type QuizImage = {
  alt?: string;
  asset?: {
    _id?: string;
    url?: string;
  };
};

export type QuizTranslation = {
  _id?: string;
  title?: string;
  slug?: string;
  language?: QuizLanguage;
};

export type QuizSummary = {
  _id: string;
  title: string;
  slug: string;
  language?: QuizLanguage;
  quizKey?: string;
  subtitle?: string;
  excerpt?: string;
  coverImage?: QuizImage;
  difficulty?: string;
  timeLimitSeconds?: number;
  questionCount?: number;
  featured?: boolean;
  publishedAt?: string;
};

export type QuizDetail = QuizSummary & {
  seoTitle?: string;
  metaDescription?: string;
  translatedVersion?: QuizTranslation;
  translatedVersions?: QuizTranslation[];
};

export type QuizRuntimeAnswer = {
  answerId?: string;
  text?: string;
};

export type QuizRuntimeQuestion = {
  questionId?: string;
  text?: string;
  image?: QuizImage;
  answers?: QuizRuntimeAnswer[];
};

export type QuizRuntime = Pick<
  QuizSummary,
  '_id' | 'title' | 'slug' | 'language' | 'quizKey' | 'timeLimitSeconds'
> & {
  isPublished?: boolean;
  questions?: QuizRuntimeQuestion[];
};

const quizSummaryFields = `
  _id,
  title,
  "slug": slug.current,
  language,
  quizKey,
  subtitle,
  excerpt,
  coverImage {
    asset->{ _id, url },
    alt
  },
  difficulty,
  timeLimitSeconds,
  "questionCount": count(questions),
  featured,
  publishedAt
`;

const quizDetailFields = `
  ${quizSummaryFields},
  seoTitle,
  metaDescription,
  translatedVersion->{
    _id,
    title,
    "slug": slug.current,
    language
  },
  "translatedVersions": *[
    _type == "quiz" &&
    translatedVersion._ref == ^._id &&
    coalesce(isPublished, false) == true &&
    !(_id in path("drafts.**"))
  ]{
    _id,
    title,
    "slug": slug.current,
    language
  }
`;

const quizRuntimeFields = `
  _id,
  title,
  "slug": slug.current,
  language,
  quizKey,
  isPublished,
  timeLimitSeconds,
  questions[]{
    questionId,
    text,
    image {
      asset->{ _id, url },
      alt
    },
    answers[]{
      answerId,
      text
    }
  }
`;

const publicQuizFilter = `
  _type == "quiz" &&
  defined(slug.current) &&
  !(_id in path("drafts.**")) &&
  coalesce(isPublished, false) == true
`;

export function getQuizUrl(
  quiz: Pick<QuizSummary, 'slug' | 'language'> | QuizTranslation | null | undefined,
  lang: QuizLanguage = quiz?.language === 'en' ? 'en' : 'it'
) {
  const slug =
    typeof quiz?.slug === 'string'
      ? quiz.slug
      : '';

  if (!slug) {
    return lang === 'en' ? '/en/quiz/' : '/quiz/';
  }

  return lang === 'en'
    ? `/en/quiz/${slug}/`
    : `/quiz/${slug}/`;
}

export async function getPublishedQuizSummaries(
  language: QuizLanguage = 'it'
): Promise<QuizSummary[]> {
  const data = await publicClient.fetch(
    `
      *[
        ${publicQuizFilter} &&
        language == $language
      ] | order(coalesce(featured, false) desc, coalesce(publishedAt, _createdAt) desc, title asc) {
        ${quizSummaryFields}
      }
    `,
    { language }
  );

  return data || [];
}

export async function getPublishedQuizBySlug(
  slug: string,
  language: QuizLanguage = 'it'
): Promise<QuizDetail | null> {
  const normalizedSlug = String(slug || '').trim();

  if (!normalizedSlug) return null;

  const data = await publicFreshClient.fetch(
    `
      *[
        ${publicQuizFilter} &&
        slug.current == $slug &&
        language == $language
      ][0] {
        ${quizDetailFields}
      }
    `,
    { slug: normalizedSlug, language }
  );

  return data || null;
}

export async function getPublishedQuizRuntimeBySlug(
  slug: string,
  language: QuizLanguage = 'it'
): Promise<QuizRuntime | null> {
  const normalizedSlug = String(slug || '').trim();

  if (!normalizedSlug) return null;

  const data = await publicFreshClient.fetch(
    `
      *[
        ${publicQuizFilter} &&
        slug.current == $slug &&
        language == $language
      ][0] {
        ${quizRuntimeFields}
      }
    `,
    { slug: normalizedSlug, language }
  );

  return data || null;
}

export async function getPublishedQuizRuntimeById(
  id: string
): Promise<QuizRuntime | null> {
  const normalizedId = String(id || '').trim();

  if (!normalizedId) return null;

  const data = await publicFreshClient.fetch(
    `
      *[
        ${publicQuizFilter} &&
        _id == $id
      ][0] {
        ${quizRuntimeFields}
      }
    `,
    { id: normalizedId }
  );

  return data || null;
}
