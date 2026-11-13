// Migrations de schéma (F-02 CA4, §10). Chaque étape transforme la version n en n+1.
import type { DB } from './types';
import { COLLECTIONS, SCHEMA_VERSION } from './types';
import { parametresInitiaux } from './seed';

type Migration = (d: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] fait passer de la version n à n+1. */
const MIGRATIONS: Record<number, Migration> = {
  // Version 0 : sauvegardes produites avant l'ajout de schemaVersion (format de l'annexe C)
  0: (d) => d,
};

export function migrer(d: unknown, depuis: number): DB {
  let cur = { ...(d as Record<string, unknown>) };
  for (let v = depuis; v < SCHEMA_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`Migration manquante depuis la version ${v}`);
    cur = m(cur);
  }
  return normaliser(cur);
}

/** Complète les champs absents (tableaux vides, valeurs par défaut) */
export function normaliser(d: Record<string, unknown>): DB {
  const out = { ...d } as Record<string, unknown>;
  for (const c of COLLECTIONS) if (!Array.isArray(out[c])) out[c] = [];
  const ts = new Date().toISOString();
  const base = parametresInitiaux(ts);
  const p = (out.parametres ?? {}) as Record<string, unknown>;
  out.parametres = {
    ...base,
    ...p,
    id: 'parametres',
    taux: { ...base.taux, ...(p.taux as object) },
    detaxe: { ...base.detaxe, ...(p.detaxe as object) },
    ia: { ...base.ia, ...(p.ia as object), usage: { ...((p.ia as { usage?: object })?.usage ?? {}) } },
    sauvegarde: { ...base.sauvegarde, ...(p.sauvegarde as object) },
  };
  const souvenirs = out.souvenirs as Record<string, unknown>[];
  out.souvenirs = souvenirs.map((s) => ({
    etapesPrevues: [],
    retour: {},
    origine: 'manuel',
    quantite: 1,
    statut: 'idee',
    createdAt: ts,
    updatedAt: ts,
    ...s,
  }));
  out.attributions = (out.attributions as Record<string, unknown>[]).map((a) => {
    const souv = souvenirs.find((s) => s.id === a.souvenirId);
    return { quantite: 1, voyageId: souv?.voyageId, createdAt: ts, updatedAt: ts, ...a };
  });
  out.etapes = (out.etapes as Record<string, unknown>[]).map((e) => ({ excursions: [], ...e }));
  out.voyages = (out.voyages as Record<string, unknown>[]).map((v) => ({
    destinataires: [],
    detaxeActive: false,
    ...v,
  }));
  return out as unknown as DB;
}
