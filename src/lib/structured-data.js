const SITE_URL = 'https://www.retro-gamers.it';
const WEBSITE_ID = `${SITE_URL}/#website`;

const cleanText = (value) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : '';

const getSlug = (item) => {
  if (!item) return '';

  return typeof item.slug === 'string'
    ? item.slug
    : item.slug?.current || '';
};

export const absoluteUrl = (url = '') => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http')) return url;

  return `${SITE_URL}${url.startsWith('/') ? url : `/${url}`}`;
};

const removeEmptyValues = (value) => {
  if (Array.isArray(value)) {
    return value
      .map(removeEmptyValues)
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, removeEmptyValues(item)])
      .filter(([, item]) => item !== undefined);

    return entries.length > 0
      ? Object.fromEntries(entries)
      : undefined;
  }

  return value === undefined || value === null || value === ''
    ? undefined
    : value;
};

export const createListItems = (items = [], getItem = (item) => item) =>
  items
    .map((item) => {
      const data = getItem(item) || {};
      const name = cleanText(data.name || item?.title || item?.name || '');
      const url = absoluteUrl(data.url || item?.url || '');

      return url
        ? {
            name,
            url
          }
        : null;
    })
    .filter(Boolean)
    .map((item, index) =>
      removeEmptyValues({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: item.url
      })
    )
    .filter(Boolean);

export const createCollectionPageStructuredData = ({
  url,
  name,
  description,
  lang = 'it',
  items = []
}) => {
  const pageUrl = absoluteUrl(url);
  const pageName = cleanText(name);
  const pageDescription = cleanText(description);
  const itemListId = `${pageUrl}#itemlist`;

  return [
    removeEmptyValues({
      '@type': 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: pageName,
      description: pageDescription,
      inLanguage: lang === 'en' ? 'en' : 'it',
      isPartOf: {
        '@id': WEBSITE_ID
      },
      mainEntity: {
        '@id': itemListId
      }
    }),
    removeEmptyValues({
      '@type': 'ItemList',
      '@id': itemListId,
      name: pageName,
      inLanguage: lang === 'en' ? 'en' : 'it',
      numberOfItems: items.length,
      itemListElement: items
    })
  ].filter(Boolean);
};

export const getStructuredDataSlug = getSlug;
