// Construction du contexte envoyé à l'IA (§9.2) et du texte du mode manuel (§9.9).
import type { CibleSuggestion, DateStr, DB, Etape, Souvenir, Voyage } from '../db/types';
import { MOI_ID } from '../db/types';
import { formatDateCourte } from '../domain/dates';
import {
  attributionsDe,
  etapesDuVoyage,
  etapesRestantes,
  ici as calculIci,
  membresDuGroupe,
  souvenirsDuVoyage,
  SEUIL_DETAXE_HT,
} from '../domain/rules';
import { yen } from '../domain/format';
import { MESSAGE_A, MESSAGE_B, PROMPT_A, PROMPT_B, REGLE_MANUELLE, outilLieux, outilSuggestions, type OutilIA } from './prompts';

function etapeContexte(e: Etape) {
  return {
    id: e.id,
    ville: e.ville,
    ...(e.zone ? { zone: e.zone } : {}),
    du: e.arrivee,
    au: e.depart,
    ...(e.excursions.length
      ? { excursions: e.excursions.map((x) => (x.date ? `${x.nom} (${formatDateCourte(x.date)})` : x.nom)) }
      : {}),
  };
}

/** Contraintes générées depuis les profils, bagages et paramètres du voyage (jamais en dur) */
export function contraintesRetour(db: DB, v: Voyage) {
  const p = db.parametres.detaxe;
  const detaxe = v.detaxeActive
    ? `Achats d'au moins ${yen(SEUIL_DETAXE_HT)} hors taxe par boutique et par jour (taxe ${p.tauxNormal} %, ${p.tauxReduit} % pour l'alimentaire) ; taxe payée en caisse puis remboursée après validation à la borne de l'aéroport, avant l'enregistrement des bagages.`
    : undefined;
  const douane = db.profils
    .filter((x) => x.voyageId === v.id)
    .sort((a, b) => a.ordre - b.ordre)
    .map((x) => {
      const alcool = x.reglesAlcool.map((r) => `${r.libelle} : ${String(r.limiteL).replace('.', ',')} L`).join(', ');
      const prorata = x.reglesAlcool.some((r) => r.groupeProrata) ? ' (catégories combinées au prorata)' : '';
      return `${x.nom} : franchise de ${x.franchiseValeur} ${x.devise}. ${x.regleValeur} Alcool : ${alcool}${prorata}. ${x.interdits.texte}`;
    });
  const bagages = [
    'Liquides de plus de 100 ml et objets tranchants : en soute.',
    'Alcool de plus de 70 % interdit en avion ; de 24 à 70 % : 5 L au maximum par passager, emballage d’origine fermé.',
    ...db.bagages
      .filter((b) => b.voyageId === v.id)
      .map((b) => `${b.nom} (${b.type})${b.poidsMaxKg ? ` : ${b.poidsMaxKg} kg max` : ''}`),
  ];
  return { ...(detaxe ? { detaxe } : {}), douane, bagages };
}

function base(db: DB, v: Voyage, jour: DateStr) {
  const etapes = etapesDuVoyage(db, v.id);
  const i = calculIci(db, v, jour);
  const e0 = i.etapes[i.etapes.length - 1] ?? etapes[etapes.length - 1];
  return {
    date_du_jour: jour,
    voyage: {
      nom: v.nom,
      du: v.dateDebut,
      au: v.dateFin,
      ...(v.itineraireRetour ? { retour: v.itineraireRetour } : {}),
    },
    ici: {
      etape_id: e0?.id,
      ville: e0?.ville,
      ...(i.manuel ? { lieu_choisi: i.excursion?.nom ?? e0?.ville } : {}),
    },
    etapes_restantes: etapesRestantes(etapes, jour).map(etapeContexte),
  };
}

function categories(db: DB) {
  return [...db.categories].sort((a, b) => a.ordre - b.ordre).map((c) => ({ id: c.id, libelle: c.libelle }));
}

/** Destinataires d'une idée, anonymisés sauf option « Envoyer les prénoms » */
function pourIdee(db: DB, v: Voyage, s: Souvenir) {
  const prenoms = db.parametres.ia.envoyerPrenoms;
  const out: Record<string, unknown>[] = [];
  for (const a of attributionsDe(db, s.id)) {
    if (a.cible.type === 'groupe') {
      const gid = a.cible.groupeId;
      const g = db.groupes.find((x) => x.id === gid);
      out.push({ type: 'groupe', groupe: g?.nom, nb_personnes: membresDuGroupe(db, v, gid).length, collectif: true });
      continue;
    }
    for (const id of a.cible.ids) {
      if (id === MOI_ID) {
        out.push({ type: 'moi' });
        continue;
      }
      const p = db.personnes.find((x) => x.id === id);
      const g = db.groupes.find((x) => x.id === p?.groupeId);
      out.push({
        type: 'personne',
        ...(g ? { groupe: g.nom } : {}),
        ...(prenoms && p ? { nom: p.nom } : {}),
        ...(a.cible.ids.length > 1 ? { collectif: true } : {}),
      });
    }
  }
  return out;
}

