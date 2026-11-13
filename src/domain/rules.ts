// Règles de gestion (SPEC §6). Fonctions pures : (données, date du jour) → résultat.
import type {
  Attribution,
  Bagage,
  DateStr,
  DB,
  Etape,
  Excursion,
  ID,
  Lieu,
  Personne,
  ProfilDouanier,
  Souvenir,
  TicketDetaxe,
  Voyage,
} from '../db/types';
import { MOI_ID } from '../db/types';
import { addDays, diffDays } from './dates';

// ---------------------------------------------------------------- Voyage actif

export function voyageActif(db: DB): Voyage | undefined {
  return db.voyages.find((v) => v.actif) ?? db.voyages[0];
}

export function etapesDuVoyage(db: DB, voyageId: ID): Etape[] {
  return db.etapes.filter((e) => e.voyageId === voyageId).sort((a, b) => a.ordre - b.ordre);
}

export function souvenirsDuVoyage(db: DB, voyageId: ID): Souvenir[] {
  return db.souvenirs.filter((s) => s.voyageId === voyageId);
}

export function attributionsDe(db: DB, souvenirId: ID): Attribution[] {
  return db.attributions.filter((a) => a.souvenirId === souvenirId);
}

/** Index souvenirId → attributions, pour les calculs sur listes */
export function indexAttributions(db: DB): Map<ID, Attribution[]> {
  const m = new Map<ID, Attribution[]>();
  for (const a of db.attributions) {
    const l = m.get(a.souvenirId);
    if (l) l.push(a);
    else m.set(a.souvenirId, [a]);
  }
  return m;
}

export function lieuxDe(db: DB, souvenirId: ID, avecEcartes = false): Lieu[] {
  return db.lieux.filter((l) => l.souvenirId === souvenirId && (avecEcartes || !l.ecarte));
}

// ---------------------------------------------------------------- Attributions

export function estPourMoi(a: Attribution): boolean {
  return a.cible.type === 'personnes' && a.cible.ids.length === 1 && a.cible.ids[0] === MOI_ID;
}

/** RG-03 : collective si plusieurs personnes ou un groupe entier */
export function estCollective(a: Attribution): boolean {
  return a.cible.type === 'groupe' || a.cible.ids.length > 1;
}

/** Personnes couvertes par une attribution au moment du calcul (RG-03) */
export function personnesDeCible(db: DB, a: Attribution): ID[] {
  if (a.cible.type === 'personnes') return a.cible.ids;
  const gid = a.cible.groupeId;
  return db.personnes.filter((p) => p.groupeId === gid && !p.systeme).map((p) => p.id);
}

export function unitesAttribuees(attrs: Attribution[]): number {
  return attrs.reduce((n, a) => n + a.quantite, 0);
}

/** RG-02 */
export function unitesNonAttribuees(s: Souvenir, attrs: Attribution[]): number {
  return Math.max(0, s.quantite - unitesAttribuees(attrs));
}

/** RG-02 / RG-04 : vérifie qu'un ensemble d'attributions tient dans la quantité */
export function verifierUnites(quantite: number, attrs: Pick<Attribution, 'quantite'>[]): string | null {
  if (!Number.isInteger(quantite) || quantite < 1) return 'La quantité doit être un entier ≥ 1.';
  if (attrs.some((a) => !Number.isInteger(a.quantite) || a.quantite < 1))
    return 'Chaque attribution compte au moins 1 unité.';
  const somme = attrs.reduce((n, a) => n + a.quantite, 0);
  if (somme > quantite)
    return `${somme} unités sont attribuées : la quantité ne peut pas être inférieure à ${somme}.`;
  return null;
}

// ---------------------------------------------------------------- RG-01 État affiché

export type EtatSouvenir = 'idee' | 'achete' | 'partiel' | 'donne';

export const LIBELLE_ETAT: Record<EtatSouvenir, string> = {
  idee: 'Idée',
  achete: 'Acheté',
  partiel: 'Partiellement donné',
  donne: 'Donné',
};

