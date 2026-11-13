// Accès aux données pour l'interface.
import { signal } from '@preact/signals';
import { etat } from '../db/store';
import type { DB, Voyage } from '../db/types';
import { today } from '../domain/dates';
import { voyageActif } from '../domain/rules';

/** Date du jour, réévaluée chaque minute (le choix « Ici » expire à minuit) */
export const jourCourant = signal(today());
if (typeof window !== 'undefined')
  setInterval(() => {
    const j = today();
    if (j !== jourCourant.value) jourCourant.value = j;
  }, 30_000);

export function useDb(): DB {
  return etat.value!;
}

export function useVoyage(): Voyage {
  return voyageActif(etat.value!)!;
}

export function useJour(): string {
  return jourCourant.value;
}

export function nomEtape(db: DB, id: string | undefined): string {
  return db.etapes.find((e) => e.id === id)?.ville ?? '—';
}

export function nomCategorie(db: DB, id: string | undefined): string | undefined {
  return db.categories.find((c) => c.id === id)?.libelle;
}

export function categoriesTriees(db: DB) {
  return [...db.categories].sort((a, b) => a.ordre - b.ordre);
}

export function groupesTries(db: DB) {
  return [...db.groupes].sort((a, b) => a.ordre - b.ordre);
}