export function contexteLieux(db: DB, v: Voyage, s: Souvenir, jour: DateStr) {
  const cat = db.categories.find((c) => c.id === s.categorieId);
  return {
    ...base(db, v, jour),
    idee: {
      nom: s.nom,
      ...(cat ? { categorie: cat.id } : {}),
      ...(s.note ? { note: s.note } : {}),
      quantite: s.quantite,
      pour: pourIdee(db, v, s),
    },
    categories: categories(db),
    contraintes_retour: contraintesRetour(db, v),
  };
}

/** Souvenirs déjà prévus pour une cible de suggestion */
export function souvenirsDeCible(db: DB, v: Voyage, c: CibleSuggestion): Souvenir[] {
  const ids = new Set<string>();
  for (const s of souvenirsDuVoyage(db, v.id))
    for (const a of attributionsDe(db, s.id)) {
      if (c.type === 'moi' && a.cible.type === 'personnes' && a.cible.ids.includes(MOI_ID)) ids.add(s.id);
      if (c.type === 'groupe' && a.cible.type === 'groupe' && a.cible.groupeId === c.id) ids.add(s.id);
      if (c.type === 'personne') {
        const p = db.personnes.find((x) => x.id === c.id);
        if (a.cible.type === 'personnes' && a.cible.ids.includes(c.id)) ids.add(s.id);
        if (a.cible.type === 'groupe' && p?.groupeId === a.cible.groupeId) ids.add(s.id);
      }
    }
  return db.souvenirs.filter((s) => ids.has(s.id));
}

export function memeCible(a: CibleSuggestion, b: CibleSuggestion): boolean {
  return a.type === b.type && (a.type === 'moi' || (a as { id: string }).id === (b as { id: string }).id);
}

export function contexteSuggestions(db: DB, v: Voyage, c: CibleSuggestion, jour: DateStr) {
  let cible: Record<string, unknown>;
  if (c.type === 'moi') cible = { type: 'moi', collectif: false };
  else if (c.type === 'groupe') {
    const g = db.groupes.find((x) => x.id === c.id);
    cible = { type: 'groupe', groupe: g?.nom, nb_personnes: membresDuGroupe(db, v, c.id).length, collectif: true };
  } else {
    const p = db.personnes.find((x) => x.id === c.id);
    const g = db.groupes.find((x) => x.id === p?.groupeId);
    cible = {
      type: 'personne',
      ...(g ? { groupe: g.nom } : {}),
      ...(db.parametres.ia.envoyerPrenoms && p ? { nom: p.nom } : {}),
      nb_personnes: 1,
      collectif: false,
      ...(p?.indices ? { indices: p.indices } : {}),
    };
  }
  const suggestions = db.suggestions.filter((s) => s.voyageId === v.id && memeCible(s.cible, c));
  return {
    ...base(db, v, jour),
    cible,
    deja_prevu: souvenirsDeCible(db, v, c).map((s) => s.nom),
    ecartees: suggestions.filter((s) => s.statut === 'ecartee').map((s) => s.nom),
    categories: categories(db),
    contraintes_retour: contraintesRetour(db, v),
  };
}

export interface Demande {
  systeme: string;
  message: string;
  outil: OutilIA;
  contexte: unknown;
}

export function demandeLieux(db: DB, v: Voyage, s: Souvenir, jour: DateStr): Demande {
  const contexte = contexteLieux(db, v, s, jour);
  return { systeme: PROMPT_A, message: `${MESSAGE_A}\n\n${JSON.stringify(contexte, null, 2)}`, outil: outilLieux(), contexte };
}

export function demandeSuggestions(db: DB, v: Voyage, c: CibleSuggestion, jour: DateStr): Demande {
  const contexte = contexteSuggestions(db, v, c, jour);
  return {
    systeme: PROMPT_B,
    message: `${MESSAGE_B}\n\n${JSON.stringify(contexte, null, 2)}`,
    outil: outilSuggestions(db.categories.map((x) => x.id)),
    contexte,
  };
}

/** Texte autonome du mode manuel (§9.9) */
export function texteManuel(d: Demande): string {
  const regles = d.systeme.split('\n');
  const i = regles.findIndex((l) => l.startsWith('- Termine en appelant'));
  if (i >= 0) regles[i] = `- ${REGLE_MANUELLE}`;
  return [
    regles.join('\n'),
    '',
    '## Contexte',
    '```json',
    JSON.stringify(d.contexte, null, 2),
    '```',
    '',
    '## Schéma de la réponse',
    '```json',
    JSON.stringify(d.outil.input_schema, null, 2),
    '```',
  ].join('\n');
}
