// Import d'une réponse IA, automatique ou collée (§9.7, F-41, F-42, RG-18).
import type { Draft } from '../db/store';
import type { Cible, CibleSuggestion, DateStr, Etape, ID, LieuData, Retour, TypeLieu } from '../db/types';
import { MOI_ID } from '../db/types';
import { ajouterAttribution, creerIdee, ErreurMetier, uuid } from '../domain/actions';
import { etapesDuVoyage, etapesRestantes, voyageActif } from '../domain/rules';
import { normaliser as norm } from '../domain/format';
import { outilLieux, outilSuggestions } from './prompts';
import { nettoyer, urlHttpsValide, valider } from './validate';
import { memeCible } from './context';

export class ErreurReponse extends Error {}

interface LieuIA {
  nom: string;
  type: TypeLieu;
  etapes: string[];
  zone?: string;
  prix_min_yen?: number;
  prix_max_yen?: number;
  horaires?: string;
  conseil: string;
  confiance: 'haute' | 'moyenne' | 'basse';
  sources: string[];
}

interface RetourIA {
  alcool?: { type: 'vin' | 'biere' | 'autre'; degre: number; volume_l?: number };
  viande?: boolean;
  lait?: boolean;
  vegetal?: boolean;
  liquide?: boolean;
  tranchant?: boolean;
  fragile?: boolean;
  poids_g?: number;
}

export interface ReponseLieux {
  interpretation: string;
  lieux: LieuIA[];
  derniere_chance?: string;
  retour?: RetourIA;
  alertes: string[];
  alternatives?: string[];
}

export interface ReponseSuggestions {
  analyse: string;
  suggestions: {
    nom: string;
    description: string;
    pourquoi: string;
    categorie: string;
    prix_min_yen?: number;
    prix_max_yen?: number;
    quantite_conseillee?: number;
    lieux: LieuIA[];
    retour?: RetourIA;
    alertes?: string[];
  }[];
}

export function lireReponseLieux(brut: unknown): ReponseLieux {
  const schema = outilLieux().input_schema;
  const v = nettoyer(brut, schema);
  const err = valider(v, schema);
  if (err.length) throw new ErreurReponse('Réponse invalide : ' + err.slice(0, 4).join(' ; '));
  return v as ReponseLieux;
}

export function lireReponseSuggestions(brut: unknown, categories: string[]): ReponseSuggestions {
  const schema = outilSuggestions(categories).input_schema;
  const v = nettoyer(brut, schema);
  const err = valider(v, schema);
  if (err.length) throw new ErreurReponse('Réponse invalide : ' + err.slice(0, 4).join(' ; '));
  return v as ReponseSuggestions;
}

/** Convertit un lieu IA ; null si aucune étape restante valide ou aucune source https (§9.7, F-41 CA5) */
function convertirLieu(l: LieuIA, restantes: Set<string>, date: string): LieuData | null {
  const etapeIds = [...new Set(l.etapes.filter((e) => restantes.has(e)))];
  if (!etapeIds.length) return null;
  const sources = l.sources.filter(urlHttpsValide);
  if (!sources.length) return null;
  return {
    nom: l.nom,
    type: l.type,
    etapeIds,
    zone: l.zone || undefined,
    prixMinYen: l.prix_min_yen,
    prixMaxYen: l.prix_max_yen,
    horaires: l.horaires || undefined,
    conseil: l.conseil || undefined,
    sources,
    confiance: l.confiance,
    origine: 'ia',
    dateRecherche: date,
  };
}

export function convertirRetour(r: RetourIA | undefined): Retour {
  if (!r) return {};
  const out: Retour = {};
  if (r.alcool) out.alcool = { type: r.alcool.type, degre: r.alcool.degre, volumeL: r.alcool.volume_l };
  for (const k of ['viande', 'lait', 'vegetal', 'liquide', 'tranchant', 'fragile'] as const) if (r[k] !== undefined) out[k] = r[k];
  if (r.poids_g !== undefined) out.poidsG = r.poids_g;
  return out;
}

/** CA3 : ne remplit que les champs vides ; mémorise les champs remplis par l'IA */
function completerRetour(actuel: Retour, propose: Retour): Retour {
  const out: Retour = { ...actuel };
  const remplis = new Set(actuel.sourceIA ?? []);
  for (const [k, v] of Object.entries(propose) as [keyof Retour, unknown][]) {
    if (v === undefined || v === false) continue;
    if (out[k] !== undefined && out[k] !== false) continue;
    (out as Record<string, unknown>)[k] = v;
    remplis.add(k);
  }
  if (remplis.size) out.sourceIA = [...remplis];
  return out;
}

function restantesIds(d: Draft, voyageId: ID, jour: DateStr): Set<string> {
  return new Set(etapesRestantes(etapesDuVoyage(d.db, voyageId), jour).map((e: Etape) => e.id));
}

