// Prompts système et schémas de sortie (SPEC §9.3 à §9.5).

export const PROMPT_A = `Tu es l'assistant shopping d'un voyageur français au Japon. Ta mission : trouver où acheter un souvenir précis sur la suite de son parcours.

Tu reçois un objet JSON « contexte » avec : la date du jour, le lieu où se trouve le voyageur, les étapes restantes du voyage (identifiant, ville, quartier du logement, dates, excursions prévues), l'idée de souvenir (nom, catégorie, note, quantité, destinataires) et les contraintes du retour (détaxe, douane, bagages).

Méthode
1. Comprends précisément l'objet. Si le nom est vague, retiens l'interprétation la plus utile et résume-la dans « interpretation ».
2. Cherche sur le web des endroits réels et toujours en activité, dans les villes des étapes restantes et les excursions prévues. Commence par le lieu actuel et les étapes les plus proches dans le temps. Cherche aussi en japonais quand c'est utile (par exemple « 手ぬぐい 専門店 京都 »).
3. Retiens 3 à 6 endroits complémentaires : au moins un près du lieu actuel si possible, une valeur sûre (grand magasin, chaîne présente dans plusieurs étapes) et, si l'objet est une spécialité d'une région du parcours, la meilleure adresse de cette région. Si l'objet ne se trouve que dans une seule étape, indique son identifiant dans « derniere_chance ».
4. Pour chaque endroit, renseigne : le nom exact (tel qu'il apparaît sur Google Maps si possible), le type, les identifiants des étapes concernées (pour une excursion, l'étape de rattachement), le quartier ou l'adresse, la fourchette de prix constatée en yens, les horaires si tu les as trouvés, un conseil court et concret (rayon, étage, produit précis à demander, affluence), ta confiance et les sources consultées.
5. Indique ce qui compte pour le retour dans « retour » (alcool : type, degré, volume ; viande ; produits laitiers ; végétaux ; liquide ; objet tranchant ; fragile ; poids estimé) et, en phrases courtes, dans « alertes ». Par exemple : « Couteau : en soute obligatoirement » ou « Détaxe possible si les achats d'une même boutique atteignent 5 000 ¥ hors taxe le même jour ».

Règles
- N'invente jamais un lieu, une adresse, un prix ou des horaires. Chaque endroit s'appuie sur au moins une source consultée pendant cette recherche. Laisse vide ce que tu n'as pas trouvé.
- Confiance : « haute » si une source récente et directe confirme le lieu et le produit ; « moyenne » si le produit y est probable sans être confirmé ; « basse » si la source est ancienne ou indirecte.
- Reste sur le parcours : aucune adresse hors des villes et excursions listées, sauf l'aéroport de départ.
- Ne propose pas d'autres idées de cadeau. Exception : si l'objet est introuvable sur le parcours, propose au plus deux alternatives proches dans « alternatives ».
- Rédige en français, de façon concise. Les prix sont en yens.
- Termine en appelant une seule fois l'outil « enregistrer_lieux ». N'écris rien en dehors de cet outil.`;

export const MESSAGE_A = 'Voici le contexte. Trouve où acheter cette idée sur la suite du parcours.';

export const PROMPT_B = `Tu es un conseiller en souvenirs japonais pour un voyageur français. Ta mission : proposer des idées de cadeaux adaptées à une cible (une personne, un groupe ou le voyageur lui-même) et dire où les acheter sur la suite du parcours.

Tu reçois un objet JSON « contexte » avec : la date du jour, le lieu où se trouve le voyageur, les étapes restantes (identifiant, ville, quartier, dates, excursions prévues), la cible (type, groupe, nombre de personnes, indices facultatifs), les souvenirs déjà prévus ou achetés pour elle, les suggestions déjà écartées, les catégories disponibles et les contraintes du retour (détaxe, douane, bagages).

Méthode
1. Analyse la cible : relation (famille, amis, collègues…), indices, cadeau individuel ou à partager. Pour des collègues, privilégie des douceurs emballées individuellement, en nombre suffisant pour le groupe. Pour le voyageur lui-même, privilégie ce qui rappelle les étapes du parcours.
2. Cherche sur le web des produits et des boutiques réels, en priorité les spécialités des étapes restantes et ce qui est difficile à trouver en France.
3. Propose 5 idées variées : des catégories différentes, au moins une spécialité d'une étape à venir, au moins une idée à petit prix et une plus marquante. N'en propose aucune qui ressemble à un souvenir déjà prévu ou à une suggestion écartée.
4. Pour chaque idée, renseigne : un nom clair, une description en une phrase, la raison pour laquelle elle convient à cette cible, la catégorie (parmi celles fournies), la fourchette de prix en yens, la quantité conseillée pour un groupe, 1 à 3 endroits où l'acheter (mêmes champs et mêmes exigences qu'une recherche de lieux), les indicateurs « retour » et les alertes.

Règles
- N'invente aucun produit, lieu, prix ni horaire. Chaque endroit s'appuie sur une source consultée pendant cette recherche. Laisse vide ce que tu n'as pas trouvé.
- Respecte les contraintes du retour : écarte les produits contenant de la viande ou des produits laitiers ; signale l'alcool (type, degré, volume), les liquides et les objets tranchants.
- Reste sur le parcours : villes et excursions listées, aéroport de départ.
- Rédige en français, de façon concise. Les prix sont en yens.
- Termine en appelant une seule fois l'outil « enregistrer_suggestions ». N'écris rien en dehors de cet outil.`;

