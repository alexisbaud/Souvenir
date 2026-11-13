import type { Attribution, DB, Souvenir } from '../../db/types';
import { estCollective, estPourMoi, etatSouvenir, nomCible, prixYen, unitesAttribuees } from '../../domain/rules';
import { yen } from '../../domain/format';
import { nomEtape } from '../data';
import { Miniature } from './champs';
import { BadgeEtat } from './ui';

/** Ligne de liste d'un souvenir (§7.3) : miniature, nom, ×N, destinataires, étape, prix */
export function SouvenirLigne(props: { db: DB; s: Souvenir; attrs: Attribution[]; etat?: boolean; extra?: preact.ComponentChildren }) {
  const { db, s, attrs } = props;
  const etape = s.achat ? nomEtape(db, s.achat.etapeId) : s.etapesPrevues.length ? s.etapesPrevues.map((e) => nomEtape(db, e)).join(', ') : s.partout ? 'Partout' : '';
  const k = unitesAttribuees(attrs);
  return (
    <li class="souvenir-ligne">
      <a href={'#/souvenirs/' + s.id} class="ligne-lien">
        <Miniature id={s.photoId} />
        <span class="souvenir-texte">
          <span class="ligne-titre">
            {s.nom}
            {s.quantite > 1 && <span class="discret"> ×{s.quantite}</span>}
            {s.quantite > 1 && s.statut === 'achete' && k < s.quantite && <span class="discret"> · {k}/{s.quantite} attribués</span>}
          </span>
          <span class="puces petites">
            {attrs.map((a) => (
              <span class={'puce' + (estCollective(a) ? ' puce-collectif' : '') + (a.remise === 'donne' ? ' puce-donne' : '')}>
                {estPourMoi(a) ? 'Moi' : nomCible(db, a)}
                {a.quantite > 1 ? ` ×${a.quantite}` : ''}
                {a.remise === 'donne' ? ' ✓' : ''}
              </span>
            ))}
          </span>
          {etape && <span class="discret">{etape}</span>}
        </span>
        <span class="souvenir-droite">
          {s.achat && <span class="prix-ligne-val">{yen(prixYen(s))}</span>}
          {props.etat && <BadgeEtat etat={etatSouvenir(s, attrs)} />}
        </span>
      </a>
      {props.extra}
    </li>
  );
}
