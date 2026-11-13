import { Draft } from '../src/db/store';
import { donneesInitiales } from '../src/db/seed';
import type { DB, Souvenir } from '../src/db/types';
import * as A from '../src/domain/actions';

export const TS = '2026-11-02T10:00:00.000Z';
export const TAUX = 0.0058;

/** Base vierge (données initiales) */
export function base(): DB {
  return donneesInitiales(TS);
}

/** Exécute une suite d'actions sur un brouillon et renvoie la base résultante */
export function avec(db: DB, f: (d: Draft) => void): DB {
  const d = new Draft(db);
  f(d);
  return d.db;
}

export function personnes(db: DB, noms: string[], groupeId?: string): { db: DB; ids: Record<string, string> } {
  const ids: Record<string, string> = {};
  const out = avec(db, (d) => {
    for (const n of noms) ids[n] = A.creerPersonne(d, { nom: n, groupeId }).id;
  });
  return { db: out, ids };
}

export function achat(over: Partial<A.DonneesAchat> = {}): A.DonneesAchat {
  return {
    nom: 'Objet',
    prix: 1000,
    devise: 'JPY',
    tauxEUR: TAUX,
    date: '2026-11-02',
    etapeId: 'kyoto',
    ...over,
  };
}

export function trouver(db: DB, nom: string): Souvenir {
  const s = db.souvenirs.find((x) => x.nom === nom);
  if (!s) throw new Error('introuvable ' + nom);
  return s;
}