export function etatSouvenir(s: Souvenir, attrs: Attribution[]): EtatSouvenir {
  if (s.statut === 'idee') return 'idee';
  const autres = attrs.filter((a) => !estPourMoi(a));
  const donnees = autres.filter((a) => a.remise === 'donne').length;
  if (autres.length > 0 && donnees === autres.length && unitesNonAttribuees(s, attrs) === 0) return 'donne';
  if (donnees > 0) return 'partiel';
  return 'achete';
}

// ---------------------------------------------------------------- RG-06 Couverture

export type Couverture = 'rien' | 'idee' | 'achete' | 'donne';

export interface CouverturePersonne {
  etat: Couverture;
  collectif: boolean;
  /** Attributions (directes ou via groupe) concernant la personne */
  attributions: Attribution[];
  nbSouvenirs: number;
  aDonner: number;
}

export const LIBELLE_COUVERTURE: Record<Couverture, string> = {
  rien: 'Rien',
  idee: 'Idée',
  achete: 'Acheté',
  donne: 'Donné',
};

export function attributionsDePersonne(db: DB, personne: Personne, voyageId: ID): Attribution[] {
  const souvenirs = new Set(souvenirsDuVoyage(db, voyageId).map((s) => s.id));
  return db.attributions.filter((a) => {
    if (!souvenirs.has(a.souvenirId)) return false;
    if (a.cible.type === 'personnes') return a.cible.ids.includes(personne.id);
    return !!personne.groupeId && a.cible.groupeId === personne.groupeId && !personne.systeme;
  });
}

export function couverture(db: DB, personne: Personne, voyageId: ID): CouverturePersonne {
  const attrs = attributionsDePersonne(db, personne, voyageId);
  const byId = new Map(db.souvenirs.map((s) => [s.id, s]));
  const surAchats = attrs.filter((a) => byId.get(a.souvenirId)?.statut === 'achete');
  const aDonner = surAchats.filter((a) => a.remise !== 'donne' && !estPourMoi(a)).length;
  let etat: Couverture;
  if (attrs.length === 0) etat = 'rien';
  else if (surAchats.length === 0) etat = 'idee';
  else if (aDonner > 0) etat = 'achete';
  else etat = 'donne';
  const collectif = (etat === 'achete' || etat === 'donne') && surAchats.every(estCollective);
  return {
    etat,
    collectif,
    attributions: attrs,
    nbSouvenirs: new Set(attrs.map((a) => a.souvenirId)).size,
    aDonner,
  };
}

/** RG-17 : destinataires du voyage actif, hors « Moi » */
export function destinatairesDuVoyage(db: DB, voyage: Voyage): Personne[] {
  const ids = new Set(voyage.destinataires);
  return db.personnes.filter((p) => !p.systeme && ids.has(p.id));
}

export function membresDuGroupe(db: DB, voyage: Voyage, groupeId: ID): Personne[] {
  return destinatairesDuVoyage(db, voyage).filter((p) => p.groupeId === groupeId);
}

// ---------------------------------------------------------------- RG-07 Ici

export interface Ici {
  mode: 'avant' | 'pendant' | 'dernier_jour' | 'apres';
  /** Étapes du lieu Ici (deux un jour de transition) */
  etapes: Etape[];
  libelle: string;
  /** Excursion choisie à la main */
  excursion?: Excursion;
  manuel: boolean;
}

