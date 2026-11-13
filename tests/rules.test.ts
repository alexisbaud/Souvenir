import { describe, expect, it } from 'vitest';
import * as A from '../src/domain/actions';
import * as R from '../src/domain/rules';
import { MOI_ID } from '../src/db/types';
import { achat, avec, base, personnes, trouver, TAUX } from './helpers';

const V = () => 'japon2026';

describe('RG-01 Cycle de vie', () => {
  it('idée → acheté → partiellement donné → donné', () => {
    let { db, ids } = personnes(base(), ['Léa', 'Hugo']);
    db = avec(db, (d) => A.creerIdee(d, { nom: 'Thé', cibles: { personnes: [ids.Léa, ids.Hugo], groupes: [], moi: false } }));
    let s = trouver(db, 'Thé');
    expect(R.etatSouvenir(s, R.attributionsDe(db, s.id))).toBe('idee');
    db = avec(db, (d) => A.acheterIdee(d, s.id, achat({ nom: 'Thé' }), R.attributionsDe(db, s.id).map((a) => a.id)));
    s = trouver(db, 'Thé');
    expect(s.statut).toBe('achete');
    expect(R.etatSouvenir(s, R.attributionsDe(db, s.id))).toBe('achete');
    const [a1, a2] = R.attributionsDe(db, s.id);
    db = avec(db, (d) => A.donner(d, a1.id, '2026-11-21'));
    expect(R.etatSouvenir(s, R.attributionsDe(db, s.id))).toBe('partiel');
    db = avec(db, (d) => A.donner(d, a2.id, '2026-11-21'));
    expect(R.etatSouvenir(s, R.attributionsDe(db, s.id))).toBe('donne');
  });

  it("n'est pas « Donné » s'il reste des unités sans destinataire", () => {
    let { db, ids } = personnes(base(), ['Léa']);
    db = avec(db, (d) => A.creerAchat(d, achat({ nom: 'Lot', quantite: 3, cibles: { personnes: [ids.Léa], groupes: [], moi: false } })));
    const s = trouver(db, 'Lot');
    db = avec(db, (d) => A.donner(d, R.attributionsDe(db, s.id)[0].id, '2026-11-21'));
    expect(R.etatSouvenir(s, R.attributionsDe(db, s.id))).toBe('partiel');
  });

  it("les attributions à « Moi » ne comptent pas ; un achat pour moi seul reste « Acheté »", () => {
    let db = avec(base(), (d) => A.creerAchat(d, achat({ nom: 'Perso', cibles: { personnes: [], groupes: [], moi: true } })));
    const s = trouver(db, 'Perso');
    expect(R.etatSouvenir(s, R.attributionsDe(db, s.id))).toBe('achete');
    expect(R.attributionsDe(db, s.id)[0].remise).toBeUndefined();
    db = avec(db, (d) => A.ajouterAttribution(d, s.id, { type: 'personnes', ids: [MOI_ID] }, 1, true));
    expect(trouver(db, 'Perso').quantite).toBe(2);
  });

  it("retour à l'idée : efface l'achat, conserve les attributions", () => {
    let { db, ids } = personnes(base(), ['Léa']);
    db = avec(db, (d) => A.creerAchat(d, achat({ nom: 'X', boutique: 'B', cibles: { personnes: [ids.Léa], groupes: [], moi: false }, detaxe: true })));
    const s = trouver(db, 'X');
    expect(db.tickets).toHaveLength(1);
    db = avec(db, (d) => A.revenirIdee(d, s.id));
    expect(trouver(db, 'X').statut).toBe('idee');
    expect(trouver(db, 'X').achat).toBeUndefined();
    expect(R.attributionsDe(db, s.id)).toHaveLength(1);
    expect(db.tickets).toHaveLength(0);
  });
});

