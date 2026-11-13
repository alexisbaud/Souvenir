// Sauvegarde et restauration (F-02). La clé API n'est jamais incluse (elle vit dans un espace séparé).
import type { DB, Photo } from './types';
import { COLLECTIONS, MOI_ID, SCHEMA_VERSION } from './types';
import { migrer } from './migrations';

export interface FichierSauvegarde extends Partial<Omit<DB, 'parametres'>> {
  schemaVersion: number;
  exportedAt: string;
  app: 'omiyage';
  parametres?: DB['parametres'];
  photos?: { id: string; dataUrl: string; thumbUrl: string; createdAt: string }[];
}

async function blobVersDataUrl(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${b.type || 'image/jpeg'};base64,${btoa(bin)}`;
}

function dataUrlVersBlob(u: string): Blob {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(u);
  if (!m) throw new Error('Photo illisible');
  const bin = atob(m[3]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: m[1] || 'image/jpeg' });
}

export async function construireSauvegarde(d: DB, photos: Photo[] | null, date: string): Promise<FichierSauvegarde> {
  const out: FichierSauvegarde = { app: 'omiyage', schemaVersion: SCHEMA_VERSION, exportedAt: date };
  for (const c of COLLECTIONS) (out as unknown as Record<string, unknown>)[c] = d[c];
  out.parametres = d.parametres;
  if (photos) {
    out.photos = [];
    for (const p of photos)
      out.photos.push({
        id: p.id,
        dataUrl: await blobVersDataUrl(p.blob),
        thumbUrl: await blobVersDataUrl(p.thumb),
        createdAt: p.createdAt,
      });
  }
  return out;
}

export class ErreurImport extends Error {}

/** Valide et migre un fichier de sauvegarde. Ne modifie rien : lève ErreurImport si invalide. */
export function lireSauvegarde(texte: string): { db: DB; photos: Photo[] | null } {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new ErreurImport("Ce fichier n'est pas un JSON valide.");
  }
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new ErreurImport('Fichier de sauvegarde invalide.');
  const f = brut as Record<string, unknown>;
  const v = f.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
    throw new ErreurImport('Version de sauvegarde absente : fichier refusé.');
  if (v > SCHEMA_VERSION)
    throw new ErreurImport(`Version de sauvegarde inconnue (${v}). Mettez l'app à jour avant d'importer.`);
  for (const c of COLLECTIONS) {
    const arr = f[c];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) throw new ErreurImport(`Champ « ${c} » invalide.`);
    for (const r of arr)
      if (!r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string')
        throw new ErreurImport(`Un élément de « ${c} » est invalide.`);
  }
  if (!Array.isArray(f.voyages) || f.voyages.length === 0) throw new ErreurImport('Aucun voyage dans ce fichier.');
  if (f.parametres !== undefined && (typeof f.parametres !== 'object' || f.parametres === null))
    throw new ErreurImport('Paramètres invalides.');
  let db: DB;
  try {
    db = migrer(f, v);
  } catch (e) {
    throw new ErreurImport((e as Error).message);
  }
  // « Moi » est toujours présent (RG-05)
  if (!db.personnes.some((p) => p.id === MOI_ID)) {
    const ts = new Date().toISOString();
    db.personnes = [{ id: MOI_ID, nom: 'Moi', systeme: true, createdAt: ts, updatedAt: ts }, ...db.personnes];
  }
  if (!db.voyages.some((x) => x.actif)) db.voyages = db.voyages.map((x, i) => ({ ...x, actif: i === 0 }));
  let photos: Photo[] | null = null;
  if (Array.isArray(f.photos)) {
    try {
      photos = (f.photos as FichierSauvegarde['photos'])!.map((p) => ({
        id: p.id,
        blob: dataUrlVersBlob(p.dataUrl),
        thumb: dataUrlVersBlob(p.thumbUrl),
        createdAt: p.createdAt,
      }));
    } catch {
      throw new ErreurImport('Photos illisibles dans ce fichier.');
    }
  }
  return { db, photos };
}

export function nomFichier(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `omiyage-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`;
}

/** Rappel discret (F-02 CA3) */
export function rappelSauvegarde(p: DB['parametres'], maintenant: Date): boolean {
  if (!p.sauvegarde.modifieDepuis) return false;
  const ref = p.sauvegarde.derniere ?? p.createdAt;
  return maintenant.getTime() - new Date(ref).getTime() > 3 * 86_400_000;
}
