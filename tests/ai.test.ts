import { describe, expect, it } from 'vitest';
import * as A from '../src/domain/actions';
import { accepterSuggestion, ecarterSuggestion, importerLieux, importerSuggestions, lireReponseLieux, lireReponseSuggestions } from '../src/ai/importer';
import { contexteLieux, contexteSuggestions, demandeLieux, texteManuel } from '../src/ai/context';
import { extraireJSON } from '../src/ai/validate';
import { lieuxDe, voyageActif, attributionsDe, estCollective } from '../src/domain/rules';
import { avec, base, personnes, trouver } from './helpers';

const JOUR = '2026-11-02';
const T = '2026-11-02T12:00:00Z';

const reponse = (over: Record<string, unknown> = {}) => ({
  interpretation: 'Tenugui imprimé',
  lieux: [
    { nom: 'Kamawanu', type: 'boutique', etapes: ['kyoto'], conseil: 'Motifs de saison', confiance: 'haute', sources: ['https://kamawanu.co.jp/'] },
    { nom: 'Passé', type: 'boutique', etapes: ['matsumoto'], conseil: 'x', confiance: 'basse', sources: ['https://a.jp/'] },
    { nom: 'Non sûr', type: 'boutique', etapes: ['osaka'], conseil: 'x', confiance: 'basse', sources: ['http://a.jp/'] },
  ],
  alertes: ['  Léger   et   compact  '],
  retour: { tranchant: true, fragile: true, poids_g: 40 },
  ...over,
});

describe('§9.7 Validation des réponses', () => {
  it('refuse une réponse non conforme au schéma', () => {
    expect(() => lireReponseLieux({ lieux: [] })).toThrow(/interpretation/);
    expect(() => lireReponseLieux({ ...reponse(), lieux: [{ nom: 'X', type: 'inconnu', etapes: ['kyoto'], conseil: 'c', confiance: 'haute', sources: ['https://a'] }] })).toThrow(/non autorisée/);
    expect(() => lireReponseSuggestions({ analyse: 'a', suggestions: [] }, ['nourriture'])).toThrow(/au moins 1/);
  });
  it('nettoie les textes et tronque à la longueur du schéma', () => {
    const r = lireReponseLieux({ ...reponse(), interpretation: 'x'.repeat(300) });
    expect(r.interpretation.length).toBeLessThanOrEqual(200);
    expect(r.alertes[0]).toBe('Léger et compact');
  });
  it('extrait le premier bloc JSON d’un texte collé', () => {
    expect(extraireJSON('Voici :\n```json\n{"a": 1}\n```\nfin')).toEqual({ a: 1 });
    expect(extraireJSON('blabla {"b": 2} blabla')).toEqual({ b: 2 });
    expect(() => extraireJSON('rien')).toThrow();
  });
});

describe('RG-18 / F-41 Import des lieux', () => {
  it('ignore les étapes passées et les sources non https ; remplit seulement les champs retour vides', () => {
    let db = avec(base(), (d) => A.creerIdee(d, { nom: 'Tenugui', cibles: A.SELECTION_VIDE, retour: { fragile: false, poidsG: 100 } }));
    const s = trouver(db, 'Tenugui');
    db = avec(db, (d) => importerLieux(d, s.id, lireReponseLieux(reponse()), JOUR, T));
    const l = lieuxDe(db, s.id);
    expect(l.map((x) => x.nom)).toEqual(['Kamawanu']);
    expect(l[0].origine).toBe('ia');
    const r = trouver(db, 'Tenugui').retour;
    expect(r.tranchant).toBe(true);
    expect(r.fragile).toBe(true); // false = vide
    expect(r.poidsG).toBe(100); // déjà rempli : conservé
    expect(r.sourceIA?.sort()).toEqual(['fragile', 'tranchant']);
    expect(trouver(db, 'Tenugui').ia?.interpretation).toBe('Tenugui imprimé');
  });

  it('remplace les lieux IA précédents, garde les écartés et ne touche jamais aux lieux manuels', () => {
    let db = avec(base(), (d) => A.creerIdee(d, { nom: 'Tenugui', cibles: A.SELECTION_VIDE }));
    const s = trouver(db, 'Tenugui');
    db = avec(db, (d) => {
      A.ajouterLieu(d, s.id, { nom: 'Manuel', type: 'boutique', etapeIds: ['kyoto'], origine: 'manuel' });
      importerLieux(d, s.id, lireReponseLieux(reponse({ lieux: [
        { nom: 'A', type: 'boutique', etapes: ['kyoto'], conseil: 'x', confiance: 'haute', sources: ['https://a.jp/'] },
        { nom: 'B', type: 'boutique', etapes: ['osaka'], conseil: 'x', confiance: 'haute', sources: ['https://b.jp/'] },
      ] })), JOUR, T);
    });
    const b = db.lieux.find((l) => l.nom === 'B')!;
    db = avec(db, (d) => A.ecarterLieu(d, b.id, true));
    db = avec(db, (d) =>
      importerLieux(d, s.id, lireReponseLieux(reponse({ lieux: [
        { nom: 'b', type: 'boutique', etapes: ['osaka'], conseil: 'x', confiance: 'haute', sources: ['https://b.jp/'] },
        { nom: 'manuel', type: 'boutique', etapes: ['kyoto'], conseil: 'x', confiance: 'haute', sources: ['https://m.jp/'] },
        { nom: 'C', type: 'chaine', etapes: ['nagoya'], conseil: 'x', confiance: 'moyenne', sources: ['https://c.jp/'] },
      ] })), JOUR, T),
    );
    const noms = lieuxDe(db, s.id, true).map((l) => `${l.nom}${l.ecarte ? ' (écarté)' : ''}`).sort();
    expect(noms).toEqual(['B (écarté)', 'C', 'Manuel']);
  });

  it('F-43 CA5 : renommer marque les lieux IA peut-être obsolètes', () => {
    let db = avec(base(), (d) => A.creerIdee(d, { nom: 'Tenugui', cibles: A.SELECTION_VIDE }));
    const s = trouver(db, 'Tenugui');
    db = avec(db, (d) => importerLieux(d, s.id, lireReponseLieux(reponse()), JOUR, T));
    db = avec(db, (d) => A.modifierSouvenir(d, s.id, { nom: 'Furoshiki' }));
    expect(lieuxDe(db, s.id).every((l) => l.obsolete)).toBe(true);
  });

  it('F-20 CA3 : en mode automatique, une nouvelle idée entre dans la file (une seule fois)', () => {
    let db = avec(base(), (d) => d.params((p) => ({ ...p, ia: { ...p.ia, auto: true } })));
    db = avec(db, (d) => A.creerIdee(d, { nom: 'Couteau', cibles: A.SELECTION_VIDE }));
    expect(db.jobs).toHaveLength(1);
    expect(db.jobs[0].statut).toBe('file');
    const s = trouver(db, 'Couteau');
    db = avec(db, (d) => A.mettreEnFile(d, { type: 'lieux', souvenirId: s.id }));
    expect(db.jobs).toHaveLength(1);
  });
});

