// Actions métier : chaque fonction modifie un brouillon (Draft) ; l'appelant l'exécute via commit().
import type { Draft } from '../db/store';
import type {
  Achat,
  Attribution,
  Bagage,
  Cible,
  DateStr,
  DemandeIA,
  Etape,
  Excursion,
  ID,
  Lieu,
  LieuData,
  Personne,
  ProfilDouanier,
  Retour,
  Souvenir,
  TicketDetaxe,
  Voyage,
} from '../db/types';
import { MOI_ID } from '../db/types';
import {
  cleTicket,
  convertirEUR,
  estPourMoi,
  verifierEtapes,
  verifierUnites,
  voyageActif,
} from './rules';

export class ErreurMetier extends Error {}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function nettoyer(s: string | undefined): string | undefined {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? t : undefined;
}

function voyage(d: Draft): Voyage {
  const v = voyageActif(d.db);
  if (!v) throw new ErreurMetier('Aucun voyage actif.');
  return v;
}

// ---------------------------------------------------------------- Personnes (F-10, RG-16, RG-17)

export function ajouterAuVoyage(d: Draft, personneId: ID, voyageId?: ID): void {
  const v = voyageId ? d.get('voyages', voyageId) : voyage(d);
  if (!v || personneId === MOI_ID || v.destinataires.includes(personneId)) return;
  d.put('voyages', { ...v, destinataires: [...v.destinataires, personneId] });
}

export function creerPersonne(d: Draft, data: { nom: string; groupeId?: ID; indices?: string }): Personne {
  const nom = nettoyer(data.nom);
  if (!nom) throw new ErreurMetier('Le nom est obligatoire.');
  const p = d.put('personnes', {
    id: uuid(),
    nom,
    groupeId: data.groupeId || undefined,
    indices: nettoyer(data.indices),
    createdAt: '',
    updatedAt: '',
  });
  ajouterAuVoyage(d, p.id);
  return p;
}

export function homonymes(personnes: Personne[], nom: string, saufId?: ID): boolean {
  const n = nom.trim().toLowerCase();
  return personnes.some((p) => p.id !== saufId && p.nom.trim().toLowerCase() === n);
}

export function modifierPersonne(d: Draft, id: ID, data: { nom: string; groupeId?: ID; indices?: string }): void {
  const p = d.get('personnes', id);
  if (!p) return;
  if (p.systeme) throw new ErreurMetier('« Moi » ne peut pas être modifié.');
  const nom = nettoyer(data.nom);
  if (!nom) throw new ErreurMetier('Le nom est obligatoire.');
  d.put('personnes', { ...p, nom, groupeId: data.groupeId || undefined, indices: nettoyer(data.indices) });
}

export function modifierIndices(d: Draft, id: ID, indices: string): void {
  d.patch('personnes', id, (p) => ({ ...p, indices: nettoyer(indices) }));
}

/** RG-16 : retire la personne de ses attributions ; une attribution vide est supprimée */
export function supprimerPersonne(d: Draft, id: ID): void {
  const p = d.get('personnes', id);
  if (!p) return;
  if (p.systeme) throw new ErreurMetier('« Moi » ne peut pas être supprimé.');
  for (const a of d.db.attributions) {
    if (a.cible.type !== 'personnes' || !a.cible.ids.includes(id)) continue;
    const ids = a.cible.ids.filter((x) => x !== id);
    if (ids.length === 0) d.del('attributions', a.id);
    else d.put('attributions', { ...a, cible: { type: 'personnes', ids } });
  }
  for (const v of d.db.voyages)
    if (v.destinataires.includes(id)) d.put('voyages', { ...v, destinataires: v.destinataires.filter((x) => x !== id) });
  for (const s of d.db.suggestions) if (s.cible.type === 'personne' && s.cible.id === id) d.del('suggestions', s.id);
  d.del('personnes', id);
}

// ---------------------------------------------------------------- Groupes (F-11)

