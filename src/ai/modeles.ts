// Constantes IA légères (le SDK Claude est chargé à la demande pour garder un bundle initial léger).
export const MODELES = [
  { id: 'claude-sonnet-5-5', libelle: 'Claude Sonnet 5.5 (recommandé)' },
  { id: 'claude-haiku-5-5', libelle: 'Claude Haiku 5.5 (plus économique)' },
  { id: 'claude-opus-5-5', libelle: 'Claude Opus 5.5 (plus précis, plus cher)' },
];

export class ErreurIA extends Error {
  constructor(
    message: string,
    public definitive = false,
  ) {
    super(message);
  }
}

export interface UsageIA {
  jetonsEntree: number;
  jetonsSortie: number;
  recherches: number;
}
