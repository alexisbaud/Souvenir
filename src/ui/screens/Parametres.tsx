// Paramètres (§7.7).
import { useEffect, useState } from 'preact/hooks';
import type { Etape, Excursion } from '../../db/types';
import * as A from '../../domain/actions';
import { couverture, destinatairesDuVoyage, etapesDuVoyage, lieuxDe, souvenirsDuVoyage } from '../../domain/rules';
import { formatDate, moisCourant, nowIso, today } from '../../domain/dates';
import { nombre, parseNombre, pluriel } from '../../domain/format';
import { majTaux } from '../../domain/taux';
import { construireSauvegarde, ErreurImport, lireSauvegarde, nomFichier } from '../../db/backup';
import { ecrireInstantane, lireInstantane, remplacerPhotos, toutesLesPhotos } from '../../db/persistence';
import { commit, db as lireDb, remplacer } from '../../db/store';
import { agir, aller, erreur, essayer, fermer, notifier, ouvrir, route } from '../state';
import { categoriesTriees, groupesTries, useDb, useVoyage } from '../data';
import { Champ, confirmer, Interrupteur, Section, Selecteur, Texte, Vide, ZoneTexte } from '../components/ui';
import { Icon } from '../components/Icon';
import { Retour as RetourLien } from './Personnes';
import { cleActuelle, cleConfiguree, cleMasquee, definirCle, demander, relancer } from '../../ai/queue';
import { MODELES } from '../../ai/modeles';

async function testerCle(cle: string): Promise<void> {
  const m = await import('../../ai/client');
  return m.testerCle(cle);
}

const RUBRIQUES: [string, string][] = [
  ['voyage', 'Voyage et étapes'],
  ['groupes', 'Groupes'],
  ['categories', 'Catégories'],
  ['taux', 'Taux de change'],
  ['detaxe', 'Détaxe'],
  ['douane', 'Douane'],
  ['bagages', 'Bagages'],
  ['ia', 'Assistant IA'],
  ['sauvegarde', 'Sauvegarde'],
  ['apropos', 'À propos'],
];

