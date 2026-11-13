// Glisser-déposer unifié souris + tactile (Pointer Events). Sur écran tactile : appui long puis glisser.
import { signal } from '@preact/signals';

export interface Glisse {
  id: string;
  nom: string;
  x: number;
  y: number;
}

export const glisse = signal<Glisse | null>(null);
/** Zone survolée (valeur de l'attribut data-zone), ou null */
export const zoneSurvol = signal<string | null>(null);

const DELAI_APPUI_LONG = 380;
const SEUIL_SOURIS = 6;
const SEUIL_TACTILE = 10;

let annulerClic = false;

/** À brancher sur onClickCapture d'un lien à l'intérieur d'un élément déplaçable */
export function clicApresGlisse(e: Event): void {
  if (annulerClic) {
    e.preventDefault();
    e.stopPropagation();
    annulerClic = false;
  }
}

function zoneSous(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const z = el?.closest<HTMLElement>('[data-zone]');
  return z ? (z.dataset.zone ?? null) : null;
}

/** Gestionnaire onPointerDown pour un élément déplaçable */
export function debutGlisse(id: string, nom: string, deposer: (zone: string) => void) {
  return (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cible = e.target as HTMLElement;
    if (cible.closest('button, input, select, textarea')) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const tactile = e.pointerType !== 'mouse';
    let actif = false;
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    let dernierY = y0;
    let dernierX = x0;
    let anim = 0;

    // Défilement automatique près des bords pendant le glisser
    const BORD = 90;
    const defiler = () => {
      if (!actif) return;
      const h = window.innerHeight;
      const v = dernierY < BORD ? -Math.ceil((BORD - dernierY) / 6) : dernierY > h - BORD ? Math.ceil((dernierY - (h - BORD)) / 6) : 0;
      if (v) {
        window.scrollBy(0, v);
        const z = zoneSous(dernierX, dernierY);
        if (z !== zoneSurvol.value) zoneSurvol.value = z;
      }
      anim = requestAnimationFrame(defiler);
    };

    const activer = (x: number, y: number) => {
      actif = true;
      glisse.value = { id, nom, x, y };
      zoneSurvol.value = zoneSous(x, y);
      document.body.classList.add('glissement');
      anim = requestAnimationFrame(defiler);
      try {
        navigator.vibrate?.(15);
      } catch {
        /* sans importance */
      }
    };

    const suivre = (x: number, y: number) => {
      dernierX = x;
      dernierY = y;
      const d = Math.hypot(x - x0, y - y0);
      if (!actif) {
        if (tactile) {
          if (d > SEUIL_TACTILE) terminer(); // c'est un défilement
        } else if (d > SEUIL_SOURIS) activer(x, y);
        return;
      }
      glisse.value = { id, nom, x, y };
      const z = zoneSous(x, y);
      if (z !== zoneSurvol.value) zoneSurvol.value = z;
    };
    const bouger = (ev: PointerEvent) => suivre(ev.clientX, ev.clientY);

    // Tactile : empêche le défilement pendant le glisser et suit le doigt
    const bloquerDefilement = (ev: TouchEvent) => {
      if (!actif) return;
      ev.preventDefault();
      const t = ev.touches[0];
      if (t) suivre(t.clientX, t.clientY);
    };
    const finTactile = () => {
      if (actif) lacher();
    };
    const annulation = () => {
      if (!actif) terminer();
    };

    const lacher = () => {
      if (actif) {
        const z = zoneSurvol.value;
        annulerClic = true;
        setTimeout(() => (annulerClic = false), 400);
        if (z !== null) deposer(z);
      }
      terminer();
    };

    const terminer = () => {
      clearTimeout(minuterie);
      cancelAnimationFrame(anim);
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', annulation);
      window.removeEventListener('touchmove', bloquerDefilement);
      window.removeEventListener('touchend', finTactile);
      window.removeEventListener('contextmenu', bloquerMenu);
      document.body.classList.remove('glissement');
      glisse.value = null;
      zoneSurvol.value = null;
      actif = false;
    };

    const bloquerMenu = (ev: Event) => {
      if (actif || tactile) ev.preventDefault();
    };

    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', annulation);
    window.addEventListener('touchmove', bloquerDefilement, { passive: false });
    window.addEventListener('touchend', finTactile);
    window.addEventListener('contextmenu', bloquerMenu);
    if (tactile) minuterie = setTimeout(() => activer(x0, y0), DELAI_APPUI_LONG);
  };
}
