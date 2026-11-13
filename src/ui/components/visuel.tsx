// Langage visuel commun : un code couleur + icône + libellé par état, avatars, tuiles de catégorie.
import type { ComponentChildren } from 'preact';
import type { DB, Personne, Retour, Souvenir } from '../../db/types';
import { MOI_ID } from '../../db/types';
import type { EtatSouvenir } from '../../domain/rules';
import { Icon } from './Icon';
import { Miniature } from './champs';

export type Ton = 'rien' | 'idee' | 'achete' | 'donne';

export const TONS: Record<Ton, { libelle: string; icone: string }> = {
  rien: { libelle: 'Rien pour l’instant', icone: 'rien' },
  idee: { libelle: 'Idée', icone: 'ampoule' },
  achete: { libelle: 'Acheté', icone: 'sac' },
  donne: { libelle: 'Donné', icone: 'ok' },
};

export function tonSouvenir(e: EtatSouvenir): Ton {
  return e === 'partiel' ? 'achete' : e;
}

/** Pastille d'état : couleur + icône + libellé (jamais la couleur seule) */
export function PuceEtat({ ton, libelle, petite }: { ton: Ton; libelle?: string; petite?: boolean }) {
  return (
    <span class={`puce-etat ton-${ton}${petite ? ' petite' : ''}`}>
      <Icon n={TONS[ton].icone} taille={petite ? 12 : 14} epaisseur={2.2} />
      {libelle ?? TONS[ton].libelle}
    </span>
  );
}

const PASTELS = ['#FDE2E4', '#E0F2FE', '#EDE9FE', '#DCFCE7', '#FEF3C7', '#FCE7F3', '#E0E7FF', '#CCFBF1', '#FFE4D6', '#E7F5D0'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/);
  if (mots.length > 1) return (mots[0][0] + mots[1][0]).toUpperCase();
  return nom.trim().slice(0, 2).toUpperCase();
}

/** Avatar rond avec initiales ; l'anneau porte l'état */
export function Avatar(props: { personne: Pick<Personne, 'id' | 'nom'>; ton?: Ton; taille?: number; actif?: boolean }) {
  const t = props.taille ?? 48;
  const moi = props.personne.id === MOI_ID;
  const fond = moi ? 'var(--fond-3)' : PASTELS[hash(props.personne.id) % PASTELS.length];
  const cls = 'avatar' + (props.ton ? ` anneau-${props.ton}` : '') + (props.actif ? ' avatar-actif' : '');
  return (
    <span class={cls} aria-hidden="true" style={{ width: `${t}px`, height: `${t}px`, fontSize: `${Math.round(t * (moi ? 0.24 : 0.36))}px`, background: fond }}>
      {moi ? 'MOI' : initiales(props.personne.nom)}
    </span>
  );
}

/** Pile d'avatars miniatures (destinataires d'un souvenir) */
export function PileAvatars({ personnes, max = 4 }: { personnes: Pick<Personne, 'id' | 'nom'>[]; max?: number }) {
  const v = personnes.slice(0, max);
  return (
    <span class="pile-avatars">
      {v.map((p) => (
        <Avatar personne={p} taille={26} />
      ))}
      {personnes.length > max && <span class="pile-plus">+{personnes.length - max}</span>}
    </span>
  );
}

export function iconeCategorie(id: string | undefined): string {
  return id ? `cat-${id}` : 'souvenirs';
}

/** Tuile carrée : photo si elle existe, sinon icône de catégorie sur la couleur de l'état */
export function Tuile(props: { s: Pick<Souvenir, 'categorieId' | 'photoId'>; ton: Ton; taille?: number }) {
  const t = props.taille ?? 44;
  if (props.s.photoId)
    return (
      <span class={`tuile ton-${props.ton}`} style={{ width: `${t}px`, height: `${t}px` }}>
        <Miniature id={props.s.photoId} taille={t} />
      </span>
    );
  return (
    <span class={`tuile ton-${props.ton}`} aria-hidden="true" style={{ width: `${t}px`, height: `${t}px` }}>
      <Icon n={iconeCategorie(props.s.categorieId)} taille={Math.round(t * 0.5)} />
    </span>
  );
}