export function creerGroupe(d: Draft, nom: string): void {
  const n = nettoyer(nom);
  if (!n) throw new ErreurMetier('Le nom est obligatoire.');
  const ordre = Math.max(0, ...d.db.groupes.map((g) => g.ordre)) + 1;
  d.put('groupes', { id: uuid(), nom: n, ordre, createdAt: '', updatedAt: '' });
}

export function renommerGroupe(d: Draft, id: ID, nom: string): void {
  const n = nettoyer(nom);
  if (!n) throw new ErreurMetier('Le nom est obligatoire.');
  d.patch('groupes', id, (g) => ({ ...g, nom: n }));
}

export function deplacerGroupe(d: Draft, id: ID, sens: -1 | 1): void {
  const tri = [...d.db.groupes].sort((a, b) => a.ordre - b.ordre);
  const i = tri.findIndex((g) => g.id === id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= tri.length) return;
  [tri[i], tri[j]] = [tri[j], tri[i]];
  tri.forEach((g, k) => {
    if (g.ordre !== k + 1) d.put('groupes', { ...g, ordre: k + 1 });
  });
}

/** RG-16 : les attributions au groupe deviennent des listes de ses membres */
export function supprimerGroupe(d: Draft, id: ID): void {
  const membres = d.db.personnes.filter((p) => p.groupeId === id && !p.systeme).map((p) => p.id);
  for (const a of d.db.attributions) {
    if (a.cible.type !== 'groupe' || a.cible.groupeId !== id) continue;
    if (membres.length === 0) d.del('attributions', a.id);
    else d.put('attributions', { ...a, cible: { type: 'personnes', ids: membres } });
  }
  for (const p of d.db.personnes) if (p.groupeId === id) d.put('personnes', { ...p, groupeId: undefined });
  for (const s of d.db.suggestions) if (s.cible.type === 'groupe' && s.cible.id === id) d.del('suggestions', s.id);
  d.del('groupes', id);
}

// ---------------------------------------------------------------- Catégories

export function creerCategorie(d: Draft, libelle: string): void {
  const l = nettoyer(libelle);
  if (!l) throw new ErreurMetier('Le libellé est obligatoire.');
  const ordre = Math.max(0, ...d.db.categories.map((c) => c.ordre)) + 1;
  d.put('categories', { id: uuid(), libelle: l, ordre, createdAt: '', updatedAt: '' });
}

export function renommerCategorie(d: Draft, id: ID, libelle: string): void {
  const l = nettoyer(libelle);
  if (!l) throw new ErreurMetier('Le libellé est obligatoire.');
  d.patch('categories', id, (c) => ({ ...c, libelle: l }));
}

export function supprimerCategorie(d: Draft, id: ID): void {
  for (const s of d.db.souvenirs) if (s.categorieId === id) d.put('souvenirs', { ...s, categorieId: undefined });
  d.del('categories', id);
}

// ---------------------------------------------------------------- Pour qui

export interface SelectionCibles {
  personnes: ID[];
  groupes: ID[];
  moi: boolean;
  /** Plusieurs personnes = un seul cadeau commun (collectif) au lieu d'un cadeau chacune */
  commun?: boolean;
}

export const SELECTION_VIDE: SelectionCibles = { personnes: [], groupes: [], moi: false };

export function ciblesDeSelection(sel: SelectionCibles): Cible[] {
  const out: Cible[] = [];
  const pers = sel.personnes.filter((p) => p !== MOI_ID);
  if (sel.commun && pers.length > 1) out.push({ type: 'personnes', ids: pers });
  else for (const p of pers) out.push({ type: 'personnes', ids: [p] });
  for (const g of sel.groupes) out.push({ type: 'groupe', groupeId: g });
  if (sel.moi || sel.personnes.includes(MOI_ID)) out.push({ type: 'personnes', ids: [MOI_ID] });
  return out;
}