export function importerLieux(d: Draft, souvenirId: ID, rep: ReponseLieux, jour: DateStr, maintenant: string): number {
  const s = d.get('souvenirs', souvenirId);
  if (!s) throw new ErreurMetier("L'idée n'existe plus.");
  const restantes = restantesIds(d, s.voyageId, jour);
  // RG-18 : remplace les lieux IA précédents, sauf les écartés ; ne touche jamais aux lieux manuels
  const existants = d.db.lieux.filter((l) => l.souvenirId === souvenirId);
  for (const l of existants) if (l.origine === 'ia' && !l.ecarte) d.del('lieux', l.id);
  const gardes = d.db.lieux.filter((l) => l.souvenirId === souvenirId);
  let n = 0;
  for (const brut of rep.lieux) {
    const l = convertirLieu(brut, restantes, maintenant);
    if (!l) continue;
    const doublon = gardes.some((g) => norm(g.nom) === norm(l.nom) && g.etapeIds.some((e) => l.etapeIds.includes(e)));
    if (doublon) continue;
    const cree = d.put('lieux', { ...l, id: uuid(), voyageId: s.voyageId, souvenirId, createdAt: '', updatedAt: '' });
    gardes.push(cree);
    n++;
  }
  const cur = d.get('souvenirs', souvenirId)!;
  d.put('souvenirs', {
    ...cur,
    retour: completerRetour(cur.retour, convertirRetour(rep.retour)),
    ia: {
      interpretation: rep.interpretation,
      alertes: rep.alertes,
      alternatives: rep.alternatives?.length ? rep.alternatives : undefined,
      derniereChance: rep.derniere_chance || undefined,
      nomRecherche: cur.nom,
      date: maintenant,
    },
  });
  return n;
}

export function importerSuggestions(
  d: Draft,
  cible: CibleSuggestion,
  rep: ReponseSuggestions,
  jour: DateStr,
  maintenant: string,
): number {
  const v = voyageActif(d.db);
  if (!v) throw new ErreurMetier('Aucun voyage actif.');
  const restantes = restantesIds(d, v.id, jour);
  // Les nouvelles suggestions remplacent les précédentes non traitées
  for (const s of d.db.suggestions)
    if (s.voyageId === v.id && s.statut === 'nouvelle' && memeCible(s.cible, cible)) d.del('suggestions', s.id);
  const ecartees = new Set(
    d.db.suggestions.filter((s) => s.statut === 'ecartee' && memeCible(s.cible, cible)).map((s) => norm(s.nom)),
  );
  let n = 0;
  for (const x of rep.suggestions) {
    if (ecartees.has(norm(x.nom))) continue; // F-42 CA4
    const lieux = x.lieux.map((l) => convertirLieu(l, restantes, maintenant)).filter((l): l is LieuData => !!l);
    d.put('suggestions', {
      id: uuid(),
      voyageId: v.id,
      cible,
      nom: x.nom,
      description: x.description,
      pourquoi: x.pourquoi,
      categorieId: d.db.categories.some((c) => c.id === x.categorie) ? x.categorie : undefined,
      prixMinYen: x.prix_min_yen,
      prixMaxYen: x.prix_max_yen,
      quantiteConseillee: x.quantite_conseillee,
      lieux,
      retour: convertirRetour(x.retour),
      alertes: x.alertes ?? [],
      statut: 'nouvelle',
      genereeLe: maintenant,
      createdAt: '',
      updatedAt: '',
    });
    n++;
  }
  return n;
}

/** F-42 CA3 : crée une idée attribuée à la cible (collective pour un groupe), avec ses lieux */
export function accepterSuggestion(d: Draft, id: ID): ID {
  const sg = d.get('suggestions', id);
  if (!sg) throw new ErreurMetier('Suggestion introuvable.');
  const quantite = Math.max(1, sg.quantiteConseillee ?? 1);
  const retour = { ...sg.retour, sourceIA: Object.keys(sg.retour).length ? Object.keys(sg.retour) : undefined };
  const s = creerIdee(d, {
    nom: sg.nom,
    cibles: { personnes: [], groupes: [], moi: false },
    quantite,
    categorieId: sg.categorieId,
    note: sg.description,
    retour,
    origine: 'ia',
  });
  const c = sg.cible;
  const cible: Cible =
    c.type === 'groupe' ? { type: 'groupe', groupeId: c.id } : { type: 'personnes', ids: [c.type === 'moi' ? MOI_ID : c.id] };
  ajouterAttribution(d, s.id, cible, c.type === 'groupe' ? quantite : 1);
  for (const l of sg.lieux) d.put('lieux', { ...l, id: uuid(), voyageId: s.voyageId, souvenirId: s.id, createdAt: '', updatedAt: '' });
  // L'idée a déjà ses lieux : inutile de la placer dans la file de recherche automatique
  for (const j of d.db.jobs) if (j.demande.type === 'lieux' && j.demande.souvenirId === s.id) d.del('jobs', j.id);
  d.put('suggestions', { ...sg, statut: 'acceptee', souvenirId: s.id });
  return s.id;
}

export function ecarterSuggestion(d: Draft, id: ID): void {
  d.patch('suggestions', id, (s) => ({ ...s, statut: 'ecartee' }));
}
