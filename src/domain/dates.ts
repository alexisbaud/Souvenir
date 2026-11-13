import type { DateStr } from '../db/types';

// Horloge injectable (SPEC §10) : en test, Playwright fige Date ; en unitaire, on passe `today` explicitement.
let override: (() => Date) | null = null;

export function setClock(fn: (() => Date) | null): void {
  override = fn;
}

export function now(): Date {
  return override ? override() : new Date();
}

/** Date locale de l'appareil au format AAAA-MM-JJ */
export function toDateStr(d: Date): DateStr {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

export function today(): DateStr {
  return toDateStr(now());
}

export function nowIso(): string {
  return now().toISOString();
}

function parse(d: DateStr): number {
  const [y, m, j] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, j);
}

/** Nombre de jours de a à b (b − a) */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

export function addDays(d: DateStr, n: number): DateStr {
  const t = new Date(parse(d) + n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

export function isValidDate(d: unknown): d is DateStr {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « lun. 2 nov. » */
export function formatDate(d: DateStr): string {
  const t = new Date(parse(d));
  return `${JOURS[t.getUTCDay()]} ${t.getUTCDate()} ${MOIS[t.getUTCMonth()]}`;
}

/** « 2/11 » */
export function formatDateCourte(d: DateStr): string {
  const t = new Date(parse(d));
  return `${t.getUTCDate()}/${t.getUTCMonth() + 1}`;
}

export function moisCourant(): string {
  return today().slice(0, 7);
}