function nouvelleAttribution(souvenir: Souvenir, cible: Cible, quantite = 1): Attribution {
  const moi = cible.type === 'personnes' && cible.ids.length === 1 && cible.ids[0] === MOI_ID;
  return {
    id: uuid(),
    voyageId: souvenir.voyageId,
    souvenirId: souvenir.id,
    cible,
    quantite,
    remise: moi ? undefined : 'a_donner',
    createdAt: '',
    updatedAt: '',
  };
}

// ---------------------------------------------------------------- Souvenirs (F-20, F-21, F-24)

export interface DonneesIdee {
  nom: string;
  cibles: SelectionCibles;
  quantite?: number;
  categorieId?: ID;
  etapesPrevues?: ID[];
  partout?: boolean;
  note?: string;
  retour?: Retour;
  origine?: 'manuel' | 'ia';
}

export function creerIdee(d: Draft, data: DonneesIdee): Souvenir {
  const v = voyage(d);
  const nom = nettoyer(data.nom);
  if (!nom) throw new ErreurMetier('Le nom est obligatoire.');
  const cibles = ciblesDeSelection(data.cibles);
  const quantite = Math.max(data.quantite ?? 1, cibles.length, 1);
  const s = d.put('souvenirs', {
    id: uuid(),
    voyageId: v.id,
    nom,
    statut: 'idee',
    categorieId: data.categorieId || undefined,
    note: nettoyer(data.note),
    quantite,
    etapesPrevues: data.etapesPrevues ?? [],
    partout: data.partout || undefined,
    retour: data.retour ?? {},
    origine: data.origine ?? 'manuel',
    createdAt: '',
    updatedAt: '',
  });
  for (const c of cibles) d.put('attributions', nouvelleAttribution(s, c));
  for (const id of data.cibles.personnes) ajouterAuVoyage(d, id, v.id);
  // F-20 CA3 / F-43 CA1 : file de recherche automatique
  if (d.db.parametres.ia.auto) mettreEnFile(d, { type: 'lieux', souvenirId: s.id });
  return s;
}

export interface DonneesAchat {
  nom: string;
  prix: number;
  devise: 'JPY' | 'EUR';
  tauxEUR: number;
  quantite?: number;
  date: DateStr;
  etapeId: ID;
  boutique?: string;
  cibles?: SelectionCibles;
  categorieId?: ID;
  note?: string;
  detaxe?: boolean;
  retour?: Retour;
  lieuId?: ID;
  photoId?: ID;
}

function construireAchat(data: DonneesAchat, ts: string): Achat {
  if (!Number.isFinite(data.prix) || data.prix < 0) throw new ErreurMetier('Le prix est obligatoire.');
  if (!(data.tauxEUR > 0)) throw new ErreurMetier('Un taux de change est nécessaire.');
  const prix = data.devise === 'JPY' ? Math.round(data.prix) : Math.round(data.prix * 100) / 100;
  return {
    date: data.date,
    etapeId: data.etapeId,
    boutique: nettoyer(data.boutique),
    prix,
    devise: data.devise,
    tauxEUR: data.tauxEUR,
    prixEUR: convertirEUR(prix, data.devise, data.tauxEUR),
    lieuId: data.lieuId,
    enregistreLe: ts,
  };
}

function memoriserBoutique(d: Draft, etapeId: ID, boutique?: string): void {
  const b = nettoyer(boutique);
  if (!b || d.db.parametres.derniereBoutique?.[etapeId] === b) return;
  d.params((p) => ({ ...p, derniereBoutique: { ...p.derniereBoutique, [etapeId]: b } }));
}

