import type { EditorialRole } from './types';

type EditorialLabelLanguage = 'it' | 'en';

const editorialRoleLabels: Record<EditorialLabelLanguage, Record<EditorialRole, string>> = {
  it: {
    contributor: 'Collaboratore',
    editor: 'Editor',
    editorial_admin: 'Amministratore editoriale',
  },
  en: {
    contributor: 'Contributor',
    editor: 'Editor',
    editorial_admin: 'Editorial administrator',
  },
};

const publicAuthorRoleLabels: Record<EditorialLabelLanguage, Record<string, string>> = {
  it: {
    editor: 'Redattore',
    contributor: 'Collaboratore',
    guest: 'Ospite',
  },
  en: {
    editor: 'Editor',
    contributor: 'Contributor',
    guest: 'Guest',
  },
};

export function getEditorialRoleLabel(
  role: EditorialRole | null | undefined,
  language: EditorialLabelLanguage
) {
  return role ? editorialRoleLabels[language][role] || role : '';
}

export function getPublicAuthorRoleLabel(
  role: string | null | undefined,
  language: EditorialLabelLanguage
) {
  const fallback = language === 'en' ? 'Author' : 'Autore';

  return role ? publicAuthorRoleLabels[language][role] || fallback : fallback;
}
