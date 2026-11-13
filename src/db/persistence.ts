// Accès IndexedDB (SPEC §11). Chaque action s'écrit dans une seule transaction (atomicité, §10).
import { openDB, type IDBPDatabase } from 'idb';
import type { CollectionName, DB, Parametres, Photo } from './types';
import { COLLECTIONS, SCHEMA_VERSION } from './types';

export const DB_NAME = 'omiyage';
const IDB_VERSION = 1;

export type Change =
  | { store: CollectionName; id: string; value?: unknown }
  | { store: 'parametres'; id: 'parametres'; value: Parametres };

let dbp: Promise<IDBPDatabase> | null = null;

export function ouvrir(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB(DB_NAME, IDB_VERSION, {
      upgrade(db) {
        for (const c of COLLECTIONS) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
        for (const s of ['parametres', 'photos', 'snapshots', 'meta'])
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        // Espace séparé pour la clé API (§9.10) : jamais exporté
        if (!db.objectStoreNames.contains('secrets')) db.createObjectStore('secrets', { keyPath: 'id' });
      },
      blocking() {
        // Une nouvelle version de l'app ouvre la base : on libère.
        void dbp?.then((d) => d.close());
        dbp = null;
      },
    });
  }
  return dbp;
}

/** Ferme la connexion (tests) */
export async function fermer(): Promise<void> {
  if (dbp) (await dbp).close();
  dbp = null;
}

export async function chargerTout(): Promise<{ db: DB | null; schemaVersion: number }> {
  const idb = await ouvrir();
  const tx = idb.transaction([...COLLECTIONS, 'parametres', 'meta'], 'readonly');
  const parametres = (await tx.objectStore('parametres').get('parametres')) as Parametres | undefined;
  const meta = (await tx.objectStore('meta').get('schema')) as { version: number } | undefined;
  if (!parametres) {
    await tx.done;
    return { db: null, schemaVersion: SCHEMA_VERSION };
  }
  const out: Partial<DB> = { parametres };
  for (const c of COLLECTIONS) (out as Record<string, unknown>)[c] = await tx.objectStore(c).getAll();
  await tx.done;
  return { db: out as DB, schemaVersion: meta?.version ?? 1 };
}

/** Écrit un lot de changements dans une seule transaction */
export async function appliquer(changes: Change[]): Promise<void> {
  if (changes.length === 0) return;
  const idb = await ouvrir();
  const stores = [...new Set(changes.map((c) => c.store))];
  const tx = idb.transaction(stores, 'readwrite');
  for (const ch of changes) {
    const st = tx.objectStore(ch.store);
    if (ch.value === undefined) void st.delete(ch.id);
    else void st.put(ch.value);
  }
  await tx.done;
}

/** Remplace toute la base (données initiales ou import) en une transaction */
export async function remplacerTout(db: DB): Promise<void> {
  const idb = await ouvrir();
  const tx = idb.transaction([...COLLECTIONS, 'parametres', 'meta'], 'readwrite');
  for (const c of COLLECTIONS) {
    const st = tx.objectStore(c);
    void st.clear();
    for (const r of db[c]) void st.put(r);
  }
  void tx.objectStore('parametres').put(db.parametres);
  void tx.objectStore('meta').put({ id: 'schema', version: SCHEMA_VERSION });
  await tx.done;
}

// ---------------------------------------------------------------- Photos (Blob)

export async function lirePhoto(id: string): Promise<Photo | undefined> {
  return (await ouvrir()).get('photos', id);
}

export async function ecrirePhoto(p: Photo): Promise<void> {
  await (await ouvrir()).put('photos', p);
}

export async function toutesLesPhotos(): Promise<Photo[]> {
  return (await ouvrir()).getAll('photos');
}

export async function supprimerPhotos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const tx = (await ouvrir()).transaction('photos', 'readwrite');
  for (const id of ids) void tx.store.delete(id);
  await tx.done;
}

export async function remplacerPhotos(photos: Photo[]): Promise<void> {
  const tx = (await ouvrir()).transaction('photos', 'readwrite');
  void tx.store.clear();
  for (const p of photos) void tx.store.put(p);
  await tx.done;
}

// ---------------------------------------------------------------- Secrets

export async function lireSecret(id: string): Promise<string | undefined> {
  const r = (await (await ouvrir()).get('secrets', id)) as { value: string } | undefined;
  return r?.value;
}

export async function ecrireSecret(id: string, value: string | null): Promise<void> {
  const idb = await ouvrir();
  if (value === null) await idb.delete('secrets', id);
  else await idb.put('secrets', { id, value });
}

// ---------------------------------------------------------------- Instantané avant import

export async function ecrireInstantane(contenu: string): Promise<void> {
  await (await ouvrir()).put('snapshots', { id: 'avant-import', date: new Date().toISOString(), contenu });
}

export async function lireInstantane(): Promise<{ date: string; contenu: string } | undefined> {
  return (await ouvrir()).get('snapshots', 'avant-import');
}