export function creerAchat(d: Draft, data: DonneesAchat): Souvenir {
  const v = voyage(d);
  const nom = nettoyer(data.nom);
  if (!nom) throw new ErreurMetier('Le nom est obligatoire.');
  const cibles = ciblesDeSelection(data.cibles ?? { personnes: [], groupes: [], moi: false });
  const quantite = Math.max(data.quantite ?? 1, cibles.length, 1);
  const s = d.put('souvenirs', {
    id: uuid(),
    voyageId: v.id,
    nom,
    statut: 'achete',
    categorieId: data.categorieId || undefined,
    note: nettoyer(data.note),
    quantite,
    etapesPrevues: [],
    retour: data.retour ?? {},
    achat: construireAchat(data, new Date().toISOString()),
    photoId: data.photoId,
    origine: 'manuel',
    createdAt: '',
    updatedAt: '',
  });
  for (const c of cibles) d.put('attributions', nouvelleAttribution(s, c));
  for (const id of data.cibles?.personnes ?? []) ajouterAuVoyage(d, id, v.id);
  memoriserBoutique(d, data.etapeId, data.boutique);
  if (data.detaxe) definirDetaxe(d, s.id, true);
  return d.get('souvenirs', s.id)!;
}

/**
 * F-24 : passe une idée en achat. `attributionsAchetees` = attributions de l'idée couvertes par cet achat.
 * Si toutes le sont (ou si l'idée n'en a pas), l'idée devient l'achat. Sinon (achat partiel, CA2),
 * un nouvel achat est créé pour elles et l'idée reste aux autres.
 */
export function acheterIdee(
  d: Draft,
  ideeId: ID,
  data: Omit<DonneesAchat, 'cibles'>,
  attributionsAchetees: ID[],
): Souvenir {
  const idee = d.get('souvenirs', ideeId);
  if (!idee || idee.statut !== 'idee') throw new ErreurMetier("Cette idée n'existe plus.");
  const attrs = d.db.attributions.filter((a) => a.souvenirId === ideeId);
  const choisies = attrs.filter((a) => attributionsAchetees.includes(a.id));
  const restantes = attrs.filter((a) => !attributionsAchetees.includes(a.id));
  const achat = construireAchat(data, new Date().toISOString());
  const commun = {
    nom: nettoyer(data.nom) ?? idee.nom,
    categorieId: data.categorieId ?? idee.categorieId,
    note: data.note ?? idee.note,
    retour: { ...idee.retour, ...data.retour },
    photoId: data.photoId ?? idee.photoId,
  };
  let s: Souvenir;
  if (restantes.length === 0 || choisies.length === 0) {
    const quantite = Math.max(data.quantite ?? idee.quantite, attrs.reduce((n, a) => n + a.quantite, 0), 1);
    s = d.put('souvenirs', { ...idee, ...commun, statut: 'achete', quantite, achat });
  } else {
    const unites = choisies.reduce((n, a) => n + a.quantite, 0);
    const quantite = Math.max(data.quantite ?? unites, unites, 1);
    s = d.put('souvenirs', {
      ...idee,
      ...commun,
      id: uuid(),
      statut: 'achete',
      quantite,
      achat,
      ia: undefined,
      createdAt: '',
      updatedAt: '',
    });
    for (const a of choisies) d.put('attributions', { ...a, souvenirId: s.id });
    const reste = restantes.reduce((n, a) => n + a.quantite, 0);
    d.put('souvenirs', { ...idee, quantite: Math.max(1, reste, idee.quantite - unites) });
    // Les lieux restent consultables sur l'achat (CA3) : copie
    for (const l of d.db.lieux.filter((x) => x.souvenirId === ideeId))
      d.put('lieux', { ...l, id: uuid(), souvenirId: s.id, createdAt: '', updatedAt: '' });
  }
  memoriserBoutique(d, data.etapeId, data.boutique);
  if (data.detaxe) definirDetaxe(d, s.id, true);
  return d.get('souvenirs', s.id)!;
}

/** RG-01 : retour à l'état d'idée ; efface l'achat, conserve les attributions */
export function revenirIdee(d: Draft, id: ID): void {
  const s = d.get('souvenirs', id);
  if (!s || s.statut !== 'achete') return;
  const ticketId = s.achat?.ticketDetaxeId;
  d.put('souvenirs', { ...s, statut: 'idee', achat: undefined });
  for (const a of d.db.attributions)
    if (a.souvenirId === id && a.remise === 'donne') d.put('attributions', { ...a, remise: 'a_donner', dateRemise: undefined });
  if (ticketId) supprimerTicketSiVide(d, ticketId);
}

