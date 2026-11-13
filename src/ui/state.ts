// État de l'interface : route (hash), feuilles modales, toast d'annulation.
import { signal, computed } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { commit, type Draft } from '../db/store';
import { ErreurMetier } from '../domain/actions';

// ---------------------------------------------------------------- Route

export interface Route {
  chemin: string[];
  query: URLSearchParams;
}

function lireRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q] = h.split('?');
  const chemin = p ? p.split('/').filter(Boolean).map(decodeURIComponent) : [];
  return { chemin: chemin.length ? chemin : ['ici'], query: new URLSearchParams(q ?? '') };
}

export const route = signal<Route>(lireRoute());
if (typeof window !== 'undefined')
  window.addEventListener('hashchange', () => {
    route.value = lireRoute();
    feuilles.value = [];
    window.scrollTo(0, 0);
  });

export function aller(chemin: string): void {
  const h = '#/' + chemin.replace(/^#?\/?/, '');
  if (location.hash === h) route.value = lireRoute();
  else location.hash = h;
}

export const onglet = computed(() => route.value.chemin[0]);

// ---------------------------------------------------------------- Feuilles (modales)

export interface Feuille {
  id: number;
  titre: string;
  contenu: () => ComponentChildren;
  large?: boolean;
}

export const feuilles = signal<Feuille[]>([]);
let compteur = 0;

export function ouvrir(titre: string, contenu: () => ComponentChildren, opts: { large?: boolean } = {}): void {
  feuilles.value = [...feuilles.value, { id: ++compteur, titre, contenu, ...opts }];
}

export function fermer(): void {
  feuilles.value = feuilles.value.slice(0, -1);
}

export function fermerTout(): void {
  feuilles.value = [];
}

// ---------------------------------------------------------------- Toast (RG-16 : « Annuler » pendant 5 s)

export interface Toast {
  id: number;
  texte: string;
  erreur?: boolean;
  annuler?: () => Promise<void>;
}

export const toast = signal<Toast | null>(null);
let minuterie: ReturnType<typeof setTimeout> | undefined;

export function notifier(texte: string, annuler?: () => Promise<void>, erreur = false): void {
  clearTimeout(minuterie);
  const t = { id: ++compteur, texte, annuler, erreur };
  toast.value = t;
  minuterie = setTimeout(() => {
    if (toast.value?.id === t.id) toast.value = null;
  }, erreur ? 6000 : 5000);
}

export function erreur(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  if (!(e instanceof ErreurMetier)) console.error(e);
  notifier(msg, undefined, true);
}

/**
 * Exécute une action. Si `message` est donné, propose « Annuler » pendant 5 s.
 * Renvoie la valeur, ou undefined en cas d'erreur (affichée).
 */
export async function agir<T>(f: (d: Draft) => T, message?: string): Promise<T | undefined> {
  try {
    const r = await commit(f);
    if (message) notifier(message, r.annuler);
    return r.valeur;
  } catch (e) {
    erreur(e);
    return undefined;
  }
}

/** Version qui renvoie true en cas de succès (pour fermer un formulaire) */
export async function essayer(f: (d: Draft) => unknown, message?: string): Promise<boolean> {
  try {
    const r = await commit(f);
    if (message) notifier(message, r.annuler);
    return true;
  } catch (e) {
    erreur(e);
    return false;
  }
}
