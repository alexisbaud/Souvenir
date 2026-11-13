import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { feuilles, fermer, ouvrir, toast } from '../state';
import { Icon } from './Icon';
import type { Couverture, EtatSouvenir, StatutLigne } from '../../domain/rules';
import { LIBELLE_COUVERTURE, LIBELLE_ETAT } from '../../domain/rules';

// ---------------------------------------------------------------- Feuilles modales

export function Feuilles() {
  const l = feuilles.value;
  useEffect(() => {
    document.body.classList.toggle('verrou', l.length > 0);
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && feuilles.value.length) fermer();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [l.length]);
  return (
    <>
      {l.map((f, i) => (
        <div class="voile" key={f.id} onClick={(e) => e.target === e.currentTarget && fermer()} style={{ zIndex: 50 + i }}>
          <div class={'feuille' + (f.large ? ' large' : '')} role="dialog" aria-modal="true" aria-label={f.titre}>
            <header class="feuille-tete">
              <h2>{f.titre}</h2>
              <button class="btn-icone" onClick={fermer} aria-label="Fermer">
                <Icon n="fermer" />
              </button>
            </header>
            <div class="feuille-corps">{f.contenu()}</div>
          </div>
        </div>
      ))}
    </>
  );
}

export function ToastView() {
  const t = toast.value;
  if (!t) return null;
  return (
    <div class={'toast' + (t.erreur ? ' toast-erreur' : '')} role="status" aria-live="polite">
      {t.erreur && <Icon n="alerte" taille={18} />}
      <span>{t.texte}</span>
      {t.annuler && (
        <button
          class="toast-action"
          onClick={async () => {
            const a = t.annuler!;
            toast.value = null;
            await a();
          }}
        >
          Annuler
        </button>
      )}
    </div>
  );
}

export function confirmer(titre: string, texte: ComponentChildren, libelle: string, action: () => unknown, danger = true): void {
  ouvrir(titre, () => (
    <div class="pile">
      <div>{texte}</div>
      <div class="actions">
        <button class="btn" onClick={fermer}>
          Annuler
        </button>
        <button
          class={'btn ' + (danger ? 'btn-danger' : 'btn-primaire')}
          onClick={async () => {
            fermer();
            await action();
          }}
        >
          {libelle}
        </button>
      </div>
    </div>
  ));
}

// ---------------------------------------------------------------- Mise en page

export function Section(props: {
  titre: ComponentChildren;
  children: ComponentChildren;
  repliable?: boolean;
  ouvert?: boolean;
  action?: ComponentChildren;
  id?: string;
}) {
  const [ouvert, setOuvert] = useState(props.ouvert ?? true);
  if (!props.repliable)
    return (
      <section class="section" id={props.id}>
        <div class="section-tete">
          <h3>{props.titre}</h3>
          {props.action}
        </div>
        {props.children}
      </section>
    );
  return (
    <section class="section" id={props.id}>
      <div class="section-tete">
        <button class="section-bascule" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
          <span class={'pivot' + (ouvert ? ' ouvert' : '')}>
            <Icon n="chevron" taille={16} />
          </span>
          <h3>{props.titre}</h3>
        </button>
        {props.action}
      </div>
      {ouvert && props.children}
    </section>
  );
}

export function Vide({ children }: { children: ComponentChildren }) {
  return <p class="vide">{children}</p>;
}

export function Champ(props: { label: ComponentChildren; children: ComponentChildren; aide?: ComponentChildren; for?: string; groupe?: boolean }) {
  // `groupe` : le champ contient des boutons (puces, compteur) ; un <label> les activerait au clic sur le libellé
  if (props.groupe)
    return (
      <div class="champ" role="group" aria-label={typeof props.label === 'string' ? props.label : undefined}>
        <span class="champ-label">{props.label}</span>
        {props.children}
        {props.aide && <span class="champ-aide">{props.aide}</span>}
      </div>
    );
  return (
    <label class="champ" for={props.for}>
      <span class="champ-label">{props.label}</span>
      {props.children}
      {props.aide && <span class="champ-aide">{props.aide}</span>}
    </label>
  );
}

export function Interrupteur(props: { label: ComponentChildren; checked: boolean; onChange: (v: boolean) => void; aide?: string }) {
  return (
    <label class="interrupteur">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
      <span class="interrupteur-texte">
        {props.label}
        {props.aide && <small>{props.aide}</small>}
      </span>
    </label>
  );
}