describe('RG-02 / RG-04 Unités et lots', () => {
  it('la somme des attributions ne dépasse jamais la quantité', () => {
    let { db, ids } = personnes(base(), ['A', 'B']);
    db = avec(db, (d) => A.creerAchat(d, achat({ nom: 'Lot', quantite: 2, cibles: { personnes: [ids.A], groupes: [], moi: false } })));
    const s = trouver(db, 'Lot');
    expect(R.unitesNonAttribuees(s, R.attributionsDe(db, s.id))).toBe(1);
    db = avec(db, (d) => A.ajouterAttribution(d, s.id, { type: 'personnes', ids: [ids.B] }));
    expect(R.unitesNonAttribuees(s, R.attributionsDe(db, s.id))).toBe(0);
    expect(() => avec(db, (d) => A.ajouterAttribution(d, s.id, { type: 'personnes', ids: [MOI_ID] }))).toThrow(/unités/);
  });

  it('réduire la quantité sous le nombre attribué est refusé avec un message', () => {
    let { db, ids } = personnes(base(), ['A', 'B', 'C']);
    db = avec(db, (d) =>
      A.creerAchat(d, achat({ nom: 'Lot', quantite: 6, cibles: { personnes: [ids.A, ids.B, ids.C], groupes: [], moi: false } })),
    );
    const s = trouver(db, 'Lot');
    expect(() => avec(db, (d) => A.modifierSouvenir(d, s.id, { quantite: 2 }))).toThrow(/3 unités/);
    db = avec(db, (d) => A.modifierSouvenir(d, s.id, { quantite: 3 }));
    expect(trouver(db, 'Lot').quantite).toBe(3);
  });

  it('un achat avec des unités libres est « À attribuer »', () => {
    let db = avec(base(), (d) => A.creerAchat(d, achat({ nom: 'Libre', quantite: 2 })));
    expect(R.aAttribuer(db, V()).map((s) => s.nom)).toEqual(['Libre']);
    db = avec(db, (d) => A.ajouterAttribution(d, trouver(db, 'Libre').id, { type: 'personnes', ids: [MOI_ID] }, 2));
    expect(R.aAttribuer(db, V())).toHaveLength(0);
  });
});

describe('RG-03 Cadeau collectif', () => {
  it('un groupe couvre ses membres au moment du calcul', () => {
    let { db, ids } = personnes(base(), ['C1', 'C2'], 'collegues');
    db = avec(db, (d) => A.creerAchat(d, achat({ nom: 'Boîte', cibles: { personnes: [], groupes: ['collegues'], moi: false } })));
    const a = R.attributionsDe(db, trouver(db, 'Boîte').id)[0];
    expect(R.estCollective(a)).toBe(true);
    expect(a.quantite).toBe(1);
    expect(R.personnesDeCible(db, a).sort()).toEqual([ids.C1, ids.C2].sort());
    const r = personnes(db, ['C3'], 'collegues');
    expect(R.personnesDeCible(r.db, a)).toHaveLength(3);
  });

  it('plusieurs personnes en « cadeau commun » = une seule attribution collective', () => {
    const { db: d0, ids } = personnes(base(), ['A', 'B']);
    const db = avec(d0, (d) =>
      A.creerIdee(d, { nom: 'Commun', cibles: { personnes: [ids.A, ids.B], groupes: [], moi: false, commun: true } }),
    );
    const attrs = R.attributionsDe(db, trouver(db, 'Commun').id);
    expect(attrs).toHaveLength(1);
    expect(R.estCollective(attrs[0])).toBe(true);
  });
});

describe('RG-05 « Moi »', () => {
  it("n'apparaît ni dans les destinataires du voyage ni dans « À donner »", () => {
    const db = avec(base(), (d) => A.creerAchat(d, achat({ nom: 'Perso', cibles: { personnes: [], groupes: [], moi: true } })));
    const v = R.voyageActif(db)!;
    expect(R.destinatairesDuVoyage(db, v)).toHaveLength(0);
    expect(R.attributionsADonner(db, v.id)).toHaveLength(0);
    expect(R.compteurs(db, v).sansRien).toBe(0);
  });

  it('ne peut être ni modifié ni supprimé', () => {
    expect(() => avec(base(), (d) => A.supprimerPersonne(d, MOI_ID))).toThrow();
    expect(() => avec(base(), (d) => A.modifierPersonne(d, MOI_ID, { nom: 'X' }))).toThrow();
  });
});