export interface ModifSouvenir {
  nom?: string;
  categorieId?: ID | null;
  note?: string;
  quantite?: number;
  etapesPrevues?: ID[];
  partout?: boolean;
  photoId?: ID | null;
}

export function modifierSouvenir(d: Draft, id: ID, m: ModifSouvenir): void {
  const s = d.get('souvenirs', id);
  if (!s) return;
  const next: Souvenir = { ...s };
  if (m.nom !== undefined) {
    const nom = nettoyer(m.nom);
    if (!nom) throw new ErreurMetier('Le nom est obligatoire.');
    if (nom !== s.nom) {
      next.nom = nom;
      // F-43 CA5 : lieux IA peut-être obsolètes après renommage
      for (const l of d.db.lieux)
        if (l.souvenirId === id && l.origine === 'ia' && !l.obsolete) d.put('lieux', { ...l, obsolete: true });
    }
  }
  if (m.categorieId !== undefined) next.categorieId = m.categorieId || undefined;
  if (m.note !== undefined) next.note = nettoyer(m.note);
  if (m.quantite !== undefined) {
    const attrs = d.db.attributions.filter((a) => a.souvenirId === id);
    const err = verifierUnites(m.quantite, attrs); // RG-04
    if (err) throw new ErreurMetier(err);
    next.quantite = m.quantite;
  }
  if (m.etapesPrevues !== undefined) next.etapesPrevues = m.etapesPrevues;
  if (m.partout !== undefined) next.partout = m.partout || undefined;
  if (m.photoId !== undefined) next.photoId = m.photoId || undefined;
  d.put('souvenirs', next);
}

export function modifierAchat(
  d: Draft,
  id: ID,
  m: Partial<Pick<Achat, 'date' | 'etapeId' | 'boutique' | 'prix' | 'devise' | 'tauxEUR' | 'lieuId'>>,
): void {
  const s = d.get('souvenirs', id);
  if (!s?.achat) return;
  const a: Achat = { ...s.achat, ...m };
  if (m.boutique !== undefined) a.boutique = nettoyer(m.boutique);
  if (!Number.isFinite(a.prix) || a.prix < 0) throw new ErreurMetier('Prix invalide.');
  if (!(a.tauxEUR > 0)) throw new ErreurMetier('Taux invalide.');
  a.prix = a.devise === 'JPY' ? Math.round(a.prix) : Math.round(a.prix * 100) / 100;
  a.prixEUR = convertirEUR(a.prix, a.devise, a.tauxEUR);
  d.put('souvenirs', { ...s, achat: a });
  // Un achat détaxé suit sa boutique et sa date (RG-13)
  if (s.achat.ticketDetaxeId && (a.boutique !== s.achat.boutique || a.date !== s.achat.date)) {
    definirDetaxe(d, id, false);
    if (a.boutique) definirDetaxe(d, id, true);
  }
}

/** Indicateurs retour saisis à la main : retire le marqueur « IA » des champs modifiés */
export function modifierRetour(d: Draft, id: ID, m: Partial<Retour>): void {
  const s = d.get('souvenirs', id);
  if (!s) return;
  const sourceIA = (s.retour.sourceIA ?? []).filter((k) => !(k in m));
  const retour: Retour = { ...s.retour, ...m, sourceIA: sourceIA.length ? sourceIA : undefined };
  for (const k of Object.keys(retour) as (keyof Retour)[]) if (retour[k] === undefined) delete retour[k];
  d.put('souvenirs', { ...s, retour });
}

export function supprimerSouvenir(d: Draft, id: ID): void {
  const s = d.get('souvenirs', id);
  if (!s) return;
  for (const a of d.db.attributions) if (a.souvenirId === id) d.del('attributions', a.id);
  for (const l of d.db.lieux) if (l.souvenirId === id) d.del('lieux', l.id);
  for (const j of d.db.jobs)
    if (j.demande.type === 'lieux' && j.demande.souvenirId === id && j.statut !== 'en_cours') d.del('jobs', j.id);
  d.del('souvenirs', id);
  if (s.achat?.ticketDetaxeId) supprimerTicketSiVide(d, s.achat.ticketDetaxeId);
}

