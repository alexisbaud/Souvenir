// Données initiales (SPEC annexes A et B, F-03).
import type { DB, Etape, Parametres, ProfilDouanier } from './types';
import { MOI_ID } from './types';

export const VOYAGE_ID = 'japon2026';

const ETAPES: [string, string, string, string, string, string, [string, string?][]][] = [
  ['tokyo1', 'Tokyo', 'Kantō', 'Komagome', '2026-10-15', '2026-10-22', [['Nikkō'], ['Kamakura'], ['Yokohama']]],
  ['fujiyoshida', 'Fujiyoshida', 'Fuji', '', '2026-10-22', '2026-10-24', [['Mitsutōge', '2026-10-23']]],
  ['matsumoto', 'Matsumoto', 'Alpes japonaises', '', '2026-10-24', '2026-10-26', []],
  ['hirayu', 'Hirayu Onsen', 'Alpes japonaises', '', '2026-10-26', '2026-10-27', [['Kamikōchi']]],
  ['takayama', 'Takayama', 'Alpes japonaises', '', '2026-10-27', '2026-10-29', [['Shirakawa-gō ou Ainokura']]],
  ['kanazawa', 'Kanazawa', 'Hokuriku', '', '2026-10-29', '2026-10-30', []],
  ['kyoto', 'Kyoto', 'Kansai', 'Nishikyōgoku', '2026-10-30', '2026-11-05', [['Nara', '2026-11-02']]],
  ['osaka', 'Osaka', 'Kansai', '', '2026-11-05', '2026-11-08', [['Kōyasan', '2026-11-06']]],
  [
    'onomichi',
    'Onomichi',
    'Setouchi',
    '',
    '2026-11-08',
    '2026-11-10',
    [
      ['Himeji (en route)', '2026-11-08'],
      ['Shimanami Kaidō et Ōmishima', '2026-11-09'],
    ],
  ],
  ['hiroshima', 'Hiroshima', 'Setouchi', 'Heiwa Ōdōri', '2026-11-10', '2026-11-13', [['Miyajima', '2026-11-12']]],
  ['nagoya', 'Nagoya', 'Tōkai', 'Ōharu, hors centre', '2026-11-13', '2026-11-15', [['Magome, Tsumago et Naegi', '2026-11-14']]],
  ['tokyo2', 'Tokyo', 'Kantō', 'Asakusa', '2026-11-15', '2026-11-19', [['Aéroport de départ', '2026-11-19']]],
];

export const CATEGORIES: [string, string][] = [
  ['nourriture', 'Nourriture et douceurs'],
  ['boisson', 'Boissons et alcool'],
  ['artisanat', 'Artisanat'],
  ['cuisine', 'Cuisine et vaisselle'],
  ['textile', 'Textile et vêtements'],
  ['papeterie', 'Papeterie'],
  ['deco', 'Déco et maison'],
  ['beaute', 'Beauté et soins'],
  ['pop', 'Pop culture et jeux'],
  ['autre', 'Autre'],
];

