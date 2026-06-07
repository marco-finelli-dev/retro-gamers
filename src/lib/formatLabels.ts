type FormatLang = 'it' | 'en';
type FormatVariant = 'default' | 'compact';

const defaultLabels: Record<FormatLang, Record<string, string>> = {
  it: {
    cartridge: 'Cartuccia',
    floppy: 'Floppy disk',
    tape: 'Cassetta / tape',
    cdrom: 'CD-ROM',
    'cd-rom': 'CD-ROM',
    dvdrom: 'DVD-ROM',
    'dvd-rom': 'DVD-ROM',
    gdrom: 'GD-ROM',
    'gd-rom': 'GD-ROM',
    hucard: 'HuCard',
    arcade_pcb: 'PCB arcade',
    'arcade-pcb': 'PCB arcade',
    digital: 'Digitale',
    other: 'Altro',
  },
  en: {
    cartridge: 'Cartridge',
    floppy: 'Floppy disk',
    tape: 'Cassette / tape',
    cdrom: 'CD-ROM',
    'cd-rom': 'CD-ROM',
    dvdrom: 'DVD-ROM',
    'dvd-rom': 'DVD-ROM',
    gdrom: 'GD-ROM',
    'gd-rom': 'GD-ROM',
    hucard: 'HuCard',
    arcade_pcb: 'Arcade PCB',
    'arcade-pcb': 'Arcade PCB',
    digital: 'Digital',
    other: 'Other',
  },
};

const compactLabels: Record<string, string> = {
  cartridge: 'CART',
  floppy: 'FLOPPY',
  tape: 'TAPE',
  cdrom: 'CD-ROM',
  'cd-rom': 'CD-ROM',
  dvdrom: 'DVD-ROM',
  'dvd-rom': 'DVD-ROM',
  gdrom: 'GD-ROM',
  'gd-rom': 'GD-ROM',
  hucard: 'HuCard',
  arcade_pcb: 'PCB',
  'arcade-pcb': 'PCB',
  digital: 'DIGITAL',
  other: 'OTHER',
};

const formatAliases: Record<string, string> = {
  cdrom: 'cd-rom',
  'cd-rom': 'cdrom',
  dvdrom: 'dvd-rom',
  'dvd-rom': 'dvdrom',
  gdrom: 'gd-rom',
  'gd-rom': 'gdrom',
  arcade_pcb: 'arcade-pcb',
  'arcade-pcb': 'arcade_pcb',
};

export function getFormatFilterValue(format: unknown) {
  return String(format || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export function getFormatFilterAliases(format: unknown) {
  const value = getFormatFilterValue(format);
  const alias = formatAliases[value];

  return [...new Set([value, alias].filter(Boolean))];
}

export function getFormatLabel(
  format: unknown,
  lang: FormatLang = 'it',
  options: { variant?: FormatVariant } = {}
) {
  const value = getFormatFilterValue(format);
  if (!value) return '';

  if (options.variant === 'compact') {
    return compactLabels[value] || value;
  }

  const labels = defaultLabels[lang] || defaultLabels.it;

  return labels[value] || defaultLabels.it[value] || value;
}