/** Étapes du jour d'après le calendrier seul */
export function icCalendrier(etapes: Etape[], voyage: Voyage, jour: DateStr): Ici {
  const triees = [...etapes].sort((a, b) => a.ordre - b.ordre);
  if (triees.length === 0) return { mode: 'pendant', etapes: [], libelle: voyage.nom, manuel: false };
  if (jour < voyage.dateDebut || jour < triees[0].arrivee) {
    return { mode: 'avant', etapes: [triees[0]], libelle: `${triees[0].ville} · À venir`, manuel: false };
  }
  if (jour > voyage.dateFin) return { mode: 'apres', etapes: [], libelle: 'Retour', manuel: false };
  const courante = triees.find((e) => e.arrivee <= jour && jour < e.depart);
  const partante = triees.find((e) => e.depart === jour);
  if (courante && partante && partante.id !== courante.id) {
    return {
      mode: 'pendant',
      etapes: [partante, courante],
      libelle: `${partante.ville} → ${courante.ville}`,
      manuel: false,
    };
  }
  if (courante) {
    const total = diffDays(courante.arrivee, courante.depart);
    const k = diffDays(courante.arrivee, jour) + 1;
    return { mode: 'pendant', etapes: [courante], libelle: `${courante.ville} · nuit ${k}/${total}`, manuel: false };
  }
  if (partante) {
    // Jour du départ final (ou trou dans le parcours)
    const derniere = triees[triees.length - 1];
    const mode = partante.id === derniere.id ? 'dernier_jour' : 'pendant';
    return { mode, etapes: [partante], libelle: `${partante.ville} · jour du départ`, manuel: false };
  }
  // Trou entre deux étapes : prochaine étape
  const prochaine = triees.find((e) => e.arrivee > jour) ?? triees[triees.length - 1];
  return { mode: 'pendant', etapes: [prochaine], libelle: `En route vers ${prochaine.ville}`, manuel: false };
}

/** RG-07 avec le choix manuel « Je suis ailleurs », valable jusqu'à minuit */
export function ici(db: DB, voyage: Voyage, jour: DateStr): Ici {
  const etapes = etapesDuVoyage(db, voyage.id);
  const cal = icCalendrier(etapes, voyage, jour);
  const m = db.parametres.ici;
  if (m && m.date === jour) {
    const e = etapes.find((x) => x.id === m.etapeId);
    if (e) {
      const exc = m.excursionId ? e.excursions.find((x) => x.id === m.excursionId) : undefined;
      return {
        mode: cal.mode === 'apres' ? 'apres' : 'pendant',
        etapes: [e],
        excursion: exc,
        libelle: exc ? `${exc.nom} (depuis ${e.ville})` : e.ville,
        manuel: true,
      };
    }
  }
  return cal;
}

// ---------------------------------------------------------------- RG-08 / RG-09 / RG-10

/** Une étape est restante si sa date de départ est postérieure ou égale à aujourd'hui */
export function etapesRestantes(etapes: Etape[], jour: DateStr): Etape[] {
  return etapes.filter((e) => e.depart >= jour).sort((a, b) => a.ordre - b.ordre);
}

/** RG-08 : étapes prévues + étapes des lieux non écartés (ids, sans doublon) */
export function etapesPossibles(s: Souvenir, lieux: Lieu[]): ID[] {
  const ids = new Set(s.etapesPrevues);
  for (const l of lieux) if (!l.ecarte && l.souvenirId === s.id) for (const e of l.etapeIds) ids.add(e);
  return [...ids];
}

export function etapesPossiblesRestantes(s: Souvenir, lieux: Lieu[], etapes: Etape[], jour: DateStr): Etape[] {
  const restantes = etapesRestantes(etapes, jour);
  if (s.partout) return restantes;
  const ids = new Set(etapesPossibles(s, lieux));
  return restantes.filter((e) => ids.has(e.id));
}

/** RG-09 */
export function achetableIci(s: Souvenir, lieux: Lieu[], icEtapes: Etape[]): boolean {
  if (s.statut !== 'idee') return false;
  if (s.partout) return true;
  const ids = new Set(etapesPossibles(s, lieux));
  return icEtapes.some((e) => ids.has(e.id));
}