/** Anneau de progression (personnes couvertes, remises…) */
export function Anneau({ valeur, total, taille = 76, libelle }: { valeur: number; total: number; taille?: number; libelle: string }) {
  const r = taille / 2 - 7;
  const c = 2 * Math.PI * r;
  const ratio = total ? Math.min(1, valeur / total) : 0;
  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} role="img" aria-label={libelle} class="anneau">
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="var(--fond-3)" stroke-width="9" />
      <circle
        cx={taille / 2}
        cy={taille / 2}
        r={r}
        fill="none"
        stroke="var(--achete)"
        stroke-width="9"
        stroke-linecap="round"
        stroke-dasharray={`${ratio * c} ${c}`}
        transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
      />
      <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size={taille * 0.23} font-weight="700" fill="var(--texte)">
        {valeur}/{total}
      </text>
    </svg>
  );
}

/** Barre Idée → Acheté → Donné */
export function Avancement({ etat, donnes, total }: { etat: EtatSouvenir; donnes: number; total: number }) {
  const niveau = etat === 'idee' ? 0 : etat === 'donne' ? 2 : 1;
  const etapes: { ton: Ton; lib: string }[] = [
    { ton: 'idee', lib: 'Idée' },
    { ton: 'achete', lib: 'Acheté' },
    { ton: 'donne', lib: etat === 'partiel' ? `Donné ${donnes}/${total}` : 'Donné' },
  ];
  return (
    <ol class="avancement" aria-label="Avancement">
      {etapes.map((e, i) => (
        <li class={(i <= niveau ? `fait ton-${e.ton}` : '') + (i === niveau ? ' courant' : '')} aria-current={i === niveau ? 'step' : undefined}>
          <span class="avancement-barre" />
          <span class="avancement-lib">
            <Icon n={TONS[e.ton].icone} taille={14} epaisseur={2.2} />
            {e.lib}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Pastilles « retour » lisibles (contraintes de douane et de bagage) */
export function PastillesRetour({ db, s }: { db: DB; s: Souvenir }) {
  const r: Retour = s.retour;
  const l: { texte: string; alerte?: boolean }[] = [];
  if (r.alcool)
    l.push({
      texte: `Alcool ${String(r.alcool.degre).replace('.', ',')} %${r.alcool.volumeL ? ` · ${String(r.alcool.volumeL).replace('.', ',')} L` : ''}`,
      alerte: r.alcool.degre > 70,
    });
  if (r.tranchant) l.push({ texte: 'Tranchant : en soute', alerte: true });
  if (r.liquide) l.push({ texte: 'Liquide : en soute', alerte: true });
  if (r.viande) l.push({ texte: 'Viande', alerte: true });
  if (r.lait) l.push({ texte: 'Produits laitiers', alerte: true });
  if (r.vegetal) l.push({ texte: 'Végétal' });
  if (r.fragile) l.push({ texte: 'Fragile' });
  if (r.poidsG) l.push({ texte: `${r.poidsG} g` });
  if (s.achat?.ticketDetaxeId) l.push({ texte: 'Détaxé' });
  if (r.consommeAuJapon) l.push({ texte: 'Consommé au Japon' });
  const b = r.bagageId ? db.bagages.find((x) => x.id === r.bagageId) : undefined;
  if (b) l.push({ texte: b.nom });
  if (!l.length) return null;
  return (
    <div class="pastilles">
      {l.map((x) => (
        <span class={'pastille' + (x.alerte ? ' pastille-alerte' : '')}>
          {x.alerte && <Icon n="alerte" taille={13} epaisseur={2} />}
          {x.texte}
        </span>
      ))}
    </div>
  );
}

export function Carte({ children, class: c, titre, action, id }: { children: ComponentChildren; class?: string; titre?: ComponentChildren; action?: ComponentChildren; id?: string }) {
  return (
    <section class={'carte ' + (c ?? '')} id={id}>
      {(titre || action) && (
        <div class="carte-tete">
          {titre && <h2>{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
