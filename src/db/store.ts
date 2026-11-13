// État en mémoire + écriture atomique + annulation (RG-16).
import { signal } from '@preact/signals';
import type { Base, CollectionName, DB, Parametres } from './types';
import { COLLECTIONS, SCHEMA_VERSION } from './types';
import { appliquer, chargerTout, remplacerTout, toutesLesPhotos, supprimerPhotos, type Change } from './persistence';
import { donneesInitiales } from './seed';
import { migrer } from './migrations';
import { nowIso } from '../domain/dates';

export const etat = signal<DB | null>(null);

export function db(): DB {
  const d = etat.value;
  if (!d) throw new Error('Base non chargée');
  return d;
}

type Rec<C extends CollectionName> = DB[C][number];

/** Brouillon de mutation : chaque put/del met à jour la vue et mémorise l'état d'avant */
export class Draft {
  db: DB;
  private avant = new Map<string, { store: CollectionName | 'parametres'; id: string; before: unknown }>();
  private apres = new Map<string, Change>();
  private ts = nowIso();

  constructor(base: DB) {
    this.db = { ...base };
  }

  get<C extends CollectionName>(c: C, id: string): Rec<C> | undefined {
    return (this.db[c] as Base[]).find((r) => r.id === id) as Rec<C> | undefined;
  }

  put<C extends CollectionName>(c: C, rec: Rec<C>, toucher = true): Rec<C> {
    const arr = this.db[c] as Base[];
    const i = arr.findIndex((r) => r.id === rec.id);
    const r = (toucher ? { ...rec, updatedAt: this.ts } : rec) as Rec<C>;
    if (!r.createdAt) (r as Base).createdAt = this.ts;
    const k = `${c}:${rec.id}`;
    if (!this.avant.has(k)) this.avant.set(k, { store: c, id: rec.id, before: i >= 0 ? arr[i] : undefined });
    const next = [...arr];
    if (i >= 0) next[i] = r as Base;
    else next.push(r as Base);
    (this.db as unknown as Record<string, Base[]>)[c] = next;
    this.apres.set(k, { store: c, id: rec.id, value: r });
    return r;
  }

  /** Modifie un enregistrement existant */
  patch<C extends CollectionName>(c: C, id: string, f: (r: Rec<C>) => Rec<C>): Rec<C> | undefined {
    const cur = this.get(c, id);
    if (!cur) return undefined;
    return this.put(c, f(cur));
  }

  del<C extends CollectionName>(c: C, id: string): void {
    const arr = this.db[c] as Base[];
    const i = arr.findIndex((r) => r.id === id);
    if (i < 0) return;
    const k = `${c}:${id}`;
    if (!this.avant.has(k)) this.avant.set(k, { store: c, id, before: arr[i] });
    (this.db as unknown as Record<string, Base[]>)[c] = arr.filter((r) => r.id !== id);
    this.apres.set(k, { store: c, id });
  }

  params(f: (p: Parametres) => Parametres): void {
    const k = 'parametres:parametres';
    if (!this.avant.has(k)) this.avant.set(k, { store: 'parametres', id: 'parametres', before: this.db.parametres });
    const p = { ...f(this.db.parametres), updatedAt: this.ts };
    this.db.parametres = p;
    this.apres.set(k, { store: 'parametres', id: 'parametres', value: p });
  }

  changes(): Change[] {
    return [...this.apres.values()];
  }

  inverse(): Change[] {
    return [...this.avant.values()].map((a) => ({ store: a.store, id: a.id, value: a.before }) as Change);
  }

  get vide(): boolean {
    return this.apres.size === 0;
  }
}

/** Applique des changements bruts à un instantané en mémoire */
function appliquerEnMemoire(base: DB, changes: Change[]): DB {
  const out: DB = { ...base };
  for (const ch of changes) {
    if (ch.store === 'parametres') {
      out.parametres = ch.value as Parametres;
      continue;
    }
    const arr = (out[ch.store] as Base[]).filter((r) => r.id !== ch.id);
    if (ch.value !== undefined) {
      const orig = (base[ch.store] as Base[]).findIndex((r) => r.id === ch.id);
      if (orig >= 0) arr.splice(Math.min(orig, arr.length), 0, ch.value as Base);
      else arr.push(ch.value as Base);
    }
    (out as unknown as Record<string, Base[]>)[ch.store] = arr;
  }
  return out;
}

export interface Resultat<T> {
  valeur: T;
  annuler: () => Promise<void>;
}

let file: Promise<unknown> = Promise.resolve();

/** Exécute une mutation : écriture atomique puis mise à jour de l'état. Les mutations sont sérialisées. */
export function commit<T>(f: (d: Draft) => T, opts: { marquerModifie?: boolean } = {}): Promise<Resultat<T>> {
  const run = async (): Promise<Resultat<T>> => {
    const d = new Draft(db());
    const valeur = f(d);
    if (!d.vide && opts.marquerModifie !== false && !d.db.parametres.sauvegarde.modifieDepuis) {
      d.params((p) => ({ ...p, sauvegarde: { ...p.sauvegarde, modifieDepuis: true } }));
    }
    const changes = d.changes();
    const inverse = d.inverse();
    await appliquer(changes);
    etat.value = d.db;
    const annuler = async () => {
      await (file = file.then(async () => {
        await appliquer(inverse);
        etat.value = appliquerEnMemoire(db(), inverse);
      }));
    };
    return { valeur, annuler };
  };
  const p = file.then(run, run);
  file = p.catch(() => undefined);
  return p;
}

/** Charge la base ; au premier lancement, écrit les données initiales (F-03) */
export async function charger(): Promise<DB> {
  const { db: lu, schemaVersion } = await chargerTout();
  let d: DB;
  if (!lu) {
    d = donneesInitiales(nowIso());
    await remplacerTout(d);
  } else if (schemaVersion < SCHEMA_VERSION) {
    d = migrer(lu, schemaVersion);
    await remplacerTout(d);
  } else {
    d = lu;
    for (const c of COLLECTIONS) if (!Array.isArray(d[c])) (d as unknown as Record<string, unknown>)[c] = [];
  }
  etat.value = d;
  void nettoyerPhotos(d);
  return d;
}

/** Remplace tout l'état (import) */
export async function remplacer(d: DB): Promise<void> {
  await remplacerTout(d);
  etat.value = d;
}

/** Supprime les photos qui ne sont plus référencées (après la fenêtre d'annulation) */
async function nettoyerPhotos(d: DB): Promise<void> {
  try {
    const refs = new Set(d.souvenirs.map((s) => s.photoId).filter(Boolean));
    const photos = await toutesLesPhotos();
    await supprimerPhotos(photos.filter((p) => !refs.has(p.id)).map((p) => p.id));
  } catch {
    /* sans importance */
  }
}