/** Lieux d'une idée pour les étapes Ici ; pour une excursion, ceux dont la zone la mentionne d'abord */
export function lieuxIci(lieux: Lieu[], icEtapes: Etape[], excursion?: Excursion): Lieu[] {
  const ids = new Set(icEtapes.map((e) => e.id));
  const l = lieux.filter((x) => !x.ecarte && x.etapeIds.some((e) => ids.has(e)));
  if (!excursion) return l;
  const cle = excursion.nom.toLowerCase().split(/[ ,(]/)[0];
  const mentionne = (x: Lieu) => `${x.zone ?? ''} ${x.nom}`.toLowerCase().includes(cle);
  return [...l.filter(mentionne), ...l.filter((x) => !mentionne(x))];
}

export interface DerniereChance {
  ici: { souvenir: Souvenir; derniere: Etape }[];
  plusPrevue: Souvenir[];
  derniersJours: { souvenir: Souvenir; derniere?: Etape }[];
  /** Vrai à partir de deux jours avant la fin */
  modeDerniersJours: boolean;
}

/** RG-10 : suit le calendrier et ignore le choix manuel */
export function derniereChance(db: DB, voyage: Voyage, jour: DateStr): DerniereChance {
  const etapes = etapesDuVoyage(db, voyage.id);
  const cal = icCalendrier(etapes, voyage, jour);
  const duJour = new Set(cal.etapes.map((e) => e.id));
  const idees = souvenirsDuVoyage(db, voyage.id).filter((s) => s.statut === 'idee');
  const res: DerniereChance = { ici: [], plusPrevue: [], derniersJours: [], modeDerniersJours: false };
  res.modeDerniersJours = jour >= addDays(voyage.dateFin, -2) && jour <= voyage.dateFin;
  for (const s of idees) {
    const lieux = lieuxDe(db, s.id);
    const restantes = etapesPossiblesRestantes(s, lieux, etapes, jour);
    const derniere = restantes[restantes.length - 1];
    if (res.modeDerniersJours) res.derniersJours.push({ souvenir: s, derniere });
    if (s.partout) continue;
    if (derniere) {
      if (duJour.has(derniere.id) && cal.mode !== 'apres') res.ici.push({ souvenir: s, derniere });
    } else if (etapesPossibles(s, lieux).length > 0) {
      res.plusPrevue.push(s);
    }
  }
  return res;
}

// ---------------------------------------------------------------- RG-11 / RG-12 Prix

export function arrondiYen(n: number): number {
  return Math.round(n);
}

export function arrondiCentimes(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Prix en euros d'un prix saisi, avec le taux EUR pour 1 JPY */
export function convertirEUR(prix: number, devise: 'JPY' | 'EUR', tauxEUR: number): number {
  return devise === 'EUR' ? arrondiCentimes(prix) : arrondiCentimes(prix * tauxEUR);
}

export function prixYen(s: Souvenir): number {
  if (!s.achat) return 0;
  if (s.achat.devise === 'JPY') return arrondiYen(s.achat.prix);
  return s.achat.tauxEUR > 0 ? arrondiYen(s.achat.prix / s.achat.tauxEUR) : 0;
}

export function prixEUR(s: Souvenir): number {
  return s.achat ? s.achat.prixEUR : 0;
}

export interface Totaux {
  yen: number;
  eur: number;
  moiYen: number;
  moiEur: number;
}

/** RG-12 */
export function totaux(db: DB, voyageId: ID): Totaux {
  const t: Totaux = { yen: 0, eur: 0, moiYen: 0, moiEur: 0 };
  const idx = indexAttributions(db);
  for (const s of souvenirsDuVoyage(db, voyageId)) {
    if (s.statut !== 'achete' || !s.achat) continue;
    const y = prixYen(s);
    const e = prixEUR(s);
    t.yen += y;
    t.eur += e;
    const moi = (idx.get(s.id) ?? []).filter(estPourMoi).reduce((n, a) => n + a.quantite, 0);
    if (moi > 0) {
      t.moiYen += (y * moi) / s.quantite;
      t.moiEur += (e * moi) / s.quantite;
    }
  }
  t.eur = arrondiCentimes(t.eur);
  t.moiYen = arrondiYen(t.moiYen);
  t.moiEur = arrondiCentimes(t.moiEur);
  return t;
}

// ---------------------------------------------------------------- RG-13 Détaxe

export const SEUIL_DETAXE_HT = 5000;

/** Taux de taxe applicable à un achat (8 % pour l'alimentaire hors alcool, sinon 10 %) */
export function tauxTaxe(s: Souvenir, p: DB['parametres']): number {
  const alimentaire = s.categorieId === 'nourriture' || (s.categorieId === 'boisson' && !s.retour.alcool);
  return alimentaire ? p.detaxe.tauxReduit : p.detaxe.tauxNormal;
}

export function cleTicket(boutique: string, date: DateStr): string {
  return `${boutique.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()}|${date}`;
}

export interface EtatTicket {
  ticket: TicketDetaxe;
  souvenirs: Souvenir[];
  totalTTC: number;
  totalHT: number;
  taxe: number;
  taxeEstimee: boolean;
  eligible: boolean;
  compromis: string[];
  dateLimite: DateStr;
}

export function etatTicket(db: DB, ticket: TicketDetaxe, voyage: Voyage): EtatTicket {
  const souvenirs = db.souvenirs.filter((s) => s.achat?.ticketDetaxeId === ticket.id && s.statut === 'achete');
  let ttc = 0;
  let ht = 0;
  for (const s of souvenirs) {
    const y = prixYen(s);
    const t = tauxTaxe(s, db.parametres);
    ttc += y;
    ht += Math.round((y * 100) / (100 + t));
  }
  const taxeEstimee = ticket.taxeYen === undefined;
  const taxe = taxeEstimee ? ttc - ht : (ticket.taxeYen as number);
  const htEffectif = taxeEstimee ? ht : ttc - taxe;
  const compromis: string[] = [];
  const idx = indexAttributions(db);
  for (const s of souvenirs) {
    if (s.retour.consommeAuJapon) compromis.push(`« ${s.nom} » est marqué consommé au Japon`);
    const donneAvant = (idx.get(s.id) ?? []).some(
      (a) => a.remise === 'donne' && !!a.dateRemise && a.dateRemise < voyage.dateFin,
    );
    if (donneAvant) compromis.push(`« ${s.nom} » a été donné avant le départ du Japon`);
  }
  return {
    ticket,
    souvenirs,
    totalTTC: ttc,
    totalHT: htEffectif,
    taxe,
    taxeEstimee,
    eligible: htEffectif >= SEUIL_DETAXE_HT,
    compromis,
    dateLimite: addDays(ticket.date, 90),
  };
}

export function ticketsDuVoyage(db: DB, voyage: Voyage): EtatTicket[] {
  return db.tickets
    .filter((t) => t.voyageId === voyage.id)
    .map((t) => etatTicket(db, t, voyage))
    .filter((t) => t.souvenirs.length > 0)
    .sort((a, b) => (a.ticket.date < b.ticket.date ? -1 : 1));
}

/** Montant total à récupérer : taxes des tickets éligibles, non compromis, non remboursés */
export function detaxeARecuperer(tickets: EtatTicket[]): number {
  return tickets
    .filter((t) => t.eligible && t.compromis.length === 0 && t.ticket.statut !== 'rembourse')
    .reduce((n, t) => n + t.taxe, 0);
}

/** Taxe japonaise d'un achat détaxé (part du ticket, ou estimation) */
export function taxeDeSouvenir(db: DB, s: Souvenir, voyage: Voyage): number {
  const tid = s.achat?.ticketDetaxeId;
  if (!tid) return 0;
  const t = db.tickets.find((x) => x.id === tid);
  if (!t) return 0;
  const et = etatTicket(db, t, voyage);
  if (!et.eligible || et.totalTTC === 0) return 0;
  return (et.taxe * prixYen(s)) / et.totalTTC;
}

// ---------------------------------------------------------------- RG-14 Douane

export type StatutLigne = 'ok' | 'attention' | 'depasse';

export function statutRatio(r: number): StatutLigne {
  if (r > 1 + 1e-9) return 'depasse';
  if (r >= 0.8 - 1e-9) return 'attention';
  return 'ok';
}

export interface LigneDouane {
  libelle: string;
  valeur: number;
  limite: number;
  ratio: number;
  statut: StatutLigne;
  unite: string;
  detail?: string;
  souvenirs: Souvenir[];
}

export interface BilanDouane {
  profil: ProfilDouanier;
  valeur: LigneDouane;
  alcool: LigneDouane[];
  interdits: { libelle: string; souvenirs: Souvenir[] }[];
  sansCategorie: Souvenir[];
  statut: StatutLigne;
}

/** Souvenirs qui passent la frontière : achats non consommés au Japon */
export function achatsRapportes(db: DB, voyageId: ID): Souvenir[] {
  return souvenirsDuVoyage(db, voyageId).filter((s) => s.statut === 'achete' && !s.retour.consommeAuJapon);
}

export function regleAlcoolPour(profil: ProfilDouanier, type: string, degre: number) {
  return profil.reglesAlcool.find(
    (r) =>
      (!r.types || r.types.length === 0 || r.types.includes(type as never)) &&
      (r.degreMin === undefined || degre > r.degreMin) &&
      (r.degreMax === undefined || degre <= r.degreMax),
  );
}

export function bilanDouane(db: DB, voyage: Voyage, profil: ProfilDouanier): BilanDouane {
  const achats = achatsRapportes(db, voyage.id);
  // Valeur : prix − taxe japonaise des achats détaxés, convertie dans la devise du profil
  let yenNet = 0;
  for (const s of achats) yenNet += prixYen(s) - taxeDeSouvenir(db, s, voyage);
  const taux =
    profil.devise === 'JPY'
      ? 1
      : profil.devise === 'CHF'
        ? (db.parametres.taux.jpyChf ?? 0)
        : (db.parametres.taux.jpyEur ?? 0);
  const valeurDevise = arrondiCentimes(yenNet * taux);
  const rv = profil.franchiseValeur > 0 ? valeurDevise / profil.franchiseValeur : 0;
  const valeur: LigneDouane = {
    libelle: 'Valeur des achats',
    valeur: valeurDevise,
    limite: profil.franchiseValeur,
    ratio: rv,
    statut: statutRatio(rv),
    unite: profil.devise,
    detail: taux ? undefined : 'Taux de change manquant',
    souvenirs: achats,
  };

  // Alcool : volume par règle ; les règles d'un même groupe se combinent au prorata
  const parRegle = new Map<number, { vol: number; souvenirs: Souvenir[] }>();
  const sansCategorie: Souvenir[] = [];
  for (const s of achats) {
    const al = s.retour.alcool;
    if (!al) continue;
    const i = profil.reglesAlcool.findIndex((r) => r === regleAlcoolPour(profil, al.type, al.degre));
    if (i < 0) {
      sansCategorie.push(s);
      continue;
    }
    const e = parRegle.get(i) ?? { vol: 0, souvenirs: [] };
    e.vol += al.volumeL ?? 0;
    e.souvenirs.push(s);
    parRegle.set(i, e);
  }
  const alcool: LigneDouane[] = [];
  const groupesVus = new Set<string>();
  profil.reglesAlcool.forEach((r, i) => {
    if (r.groupeProrata) {
      if (groupesVus.has(r.groupeProrata)) return;
      groupesVus.add(r.groupeProrata);
      const membres = profil.reglesAlcool
        .map((x, j) => ({ x, j }))
        .filter(({ x }) => x.groupeProrata === r.groupeProrata);
      let ratio = 0;
      const souvenirs: Souvenir[] = [];
      const parts: string[] = [];
      for (const { x, j } of membres) {
        const e = parRegle.get(j);
        const vol = e?.vol ?? 0;
        ratio += x.limiteL > 0 ? vol / x.limiteL : 0;
        if (e) souvenirs.push(...e.souvenirs);
        parts.push(`${fmtL(vol)} L / ${fmtL(x.limiteL)} (${x.libelle})`);
      }
      alcool.push({
        libelle: membres.map(({ x }) => x.libelle).join(' + '),
        valeur: ratio,
        limite: 1,
        ratio,
        statut: statutRatio(ratio),
        unite: 'prorata',
        detail: parts.join(' + ') + ` = ${fmtL(ratio)}`,
        souvenirs,
      });
    } else {
      const e = parRegle.get(i);
      const vol = e?.vol ?? 0;
      const ratio = r.limiteL > 0 ? vol / r.limiteL : 0;
      alcool.push({
        libelle: r.libelle,
        valeur: vol,
        limite: r.limiteL,
        ratio,
        statut: statutRatio(ratio),
        unite: 'L',
        souvenirs: e?.souvenirs ?? [],
      });
    }
  });

  const interdits: BilanDouane['interdits'] = [];
  const libelles = { viande: 'Viande', lait: 'Produits laitiers', vegetal: 'Végétaux' } as const;
  for (const k of ['viande', 'lait', 'vegetal'] as const) {
    if (!profil.interdits[k]) continue;
    const l = achats.filter((s) => s.retour[k]);
    if (l.length) interdits.push({ libelle: libelles[k], souvenirs: l });
  }

  const statuts = [valeur.statut, ...alcool.map((a) => a.statut)];
  if (interdits.length) statuts.push('depasse');
  const statut: StatutLigne = statuts.includes('depasse')
    ? 'depasse'
    : statuts.includes('attention')
      ? 'attention'
      : 'ok';
  return { profil, valeur, alcool, interdits, sansCategorie, statut };
}

function fmtL(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}

// ---------------------------------------------------------------- RG-15 Bagages

export interface AlerteBagage {
  souvenir?: Souvenir;
  texte: string;
  grave: boolean;
}

export interface BilanBagage {
  bagage: Bagage;
  souvenirs: Souvenir[];
  poidsSouvenirsKg: number;
  poidsTotalKg: number;
  depasse: boolean;
  alertes: AlerteBagage[];
}

export interface BilanBagages {
  bagages: BilanBagage[];
  nonRanges: Souvenir[];
  alertesGenerales: AlerteBagage[];
}

export function bilanBagages(db: DB, voyage: Voyage): BilanBagages {
  const achats = achatsRapportes(db, voyage.id);
  const bagages = db.bagages.filter((b) => b.voyageId === voyage.id);
  const ids = new Set(bagages.map((b) => b.id));
  const res: BilanBagages = { bagages: [], nonRanges: [], alertesGenerales: [] };
  for (const b of bagages) {
    const souvenirs = achats.filter((s) => s.retour.bagageId === b.id);
    const g = souvenirs.reduce((n, s) => n + (s.retour.poidsG ?? 0), 0);
    const poidsSouvenirsKg = g / 1000;
    const poidsTotalKg = poidsSouvenirsKg + (b.poidsHorsSouvenirsKg ?? 0);
    const alertes: AlerteBagage[] = [];
    for (const s of souvenirs) {
      if (b.type === 'cabine' && (s.retour.liquide || s.retour.tranchant)) {
        const quoi = s.retour.tranchant ? 'Objet tranchant' : 'Liquide';
        alertes.push({ souvenir: s, texte: `${quoi} en cabine : à mettre en soute`, grave: true });
      }
      if (b.type === 'soute' && s.retour.fragile)
        alertes.push({ souvenir: s, texte: 'Fragile en soute : vérifier la protection', grave: false });
    }
    res.bagages.push({
      bagage: b,
      souvenirs,
      poidsSouvenirsKg,
      poidsTotalKg,
      depasse: !!b.poidsMaxKg && poidsTotalKg > b.poidsMaxKg,
      alertes,
    });
  }
  res.nonRanges = achats.filter((s) => !s.retour.bagageId || !ids.has(s.retour.bagageId));
  let fort = 0;
  for (const s of achats) {
    const al = s.retour.alcool;
    if (!al) continue;
    if (al.degre > 70)
      res.alertesGenerales.push({ souvenir: s, texte: 'Alcool à plus de 70 % : interdit en avion', grave: true });
    else if (al.degre >= 24) fort += al.volumeL ?? 0;
  }
  if (fort > 5)
    res.alertesGenerales.push({
      texte: `Alcool entre 24 et 70 % : ${fmtL(fort)} L, au-delà de 5 L par passager`,
      grave: true,
    });
  else if (fort > 0)
    res.alertesGenerales.push({
      texte: `Alcool entre 24 et 70 % : ${fmtL(fort)} L sur 5 L, en emballage d'origine fermé`,
      grave: false,
    });
  return res;
}

// ---------------------------------------------------------------- Compteurs de l'écran Ici

export interface Compteurs {
  sansRien: number;
  ideesAAcheter: number;
  aAttribuer: number;
  aDonner: number;
}

export function aAttribuer(db: DB, voyageId: ID): Souvenir[] {
  const idx = indexAttributions(db);
  return souvenirsDuVoyage(db, voyageId).filter(
    (s) => s.statut === 'achete' && unitesNonAttribuees(s, idx.get(s.id) ?? []) > 0,
  );
}

/** Attributions à remettre : achats, hors « Moi », non données */
export function attributionsADonner(db: DB, voyageId: ID): Attribution[] {
  const achetes = new Set(
    souvenirsDuVoyage(db, voyageId)
      .filter((s) => s.statut === 'achete')
      .map((s) => s.id),
  );
  return db.attributions.filter((a) => achetes.has(a.souvenirId) && !estPourMoi(a) && a.remise !== 'donne');
}

export function compteurs(db: DB, voyage: Voyage): Compteurs {
  const dest = destinatairesDuVoyage(db, voyage);
  return {
    sansRien: dest.filter((p) => couverture(db, p, voyage.id).etat === 'rien').length,
    ideesAAcheter: souvenirsDuVoyage(db, voyage.id).filter((s) => s.statut === 'idee').length,
    aAttribuer: aAttribuer(db, voyage.id).length,
    aDonner: attributionsADonner(db, voyage.id).length,
  };
}

// ---------------------------------------------------------------- Divers

/** Doublon probable (F-24 / F-21 CA4) : idée dont le nom ressemble au nom saisi */
export function ideesSimilaires(db: DB, voyageId: ID, nom: string): Souvenir[] {
  const n = norm(nom);
  if (n.length < 3) return [];
  return souvenirsDuVoyage(db, voyageId).filter((s) => {
    if (s.statut !== 'idee') return false;
    const m = norm(s.nom);
    return m === n || m.includes(n) || n.includes(m) || distance(m, n) <= Math.max(1, Math.floor(n.length / 5));
  });
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/** F-30 CA2 : étapes sans chevauchement, dans les dates du voyage */
export function verifierEtapes(voyage: Voyage, etapes: Pick<Etape, 'id' | 'ville' | 'arrivee' | 'depart'>[]): string | null {
  for (const e of etapes) {
    if (!e.ville.trim()) return 'Chaque étape doit avoir une ville.';
    if (e.depart <= e.arrivee) return `${e.ville} : le départ doit suivre l'arrivée.`;
    if (e.arrivee < voyage.dateDebut || e.depart > voyage.dateFin)
      return `${e.ville} : l'étape doit rester dans les dates du voyage.`;
  }
  const t = [...etapes].sort((a, b) => (a.arrivee < b.arrivee ? -1 : 1));
  for (let i = 1; i < t.length; i++) {
    if (t[i].arrivee < t[i - 1].depart) return `${t[i - 1].ville} et ${t[i].ville} se chevauchent.`;
  }
  return null;
}

/** Date par défaut d'un achat saisi pour une étape passée (F-21 CA3) */
export function dateParDefautPourEtape(e: Etape, jour: DateStr): DateStr {
  if (jour >= e.arrivee && jour <= e.depart) return jour;
  return e.arrivee;
}

export function nomCible(db: DB, a: Attribution): string {
  if (a.cible.type === 'groupe') {
    const gid = a.cible.groupeId;
    return db.groupes.find((g) => g.id === gid)?.nom ?? 'Groupe supprimé';
  }
  return a.cible.ids.map((id) => db.personnes.find((p) => p.id === id)?.nom ?? '?').join(', ');
}
