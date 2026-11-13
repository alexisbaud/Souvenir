// Modèle de données complet (SPEC §5). Toutes les entités portent id, createdAt, updatedAt.

export type ID = string;
/** Date locale au format AAAA-MM-JJ */
export type DateStr = string;

export interface Base {
  id: ID;
  createdAt: string;
  updatedAt: string;
}

export type Devise = 'JPY' | 'EUR' | 'CHF';

// 5.1
export interface Voyage extends Base {
  nom: string;
  dateDebut: DateStr;
  dateFin: DateStr;
  deviseLocale: Devise;
  deviseReference: Devise;
  actif: boolean;
  destinataires: ID[];
  itineraireRetour?: string;
  detaxeActive: boolean;
}

// 5.2
export interface Excursion {
  id: ID;
  nom: string;
  date?: DateStr;
}

export interface Etape extends Base {
  voyageId: ID;
  ordre: number;
  ville: string;
  region?: string;
  zone?: string;
  /** Nuitées de arrivee incluse à depart exclu */
  arrivee: DateStr;
  depart: DateStr;
  excursions: Excursion[];
  note?: string;
}

// 5.3
export interface Groupe extends Base {
  nom: string;
  ordre: number;
}

// 5.4
export interface Personne extends Base {
  nom: string;
  groupeId?: ID;
  indices?: string;
  systeme?: boolean;
}

export interface Categorie extends Base {
  libelle: string;
  ordre: number;
}

// 5.5
export type AlcoolType = 'vin' | 'biere' | 'autre';

export interface Alcool {
  type: AlcoolType;
  degre: number;
  /** Volume total de la ligne, en litres */
  volumeL?: number;
}

export type RetourFlag = 'viande' | 'lait' | 'vegetal' | 'liquide' | 'tranchant' | 'fragile';

export interface Retour {
  alcool?: Alcool;
  viande?: boolean;
  lait?: boolean;
  vegetal?: boolean;
  liquide?: boolean;
  tranchant?: boolean;
  fragile?: boolean;
  poidsG?: number;
  bagageId?: ID;
  consommeAuJapon?: boolean;
  /** Champs remplis par l'IA et non encore modifiés à la main */
  sourceIA?: string[];
}

export interface Achat {
  date: DateStr;
  etapeId: ID;
  boutique?: string;
  prix: number;
  devise: 'JPY' | 'EUR';
  /** EUR pour 1 JPY, figé à l'enregistrement */
  tauxEUR: number;
  prixEUR: number;
  lieuId?: ID;
  ticketDetaxeId?: ID;
  enregistreLe?: string;
}

/** Résultat de la dernière recherche IA de lieux, affiché sur la fiche */
export interface InfoIA {
  interpretation?: string;
  alertes: string[];
  alternatives?: string[];
  derniereChance?: string;
  nomRecherche: string;
  date: string;
}

export type StatutSouvenir = 'idee' | 'achete';

export interface Souvenir extends Base {
  voyageId: ID;
  nom: string;
  statut: StatutSouvenir;
  categorieId?: ID;
  note?: string;
  quantite: number;
  etapesPrevues: ID[];
  partout?: boolean;
  achat?: Achat;
  photoId?: ID;
  retour: Retour;
  origine: 'manuel' | 'ia';
  ia?: InfoIA;
}

// 5.6
export type Cible = { type: 'personnes'; ids: ID[] } | { type: 'groupe'; groupeId: ID };

export interface Attribution extends Base {
  voyageId: ID;
  souvenirId: ID;
  cible: Cible;
  quantite: number;
  /** Sans objet pour « Moi » */
  remise?: 'a_donner' | 'donne';
  dateRemise?: DateStr;
}

// 5.7
export type TypeLieu =
  | 'boutique'
  | 'grand_magasin'
  | 'marche'
  | 'rue_commercante'
  | 'temple_sanctuaire'
  | 'chaine'
  | 'konbini'
  | 'aeroport'
  | 'autre';

export type Confiance = 'haute' | 'moyenne' | 'basse';

/** Données d'un lieu, sans rattachement (aussi utilisé dans les suggestions) */
export interface LieuData {
  nom: string;
  type: TypeLieu;
  etapeIds: ID[];
  zone?: string;
  prixMinYen?: number;
  prixMaxYen?: number;
  horaires?: string;
  conseil?: string;
  sources?: string[];
  confiance?: Confiance;
  origine: 'manuel' | 'ia';
  dateRecherche?: string;
}