describe('F-42 Suggestions', () => {
  const sugg = {
    analyse: 'a',
    suggestions: [
      { nom: 'Momiji manjū', description: 'd', pourquoi: 'p', categorie: 'nourriture', quantite_conseillee: 3, lieux: [{ nom: 'Momijido', type: 'boutique', etapes: ['hiroshima'], conseil: 'c', confiance: 'haute', sources: ['https://m.jp/'] }] },
      { nom: 'Kit Kat', description: 'd', pourquoi: 'p', categorie: 'nourriture', lieux: [{ nom: 'Donki', type: 'chaine', etapes: ['osaka'], conseil: 'c', confiance: 'haute', sources: ['https://d.jp/'] }], retour: { lait: true } },
    ],
  };
  it('accepter crée une idée collective pour un groupe ; écarter empêche de reproposer', () => {
    let { db } = personnes(base(), ['C1', 'C2'], 'collegues');
    const cible = { type: 'groupe' as const, id: 'collegues' };
    db = avec(db, (d) => importerSuggestions(d, cible, lireReponseSuggestions(sugg, db.categories.map((c) => c.id)), JOUR, T));
    expect(db.suggestions).toHaveLength(2);
    const [m, k] = db.suggestions;
    db = avec(db, (d) => {
      accepterSuggestion(d, m.id);
      ecarterSuggestion(d, k.id);
    });
    const s = trouver(db, 'Momiji manjū');
    expect(s.quantite).toBe(3);
    expect(s.origine).toBe('ia');
    const a = attributionsDe(db, s.id)[0];
    expect(a.cible).toEqual({ type: 'groupe', groupeId: 'collegues' });
    expect(estCollective(a)).toBe(true);
    expect(lieuxDe(db, s.id).map((l) => l.nom)).toEqual(['Momijido']);
    const ctx = contexteSuggestions(db, voyageActif(db)!, cible, JOUR);
    expect(ctx.ecartees).toEqual(['Kit Kat']);
    expect(ctx.deja_prevu).toEqual(['Momiji manjū']);
    db = avec(db, (d) => importerSuggestions(d, cible, lireReponseSuggestions(sugg, db.categories.map((c) => c.id)), JOUR, T));
    expect(db.suggestions.filter((x) => x.statut === 'nouvelle').map((x) => x.nom)).toEqual(['Momiji manjū']);
  });
});

describe('§9.2 Contexte', () => {
  it('étapes restantes, contraintes générées, prénoms masqués par défaut', () => {
    let { db, ids } = personnes(base(), ['Léa'], 'famille');
    db = avec(db, (d) => A.creerIdee(d, { nom: 'Couteau', cibles: { personnes: [ids.Léa], groupes: [], moi: false } }));
    const v = voyageActif(db)!;
    const ctx = contexteLieux(db, v, trouver(db, 'Couteau'), JOUR);
    expect(ctx.etapes_restantes.map((e) => e.id)).toEqual(['kyoto', 'osaka', 'onomichi', 'hiroshima', 'nagoya', 'tokyo2']);
    expect(ctx.etapes_restantes[0].excursions).toEqual(['Nara (2/11)']);
    expect(ctx.idee.pour).toEqual([{ type: 'personne', groupe: 'Famille' }]);
    expect(JSON.stringify(ctx)).not.toContain('Léa');
    expect(ctx.contraintes_retour.douane[0]).toContain('150 CHF');
    db = avec(db, (d) => d.params((p) => ({ ...p, ia: { ...p.ia, envoyerPrenoms: true } })));
    expect(JSON.stringify(contexteLieux(db, v, trouver(db, 'Couteau'), JOUR))).toContain('Léa');
  });
  it('mode manuel : texte autonome avec la règle de sortie JSON', () => {
    const db = avec(base(), (d) => A.creerIdee(d, { nom: 'Thé', cibles: A.SELECTION_VIDE }));
    const t = texteManuel(demandeLieux(db, voyageActif(db)!, trouver(db, 'Thé'), JOUR));
    expect(t).toContain('Réponds uniquement par un bloc de code JSON');
    expect(t).not.toContain('Termine en appelant');
    expect(t).toContain('"interpretation"');
  });
});
