export type AiTransparency =
  | 'none'
  | 'aiTranslation'
  | 'aiAssistedSections'
  | 'legacyAiAssisted';

export type AiTransparencyLanguage = 'it' | 'en';

const standardNotes: Record<Exclude<AiTransparency, 'none'>, Record<AiTransparencyLanguage, string>> = {
  aiTranslation: {
    it: 'Questo articolo è stato tradotto con l’assistenza di strumenti di intelligenza artificiale. Le traduzioni vengono revisionate, ma se trovi passaggi poco naturali o poco chiari, segnalaceli: il tuo feedback ci aiuta a migliorare Retro-Gamers.it.',
    en: 'This article was originally written in Italian and translated into English with the assistance of AI tools. We review our translations, but some phrasing may still sound unnatural or unclear. If you notice anything that could be improved, please let us know. Reader feedback helps us make Retro-Gamers.it better.'
  },
  aiAssistedSections: {
    it: 'Questo articolo contiene alcune sezioni realizzate con l’ausilio di strumenti di intelligenza artificiale. Se trovi passaggi poco chiari, artificiosi o inesatti, segnalaceli: li verificheremo e, quando necessario, li correggeremo.',
    en: 'Some sections of this article were created with the assistance of AI tools. If you find anything unclear, unnatural or inaccurate, please let us know and we will review it.'
  },
  legacyAiAssisted: {
    it: 'Questo articolo è stato realizzato con l’assistenza di strumenti di intelligenza artificiale. Retro-Gamers.it sta progressivamente adottando una linea editoriale basata su testi scritti direttamente dagli autori.',
    en: 'This article was created with the assistance of AI tools. Retro-Gamers.it is progressively adopting an editorial approach based on texts written directly by its authors.'
  }
};

export function getAiTransparencyNote(
  value: unknown,
  language: AiTransparencyLanguage,
  customNote?: unknown
) {
  const note = typeof customNote === 'string' ? customNote.trim() : '';
  if (note) return note;

  if (value !== 'aiTranslation' && value !== 'aiAssistedSections' && value !== 'legacyAiAssisted') {
    return '';
  }

  return standardNotes[value][language];
}
