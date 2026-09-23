import { createImageUrlBuilder } from '@sanity/image-url';
import { client } from './sanity';

const builder = createImageUrlBuilder(client);

export function urlFor(source) {
  return builder.image(source);
}

// Logos must retain the entire asset: two requested dimensions introduce a crop
// before CSS object-fit can contain it. Leave height to the original proportions.
export function getLogoUrl(source, width = 360) {
  if (!source?.asset) return '';
  return urlFor({ asset: source.asset }).width(width).fit('max').auto('format').url();
}
