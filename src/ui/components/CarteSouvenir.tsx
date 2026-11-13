// Carte d'un souvenir : tuile (photo ou catégorie, couleur de l'état), nom, destinataires, prix, état.
import type { ComponentChildren } from 'preact';
import type { Attribution, DB, Personne, Souvenir } from '../../db/types';
import { etatSouvenir, prixYen, unitesNonAttribuees } from '../../domain/rules';
import { yen } from '../../domain/format';
import { nomEtape } from '../data';
import { PileAvatars, PuceEtat, Tuile, tonSouvenir } from './visuel';
import { Icon } from './Icon';

export function destinatairesDe(db: DB, attrs: Attribution[]): { personnes: Personne[]; groupes: string[] } {
  const personnes: Personne[] = [];
  const groupes: string[] = [];
  for (const a of attrs) {
    if (a.cible.type === 'groupe') {
      const gid = a.cible.groupeId;
      groupes.push(db.groupes.find((g) => g.id === gid)?.nom ?? 'Groupe');
    } else
      for (const id of a.cible.ids) {
        const p = db.personnes.find((x) => x.id === id);
        if (p && !personnes.includes(p)) personnes.push(p);
      }
  }
  return { personnes, groupes };
}

export function CarteSouvenir(props: {
  db: DB;
  s: Souvenir;
  attrs: Attribution[];
  /** Ligne d'information sous le nom (sinon : étape d'achat ou étapes prévues) */
  info?: ComponentChildren;
  children?: ComponentChildren;
  masquerEtat?: boolean;
}) {
  const { db, s, attrs } = props;
  const etat = etatSouvenir(s, attrs);
  const ton = tonSouvenir(etat);
  const { personnes, groupes } = destinatairesDe(db, attrs);
  const libres = s.statut === 'achete' ? unitesNonAttribuees(s, attrs) : 0;
  const info =
    props.info ??
    (s.achat
      ? nomEtape(db, s.achat.etapeId) + (s.achat.boutique ? ` · ${s.achat.boutique}` : '')
      : s.partout
        ? 'Partout'
        : s.etapesPrevues.map((e) => nomEtape(db, e)).join(', '));
  return (
    <li class="carte-souvenir">
      <a class="carte-souvenir-tete" href={'#/souvenirs/' + s.id}>
        <Tuile s={s} ton={ton} taille={48} />
        <span class="carte-souvenir-texte">
          <span class="carte-souvenir-nom">
            {s.nom}
            {s.quantite > 1 && <span class="discret"> ×{s.quantite}</span>}
          </span>
          <span class="carte-souvenir-meta">
            {personnes.length > 0 && <PileAvatars personnes={personnes} />}
            {groupes.map((g) => (
              <span class="puce puce-collectif">
                <Icon n="groupe" taille={12} /> {g}
              </span>
            ))}
            {personnes.length === 0 && groupes.length === 0 && <span>Pour personne encore</span>}
            {personnes.length === 1 && groupes.length === 0 && <span>{personnes[0].nom}</span>}
            {libres > 0 && <span>· {libres} sans destinataire</span>}
          </span>
          {info && <span class="carte-souvenir-meta">{info}</span>}
        </span>
        <span class="carte-souvenir-droite">
          {s.achat && <span class="prix-carte">{yen(prixYen(s))}</span>}
          {!props.masquerEtat && <PuceEtat ton={ton} petite libelle={etat === 'partiel' ? 'Donné en partie' : undefined} />}
        </span>
      </a>
      {props.children}
    </li>
  );
}