// ---------------------------------------------------------------- Attributions (F-23, RG-02..05)

export function ajouterAttribution(d: Draft, souvenirId: ID, cible: Cible, quantite = 1, augmenter = false): Attribution {
  const s = d.get('souvenirs', souvenirId);
  if (!s) throw new ErreurMetier('Souvenir introuvable.');
  if (cible.type === 'personnes' && cible.ids.length === 0) throw new ErreurMetier('Choisissez au moins une personne.');
  const attrs = d.db.attributions.filter((a) => a.souvenirId === souvenirId);
  const somme = attrs.reduce((n, a) => n + a.quantite, 0) + quantite;
  if (somme > s.quantite) {
    if (!augmenter)
      throw new ErreurMetier(`Plus assez d'unités : ${s.quantite - (somme - quantite)} disponible(s) sur ${s.quantite}.`);
    d.put('souvenirs', { ...s, quantite: somme });
  }
  const a = d.put('attributions', nouvelleAttribution(s, cible, quantite));
  if (cible.type === 'personnes') for (const id of cible.ids) ajouterAuVoyage(d, id, s.voyageId);
  return a;
}

export function modifierAttribution(d: Draft, id: ID, m: { cible?: Cible; quantite?: number }): void {
  const a = d.get('attributions', id);
  if (!a) return;
  const s = d.get('souvenirs', a.souvenirId);
  if (!s) return;
  const next = { ...a, ...m };
  if (next.cible.type === 'personnes' && next.cible.ids.length === 0)
    throw new ErreurMetier('Choisissez au moins une personne.');
  const autres = d.db.attributions.filter((x) => x.souvenirId === s.id && x.id !== id);
  const err = verifierUnites(s.quantite, [...autres, next]);
  if (err) throw new ErreurMetier(err);
  if (estPourMoi(next)) {
    next.remise = undefined;
    next.dateRemise = undefined;
  } else if (!next.remise) next.remise = 'a_donner';
  d.put('attributions', next);
}

export function supprimerAttribution(d: Draft, id: ID): void {
  d.del('attributions', id);
}

/** F-53 : remise */
export function donner(d: Draft, attributionId: ID, date: DateStr): void {
  const a = d.get('attributions', attributionId);
  if (!a || estPourMoi(a)) return;
  d.put('attributions', { ...a, remise: 'donne', dateRemise: date });
}

export function annulerRemise(d: Draft, attributionId: ID): void {
  const a = d.get('attributions', attributionId);
  if (!a || estPourMoi(a)) return;
  d.put('attributions', { ...a, remise: 'a_donner', dateRemise: undefined });
}

// ---------------------------------------------------------------- Lieux d'achat (F-33)

export function ajouterLieu(d: Draft, souvenirId: ID, data: LieuData): Lieu {
  const s = d.get('souvenirs', souvenirId);
  if (!s) throw new ErreurMetier('Souvenir introuvable.');
  const nom = nettoyer(data.nom);
  if (!nom) throw new ErreurMetier('Le nom du lieu est obligatoire.');
  if (!data.etapeIds.length) throw new ErreurMetier('Choisissez au moins une étape.');
  return d.put('lieux', {
    ...data,
    nom,
    zone: nettoyer(data.zone),
    conseil: nettoyer(data.conseil),
    horaires: nettoyer(data.horaires),
    id: uuid(),
    voyageId: s.voyageId,
    souvenirId,
    createdAt: '',
    updatedAt: '',
  });
}

