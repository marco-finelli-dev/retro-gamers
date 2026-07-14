const SITE_ORIGIN = 'https://www.retro-gamers.it';

const STATIC_LANGUAGE_PAIRS = [
  { it: '/', en: '/en/' },
  { it: '/chi-siamo/', en: '/en/about/' },
  { it: '/contatti/', en: '/en/contact/' },
  { it: '/collaborazioni/', en: '/en/collaborations/' },
  { it: '/privacy-policy/', en: '/en/privacy-policy/' },
  { it: '/cookie-policy/', en: '/en/cookie-policy/' },
  { it: '/come-lavoriamo/', en: '/en/how-we-work/' },
  { it: '/archivio/', en: '/en/archive/' },
  { it: '/risorse/', en: '/en/resources/' },
  { it: '/grazie/', en: '/en/thanks/' },
  { it: '/donazione-annullata/', en: '/en/donation-cancelled/' },
  { it: '/piattaforme/', en: '/en/platforms/' },
  { it: '/creatori/', en: '/en/creators/' },
  { it: '/aziende/', en: '/en/companies/' },
  { it: '/autori/', en: '/en/authors/' },
  { it: '/recensioni/', en: '/en/reviews/' },
  { it: '/news/', en: '/en/news/' },
  { it: '/speciali/', en: '/en/features/' },
  { it: '/guide/', en: '/en/guides/' },
  { it: '/interviste/', en: '/en/interviews/' },
  { it: '/memories/', en: '/en/memories/' },
  { it: '/hardware/', en: '/en/hardware/' }
];

const staticLanguageRoutes = new Map(
  STATIC_LANGUAGE_PAIRS.flatMap(({ it, en }) => [
    [it, en],
    [en, it]
  ])
);

const platformTypeToEnglish = {
  arcade: 'arcade',
  computer: 'computers',
  console: 'consoles'
};

const platformTypeToItalian = {
  arcade: 'arcade',
  computers: 'computer',
  consoles: 'console'
};

function normalizePath(pathname = '/') {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return path.endsWith('/') ? path : `${path}/`;
}

function toLocalUrl(value) {
  if (!value) return '';

  try {
    const parsed = new URL(value, SITE_ORIGIN);

    if (parsed.origin === SITE_ORIGIN) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return value;
  }

  return value;
}

function getExplicitSwitchUrl(languageSwitch) {
  if (typeof languageSwitch === 'string') {
    return toLocalUrl(languageSwitch);
  }

  return toLocalUrl(languageSwitch?.url);
}

function getAlternateSwitchUrl(alternateLanguages = [], targetLang) {
  const alternate = alternateLanguages.find((item) => item?.lang === targetLang);
  return toLocalUrl(alternate?.url);
}

function mapItalianPathToEnglish(pathname) {
  const path = normalizePath(pathname);

  if (staticLanguageRoutes.has(path)) {
    return staticLanguageRoutes.get(path);
  }

  const platformMatch = path.match(
    /^\/piattaforme\/(arcade|computer|console)(?:\/([^/]+)(?:\/([^/]+))?)?\/$/
  );

  if (platformMatch) {
    const [, type, manufacturer, platform] = platformMatch;
    const englishType = platformTypeToEnglish[type];

    if (platform) {
      return `/en/platforms/${englishType}/${manufacturer}/${platform}/`;
    }

    if (manufacturer) {
      return `/en/platforms/${englishType}/${manufacturer}/`;
    }

    return `/en/platforms/${englishType}/`;
  }

  const creatorMatch = path.match(/^\/creatori\/([^/]+)\/$/);
  if (creatorMatch) {
    return `/en/creators/${creatorMatch[1]}/`;
  }

  const companyMatch = path.match(/^\/aziende\/([^/]+)\/$/);
  if (companyMatch) {
    return `/en/companies/${companyMatch[1]}/`;
  }

  const authorMatch = path.match(/^\/autori\/([^/]+)\/$/);
  if (authorMatch) {
    return `/en/authors/${authorMatch[1]}/`;
  }

  return '';
}

function mapEnglishPathToItalian(pathname) {
  const path = normalizePath(pathname);

  if (staticLanguageRoutes.has(path)) {
    return staticLanguageRoutes.get(path);
  }

  const platformMatch = path.match(
    /^\/en\/platforms\/(arcade|computers|consoles)(?:\/([^/]+)(?:\/([^/]+))?)?\/$/
  );

  if (platformMatch) {
    const [, type, manufacturer, platform] = platformMatch;
    const italianType = platformTypeToItalian[type];

    if (platform) {
      return `/piattaforme/${italianType}/${manufacturer}/${platform}/`;
    }

    if (manufacturer) {
      return `/piattaforme/${italianType}/${manufacturer}/`;
    }

    return `/piattaforme/${italianType}/`;
  }

  const creatorMatch = path.match(/^\/en\/creators\/([^/]+)\/$/);
  if (creatorMatch) {
    return `/creatori/${creatorMatch[1]}/`;
  }

  const companyMatch = path.match(/^\/en\/companies\/([^/]+)\/$/);
  if (companyMatch) {
    return `/aziende/${companyMatch[1]}/`;
  }

  const authorMatch = path.match(/^\/en\/authors\/([^/]+)\/$/);
  if (authorMatch) {
    return `/autori/${authorMatch[1]}/`;
  }

  return '';
}

function getMappedSwitchUrl(currentUrl, lang) {
  const pathname = typeof currentUrl === 'string'
    ? new URL(currentUrl, SITE_ORIGIN).pathname
    : currentUrl?.pathname;

  if (!pathname) return '';

  return lang === 'en'
    ? mapEnglishPathToItalian(pathname)
    : mapItalianPathToEnglish(pathname);
}

export function getLanguageSwitchUrl({
  currentUrl,
  lang = 'it',
  languageSwitch = null,
  alternateLanguages = []
} = {}) {
  const targetLang = lang === 'en' ? 'it' : 'en';

  return (
    getExplicitSwitchUrl(languageSwitch) ||
    getAlternateSwitchUrl(alternateLanguages, targetLang) ||
    getMappedSwitchUrl(currentUrl, lang) ||
    (lang === 'en' ? '/' : '/en/')
  );
}