export function profilsInitiaux(voyageId: string, ts: string): ProfilDouanier[] {
  return [
    {
      id: 'suisse',
      voyageId,
      createdAt: ts,
      updatedAt: ts,
      nom: 'Suisse, arrivée à Genève (avion)',
      ordre: 1,
      devise: 'CHF',
      franchiseValeur: 150,
      regleValeur:
        'Au-delà de 150 CHF par personne et par jour, la TVA est due sur la valeur totale des marchandises.',
      reglesAlcool: [
        { libelle: "Jusqu'à 18 %", degreMax: 18, limiteL: 5 },
        { libelle: 'Plus de 18 %', degreMin: 18, limiteL: 1 },
      ],
      interdits: {
        viande: true,
        lait: true,
        vegetal: false,
        texte: 'Viande et produits laitiers de pays hors UE interdits dans les provisions de voyage.',
      },
      sources: [
        'https://www.bazg.admin.ch/fr/informations-generales-sur-les-franchises-et-les-limites-de-valeur',
        'https://www.bazg.admin.ch/dam/fr/sd-web/Mv9dMMMmYzCG/Info-Zoll-Wertfreigrenze-Freimengen_f.pdf',
      ],
      verifieLe: '2026-11-02',
    },
    {
      id: 'france',
      voyageId,
      createdAt: ts,
      updatedAt: ts,
      nom: 'France, entrée depuis la Suisse (route ou train)',
      ordre: 2,
      devise: 'EUR',
      franchiseValeur: 300,
      regleValeur:
        'Au-delà de 300 €, déclaration obligatoire ; droits et TVA portent sur la valeur totale, pas seulement sur l’excédent.',
      reglesAlcool: [
        { libelle: 'Vins tranquilles', types: ['vin'], limiteL: 4 },
        { libelle: 'Bières', types: ['biere'], limiteL: 16 },
        { libelle: 'Plus de 22 %', types: ['autre'], degreMin: 22, limiteL: 1, groupeProrata: 'boissons' },
        { libelle: '22 % ou moins', types: ['autre'], degreMax: 22, limiteL: 2, groupeProrata: 'boissons' },
      ],
      interdits: {
        viande: true,
        lait: true,
        vegetal: true,
        texte:
          'Viande et produits laitiers hors UE interdits (sauf lait infantile et aliments médicaux, 2 kg). Produits de la pêche : 20 kg. Autres produits sans viande ni lait (miel…) : 2 kg. Végétaux : certificat phytosanitaire requis.',
      },
      sources: [
        'https://www.douane.gouv.fr/fiche/franchises-douanieres-et-fiscales-en-quantites-et-en-valeurs',
        'https://www.douane.gouv.fr/particuliers/vous-voyagez/tabacs-et-boissons-alcooliques',
        'https://europa.eu/youreurope/citizens/travel/carry/meat-dairy-animal/index_fr.htm',
      ],
      verifieLe: '2026-11-02',
    },
  ];
}

export function parametresInitiaux(ts: string): Parametres {
  return {
    id: 'parametres',
    createdAt: ts,
    updatedAt: ts,
    taux: {},
    detaxe: { tauxNormal: 10, tauxReduit: 8 },
    ia: {
      modele: 'claude-sonnet-5-5',
      auto: false,
      maxRecherchesLieux: 5,
      maxRecherchesSuggestions: 8,
      maxDemandesMois: 100,
      envoyerPrenoms: false,
      usage: {},
    },
    sauvegarde: {},
  };
}

export function donneesInitiales(ts: string): DB {
  const etapes: Etape[] = ETAPES.map(([id, ville, region, zone, arrivee, depart, exc], i) => ({
    id,
    voyageId: VOYAGE_ID,
    createdAt: ts,
    updatedAt: ts,
    ordre: i + 1,
    ville,
    region: region || undefined,
    zone: zone || undefined,
    arrivee,
    depart,
    excursions: exc.map(([nom, date], j) => ({ id: `${id}-x${j + 1}`, nom, date })),
  }));
  return {
    voyages: [
      {
        id: VOYAGE_ID,
        createdAt: ts,
        updatedAt: ts,
        nom: 'Japon 2026',
        dateDebut: '2026-10-15',
        dateFin: '2026-11-19',
        deviseLocale: 'JPY',
        deviseReference: 'EUR',
        actif: true,
        destinataires: [],
        itineraireRetour: 'Vol Tokyo → Genève avec correspondance, puis route ou train vers la France',
        detaxeActive: true,
      },
    ],
    etapes,
    groupes: [
      { id: 'famille', nom: 'Famille', ordre: 1, createdAt: ts, updatedAt: ts },
      { id: 'amis', nom: 'Amis', ordre: 2, createdAt: ts, updatedAt: ts },
      { id: 'collegues', nom: 'Collègues', ordre: 3, createdAt: ts, updatedAt: ts },
    ],
    personnes: [{ id: MOI_ID, nom: 'Moi', systeme: true, createdAt: ts, updatedAt: ts }],
    categories: CATEGORIES.map(([id, libelle], i) => ({ id, libelle, ordre: i + 1, createdAt: ts, updatedAt: ts })),
    souvenirs: [],
    attributions: [],
    lieux: [],
    suggestions: [],
    tickets: [],
    bagages: [
      { id: 'valise', voyageId: VOYAGE_ID, nom: 'Valise', type: 'soute', createdAt: ts, updatedAt: ts },
      { id: 'sac', voyageId: VOYAGE_ID, nom: 'Sac à dos', type: 'cabine', createdAt: ts, updatedAt: ts },
    ],
    profils: profilsInitiaux(VOYAGE_ID, ts),
    jobs: [],
    parametres: parametresInitiaux(ts),
  };
}