export function modifierLieu(d: Draft, id: ID, data: Partial<LieuData>): void {
  const l = d.get('lieux', id);
  if (!l) return;
  const next = { ...l, ...data };
  if (!nettoyer(next.nom)) throw new ErreurMetier('Le nom du lieu est obligatoire.');
  if (!next.etapeIds.length) throw new ErreurMetier('Choisissez au moins une étape.');
  d.put('lieux', next);
}

export function ecarterLieu(d: Draft, id: ID, ecarte: boolean): void {
  d.patch('lieux', id, (l) => ({ ...l, ecarte: ecarte || undefined }));
}

export function supprimerLieu(d: Draft, id: ID): void {
  d.del('lieux', id);
}

// ---------------------------------------------------------------- Détaxe (F-50, RG-13)

function supprimerTicketSiVide(d: Draft, ticketId: ID): void {
  const utilise = d.db.souvenirs.some((s) => s.achat?.ticketDetaxeId === ticketId && s.statut === 'achete');
  if (!utilise) d.del('tickets', ticketId);
}

export function definirDetaxe(d: Draft, souvenirId: ID, actif: boolean): void {
  const s = d.get('souvenirs', souvenirId);
  if (!s?.achat) throw new ErreurMetier('Seul un achat peut être détaxé.');
  if (!actif) {
    const tid = s.achat.ticketDetaxeId;
    if (!tid) return;
    d.put('souvenirs', { ...s, achat: { ...s.achat, ticketDetaxeId: undefined } });
    supprimerTicketSiVide(d, tid);
    return;
  }
  const boutique = nettoyer(s.achat.boutique);
  if (!boutique) throw new ErreurMetier('Indiquez la boutique pour regrouper les achats détaxés par ticket.');
  const cle = cleTicket(boutique, s.achat.date);
  let t: TicketDetaxe | undefined = d.db.tickets.find(
    (x) => x.voyageId === s.voyageId && cleTicket(x.boutique, x.date) === cle,
  );
  if (!t)
    t = d.put('tickets', {
      id: uuid(),
      voyageId: s.voyageId,
      boutique,
      etapeId: s.achat.etapeId,
      date: s.achat.date,
      statut: 'a_valider',
      createdAt: '',
      updatedAt: '',
    });
  if (s.achat.ticketDetaxeId === t.id) return;
  const ancien = s.achat.ticketDetaxeId;
  d.put('souvenirs', { ...s, achat: { ...s.achat, ticketDetaxeId: t.id } });
  if (ancien) supprimerTicketSiVide(d, ancien);
}

export function modifierTicket(d: Draft, id: ID, m: Partial<Pick<TicketDetaxe, 'taxeYen' | 'statut' | 'note'>>): void {
  d.patch('tickets', id, (t) => {
    const n = { ...t, ...m };
    if ('taxeYen' in m && (m.taxeYen === undefined || Number.isNaN(m.taxeYen))) delete n.taxeYen;
    return n;
  });
}

// ---------------------------------------------------------------- Bagages (F-52) et douane (F-51)

export function rangerDansBagage(d: Draft, souvenirId: ID, bagageId: ID | undefined): void {
  modifierRetour(d, souvenirId, { bagageId });
}

export function enregistrerBagage(d: Draft, b: Omit<Bagage, 'createdAt' | 'updatedAt' | 'voyageId' | 'id'> & { id?: ID }): void {
  const v = voyage(d);
  const nom = nettoyer(b.nom);
  if (!nom) throw new ErreurMetier('Le nom est obligatoire.');
  const exist = b.id ? d.get('bagages', b.id) : undefined;
  d.put('bagages', {
    ...(exist ?? { id: uuid(), voyageId: v.id, createdAt: '', updatedAt: '' }),
    nom,
    type: b.type,
    poidsMaxKg: b.poidsMaxKg,
    poidsHorsSouvenirsKg: b.poidsHorsSouvenirsKg,
  } as Bagage);
}

export function supprimerBagage(d: Draft, id: ID): void {
  for (const s of d.db.souvenirs) if (s.retour.bagageId === id) d.put('souvenirs', { ...s, retour: { ...s.retour, bagageId: undefined } });
  d.del('bagages', id);
}