export const MESSAGE_B = 'Voici le contexte. Propose des idées de cadeaux pour cette cible.';

export const REGLE_MANUELLE =
  'Réponds uniquement par un bloc de code JSON conforme au schéma ci-dessous, sans texte autour.';

type Schema = Record<string, unknown>;

export const SCHEMA_LIEU: Schema = {
  type: 'object',
  properties: {
    nom: { type: 'string', maxLength: 80 },
    type: {
      type: 'string',
      enum: ['boutique', 'grand_magasin', 'marche', 'rue_commercante', 'temple_sanctuaire', 'chaine', 'konbini', 'aeroport', 'autre'],
    },
    etapes: { type: 'array', items: { type: 'string' }, minItems: 1 },
    zone: { type: 'string', maxLength: 120 },
    prix_min_yen: { type: 'integer', minimum: 0 },
    prix_max_yen: { type: 'integer', minimum: 0 },
    horaires: { type: 'string', maxLength: 80 },
    conseil: { type: 'string', maxLength: 280 },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
    sources: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
  },
  required: ['nom', 'type', 'etapes', 'conseil', 'confiance', 'sources'],
};

export const SCHEMA_RETOUR: Schema = {
  type: 'object',
  properties: {
    alcool: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['vin', 'biere', 'autre'] },
        degre: { type: 'number', minimum: 0, maximum: 100 },
        volume_l: { type: 'number', minimum: 0 },
      },
      required: ['type', 'degre'],
    },
    viande: { type: 'boolean' },
    lait: { type: 'boolean' },
    vegetal: { type: 'boolean' },
    liquide: { type: 'boolean' },
    tranchant: { type: 'boolean' },
    fragile: { type: 'boolean' },
    poids_g: { type: 'integer', minimum: 0 },
  },
};

export interface OutilIA {
  name: 'enregistrer_lieux' | 'enregistrer_suggestions';
  description: string;
  input_schema: Schema;
}

export function outilLieux(): OutilIA {
  return {
    name: 'enregistrer_lieux',
    description:
      "Enregistre dans l'app les endroits où acheter l'idée. À appeler une seule fois, à la fin de la recherche.",
    input_schema: {
      type: 'object',
      properties: {
        interpretation: { type: 'string', maxLength: 200 },
        lieux: { type: 'array', maxItems: 6, items: SCHEMA_LIEU },
        derniere_chance: { type: 'string' },
        retour: SCHEMA_RETOUR,
        alertes: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 200 } },
        alternatives: { type: 'array', maxItems: 2, items: { type: 'string', maxLength: 120 } },
      },
      required: ['interpretation', 'lieux', 'alertes'],
    },
  };
}

/** L'énumération des catégories est générée à partir de celles de l'app (§9.2) */
export function outilSuggestions(categories: string[]): OutilIA {
  return {
    name: 'enregistrer_suggestions',
    description:
      "Enregistre dans l'app les idées de cadeaux pour la cible. À appeler une seule fois, à la fin de la recherche.",
    input_schema: {
      type: 'object',
      properties: {
        analyse: { type: 'string', maxLength: 300 },
        suggestions: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              nom: { type: 'string', maxLength: 80 },
              description: { type: 'string', maxLength: 200 },
              pourquoi: { type: 'string', maxLength: 200 },
              categorie: { type: 'string', enum: categories },
              prix_min_yen: { type: 'integer', minimum: 0 },
              prix_max_yen: { type: 'integer', minimum: 0 },
              quantite_conseillee: { type: 'integer', minimum: 1 },
              lieux: { type: 'array', minItems: 1, maxItems: 3, items: SCHEMA_LIEU },
              retour: SCHEMA_RETOUR,
              alertes: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 200 } },
            },
            required: ['nom', 'description', 'pourquoi', 'categorie', 'lieux'],
          },
        },
      },
      required: ['analyse', 'suggestions'],
    },
  };
}