export function Parametres() {
  const r = route.value.chemin[1];
  if (r === 'douane') {
    aller('retour?section=douane');
    return null;
  }
  if (r === 'bagages') {
    aller('retour?section=bagages');
    return null;
  }
  if (!r)
    return (
      <div class="ecran etroit">
        <div class="ecran-tete">
          <h1>Paramètres</h1>
        </div>
        <ul class="liste carte">
          {RUBRIQUES.map(([id, l]) => (
            <li>
              <a class="ligne-lien" href={'#/parametres/' + id}>
                <span class="ligne-titre">{l}</span>
                <Icon n="chevron" taille={18} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  const titre = RUBRIQUES.find(([id]) => id === r)?.[1] ?? '';
  return (
    <div class="ecran etroit">
      <RetourLien href="parametres" libelle="Paramètres" />
      <div class="ecran-tete">
        <h1>{titre}</h1>
      </div>
      {r === 'voyage' && <VoyageEtapes />}
      {r === 'groupes' && <Groupes />}
      {r === 'categories' && <Categories />}
      {r === 'taux' && <Taux />}
      {r === 'detaxe' && <DetaxeParams />}
      {r === 'ia' && <IA />}
      {r === 'sauvegarde' && <Sauvegarde />}
      {r === 'apropos' && <APropos />}
    </div>
  );
}

// ---------------------------------------------------------------- Voyage et étapes (F-30)

function VoyageEtapes() {
  const db = useDb();
  const v = useVoyage();
  const [nom, setNom] = useState(v.nom);
  const [debut, setDebut] = useState(v.dateDebut);
  const [fin, setFin] = useState(v.dateFin);
  const [itin, setItin] = useState(v.itineraireRetour ?? '');
  const etapes = etapesDuVoyage(db, v.id);
  return (
    <>
      <Section titre="Voyage">
        <form
          class="pile"
          onSubmit={(e) => {
            e.preventDefault();
            void agir((d) => A.modifierVoyage(d, v.id, { nom, dateDebut: debut, dateFin: fin, itineraireRetour: itin || undefined }), 'Voyage modifié');
          }}
        >
          <Champ label="Nom">
            <Texte valeur={nom} onValeur={setNom} />
          </Champ>
          <div class="grille2">
            <Champ label="Début">
              <input type="date" value={debut} onInput={(e) => setDebut((e.target as HTMLInputElement).value)} />
            </Champ>
            <Champ label="Fin">
              <input type="date" value={fin} onInput={(e) => setFin((e.target as HTMLInputElement).value)} />
            </Champ>
          </div>
          <Champ label="Itinéraire de retour" aide="Envoyé à l'IA">
            <ZoneTexte valeur={itin} onValeur={setItin} rows={2} />
          </Champ>
          <Interrupteur label="Détaxe active" checked={v.detaxeActive} onChange={(c) => agir((d) => A.modifierVoyage(d, v.id, { detaxeActive: c }))} />
          <button type="submit" class="btn btn-primaire">
            Enregistrer
          </button>
        </form>
      </Section>
      <Section
        titre={`Étapes (${etapes.length})`}
        action={
          <button class="btn btn-petit" onClick={() => ouvrir('Nouvelle étape', () => <FormEtape />)}>
            <Icon n="plus" taille={16} /> Étape
          </button>
        }
      >
        <ul class="liste">
          {etapes.map((e) => (
            <li>
              <button class="ligne-btn" onClick={() => ouvrir(`Étape : ${e.ville}`, () => <FormEtape etape={e} />)}>
                <span>
                  <strong>
                    {e.ordre}. {e.ville}
                  </strong>{' '}
                  <span class="discret">
                    {formatDate(e.arrivee)} → {formatDate(e.depart)}
                    {e.excursions.length ? ` · ${e.excursions.map((x) => x.nom).join(', ')}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function FormEtape({ etape }: { etape?: Etape }) {
  const db = useDb();
  const v = useVoyage();
  const [ville, setVille] = useState(etape?.ville ?? '');
  const [region, setRegion] = useState(etape?.region ?? '');
  const [zone, setZone] = useState(etape?.zone ?? '');
  const [arrivee, setArrivee] = useState(etape?.arrivee ?? v.dateDebut);
  const [depart, setDepart] = useState(etape?.depart ?? v.dateFin);
  const [note, setNote] = useState(etape?.note ?? '');
  const [excursions, setExcursions] = useState<Excursion[]>(etape?.excursions ?? []);
  const enregistrer = async () => {
    const autres = etapesDuVoyage(db, v.id).filter((e) => e.id !== etape?.id);
    const nouvelle: Etape = {
      ...(etape ?? { id: A.uuid(), voyageId: v.id, ordre: 0, createdAt: '', updatedAt: '' }),
      ville: ville.trim(),
      region: region.trim() || undefined,
      zone: zone.trim() || undefined,
      arrivee,
      depart,
      note: note.trim() || undefined,
      excursions: excursions.filter((x) => x.nom.trim()),
    };
    if (await essayer((d) => A.enregistrerEtapes(d, [...autres, nouvelle]), 'Étapes enregistrées')) fermer();
  };
  return (
    <div class="pile">
      <Champ label="Ville">
        <Texte valeur={ville} onValeur={setVille} required />
      </Champ>
      <div class="grille2">
        <Champ label="Région">
          <Texte valeur={region} onValeur={setRegion} />
        </Champ>
        <Champ label="Quartier du logement">
          <Texte valeur={zone} onValeur={setZone} />
        </Champ>
      </div>
      <div class="grille2">
        <Champ label="Arrivée">
          <input type="date" value={arrivee} onInput={(e) => setArrivee((e.target as HTMLInputElement).value)} />
        </Champ>
        <Champ label="Départ" aide="Nuitées de l'arrivée incluse au départ exclu">
          <input type="date" value={depart} onInput={(e) => setDepart((e.target as HTMLInputElement).value)} />
        </Champ>
      </div>
      <fieldset class="pile">
        <legend>Excursions</legend>
        {excursions.map((x, i) => (
          <div class="ligne-form">
            <input type="text" aria-label="Nom de l'excursion" value={x.nom} onInput={(e) => setExcursions(excursions.map((y, j) => (j === i ? { ...y, nom: (e.target as HTMLInputElement).value } : y)))} />
            <input type="date" aria-label="Date de l'excursion" value={x.date ?? ''} onInput={(e) => setExcursions(excursions.map((y, j) => (j === i ? { ...y, date: (e.target as HTMLInputElement).value || undefined } : y)))} />
            <button type="button" class="btn-icone" aria-label="Retirer l'excursion" onClick={() => setExcursions(excursions.filter((_, j) => j !== i))}>
              <Icon n="fermer" taille={18} />
            </button>
          </div>
        ))}
        <button type="button" class="btn btn-petit" onClick={() => setExcursions([...excursions, A.nouvelleExcursion('')])}>
          <Icon n="plus" taille={16} /> Excursion
        </button>
      </fieldset>
      <Champ label="Note">
        <ZoneTexte valeur={note} onValeur={setNote} rows={2} />
      </Champ>
      <div class="actions">
        {etape && (
          <button
            class="btn btn-danger"
            onClick={async () => {
              if (await essayer((d) => A.supprimerEtape(d, etape.id), `Étape ${etape.ville} supprimée`)) fermer();
            }}
          >
            Supprimer
          </button>
        )}
        <button class="btn btn-primaire" onClick={enregistrer}>
          Enregistrer
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Groupes (F-11)

function Groupes() {
  const db = useDb();
  const [nom, setNom] = useState('');
  const groupes = groupesTries(db);
  return (
    <section class="carte">
      <form
        class="ligne-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await essayer((d) => A.creerGroupe(d, nom), 'Groupe créé')) setNom('');
        }}
      >
        <input type="text" placeholder="Nouveau groupe" aria-label="Nom du nouveau groupe" value={nom} onInput={(e) => setNom((e.target as HTMLInputElement).value)} />
        <button class="btn btn-primaire" type="submit">
          Ajouter
        </button>
      </form>
      <ul class="liste">
        {groupes.map((g, i) => (
          <li class="ligne-rangement">
            <LibelleEditable valeur={g.nom} onValider={(n) => agir((d) => A.renommerGroupe(d, g.id, n), 'Groupe renommé')} />
            <span class="boutons">
              <button class="btn-icone" aria-label="Monter" disabled={i === 0} onClick={() => agir((d) => A.deplacerGroupe(d, g.id, -1))}>
                ↑
              </button>
              <button class="btn-icone" aria-label="Descendre" disabled={i === groupes.length - 1} onClick={() => agir((d) => A.deplacerGroupe(d, g.id, 1))}>
                ↓
              </button>
              <button class="btn-icone" aria-label={`Supprimer ${g.nom}`} onClick={() => agir((d) => A.supprimerGroupe(d, g.id), `Groupe ${g.nom} supprimé`)}>
                <Icon n="corbeille" taille={18} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LibelleEditable({ valeur, onValider }: { valeur: string; onValider: (v: string) => unknown }) {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  return (
    <input
      type="text"
      class="input-discret"
      value={v}
      aria-label="Nom"
      onInput={(e) => setV((e.target as HTMLInputElement).value)}
      onBlur={() => v.trim() && v !== valeur && onValider(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Categories() {
  const db = useDb();
  const [nom, setNom] = useState('');
  return (
    <section class="carte">
      <form
        class="ligne-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await essayer((d) => A.creerCategorie(d, nom), 'Catégorie créée')) setNom('');
        }}
      >
        <input type="text" placeholder="Nouvelle catégorie" aria-label="Nom de la nouvelle catégorie" value={nom} onInput={(e) => setNom((e.target as HTMLInputElement).value)} />
        <button class="btn btn-primaire" type="submit">
          Ajouter
        </button>
      </form>
      <ul class="liste">
        {categoriesTriees(db).map((c) => (
          <li class="ligne-rangement">
            <LibelleEditable valeur={c.libelle} onValider={(n) => agir((d) => A.renommerCategorie(d, c.id, n), 'Catégorie renommée')} />
            <button class="btn-icone" aria-label={`Supprimer ${c.libelle}`} onClick={() => agir((d) => A.supprimerCategorie(d, c.id), 'Catégorie supprimée')}>
              <Icon n="corbeille" taille={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Taux (F-27)

function Taux() {
  const db = useDb();
  const t = db.parametres.taux;
  const [eur, setEur] = useState('');
  const [chf, setChf] = useState('');
  const [enCours, setEnCours] = useState(false);
  return (
    <>
      <Section titre="Taux actuels">
        {t.jpyEur ? (
          <ul class="liste-simple">
            <li>1 ¥ = {nombre(t.jpyEur, 6)} € (1 000 ¥ = {nombre(t.jpyEur * 1000, 2)} €)</li>
            {t.jpyChf && <li>1 ¥ = {nombre(t.jpyChf, 6)} CHF</li>}
            <li class="discret">
              {t.source === 'manuel' ? 'Saisi à la main' : 'Automatique (BCE, via Frankfurter)'} · {t.date ? formatDate(t.date) : ''}
            </li>
          </ul>
        ) : (
          <Vide>Aucun taux connu.</Vide>
        )}
        <button
          class="btn"
          disabled={enCours}
          onClick={async () => {
            setEnCours(true);
            try {
              await majTaux(true);
              notifier('Taux mis à jour');
            } catch (e) {
              erreur(new A.ErreurMetier('Mise à jour impossible : ' + (e as Error).message));
            } finally {
              setEnCours(false);
            }
          }}
        >
          Mettre à jour maintenant
        </button>
        <p class="champ-aide">Mise à jour automatique au plus une fois par jour quand le réseau est disponible. Les achats gardent le taux de leur enregistrement.</p>
      </Section>
      <Section titre="Taux manuel">
        <form
          class="pile"
          onSubmit={(e) => {
            e.preventDefault();
            void agir((d) => A.definirTauxManuel(d, parseNombre(eur), parseNombre(chf), today()), 'Taux manuel enregistré');
          }}
        >
          <div class="grille2">
            <Champ label="EUR pour 1 ¥">
              <input type="text" inputMode="decimal" placeholder="0,0058" value={eur} onInput={(e) => setEur((e.target as HTMLInputElement).value)} />
            </Champ>
            <Champ label="CHF pour 1 ¥">
              <input type="text" inputMode="decimal" placeholder="0,0054" value={chf} onInput={(e) => setChf((e.target as HTMLInputElement).value)} />
            </Champ>
          </div>
          <button class="btn btn-primaire" type="submit">
            Utiliser ce taux
          </button>
        </form>
      </Section>
    </>
  );
}

function DetaxeParams() {
  const db = useDb();
  const p = db.parametres.detaxe;
  const [n, setN] = useState(String(p.tauxNormal));
  const [r, setR] = useState(String(p.tauxReduit));
  return (
    <form
      class="pile carte"
      onSubmit={(e) => {
        e.preventDefault();
        const a = parseNombre(n);
        const b = parseNombre(r);
        if (!(a >= 0 && b >= 0)) return erreur(new A.ErreurMetier('Taux invalides.'));
        void agir((d) => d.params((x) => ({ ...x, detaxe: { tauxNormal: a, tauxReduit: b } })), 'Taux de taxe enregistrés');
      }}
    >
      <div class="grille2">
        <Champ label="Taux normal (%)">
          <input type="text" inputMode="decimal" value={n} onInput={(e) => setN((e.target as HTMLInputElement).value)} />
        </Champ>
        <Champ label="Taux réduit, alimentaire (%)">
          <input type="text" inputMode="decimal" value={r} onInput={(e) => setR((e.target as HTMLInputElement).value)} />
        </Champ>
      </div>
      <p class="champ-aide">Servent à estimer la taxe quand elle n'est pas saisie depuis le ticket. Le montant du ticket fait foi.</p>
      <button class="btn btn-primaire" type="submit">
        Enregistrer
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- IA (F-40, F-43)

function IA() {
  const db = useDb();
  const v = useVoyage();
  const ia = db.parametres.ia;
  const [cle, setCle] = useState('');
  const [test, setTest] = useState<string | null>(null);
  const u = ia.usage[moisCourant()] ?? { demandes: 0, recherches: 0, jetonsEntree: 0, jetonsSortie: 0 };
  const majIA = (m: Partial<typeof ia>) => agir((d) => d.params((p) => ({ ...p, ia: { ...p.ia, ...m } })), undefined);
  const idees = souvenirsDuVoyage(db, v.id).filter((s) => s.statut === 'idee' && !s.partout && lieuxDe(db, s.id).length === 0 && s.etapesPrevues.length === 0);
  const sansRien = destinatairesDuVoyage(db, v).filter((p) => couverture(db, p, v.id).etat === 'rien');
  const groupe = (type: 'lieux' | 'suggestions') => {
    const n = type === 'lieux' ? idees.length : sansRien.length;
    const max = n * (type === 'lieux' ? ia.maxRecherchesLieux : ia.maxRecherchesSuggestions);
    confirmer(
      type === 'lieux' ? 'Chercher les lieux' : 'Suggestions pour tous',
      `${pluriel(n, 'demande')}, ${pluriel(max, 'recherche web')} au maximum.`,
      'Lancer',
      async () => {
        try {
          const k = await demander(
            type === 'lieux'
              ? idees.map((s) => ({ type: 'lieux' as const, souvenirId: s.id }))
              : sansRien.map((p) => ({ type: 'suggestions' as const, cible: { type: 'personne' as const, id: p.id } })),
          );
          notifier(`${pluriel(k, 'demande ajoutée', 'demandes ajoutées')} à la file`);
        } catch (e) {
          erreur(e);
        }
      },
      false,
    );
  };
  return (
    <>
      <Section titre="Clé API Claude">
        {cleConfiguree.value ? (
          <div class="pile">
            <p>
              Clé enregistrée : <code>{cleMasquee()}</code>
            </p>
            <div class="boutons">
              <button
                class="btn"
                onClick={async () => {
                  setTest('Test en cours…');
                  try {
                    await testerCle(cleActuelle()!);
                    setTest('Clé valide.');
                  } catch (e) {
                    setTest((e as Error).message);
                  }
                }}
              >
                Tester
              </button>
              <button class="btn btn-danger" onClick={() => confirmer('Supprimer la clé ?', 'Le mode manuel reste disponible.', 'Supprimer', () => definirCle(null))}>
                Supprimer la clé
              </button>
            </div>
            {test && <p role="status">{test}</p>}
          </div>
        ) : (
          <form
            class="pile"
            onSubmit={async (e) => {
              e.preventDefault();
              const k = cle.trim();
              if (!k) return;
              setTest('Test en cours…');
              try {
                await testerCle(k);
                await definirCle(k);
                setCle('');
                setTest('Clé valide et enregistrée.');
              } catch (err) {
                setTest((err as Error).message);
              }
            }}
          >
            <Champ label="Clé" aide="Stockée sur cet appareil uniquement, jamais exportée. Facturée à l'usage, séparément de l'abonnement Claude. Une clé dédiée avec une limite de dépense est recommandée.">
              <input type="password" autoComplete="off" placeholder="sk-ant-…" value={cle} onInput={(e) => setCle((e.target as HTMLInputElement).value)} />
            </Champ>
            <button class="btn btn-primaire" type="submit">
              Tester et enregistrer
            </button>
            {test && <p role="status">{test}</p>}
          </form>
        )}
      </Section>
      <Section titre="Réglages">
        <div class="pile">
          <Champ label="Modèle">
            <Selecteur valeur={ia.modele} onValeur={(m) => majIA({ modele: m || 'claude-sonnet-5-5' })} options={MODELES.map((m) => ({ id: m.id, libelle: m.libelle }))} />
          </Champ>
          <Interrupteur label="Mode automatique" aide="Chaque nouvelle idée sans lieu part en recherche" checked={ia.auto} onChange={(c) => majIA({ auto: c })} />
          <Interrupteur
            label="Envoyer les prénoms"
            aide="Par défaut, une personne est envoyée comme « Destinataire » avec son groupe"
            checked={ia.envoyerPrenoms}
            onChange={(c) => majIA({ envoyerPrenoms: c })}
          />
          <div class="grille3">
            <Champ label="Recherches web (lieux)">
              <NombreChamp valeur={ia.maxRecherchesLieux} onValeur={(n) => majIA({ maxRecherchesLieux: n })} />
            </Champ>
            <Champ label="Recherches web (suggestions)">
              <NombreChamp valeur={ia.maxRecherchesSuggestions} onValeur={(n) => majIA({ maxRecherchesSuggestions: n })} />
            </Champ>
            <Champ label="Demandes par mois">
              <NombreChamp valeur={ia.maxDemandesMois} onValeur={(n) => majIA({ maxDemandesMois: n })} />
            </Champ>
          </div>
        </div>
      </Section>
      <Section titre="Ce mois-ci">
        <ul class="liste-simple">
          <li>
            {u.demandes} / {ia.maxDemandesMois} demandes
          </li>
          <li>{pluriel(u.recherches, 'recherche web', 'recherches web')} (10 $ les 1 000)</li>
          <li>
            Jetons : {u.jetonsEntree.toLocaleString('fr-FR')} en entrée, {u.jetonsSortie.toLocaleString('fr-FR')} en sortie
          </li>
        </ul>
      </Section>
      <Section titre="Actions groupées">
        <div class="pile">
          <button class="btn" disabled={!cleConfiguree.value || idees.length === 0} onClick={() => groupe('lieux')}>
            Chercher les lieux de toutes les idées sans lieu ({idees.length})
          </button>
          <button class="btn" disabled={!cleConfiguree.value || sansRien.length === 0} onClick={() => groupe('suggestions')}>
            Suggestions pour tous les destinataires sans rien ({sansRien.length})
          </button>
        </div>
      </Section>
      <Section titre="File d'attente">
        <FileIA />
      </Section>
    </>
  );
}

function FileIA() {
  const db = useDb();
  const jobs = [...db.jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 20);
  if (!jobs.length) return <Vide>Aucune demande.</Vide>;
  const lib: Record<string, string> = { file: 'En file', en_cours: 'En cours', terminee: 'Terminée', echec: 'Échec' };
  return (
    <ul class="liste">
      {jobs.map((j) => {
        const quoi =
          j.demande.type === 'lieux'
            ? `Lieux : ${db.souvenirs.find((s) => s.id === (j.demande as { souvenirId: string }).souvenirId)?.nom ?? '(supprimé)'}`
            : `Suggestions : ${j.demande.cible.type === 'moi' ? 'Moi' : j.demande.cible.type === 'groupe' ? db.groupes.find((g) => g.id === (j.demande as { cible: { id: string } }).cible.id)?.nom : db.personnes.find((p) => p.id === (j.demande as { cible: { id: string } }).cible.id)?.nom}`;
        return (
          <li class="ligne-rangement">
            <span>
              {quoi}
              <br />
              <span class={'petite ' + (j.statut === 'echec' ? 'alerte-texte' : 'discret')}>
                {lib[j.statut]}
                {j.erreur ? ` : ${j.erreur}` : ''}
              </span>
            </span>
            {j.statut === 'echec' && (
              <button
                class="btn btn-petit"
                onClick={() => relancer(j.id)}
              >
                Relancer
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NombreChamp({ valeur, onValeur }: { valeur: number; onValeur: (n: number) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={valeur}
      onChange={(e) => {
        const n = Math.round(parseNombre((e.target as HTMLInputElement).value));
        if (n >= 1) onValeur(n);
      }}
    />
  );
}

// ---------------------------------------------------------------- Sauvegarde (F-02)

export async function exporter(avecPhotos: boolean): Promise<void> {
  const d = lireDb();
  const maintenant = new Date();
  const contenu = await construireSauvegarde(d, avecPhotos ? await toutesLesPhotos() : null, nowIso());
  const texte = JSON.stringify(contenu);
  const nom = nomFichier(maintenant);
  const fichier = new File([texte], nom, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  let partage = false;
  if (nav.canShare?.({ files: [fichier] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [fichier], title: nom });
      partage = true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  if (!partage) {
    const url = URL.createObjectURL(fichier);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  await commit((x) => x.params((p) => ({ ...p, sauvegarde: { derniere: maintenant.toISOString(), modifieDepuis: false } })), { marquerModifie: false });
  notifier('Sauvegarde exportée');
}

export async function importerFichier(texte: string): Promise<void> {
  const { db: nouvelle, photos } = lireSauvegarde(texte); // lève ErreurImport sans rien modifier
  // Sauvegarde automatique de l'état courant avant remplacement
  const avant = await construireSauvegarde(lireDb(), await toutesLesPhotos(), nowIso());
  await ecrireInstantane(JSON.stringify(avant));
  nouvelle.parametres = {
    ...nouvelle.parametres,
    sauvegarde: { ...nouvelle.parametres.sauvegarde, modifieDepuis: false },
  };
  await remplacer(nouvelle);
  if (photos) await remplacerPhotos(photos);
}

function Sauvegarde() {
  const db = useDb();
  const [avecPhotos, setAvecPhotos] = useState(true);
  const [instantane, setInstantane] = useState<{ date: string } | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void lireInstantane().then((x) => setInstantane(x ? { date: x.date } : undefined));
  }, []);
  const choisir = (texte: string) =>
    confirmer(
      'Remplacer les données ?',
      'Toutes les données de cet appareil seront remplacées par celles du fichier. L’état actuel est sauvegardé automatiquement avant.',
      'Importer',
      async () => {
        try {
          await importerFichier(texte);
          setMessage('Import réussi.');
          notifier('Données importées');
          aller('ici');
        } catch (e) {
          setMessage(e instanceof ErreurImport ? e.message : 'Import impossible : ' + (e as Error).message);
        }
      },
    );
  return (
    <>
      <Section titre="Exporter">
        <div class="pile">
          <p class="discret">
            {db.parametres.sauvegarde.derniere ? `Dernière sauvegarde : ${formatDate(db.parametres.sauvegarde.derniere.slice(0, 10))}` : 'Jamais sauvegardé.'}
          </p>
          <Interrupteur label="Inclure les photos" checked={avecPhotos} onChange={setAvecPhotos} />
          <button class="btn btn-primaire" onClick={() => exporter(avecPhotos).catch(erreur)}>
            Exporter la sauvegarde
          </button>
          <p class="champ-aide">Fichier JSON complet et daté, sans la clé API. Sur iPhone : feuille de partage → Save to Files. C'est aussi le moyen de passer les données du téléphone à l'ordinateur.</p>
        </div>
      </Section>
      <Section titre="Importer">
        <div class="pile">
          <label class="btn">
            Choisir un fichier…
            <input
              type="file"
              accept="application/json,.json"
              class="masque"
              onChange={async (e) => {
                const input = e.target as HTMLInputElement;
                const f = input.files?.[0];
                input.value = '';
                if (!f) return;
                setMessage(null);
                const texte = await f.text();
                try {
                  lireSauvegarde(texte); // validation préalable : fichier invalide refusé sans rien modifier
                  choisir(texte);
                } catch (err) {
                  setMessage((err as Error).message);
                }
              }}
            />
          </label>
          {message && <p role="status" class={message.startsWith('Import réussi') ? '' : 'alerte-texte'}>{message}</p>}
          {instantane && (
            <button
              class="btn btn-petit"
              onClick={() =>
                confirmer('Restaurer l’état d’avant import ?', `Sauvegarde automatique du ${formatDate(instantane.date.slice(0, 10))}.`, 'Restaurer', async () => {
                  const x = await lireInstantane();
                  if (!x) return;
                  try {
                    await importerFichier(x.contenu);
                    notifier('État restauré');
                  } catch (e) {
                    erreur(e);
                  }
                })
              }
            >
              Restaurer l'état d'avant le dernier import
            </button>
          )}
        </div>
      </Section>
    </>
  );
}

function APropos() {
  const [stockage, setStockage] = useState<string>('…');
  const [persistant, setPersistant] = useState<boolean | null>(null);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => {
      const mo = (e.usage ?? 0) / 1024 / 1024;
      setStockage(`${nombre(mo, 1)} Mo utilisés`);
    });
    void navigator.storage?.persisted?.().then(setPersistant);
  }, []);
  return (
    <ul class="liste-simple carte" style={{ paddingLeft: '2rem' }}>
      <li>Omiyage {__APP_VERSION__} ({__BUILD_DATE__})</li>
      <li>Stockage : {stockage}</li>
      <li>Stockage persistant : {persistant === null ? '…' : persistant ? 'accordé' : 'non accordé (installez l’app sur l’écran d’accueil)'}</li>
      <li>Données locales uniquement, aucune télémétrie.</li>
    </ul>
  );
}

export { Interrupteur };
