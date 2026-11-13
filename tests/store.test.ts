import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { charger, commit, db, etat } from '../src/db/store';
import { fermer, DB_NAME, chargerTout } from '../src/db/persistence';
import * as A from '../src/domain/actions';
import { construireSauvegarde, ErreurImport, lireSauvegarde, rappelSauvegarde } from '../src/db/backup';
import { attributionsDe, voyageActif } from '../src/domain/rules';
import { achat } from './helpers';

beforeEach(async () => {
  await fermer();
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
  etat.value = null;
});

describe('F-01 / F-03 Persistance et données initiales', () => {
  it('écrit les données initiales au premier lancement et les relit', async () => {
    await charger();
    expect(db().etapes).toHaveLength(12);
    expect(db().personnes.map((p) => p.nom)).toEqual(['Moi']);
    expect(db().souvenirs).toHaveLength(0);
    await commit((d) => A.creerPersonne(d, { nom: 'Léa' }));
    await fermer();
    const relu = await chargerTout();
    expect(relu.db!.personnes.map((p) => p.nom).sort()).toEqual(['Léa', 'Moi']);
  });
});

describe('RG-16 Annulation', () => {
  it('« Annuler » rétablit exactement l’état précédent, y compris en base', async () => {
    await charger();
    const r1 = await commit((d) => A.creerPersonne(d, { nom: 'Léa' }));
    const lea = r1.valeur.id;
    await commit((d) => A.creerAchat(d, achat({ nom: 'Tenugui', cibles: { personnes: [lea], groupes: [], moi: false } })));
    const s = db().souvenirs[0];
    const avant = JSON.stringify(db());
    const r = await commit((d) => A.supprimerPersonne(d, lea));
    expect(attributionsDe(db(), s.id)).toHaveLength(0);
    expect(voyageActif(db())!.destinataires).toEqual([]);
    await r.annuler();
    expect(attributionsDe(db(), s.id)).toHaveLength(1);
    expect(JSON.stringify(db().personnes)).toBe(JSON.stringify(JSON.parse(avant).personnes));
    await fermer();
    const relu = (await chargerTout()).db!;
    expect(relu.personnes.some((p) => p.id === lea)).toBe(true);
    expect(relu.attributions).toHaveLength(1);
  });

  it('une action refusée ne modifie rien (atomicité)', async () => {
    await charger();
    const avant = JSON.stringify(db());
    await expect(commit((d) => {
      A.creerPersonne(d, { nom: 'X' });
      A.supprimerPersonne(d, 'moi');
    })).rejects.toThrow();
    expect(JSON.stringify(db())).toBe(avant);
    await fermer();
    expect((await chargerTout()).db!.personnes).toHaveLength(1);
  });
});

describe('F-02 Sauvegarde', () => {
  it('export complet sans clé API ; import avec migration ; refus des fichiers invalides', async () => {
    await charger();
    await commit((d) => A.creerPersonne(d, { nom: 'Léa' }));
    const f = await construireSauvegarde(db(), null, '2026-11-02T22:00:00+09:00');
    const texte = JSON.stringify(f);
    expect(f.schemaVersion).toBe(1);
    expect(texte).not.toContain('sk-ant');
    const lu = lireSauvegarde(texte);
    expect(lu.db.personnes.map((p) => p.nom).sort()).toEqual(['Léa', 'Moi']);
    expect(() => lireSauvegarde('pas du json')).toThrow(ErreurImport);
    expect(() => lireSauvegarde('{"voyages": []}')).toThrow(/Version/);
    expect(() => lireSauvegarde('{"schemaVersion": 2, "voyages": [{"id": "v"}]}')).toThrow(/inconnue/);
    expect(() => lireSauvegarde('{"schemaVersion": 1, "voyages": "x"}')).toThrow(ErreurImport);
  });

  it("importe l'exemple de l'annexe C (sauvegarde partielle) en complétant les champs", () => {
    const annexeC = {
      schemaVersion: 1,
      exportedAt: '2026-11-02T22:00:00+09:00',
      voyages: [{ id: 'v1', nom: 'Japon 2026', dateDebut: '2026-10-15', dateFin: '2026-11-19', deviseLocale: 'JPY', deviseReference: 'EUR', actif: true }],
      personnes: [{ id: 'moi', nom: 'Moi', systeme: true }, { id: 'p1', nom: 'Léa', groupeId: 'g2' }],
      groupes: [{ id: 'g2', nom: 'Amis', ordre: 2 }],
      souvenirs: [{ id: 's1', voyageId: 'v1', nom: 'Tenugui', statut: 'achete', quantite: 6, achat: { date: '2026-11-02', etapeId: 'kyoto', boutique: 'Kamawanu', prix: 6600, devise: 'JPY', tauxEUR: 0.0058, prixEUR: 38.28 } }],
      attributions: [
        { id: 'a1', souvenirId: 's1', cible: { type: 'personnes', ids: ['p1'] }, quantite: 1, remise: 'a_donner' },
        { id: 'a2', souvenirId: 's1', cible: { type: 'personnes', ids: ['moi'] }, quantite: 1 },
      ],
      parametres: { ia: { modele: 'claude-sonnet-5-5', auto: true } },
    };
    const { db: d } = lireSauvegarde(JSON.stringify(annexeC));
    expect(d.souvenirs[0].retour).toEqual({});
    expect(d.souvenirs[0].etapesPrevues).toEqual([]);
    expect(d.attributions[0].voyageId).toBe('v1');
    expect(d.parametres.ia.maxDemandesMois).toBe(100);
    expect(d.parametres.ia.auto).toBe(true);
    expect(d.voyages[0].destinataires).toEqual([]);
    expect(d.etapes).toEqual([]);
  });

  it('rappel discret après 3 jours si des données ont changé', () => {
    const p = { createdAt: '2026-11-01T00:00:00Z', sauvegarde: { derniere: '2026-11-01T00:00:00Z', modifieDepuis: true } } as never;
    expect(rappelSauvegarde(p, new Date('2026-11-03T00:00:00Z'))).toBe(false);
    expect(rappelSauvegarde(p, new Date('2026-11-05T00:00:00Z'))).toBe(true);
    const q = { createdAt: '2026-11-01T00:00:00Z', sauvegarde: { derniere: '2026-11-01T00:00:00Z', modifieDepuis: false } } as never;
    expect(rappelSauvegarde(q, new Date('2026-11-10T00:00:00Z'))).toBe(false);
  });
});