describe('RG-06 Couverture', () => {
  it('Rien, Idée, Acheté, Donné et mention collectif', () => {
    let { db, ids } = personnes(base(), ['P'], 'amis');
    const v = R.voyageActif(db)!;
    const p = () => db.personnes.find((x) => x.id === ids.P)!;
    expect(R.couverture(db, p(), v.id).etat).toBe('rien');
    db = avec(db, (d) => A.creerIdee(d, { nom: 'I', cibles: { personnes: [ids.P], groupes: [], moi: false } }));
    expect(R.couverture(db, p(), v.id).etat).toBe('idee');
    db = avec(db, (d) => A.creerAchat(d, achat({ nom: 'G', cibles: { personnes: [], groupes: ['amis'], moi: false } })));
    let c = R.couverture(db, p(), v.id);
    expect(c.etat).toBe('achete');
    expect(c.collectif).toBe(true);
    db = avec(db, (d) => A.creerAchat(d, achat({ nom: 'Ind', cibles: { personnes: [ids.P], groupes: [], moi: false } })));
    c = R.couverture(db, p(), v.id);
    expect(c.collectif).toBe(false);
    for (const a of c.attributions) if (trouver(db, 'I').id !== a.souvenirId) db = avec(db, (d) => A.donner(d, a.id, '2026-11-21'));
    c = R.couverture(db, p(), v.id);
    expect(c.etat).toBe('donne');
  });
});

describe('RG-07 Ici', () => {
  const v = () => R.voyageActif(base())!;
  it('nuit k/n, transition, avant, dernier jour, après', () => {
    const db = base();
    expect(R.ici(db, v(), '2026-11-02').libelle).toBe('Kyoto · nuit 4/6');
    expect(R.ici(db, v(), '2026-11-05').libelle).toBe('Kyoto → Osaka');
    expect(R.ici(db, v(), '2026-11-05').etapes.map((e) => e.id)).toEqual(['kyoto', 'osaka']);
    const avant = R.ici(db, v(), '2026-10-01');
    expect(avant.mode).toBe('avant');
    expect(avant.libelle).toContain('À venir');
    expect(avant.etapes[0].id).toBe('tokyo1');
    expect(R.ici(db, v(), '2026-11-19').mode).toBe('dernier_jour');
    expect(R.ici(db, v(), '2026-11-20').mode).toBe('apres');
  });

  it('le choix manuel vaut jusqu’à minuit', () => {
    const db = avec(base(), (d) => A.definirIciManuel(d, { etapeId: 'kyoto', excursionId: 'kyoto-x1' }, '2026-11-02'));
    const i = R.ici(db, v(), '2026-11-02');
    expect(i.manuel).toBe(true);
    expect(i.excursion?.nom).toBe('Nara');
    expect(R.ici(db, v(), '2026-11-03').manuel).toBe(false);
  });
});

describe('RG-08 / RG-09 Étapes possibles et achetable ici', () => {
  it('étapes prévues + étapes des lieux non écartés ; partout', () => {
    let db = avec(base(), (d) => A.creerIdee(d, { nom: 'I', cibles: A.SELECTION_VIDE, etapesPrevues: ['osaka'] }));
    const s = trouver(db, 'I');
    db = avec(db, (d) => {
      A.ajouterLieu(d, s.id, { nom: 'L1', type: 'boutique', etapeIds: ['hiroshima'], origine: 'manuel' });
      const l2 = A.ajouterLieu(d, s.id, { nom: 'L2', type: 'boutique', etapeIds: ['nagoya'], origine: 'manuel' });
      A.ecarterLieu(d, l2.id, true);
    });
    expect(R.etapesPossibles(s, R.lieuxDe(db, s.id, true)).sort()).toEqual(['hiroshima', 'osaka']);
    const etapes = R.etapesDuVoyage(db, 'japon2026');
    expect(R.achetableIci(s, db.lieux, etapes.filter((e) => e.id === 'osaka'))).toBe(true);
    expect(R.achetableIci(s, db.lieux, etapes.filter((e) => e.id === 'kyoto'))).toBe(false);
    const p = { ...s, partout: true };
    expect(R.achetableIci(p, db.lieux, etapes.filter((e) => e.id === 'kyoto'))).toBe(true);
    expect(R.etapesPossiblesRestantes(p, db.lieux, etapes, '2026-11-14').map((e) => e.id)).toEqual(['nagoya', 'tokyo2']);
  });
});