export function modifierProfil(d: Draft, id: ID, m: Partial<ProfilDouanier>): void {
  d.patch('profils', id, (p) => ({ ...p, ...m, id: p.id, voyageId: p.voyageId }));
}

// ---------------------------------------------------------------- Étapes (F-30)

export function enregistrerEtapes(d: Draft, etapes: Etape[]): void {
  const v = voyage(d);
  const err = verifierEtapes(v, etapes);
  if (err) throw new ErreurMetier(err);
  const tri = [...etapes].sort((a, b) => (a.arrivee < b.arrivee ? -1 : 1));
  const ids = new Set(tri.map((e) => e.id));
  for (const e of d.db.etapes.filter((x) => x.voyageId === v.id && !ids.has(x.id))) supprimerEtape(d, e.id);
  tri.forEach((e, i) => {
    const cur = d.get('etapes', e.id);
    const next = { ...e, voyageId: v.id, ordre: i + 1 };
    if (!cur || JSON.stringify(cur) !== JSON.stringify(next)) d.put('etapes', next);
  });
}

export function supprimerEtape(d: Draft, id: ID): void {
  if (d.db.souvenirs.some((s) => s.achat?.etapeId === id))
    throw new ErreurMetier('Des achats sont rattachés à cette étape : changez-les avant de la supprimer.');
  for (const s of d.db.souvenirs)
    if (s.etapesPrevues.includes(id)) d.put('souvenirs', { ...s, etapesPrevues: s.etapesPrevues.filter((x) => x !== id) });
  for (const l of d.db.lieux) {
    if (!l.etapeIds.includes(id)) continue;
    const etapeIds = l.etapeIds.filter((x) => x !== id);
    if (etapeIds.length) d.put('lieux', { ...l, etapeIds });
    else d.del('lieux', l.id);
  }
  d.del('etapes', id);
}

export function nouvelleExcursion(nom: string, date?: DateStr): Excursion {
  return { id: uuid(), nom, date };
}

export function modifierVoyage(d: Draft, id: ID, m: Partial<Pick<Voyage, 'nom' | 'dateDebut' | 'dateFin' | 'itineraireRetour' | 'detaxeActive'>>): void {
  const v = d.get('voyages', id);
  if (!v) return;
  const next = { ...v, ...m };
  if (!nettoyer(next.nom)) throw new ErreurMetier('Le nom est obligatoire.');
  if (next.dateFin < next.dateDebut) throw new ErreurMetier('La fin doit suivre le début.');
  const err = verifierEtapes(next, d.db.etapes.filter((e) => e.voyageId === id));
  if (err) throw new ErreurMetier(err);
  d.put('voyages', next);
}

// ---------------------------------------------------------------- Paramètres

export function definirIciManuel(d: Draft, choix: { etapeId: ID; excursionId?: ID } | null, jour: DateStr): void {
  d.params((p) => ({ ...p, ici: choix ? { ...choix, date: jour } : undefined }));
}

export function definirTauxManuel(d: Draft, jpyEur: number, jpyChf: number | undefined, jour: DateStr): void {
  if (!(jpyEur > 0)) throw new ErreurMetier('Taux JPY→EUR invalide.');
  d.params((p) => ({ ...p, taux: { ...p.taux, jpyEur, jpyChf: jpyChf && jpyChf > 0 ? jpyChf : p.taux.jpyChf, date: jour, source: 'manuel' } }));
}

// ---------------------------------------------------------------- File IA (RG-18)

export function mettreEnFile(d: Draft, demande: DemandeIA): boolean {
  const v = voyage(d);
  const deja = d.db.jobs.some(
    (j) => (j.statut === 'file' || j.statut === 'en_cours') && JSON.stringify(j.demande) === JSON.stringify(demande),
  );
  if (deja) return false;
  d.put('jobs', { id: uuid(), voyageId: v.id, demande, statut: 'file', tentatives: 0, createdAt: '', updatedAt: '' });
  return true;
}