export function Segments<T extends string>(props: {
  valeurs: { id: T; libelle: ComponentChildren }[];
  valeur: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div class="segments" role="tablist" aria-label={props.label}>
      {props.valeurs.map((v) => (
        <button
          role="tab"
          aria-selected={props.valeur === v.id}
          class={'segment' + (props.valeur === v.id ? ' actif' : '')}
          onClick={() => props.onChange(v.id)}
        >
          {v.libelle}
        </button>
      ))}
    </div>
  );
}

export function Puce(props: { children: ComponentChildren; actif?: boolean; onClick?: () => void; titre?: string; class?: string }) {
  if (!props.onClick) return <span class={'puce ' + (props.class ?? '')}>{props.children}</span>;
  return (
    <button
      type="button"
      class={'puce puce-btn ' + (props.actif ? 'actif ' : '') + (props.class ?? '')}
      aria-pressed={props.actif}
      onClick={props.onClick}
      title={props.titre}
    >
      {props.children}
    </button>
  );
}

// ---------------------------------------------------------------- États (libellé + pictogramme, jamais la couleur seule)

const PICTO_COUV: Record<Couverture, string> = { rien: '○', idee: '◐', achete: '●', donne: '✓' };

export function BadgeCouverture({ etat, collectif }: { etat: Couverture; collectif?: boolean }) {
  return (
    <span class={'badge badge-' + etat}>
      <span aria-hidden="true">{PICTO_COUV[etat]}</span> {LIBELLE_COUVERTURE[etat]}
      {collectif ? ' · collectif' : ''}
    </span>
  );
}

const PICTO_ETAT: Record<EtatSouvenir, string> = { idee: '◐', achete: '●', partiel: '◑', donne: '✓' };

export function BadgeEtat({ etat }: { etat: EtatSouvenir }) {
  return (
    <span class={'badge badge-' + etat}>
      <span aria-hidden="true">{PICTO_ETAT[etat]}</span> {LIBELLE_ETAT[etat]}
    </span>
  );
}

const LIB_STATUT: Record<StatutLigne, string> = { ok: 'OK', attention: 'Attention', depasse: 'Dépassé' };
const PICTO_STATUT: Record<StatutLigne, string> = { ok: '✓', attention: '!', depasse: '✕' };

export function BadgeStatut({ s }: { s: StatutLigne }) {
  return (
    <span class={'badge statut-' + s}>
      <span aria-hidden="true">{PICTO_STATUT[s]}</span> {LIB_STATUT[s]}
    </span>
  );
}

export function Barre({ ratio, statut }: { ratio: number; statut: StatutLigne }) {
  return (
    <div class={'barre statut-' + statut} role="presentation">
      <span style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- Saisie

export function Texte(props: {
  valeur: string;
  onValeur: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  required?: boolean;
  id?: string;
  onBlur?: () => void;
  'aria-label'?: string;
  grand?: boolean;
}) {
  const { valeur, onValeur, autoFocus, onBlur, grand, ...rest } = props;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 50);
  }, []);
  return (
    <input
      ref={ref}
      type="text"
      class={grand ? 'champ-grand' : undefined}
      value={valeur}
      onInput={(e) => onValeur((e.target as HTMLInputElement).value)}
      onBlur={onBlur}
      {...rest}
    />
  );
}

export function ZoneTexte(props: { valeur: string; onValeur: (v: string) => void; placeholder?: string; rows?: number; id?: string }) {
  return (
    <textarea
      id={props.id}
      rows={props.rows ?? 3}
      value={props.valeur}
      placeholder={props.placeholder}
      onInput={(e) => props.onValeur((e.target as HTMLTextAreaElement).value)}
    />
  );
}

export function Selecteur<T extends string>(props: {
  valeur: T | '';
  onValeur: (v: T | '') => void;
  options: { id: T; libelle: string }[];
  vide?: string;
  id?: string;
}) {
  return (
    <select id={props.id} value={props.valeur} onChange={(e) => props.onValeur((e.target as HTMLSelectElement).value as T)}>
      {props.vide !== undefined && <option value="">{props.vide}</option>}
      {props.options.map((o) => (
        <option value={o.id}>{o.libelle}</option>
      ))}
    </select>
  );
}

export function Plier(props: { titre: string; children: ComponentChildren; ouvert?: boolean }) {
  return (
    <details class="plier" open={props.ouvert}>
      <summary>{props.titre}</summary>
      <div class="pile">{props.children}</div>
    </details>
  );
}

export function LienExterne({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" class="lien-ext">
      {children}
    </a>
  );
}