describe('RG-10 Dernière chance', () => {
  const avecIdee = () => {
    let db = avec(base(), (d) => A.creerIdee(d, { nom: 'Onomichi seul', cibles: A.SELECTION_VIDE }));
    const s = trouver(db, 'Onomichi seul');
    db = avec(db, (d) => A.ajouterLieu(d, s.id, { nom: 'Ramen', type: 'boutique', etapeIds: ['onomichi'], origine: 'manuel' }));
    return db;
  };
  it('dernière chance ici puis plus prévue (S5)', () => {
    const db = avecIdee();
    const v = R.voyageActif(db)!;
    expect(R.derniereChance(db, v, '2026-11-09').ici.map((x) => x.souvenir.nom)).toEqual(['Onomichi seul']);
    expect(R.derniereChance(db, v, '2026-11-10').ici.map((x) => x.souvenir.nom)).toEqual(['Onomichi seul']);
    const j11 = R.derniereChance(db, v, '2026-11-11');
    expect(j11.ici).toHaveLength(0);
    expect(j11.plusPrevue.map((s) => s.nom)).toEqual(['Onomichi seul']);
    expect(R.derniereChance(db, v, '2026-11-08').ici).toHaveLength(1);
    expect(R.derniereChance(db, v, '2026-11-05').ici).toHaveLength(0);
  });
  it('ignore le choix manuel', () => {
    const db = avec(avecIdee(), (d) => A.definirIciManuel(d, { etapeId: 'kyoto' }, '2026-11-09'));
    expect(R.derniereChance(db, R.voyageActif(db)!, '2026-11-09').ici).toHaveLength(1);
  });
  it('derniers jours : toute idée non achetée à partir de J-2', () => {
    let db = avecIdee();
    db = avec(db, (d) => A.creerIdee(d, { nom: 'Sans lieu', cibles: A.SELECTION_VIDE }));
    const v = R.voyageActif(db)!;
    expect(R.derniereChance(db, v, '2026-11-16').modeDerniersJours).toBe(false);
    const dc = R.derniereChance(db, v, '2026-11-17');
    expect(dc.modeDerniersJours).toBe(true);
    expect(dc.derniersJours.map((x) => x.souvenir.nom).sort()).toEqual(['Onomichi seul', 'Sans lieu']);
    expect(dc.plusPrevue.map((s) => s.nom)).toEqual(['Onomichi seul']);
  });
  it('une idée sans aucune étape n’est pas « plus prévue » ; partout jamais en dernière chance', () => {
    const db = avec(base(), (d) => {
      A.creerIdee(d, { nom: 'Vide', cibles: A.SELECTION_VIDE });
      A.creerIdee(d, { nom: 'Konbini', cibles: A.SELECTION_VIDE, partout: true });
    });
    const dc = R.derniereChance(db, R.voyageActif(db)!, '2026-11-18');
    expect(dc.plusPrevue).toHaveLength(0);
    expect(dc.ici).toHaveLength(0);
  });
});

describe('RG-11 Prix et conversion', () => {
  it('convertit et fige le taux', () => {
    let db = avec(base(), (d) => A.creerAchat(d, achat({ nom: 'Y', prix: 12800 })));
    expect(trouver(db, 'Y').achat!.prixEUR).toBe(74.24);
    db = avec(db, (d) => A.creerAchat(d, achat({ nom: 'E', prix: 84.3, devise: 'EUR' })));
    expect(trouver(db, 'E').achat!.prixEUR).toBe(84.3);
    expect(R.prixYen(trouver(db, 'E'))).toBe(Math.round(84.3 / TAUX));
    db = avec(db, (d) => A.definirTauxManuel(d, 0.007, undefined, '2026-11-03'));
    expect(trouver(db, 'Y').achat!.tauxEUR).toBe(TAUX);
    expect(() => avec(db, (d) => A.creerAchat(d, achat({ nom: 'Z', tauxEUR: 0 })))).toThrow(/taux/);
  });
  it('arrondit les yens à l’unité et les euros au centime', () => {
    const db = avec(base(), (d) => A.creerAchat(d, achat({ nom: 'R', prix: 999.6, tauxEUR: 0.00571 })));
    expect(trouver(db, 'R').achat!.prix).toBe(1000);
    expect(trouver(db, 'R').achat!.prixEUR).toBe(5.71);
  });
});

