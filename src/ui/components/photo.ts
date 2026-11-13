// Photos (F-26) : compression (côté long ≤ 1 600 px) et miniature.
import { signal } from '@preact/signals';
import { ecrirePhoto, lirePhoto } from '../../db/persistence';
import { uuid } from '../../domain/actions';

async function redimensionner(source: ImageBitmap | HTMLImageElement, max: number, qualite: number): Promise<Blob> {
  const w = source.width;
  const h = source.height;
  const r = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * r);
  c.height = Math.round(h * r);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Compression impossible'))), 'image/jpeg', qualite));
}

async function charger(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* repli */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

export async function enregistrerPhoto(file: File): Promise<string> {
  const img = await charger(file);
  const blob = await redimensionner(img, 1600, 0.82);
  const thumb = await redimensionner(img, 240, 0.7);
  const id = uuid();
  await ecrirePhoto({ id, blob, thumb, createdAt: new Date().toISOString() });
  return id;
}

const cache = new Map<string, { thumb: string; full?: string }>();
export const versionPhotos = signal(0);

export function urlMiniature(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const c = cache.get(id);
  if (c) return c.thumb;
  cache.set(id, { thumb: '' });
  void lirePhoto(id).then((p) => {
    if (!p) return;
    cache.set(id, { thumb: URL.createObjectURL(p.thumb) });
    versionPhotos.value++;
  });
  return undefined;
}

export async function urlPhoto(id: string): Promise<string | undefined> {
  const c = cache.get(id);
  if (c?.full) return c.full;
  const p = await lirePhoto(id);
  if (!p) return undefined;
  const full = URL.createObjectURL(p.blob);
  cache.set(id, { thumb: c?.thumb || URL.createObjectURL(p.thumb), full });
  return full;
}
