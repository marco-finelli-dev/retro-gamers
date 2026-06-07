const SITE_ORIGIN = 'https://www.retro-gamers.it';

const staticLanguageRoutes = new Map([
  ['/', '/en/'],
  ['/en/', '/'],
  ['/chi-siamo/', '/en/about/'],
  ['/en/about/', '/chi-siamo/'],
  ['/contatti/', '/en/contact/'],
  ['/en/contact/', '/contatti/'],
  ['/collaborazioni/', '/en/collaborations/'],
  ['/en/collaborations/', '/collaborazioni/'],
  ['/privacy-policy/', '/en/privacy-policy/'],
  ['/en/privacy-policy/', '/privacy-policy/'],
  ['/cookie-policy/', '/en/cookie-policy/'],
  ['/en/cookie-policy/', '/cookie-policy/'],
  ['/come-lavoriamo/', '/en/how-we-work/'],
  ['/en/how-we-work/', '/come-lavoriamo/'],
  ['/archivio/', '/en/archive/'],
  ['/en/archive/', '/archivio/'],
  ['/risorse/', '/en/resources/'],
  ['/en/resources/', '/risorse/'],
  ['/grazie/', '/en/thanks/'],
  ['/en/thanks/', '/grazie/'],
  ['/donazione-annullata/', '/en/donation-cancelled/'],
  ['/en/donation-cancelled/', '/donazione-annullata/'],
  ['/piattaforme/', '/en/platforms/'],
  ['/en/platforms/', '/piattaforme/'],
  ['/creatori/', '/en/creators/'],
  ['/en/creators/', '/creatori/'],
  ['/aziende/', '/en/companies/'],
  ['/en/companies/', '/aziende/'],
  ['/autori/', '/en/authors/'],
  ['/en/authors/', '/autori/'],
  ['/recensioni/', '/en/reviews/'],
  ['/en/reviews/', '/recensioni/'],
  ['/news/', '/en/news/'],
  ['/en/news/', '/news/'],
  ['/speciali/', '/en/features/'],
  ['/en/features/', '/speciali/'],
  ['/guide/', '/en/guides/'],
  ['/en/guides/', '/guide/'],
  ['/interviste/', '/en/interviews/'],
  ['/en/interviews/', '/interviste/'],
  ['/memories/', '/en/memories/'],
  ['/en/memories/', '/memories/'],
  ['/hardware/', '/en/hardware/'],
  ['/en/hardware/', '/hardware/']
]);

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