describe('RG-12 Totaux', () => {
  it('total et part pour moi au prorata des unités', () => {
    const { db: d0, ids } = personnes(base(), ['A']);
    const db = avec(d0, (d) => {
      A.creerAchat(d, achat({ nom: 'Lot', prix: 6000, quantite: 3, cibles: { personnes: [ids.A], groupes: [], moi: true } }));
      A.creerAchat(d, achat({ nom: 'Autre', prix: 1000 }));
    });
    const t = R.totaux(db, 'japon2026');
    expect(t.yen).toBe(7000);
    expect(t.moiYen).toBe(2000);
    expect(t.eur).toBe(40.6);
  });
});

describe('RG-13 Détaxe', () => {
  it('regroupe par boutique et date, seuil 5 000 ¥ HT, ticket compromis (S8)', () => {
    let { db, ids } = personnes(base(), ['A']);
    db = avec(db, (d) => {
      A.creerAchat(d, achat({ nom: 'T1', prix: 3300, boutique: 'Kamawanu', detaxe: true, cibles: { personnes: [ids.A], groupes: [], moi: false } }));
      A.creerAchat(d, achat({ nom: 'T2', prix: 2200, boutique: 'kamawanu ', detaxe: true }));
      A.creerAchat(d, achat({ nom: 'T3', prix: 2200, boutique: 'Kamawanu', date: '2026-11-03', detaxe: true }));
    });
    const v = R.voyageActif(db)!;
    const tickets = R.ticketsDuVoyage(db, v);
    expect(tickets).toHaveLength(2);
    const t = tickets[0];
    expect(t.totalTTC).toBe(5500);
    expect(t.totalHT).toBe(5000);
    expect(t.eligible).toBe(true);
    expect(t.taxe).toBe(500);
    expect(tickets[1].eligible).toBe(false);
    expect(R.detaxeARecuperer(tickets)).toBe(500);
    const a = R.attributionsDe(db, trouver(db, 'T1').id)[0];
    db = avec(db, (d) => A.donner(d, a.id, '2026-11-05'));
    expect(R.ticketsDuVoyage(db, v)[0].compromis).toHaveLength(1);
    expect(R.detaxeARecuperer(R.ticketsDuVoyage(db, v))).toBe(0);
  });
  it('taxe saisie depuis le ticket et taux réduit alimentaire', () => {
    let db = avec(base(), (d) => A.creerAchat(d, achat({ nom: 'Mochi', prix: 5400, boutique: 'B', categorieId: 'nourriture', detaxe: true })));
    const v = R.voyageActif(db)!;
    expect(R.ticketsDuVoyage(db, v)[0].taxe).toBe(400);
    db = avec(db, (d) => A.modifierTicket(d, db.tickets[0].id, { taxeYen: 390 }));
    expect(R.ticketsDuVoyage(db, v)[0].taxe).toBe(390);
    expect(R.ticketsDuVoyage(db, v)[0].dateLimite).toBe('2027-01-31');
  });
  it('consommé au Japon compromet le ticket ; une boutique est requise', () => {
    let db = avec(base(), (d) => A.creerAchat(d, achat({ nom: 'Saké', prix: 6000, boutique: 'B', detaxe: true })));
    db = avec(db, (d) => A.modifierRetour(d, trouver(db, 'Saké').id, { consommeAuJapon: true }));
    expect(R.ticketsDuVoyage(db, R.voyageActif(db)!)[0].compromis[0]).toMatch(/consommé/);
    expect(() => avec(db, (d) => A.creerAchat(d, achat({ nom: 'Sans', detaxe: true })))).toThrow(/boutique/);
  });
});