export interface Lieu extends Base, LieuData {
  voyageId: ID;
  souvenirId?: ID;
  suggestionId?: ID;
  ecarte?: boolean;
  obsolete?: boolean;
}

// 5.8
export type CibleSuggestion = { type: 'personne'; id: ID } | { type: 'groupe'; id: ID } | { type: 'moi' };

export interface Suggestion extends Base {
  voyageId: ID;
  cible: CibleSuggestion;
  nom: string;
  description?: string;
  pourquoi?: string;
  categorieId?: ID;
  prixMinYen?: number;
  prixMaxYen?: number;
  quantiteConseillee?: number;
  lieux: LieuData[];
  retour: Retour;
  alertes: string[];
  statut: 'nouvelle' | 'acceptee' | 'ecartee';
  genereeLe: string;
  souvenirId?: ID;
}

// 5.9
export interface TicketDetaxe extends Base {
  voyageId: ID;
  boutique: string;
  etapeId: ID;
  date: DateStr;
  /** Taxe saisie depuis le ticket ; absente = estimée */
  taxeYen?: number;
  statut: 'a_valider' | 'valide' | 'rembourse';
  note?: string;
}

// 5.10
export interface Bagage extends Base {
  voyageId: ID;
  nom: string;
  type: 'soute' | 'cabine';
  poidsMaxKg?: number;
  poidsHorsSouvenirsKg?: number;
}

// 5.11
export interface RegleAlcool {
  libelle: string;
  types?: AlcoolType[];
  /** Borne basse exclue (« plus de ») */
  degreMin?: number;
  /** Borne haute incluse (« jusqu'à ») */
  degreMax?: number;
  limiteL: number;
  groupeProrata?: string;
}

export interface ProfilDouanier extends Base {
  voyageId: ID;
  nom: string;
  ordre: number;
  devise: Devise;
  franchiseValeur: number;
  regleValeur: string;
  reglesAlcool: RegleAlcool[];
  interdits: { viande: boolean; lait: boolean; vegetal: boolean; texte: string };
  sources: string[];
  verifieLe: DateStr;
}

// File d'attente IA (RG-18)
export type DemandeIA =
  | { type: 'lieux'; souvenirId: ID }
  | { type: 'suggestions'; cible: CibleSuggestion };

export interface JobIA extends Base {
  voyageId: ID;
  demande: DemandeIA;
  statut: 'file' | 'en_cours' | 'terminee' | 'echec';
  erreur?: string;
  tentatives: number;
  journal?: string[];
}

export interface Photo {
  id: ID;
  blob: Blob;
  thumb: Blob;
  createdAt: string;
}

// 5.12
export interface Parametres {
  id: 'parametres';
  createdAt: string;
  updatedAt: string;
  taux: {
    jpyEur?: number;
    jpyChf?: number;
    date?: DateStr;
    source?: 'auto' | 'manuel';
    /** Dernière tentative de mise à jour automatique (date) */
    derniereTentative?: DateStr;
  };
  detaxe: { tauxNormal: number; tauxReduit: number };
  ia: {
    modele: string;
    auto: boolean;
    maxRecherchesLieux: number;
    maxRecherchesSuggestions: number;
    maxDemandesMois: number;
    envoyerPrenoms: boolean;
    usage: Record<string, { demandes: number; recherches: number; jetonsEntree: number; jetonsSortie: number }>;
  };
  sauvegarde: { derniere?: string; modifieDepuis?: boolean };
  ici?: { etapeId: ID; excursionId?: ID; date: DateStr };
  bandeauInstallationMasque?: boolean;
  derniereBoutique?: Record<ID, string>;
}

export interface DB {
  voyages: Voyage[];
  etapes: Etape[];
  groupes: Groupe[];
  personnes: Personne[];
  categories: Categorie[];
  souvenirs: Souvenir[];
  attributions: Attribution[];
  lieux: Lieu[];
  suggestions: Suggestion[];
  tickets: TicketDetaxe[];
  bagages: Bagage[];
  profils: ProfilDouanier[];
  jobs: JobIA[];
  parametres: Parametres;
}

export type CollectionName = Exclude<keyof DB, 'parametres'>;

export const COLLECTIONS: CollectionName[] = [
  'voyages',
  'etapes',
  'groupes',
  'personnes',
  'categories',
  'souvenirs',
  'attributions',
  'lieux',
  'suggestions',
  'tickets',
  'bagages',
  'profils',
  'jobs',
];

export const SCHEMA_VERSION = 1;
export const MOI_ID = 'moi';
