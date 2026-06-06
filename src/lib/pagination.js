export const PAGE_SIZE = 12;

export function getCurrentPage(url) {
  const value = Number.parseInt(url?.searchParams?.get('page') || '1', 10);

  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function getTotalPages(totalItems = 0, pageSize = PAGE_SIZE) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateItems(items = [], currentPage = 1, pageSize = PAGE_SIZE) {
  const total = items.length;
  const totalPages = getTotalPages(total, pageSize);
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const offset = (page - 1) * pageSize;

  return {
    currentPage: page,
    total,
    totalPages,
    items: items.slice(offset, offset + pageSize),
  };
}

export function getPaginationUrl(url, pageNumber) {
  const nextUrl = new URL(url);
  const page = Number.parseInt(pageNumber, 10);

  if (!Number.isFinite(page) || page <= 1) {
    nextUrl.searchParams.delete('page');
  } else {
    nextUrl.searchParams.set('page', String(page));
  }

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}