describe('RG-14 Douane (S7)', () => {
  const avecAlcools = (whiskies: number) =>
    avec(
      avec(base(), (d) => A.definirTauxManuel(d, TAUX, 0.0054, '2026-11-02')),
      (d) => {
        for (let i = 0; i < whiskies; i++)
          A.creerAchat(d, achat({ nom: 'Whisky ' + i, prix: 5000, retour: { alcool: { type: 'autre', degre: 43, volumeL: 0.7 } } }));
        A.creerAchat(d, achat({ nom: 'Saké', prix: 3000, retour: { alcool: { type: 'autre', degre: 15, volumeL: 0.72 } } }));
      },
    );
  it('France : prorata 0,7/1 + 0,72/2 = 1,06 → Dépassé', () => {
    const db = avecAlcools(1);
    const b = R.bilanDouane(db, R.voyageActif(db)!, db.profils.find((p) => p.id === 'france')!);
    const l = b.alcool.find((x) => x.unite === 'prorata')!;
    expect(l.ratio).toBeCloseTo(1.06, 5);
    expect(l.statut).toBe('depasse');
    expect(b.statut).toBe('depasse');
  });
  it('Suisse : 0,7 L sur 1 L OK, 0,72 L sur 5 L OK ; deux whiskies → Dépassé', () => {
    let db = avecAlcools(1);
    let b = R.bilanDouane(db, R.voyageActif(db)!, db.profils.find((p) => p.id === 'suisse')!);
    expect(b.alcool.map((l) => [l.libelle, l.valeur, l.statut])).toEqual([
      ["Jusqu'à 18 %", 0.72, 'ok'],
      ['Plus de 18 %', 0.7, 'ok'],
    ]);
    db = avecAlcools(2);
    b = R.bilanDouane(db, R.voyageActif(db)!, db.profils.find((p) => p.id === 'suisse')!);
    expect(b.alcool[1].valeur).toBeCloseTo(1.4);
    expect(b.alcool[1].statut).toBe('depasse');
  });
  it('valeur nette de la taxe japonaise, convertie ; statut Attention à 80 %', () => {
    let db = avec(base(), (d) => A.definirTauxManuel(d, 0.006, 0.005, '2026-11-02'));
    db = avec(db, (d) => A.creerAchat(d, achat({ nom: 'Cher', prix: 27500, boutique: 'B', detaxe: true })));
    const b = R.bilanDouane(db, R.voyageActif(db)!, db.profils.find((p) => p.id === 'suisse')!);
    expect(b.valeur.valeur).toBe(125); // (27 500 − 2 500) × 0,005
    expect(b.valeur.statut).toBe('attention');
  });
  it('liste les interdits avec les souvenirs concernés', () => {
    const db = avec(base(), (d) => A.creerAchat(d, achat({ nom: 'Wagyu séché', retour: { viande: true } })));
    const b = R.bilanDouane(db, R.voyageActif(db)!, db.profils.find((p) => p.id === 'france')!);
    expect(b.interdits[0].souvenirs[0].nom).toBe('Wagyu séché');
  });
});

describe('RG-15 Bagages', () => {
  it('alertes cabine, fragile, alcool et poids', () => {
    let db = avec(base(), (d) => {
      A.creerAchat(d, achat({ nom: 'Couteau', retour: { tranchant: true, bagageId: 'sac', poidsG: 300 } }));
      A.creerAchat(d, achat({ nom: 'Bol', retour: { fragile: true, bagageId: 'valise', poidsG: 800 } }));
      A.creerAchat(d, achat({ nom: 'Spiritueux', retour: { alcool: { type: 'autre', degre: 75, volumeL: 0.5 } } }));
    });
    db = avec(db, (d) => A.enregistrerBagage(d, { id: 'valise', nom: 'Valise', type: 'soute', poidsMaxKg: 1, poidsHorsSouvenirsKg: 0.5 }));
    const b = R.bilanBagages(db, R.voyageActif(db)!);
    const sac = b.bagages.find((x) => x.bagage.id === 'sac')!;
    expect(sac.alertes[0].texte).toMatch(/à mettre en soute/);
    const valise = b.bagages.find((x) => x.bagage.id === 'valise')!;
    expect(valise.alertes[0].texte).toMatch(/Fragile/);
    expect(valise.poidsTotalKg).toBeCloseTo(1.3);
    expect(valise.depasse).toBe(true);
    expect(b.nonRanges.map((s) => s.nom)).toEqual(['Spiritueux']);
    expect(b.alertesGenerales[0].texte).toMatch(/interdit/);
  });
});

