// Liste des souvenirs (§7.3, F-25).
import { useState } from 'preact/hooks';
import type { Attribution, DB, Souvenir } from '../../db/types';
import {
  estPourMoi,
  etatSouvenir,
  etapesDuVoyage,
  etapesPossibles,
  indexAttributions,
  lieuxDe,
  nomCible,
  souvenirsDuVoyage,
  unitesNonAttribuees,
} from '../../domain/rules';
import { normaliser } from '../../domain/format';
import { route } from '../state';
import { categoriesTriees, useDb, useVoyage } from '../data';
import { Segments, Selecteur, Vide } from '../components/ui';
import { Icon } from '../components/Icon';
import { SouvenirLigne } from '../components/SouvenirLigne';
import { libelleEtape } from '../components/champs';

export type Segment = 'idees' | 'achetes' | 'a_attribuer' | 'donnes' | 'pour_moi';

export function dansSegment(seg: Segment, s: Souvenir, attrs: Attribution[]): boolean {
  const e = etatSouvenir(s, attrs);
  switch (seg) {
    case 'idees':
      return s.statut === 'idee';
    case 'achetes':
      return s.statut === 'achete' && e !== 'donne';
    case 'a_attribuer':
      return s.statut === 'achete' && unitesNonAttribuees(s, attrs) > 0;
    case 'donnes':
      return e === 'donne';
    case 'pour_moi':
      return attrs.some(estPourMoi);
  }
}

export function aAlerteRetour(s: Souvenir): boolean {
  const r = s.retour;
  return !!(r.alcool || r.viande || r.lait || r.vegetal || r.liquide || r.tranchant || (s.ia?.alertes.length ?? 0) > 0);
}

export interface Filtres {
  categorie: string;
  etape: string;
  sansLieu: boolean;
  detaxe: boolean;
  alerte: boolean;
}

const AUCUN: Filtres = { categorie: '', etape: '', sansLieu: false, detaxe: false, alerte: false };

/** Recherche insensible aux accents et à la casse sur nom, note, boutique et destinataires */
export function correspond(db: DB, s: Souvenir, attrs: Attribution[], q: string): boolean {
  if (!q) return true;
  const n = normaliser(q);
  const texte = [s.nom, s.note, s.achat?.boutique, ...attrs.map((a) => (estPourMoi(a) ? 'Moi' : nomCible(db, a)))].filter(Boolean).join(' ');
  return normaliser(texte).includes(n);
}

export function filtrer(db: DB, liste: Souvenir[], f: Filtres, idx: Map<string, Attribution[]>): Souvenir[] {
  return liste.filter((s) => {
    if (f.categorie && s.categorieId !== f.categorie) return false;
    if (f.etape && s.achat?.etapeId !== f.etape && !etapesPossibles(s, db.lieux).includes(f.etape)) return false;
    if (f.sansLieu && lieuxDe(db, s.id).length > 0) return false;
    if (f.detaxe && !s.achat?.ticketDetaxeId) return false;
    if (f.alerte && !aAlerteRetour(s)) return false;
    void idx;
    return true;
  });
}

export function Souvenirs() {
  const db = useDb();
  const v = useVoyage();
  const q = route.value.query;
  const [seg, setSeg] = useState<Segment>((q.get('seg') as Segment) || 'idees');
  const [f, setF] = useState<Filtres>(AUCUN);
  const [recherche, setRecherche] = useState('');
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const idx = indexAttributions(db);
  const tous = souvenirsDuVoyage(db, v.id);
  const compte = (s: Segment) => tous.filter((x) => dansSegment(s, x, idx.get(x.id) ?? [])).length;
  const liste = filtrer(
    db,
    tous.filter((s) => dansSegment(seg, s, idx.get(s.id) ?? []) && correspond(db, s, idx.get(s.id) ?? [], recherche)),
    f,
    idx,
  ).sort((a, b) => {
    const da = a.achat?.date ?? a.createdAt;
    const dbb = b.achat?.date ?? b.createdAt;
    return da < dbb ? 1 : da > dbb ? -1 : a.nom.localeCompare(b.nom, 'fr');
  });
  const nbFiltres = Object.values(f).filter(Boolean).length;
  const etapes = etapesDuVoyage(db, v.id);

  return (
    <div class="ecran">
      <div class="ecran-tete">
        <h1>Souvenirs</h1>
      </div>
      <Segments
        label="Segments"
        valeur={seg}
        onChange={setSeg}
        valeurs={[
          { id: 'idees', libelle: <>Idées <small>{compte('idees')}</small></> },
          { id: 'achetes', libelle: <>Achetés <small>{compte('achetes')}</small></> },
          { id: 'a_attribuer', libelle: <>À attribuer <small>{compte('a_attribuer')}</small></> },
          { id: 'donnes', libelle: <>Donnés <small>{compte('donnes')}</small></> },
          { id: 'pour_moi', libelle: <>Pour moi <small>{compte('pour_moi')}</small></> },
        ]}
      />
      <div class="barre-recherche">
        <div class="recherche">
          <Icon n="recherche" taille={18} />
          <input type="search" placeholder="Nom, note, boutique, destinataire" aria-label="Rechercher un souvenir" value={recherche} onInput={(e) => setRecherche((e.target as HTMLInputElement).value)} />
        </div>
        <button class={'btn btn-petit' + (nbFiltres ? ' btn-actif' : '')} aria-expanded={filtresOuverts} onClick={() => setFiltresOuverts(!filtresOuverts)}>
          Filtres{nbFiltres ? ` (${nbFiltres})` : ''}
        </button>
      </div>
      {filtresOuverts && (
        <div class="filtres">
          <Selecteur valeur={f.categorie} onValeur={(c) => setF({ ...f, categorie: c })} vide="Toutes catégories" options={categoriesTriees(db).map((c) => ({ id: c.id, libelle: c.libelle }))} />
          <Selecteur valeur={f.etape} onValeur={(e) => setF({ ...f, etape: e })} vide="Toutes étapes" options={etapes.map((e) => ({ id: e.id, libelle: libelleEtape(e, etapes) }))} />
          <div class="puces">
            <button class={'puce puce-btn' + (f.sansLieu ? ' actif' : '')} aria-pressed={f.sansLieu} onClick={() => setF({ ...f, sansLieu: !f.sansLieu })}>
              Sans lieu d'achat
            </button>
            <button class={'puce puce-btn' + (f.detaxe ? ' actif' : '')} aria-pressed={f.detaxe} onClick={() => setF({ ...f, detaxe: !f.detaxe })}>
              Détaxé
            </button>
            <button class={'puce puce-btn' + (f.alerte ? ' actif' : '')} aria-pressed={f.alerte} onClick={() => setF({ ...f, alerte: !f.alerte })}>
              Avec alerte retour
            </button>
          </div>
          {nbFiltres > 0 && (
            <button class="btn btn-petit" onClick={() => setF(AUCUN)}>
              Réinitialiser les filtres
            </button>
          )}
        </div>
      )}
      {liste.length === 0 ? (
        <Vide>Aucun souvenir ici.</Vide>
      ) : (
        <ul class="liste" aria-label="Souvenirs">
          {liste.map((s) => (
            <SouvenirLigne db={db} s={s} attrs={idx.get(s.id) ?? []} etat={seg === 'pour_moi' || seg === 'achetes'} />
          ))}
        </ul>
      )}
    </div>
  );
}
