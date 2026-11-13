// Formats français (SPEC §10) : « 12 800 ¥ », « 84,30 € ».
const NBSP = '\u202f';

function groupe(n: number, d: number): string {
  const [ent, dec] = Math.abs(n).toFixed(d).split('.');
  const g = ent.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return (n < 0 ? '−' : '') + g + (dec ? ',' + dec : '');
}

export function yen(n: number): string {
  return groupe(Math.round(n), 0) + NBSP + '¥';
}

export function euro(n: number): string {
  return groupe(Math.round(n * 100) / 100, 2) + NBSP + '€';
}

export function chf(n: number): string {
  return groupe(Math.round(n * 100) / 100, 2) + NBSP + 'CHF';
}

export function montant(n: number, devise: string): string {
  if (devise === 'JPY') return yen(n);
  if (devise === 'EUR') return euro(n);
  if (devise === 'CHF') return chf(n);
  return groupe(n, 2) + NBSP + devise;
}

export function nombre(n: number, d = 2): string {
  const s = groupe(Math.round(n * 10 ** d) / 10 ** d, d);
  return d > 0 ? s.replace(/0+$/, '').replace(/,$/, '') : s;
}

export function pourcent(r: number): string {
  return Math.round(r * 100) + NBSP + '%';
}

/** Parse « 6 600 », « 84,30 » → nombre, ou NaN */
export function parseNombre(s: string): number {
  const t = s.replace(/[\s\u202f\u00a0]/g, '').replace(',', '.');
  if (!t || !/^-?\d*\.?\d*$/.test(t)) return NaN;
  return Number(t);
}

/** Normalisation insensible à la casse et aux accents (F-25 CA2) */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function lienCarte(nom: string, ville: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${nom} ${ville}`);
}

export function pluriel(n: number, sing: string, plur?: string): string {
  return `${n} ${n > 1 ? (plur ?? sing + 's') : sing}`;
}