describe('RG-16 Suppression', () => {
  it('supprimer une personne la retire ; une attribution vide disparaît', () => {
    let { db, ids } = personnes(base(), ['A', 'B']);
    db = avec(db, (d) => {
      A.creerIdee(d, { nom: 'Seul', cibles: { personnes: [ids.A], groupes: [], moi: false } });
      A.creerIdee(d, { nom: 'Commun', cibles: { personnes: [ids.A, ids.B], groupes: [], moi: false, commun: true } });
    });
    db = avec(db, (d) => A.supprimerPersonne(d, ids.A));
    expect(R.attributionsDe(db, trouver(db, 'Seul').id)).toHaveLength(0);
    const c = R.attributionsDe(db, trouver(db, 'Commun').id)[0];
    expect(c.cible).toEqual({ type: 'personnes', ids: [ids.B] });
    expect(R.voyageActif(db)!.destinataires).toEqual([ids.B]);
  });
  it('supprimer un groupe cible convertit en liste de membres', () => {
    let { db, ids } = personnes(base(), ['C1', 'C2'], 'collegues');
    db = avec(db, (d) => A.creerIdee(d, { nom: 'Boîte', cibles: { personnes: [], groupes: ['collegues'], moi: false } }));
    db = avec(db, (d) => A.supprimerGroupe(d, 'collegues'));
    const a = R.attributionsDe(db, trouver(db, 'Boîte').id)[0];
    expect(a.cible.type).toBe('personnes');
    expect((a.cible as { ids: string[] }).ids.sort()).toEqual([ids.C1, ids.C2].sort());
    expect(db.personnes.find((p) => p.id === ids.C1)!.groupeId).toBeUndefined();
  });
});

describe('RG-17 Destinataires du voyage', () => {
  it('une personne créée pendant le voyage y est ajoutée ; les compteurs ne portent que sur eux', () => {
    const { db, ids } = personnes(base(), ['A']);
    const v = R.voyageActif(db)!;
    expect(v.destinataires).toEqual([ids.A]);
    const horsVoyage = avec(db, (d) =>
      d.put('personnes', { id: 'x', nom: 'Hors voyage', createdAt: '', updatedAt: '' }),
    );
    expect(R.destinatairesDuVoyage(horsVoyage, R.voyageActif(horsVoyage)!).map((p) => p.nom)).toEqual(['A']);
    expect(R.compteurs(horsVoyage, R.voyageActif(horsVoyage)!).sansRien).toBe(1);
  });
});

describe('F-30 Étapes', () => {
  it('refuse les chevauchements et les dates hors voyage', () => {
    const db = base();
    const v = R.voyageActif(db)!;
    const e = R.etapesDuVoyage(db, v.id);
    expect(R.verifierEtapes(v, e)).toBeNull();
    expect(R.verifierEtapes(v, [...e.slice(0, 11), { ...e[11], arrivee: '2026-11-14' }])).toMatch(/chevauchent/);
    expect(R.verifierEtapes(v, [{ ...e[0], arrivee: '2026-10-10' }])).toMatch(/dates du voyage/);
  });
});

describe('F-21 CA4 Doublon probable', () => {
  it('propose une idée existante au nom proche', () => {
    const db = avec(base(), (d) => A.creerIdee(d, { nom: 'Baguettes laquées', cibles: A.SELECTION_VIDE }));
    expect(R.ideesSimilaires(db, 'japon2026', 'baguettes').map((s) => s.nom)).toEqual(['Baguettes laquées']);
    expect(R.ideesSimilaires(db, 'japon2026', 'Baguetes laquees')).toHaveLength(1);
    expect(R.ideesSimilaires(db, 'japon2026', 'Thé')).toHaveLength(0);
  });
});
