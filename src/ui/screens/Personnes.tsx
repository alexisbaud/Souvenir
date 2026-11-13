// Personnes et groupes (§7.2, F-10, F-11, F-12, F-42) : une carte par personne, groupes en zones, glisser-déposer.
import { useState } from 'preact/hooks';
import type { Attribution, CibleSuggestion, DB, Personne, Souvenir, Suggestion } from '../../db/types';
import { MOI_ID } from '../../db/types';
import * as A from '../../domain/actions';
import {
  attributionsDe,
  couverture,
  destinatairesDuVoyage,
  estCollective,
  estPourMoi,
  membresDuGroupe,
  souvenirsDuVoyage,
  type Couverture,
} from '../../domain/rules';
import { normaliser, pluriel, yen } from '../../domain/format';
import { today } from '../../domain/dates';
import { agir, aller, erreur, essayer, fermer, notifier, ouvrir, route } from '../state';
import { groupesTries, nomCategorie, nomEtape, useDb, useVoyage } from '../data';
import { Champ, confirmer, Selecteur, Texte, Vide, ZoneTexte } from '../components/ui';
import { Icon } from '../components/Icon';
import { Avatar, Carte, PuceEtat, Tuile, type Ton } from '../components/visuel';
import { CarteSouvenir } from '../components/CarteSouvenir';
import { ouvrirSaisie } from './Saisie';
import { accepterSuggestion, ecarterSuggestion } from '../../ai/importer';
import { cleConfiguree, demander } from '../../ai/queue';
import { BlocManuel } from './Manuel';
import { memeCible } from '../../ai/context';
import { clicApresGlisse, debutGlisse, glisse, zoneSurvol } from '../glisser';

type Filtre = 'tous' | 'rien' | 'idee' | 'achete' | 'a_donner';

const ZONE_SANS = '_sans';

function pourSelection(p: Personne): A.SelectionCibles {
  return p.id === MOI_ID ? { personnes: [], groupes: [], moi: true } : { personnes: [p.id], groupes: [], moi: false };
}

/** Souvenirs d'une personne (directs et via groupe), triés : achats à donner, idées, donnés */
function cadeauxDe(db: DB, attrs: Attribution[]): { s: Souvenir; ton: Ton; collectif: boolean }[] {
  const vus = new Map<string, { s: Souvenir; ton: Ton; collectif: boolean }>();
  for (const a of attrs) {
    const s = db.souvenirs.find((x) => x.id === a.souvenirId);
    if (!s || vus.has(s.id)) continue;
    const ton: Ton = s.statut === 'idee' ? 'idee' : a.remise === 'donne' ? 'donne' : 'achete';
    vus.set(s.id, { s, ton, collectif: estCollective(a) });
  }
  const ordre: Record<Ton, number> = { achete: 0, idee: 1, donne: 2, rien: 3 };
  return [...vus.values()].sort((a, b) => ordre[a.ton] - ordre[b.ton]);
}

function attributionsMoi(db: DB, voyageId: string): Attribution[] {
  const ids = new Set(souvenirsDuVoyage(db, voyageId).map((s) => s.id));
  return db.attributions.filter((a) => estPourMoi(a) && ids.has(a.souvenirId));
}

// ---------------------------------------------------------------- Liste

export function Personnes() {
  const db = useDb();
  const v = useVoyage();
  const q = route.value.query;
  const [filtre, setFiltre] = useState<Filtre>((q.get('filtre') as Filtre) || 'tous');
  const [recherche, setRecherche] = useState('');
  const [nouveauGroupe, setNouveauGroupe] = useState('');
  const dest = destinatairesDuVoyage(db, v);
  const couv = new Map(dest.map((p) => [p.id, couverture(db, p, v.id)]));
  const garde = (p: Personne) => {
    const c = couv.get(p.id)!;
    if (recherche && !normaliser(p.nom).includes(normaliser(recherche))) return false;
    if (filtre === 'tous') return true;
    if (filtre === 'a_donner') return c.aDonner > 0;
    return c.etat === filtre;
  };
  const enGlisse = !!glisse.value;
  const zones: { id: string; groupeId?: string; titre: string; personnes: Personne[] }[] = groupesTries(db).map((g) => ({
    id: g.id,
    groupeId: g.id,
    titre: g.nom,
    personnes: dest.filter((p) => p.groupeId === g.id),
  }));
  const sansGroupe = dest.filter((p) => !p.groupeId || !db.groupes.some((g) => g.id === p.groupeId));
  if (sansGroupe.length || enGlisse) zones.push({ id: ZONE_SANS, titre: 'Sans groupe', personnes: sansGroupe });

  const couverts = dest.filter((p) => couv.get(p.id)!.etat !== 'rien').length;
  const nbIdees = souvenirsDuVoyage(db, v.id).filter((s) => s.statut === 'idee').length;
  const nbADonner = dest.reduce((n, p) => n + couv.get(p.id)!.aDonner, 0);
  const compte = (f: Filtre) =>
    dest.filter((p) => {
      const c = couv.get(p.id)!;
      return f === 'tous' ? true : f === 'a_donner' ? c.aDonner > 0 : c.etat === f;
    }).length;

  const deplacer = (p: Personne, zone: string) => {
    const groupeId = zone === ZONE_SANS ? undefined : zone;
    if ((p.groupeId ?? undefined) === groupeId) return;
    const g = db.groupes.find((x) => x.id === groupeId);
    void agir((d) => A.modifierPersonne(d, p.id, { nom: p.nom, groupeId, indices: p.indices }), `${p.nom} → ${g ? g.nom : 'sans groupe'}`);
  };

  const moi = db.personnes.find((p) => p.id === MOI_ID)!;
  const moiAttrs = attributionsMoi(db, v.id);

  return (
    <div class="ecran">
      <div class="ecran-tete">
        <div>
          <h1>Personnes</h1>
          <p class="sous-ligne">
            <strong>
              {couverts} sur {dest.length}
            </strong>{' '}
            ont déjà un cadeau · {pluriel(nbIdees, 'idée à acheter', 'idées à acheter')} · {nbADonner} à donner
          </p>
        </div>
        <div class="boutons">
          <button class="btn btn-primaire" onClick={() => ouvrir('Nouvelle personne', () => <FormPersonne />)}>
            <Icon n="plus" taille={16} epaisseur={2.2} /> Personne
          </button>
        </div>
      </div>

      <div class="segments" role="tablist" aria-label="Filtrer">
        {(
          [
            ['tous', 'Tous'],
            ['rien', 'Sans rien'],
            ['idee', 'Idée'],
            ['achete', 'Acheté'],
            ['a_donner', 'À donner'],
          ] as [Filtre, string][]
        ).map(([id, lib]) => (
          <button role="tab" aria-selected={filtre === id} class={'segment' + (filtre === id ? ' actif' : '')} onClick={() => setFiltre(id)}>
            {lib} <small>{compte(id)}</small>
          </button>
        ))}
      </div>
      <div class="barre-recherche">
        <div class="recherche">
          <Icon n="recherche" taille={18} />
          <input type="search" placeholder="Rechercher" aria-label="Rechercher une personne" value={recherche} onInput={(e) => setRecherche((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <div class="boutons" style={{ justifyContent: 'space-between' }}>
        <p class="astuce">
          <Icon n="poignee" taille={16} epaisseur={3} />
          Glissez une carte sur un groupe pour la déplacer (sur téléphone : appui long, puis glisser).
        </p>
        <span class="legende" aria-label="Légende">
          <span>
            <i style={{ border: '2px dashed var(--rien)' }} />
            Rien
          </span>
          <span>
            <i style={{ background: 'var(--idee)' }} />
            Idée
          </span>
          <span>
            <i style={{ background: 'var(--achete)' }} />
            Acheté
          </span>
          <span>
            <i style={{ background: 'var(--donne)' }} />
            Donné
          </span>
        </span>
      </div>

      <div class="zones">
        {filtre === 'tous' && !recherche && (
          <section class="zone" aria-label="Moi">
            <div class="zone-tete">
              <div class="zone-titre">
                <h2>Pour moi</h2>
                <span class="discret">{pluriel(new Set(moiAttrs.map((a) => a.souvenirId)).size, 'souvenir')}</span>
              </div>
            </div>
            <ul class="grille-cartes">
              <CartePersonne db={db} p={moi} ton={moiAttrs.length ? 'achete' : 'rien'} attrs={moiAttrs} />
            </ul>
          </section>
        )}

        {dest.length === 0 && (
          <Vide>Aucun destinataire pour l'instant. Ajoutez une personne, ou créez-la directement depuis « Pour qui ? » en ajoutant un cadeau.</Vide>
        )}

        {zones.map((z) => {
          const visibles = z.personnes.filter(garde);
          if ((filtre !== 'tous' || recherche) && !visibles.length && !enGlisse) return null;
          const nbCouverts = z.personnes.filter((p) => couv.get(p.id)!.etat !== 'rien').length;
          const survol = enGlisse && zoneSurvol.value === z.id;
          return (
            <section class={'zone' + (survol ? ' zone-survol' : '')} data-zone={z.id} aria-label={z.titre}>
              <div class="zone-tete">
                <div class="zone-titre">
                  <h2>{z.groupeId ? <a href={'#/groupes/' + z.groupeId}>{z.titre}</a> : z.titre}</h2>
                  <span class="discret">{z.personnes.length ? `${nbCouverts} sur ${z.personnes.length} ont un cadeau` : 'Groupe vide'}</span>
                </div>
                <div class="zone-progression">
                  <div class="barre" role="presentation">
                    <span style={{ width: `${z.personnes.length ? (nbCouverts / z.personnes.length) * 100 : 0}%` }} />
                  </div>
                  {z.groupeId && (
                    <a class="btn btn-petit" href={'#/groupes/' + z.groupeId}>
                      <Icon n="ia" taille={15} /> Idées pour le groupe
                    </a>
                  )}
                </div>
              </div>
              {z.personnes.length === 0 ? (
                <div class="zone-vide">Glissez des personnes ici</div>
              ) : (
                <ul class="grille-cartes">
                  {visibles.map((p) => {
                    const c = couv.get(p.id)!;
                    return <CartePersonne db={db} p={p} ton={c.etat} attrs={c.attributions} collectif={c.collectif} onDeplacer={(zone) => deplacer(p, zone)} />;
                  })}
                </ul>
              )}
            </section>
          );
        })}

        <section class="zone zone-creation" aria-label="Nouveau groupe">
          <form
            class="nouveau-groupe"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await essayer((d) => A.creerGroupe(d, nouveauGroupe), `Groupe « ${nouveauGroupe.trim()} » créé`)) setNouveauGroupe('');
            }}
          >
            <input type="text" placeholder="Nom d'un nouveau groupe (Voisins, Club…)" aria-label="Nom du nouveau groupe" value={nouveauGroupe} onInput={(e) => setNouveauGroupe((e.target as HTMLInputElement).value)} />
            <button type="submit" class="btn">
              <Icon n="plus" taille={16} epaisseur={2.2} /> Créer le groupe
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function CartePersonne(props: { db: DB; p: Personne; ton: Couverture; attrs: Attribution[]; collectif?: boolean; onDeplacer?: (zone: string) => void }) {
  const { db, p } = props;
  const cadeaux = cadeauxDe(db, props.attrs);
  const MAX = 4;
  const enGlisse = glisse.value?.id === p.id;
  return (
    <li>
      <article
        class={'carte-personne' + (props.onDeplacer ? ' deplacable' : '') + (enGlisse ? ' en-glisse' : '')}
        aria-label={p.nom}
        onPointerDown={props.onDeplacer ? debutGlisse(p.id, p.nom, props.onDeplacer) : undefined}
        onClickCapture={clicApresGlisse}
      >
        <a class="carte-personne-tete" href={'#/personnes/' + p.id} draggable={false}>
          <Avatar personne={p} ton={props.ton} taille={48} />
          <span class="carte-personne-nom">
            <strong>{p.nom}</strong>
            {p.id === MOI_ID ? (
              <span class="discret">Achats pour soi</span>
            ) : (
              <PuceEtat ton={props.ton} libelle={props.collectif ? `${props.ton === 'donne' ? 'Donné' : 'Acheté'} · collectif` : undefined} />
            )}
          </span>
          {props.onDeplacer && (
            <span class="poignee" aria-hidden="true">
              <Icon n="poignee" taille={20} epaisseur={3} />
            </span>
          )}
        </a>
        {cadeaux.length === 0 ? (
          <p class="vide">Pas encore d'idée pour {p.id === MOI_ID ? 'vous' : p.nom}.</p>
        ) : (
          <ul class="cadeaux-mini">
            {cadeaux.slice(0, MAX).map((c) => (
              <li class={'ton-' + c.ton}>
                <a href={'#/souvenirs/' + c.s.id} draggable={false}>
                  <Tuile s={c.s} ton={c.ton} taille={32} />
                  <span class="nom">{c.s.nom}</span>
                </a>
                {c.collectif && <span class="puce puce-collectif">collectif</span>}
                <span class="etat">{c.ton === 'idee' ? 'Idée' : c.ton === 'donne' ? 'Donné' : 'Acheté'}</span>
              </li>
            ))}
            {cadeaux.length > MAX && <li class="discret">+ {cadeaux.length - MAX} autres</li>}
          </ul>
        )}
        <div class="carte-personne-pied">
          <button type="button" class="btn btn-petit btn-pointille" onClick={() => ouvrirSaisie({ pour: pourSelection(p) })}>
            <Icon n="plus" taille={15} epaisseur={2.2} /> Idée{p.id === MOI_ID ? '' : ` pour ${p.nom}`}
          </button>
        </div>
      </article>
    </li>
  );
}

export function FormPersonne(props: { personne?: Personne }) {
  const db = useDb();
  const p = props.personne;
  const [nom, setNom] = useState(p?.nom ?? '');
  const [groupe, setGroupe] = useState(p?.groupeId ?? '');
  const doublon = nom.trim() && A.homonymes(db.personnes, nom, p?.id);
  return (
    <form
      class="pile"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await essayer(
          (d) => (p ? A.modifierPersonne(d, p.id, { nom, groupeId: groupe, indices: p.indices }) : A.creerPersonne(d, { nom, groupeId: groupe })),
          p ? 'Personne modifiée' : 'Personne ajoutée',
        );
        if (ok) fermer();
      }}
    >
      <Champ label="Nom">
        <Texte valeur={nom} onValeur={setNom} autoFocus required placeholder="Prénom ou surnom" />
      </Champ>
      {doublon && <p class="avert">Une personne porte déjà ce nom (autorisé).</p>}
      <Champ label="Groupe">
        <Selecteur valeur={groupe} onValeur={setGroupe} vide="Sans groupe" options={groupesTries(db).map((g) => ({ id: g.id, libelle: g.nom }))} />
      </Champ>
      <div class="actions">
        <button type="submit" class="btn btn-primaire btn-large">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Fiche personne

/** Cartes des souvenirs d'une personne, avec l'action « Donné » sur les achats */
function SouvenirsDe({ db, attributions, nom }: { db: DB; attributions: Attribution[]; nom: string }) {
  const ids = [...new Set(attributions.map((a) => a.souvenirId))];
  const souvenirs = ids.map((id) => db.souvenirs.find((s) => s.id === id)!).filter(Boolean);
  const mine = (s: Souvenir) => attributions.filter((a) => a.souvenirId === s.id);
  const groupes: [string, Souvenir[]][] = [
    ['À donner', souvenirs.filter((s) => s.statut === 'achete' && mine(s).some((a) => a.remise !== 'donne' && !estPourMoi(a)))],
    ['Idées à acheter', souvenirs.filter((s) => s.statut === 'idee')],
    ['Pour moi', souvenirs.filter((s) => s.statut === 'achete' && mine(s).every(estPourMoi))],
    ['Donnés', souvenirs.filter((s) => s.statut === 'achete' && mine(s).every((a) => a.remise === 'donne'))],
  ];
  if (!souvenirs.length) return <Vide>Rien pour {nom} pour l'instant.</Vide>;
  return (
    <>
      {groupes.map(([titre, l]) =>
        l.length ? (
          <>
            <h3 class="sous-titre">{titre}</h3>
            <ul class="cartes-souvenirs">
              {l.map((s) => (
                <CarteSouvenir db={db} s={s} attrs={attributionsDe(db, s.id)}>
                  {(mine(s).some(estCollective) || (s.statut === 'achete' && mine(s).some((a) => !estPourMoi(a)))) && (
                    <div class="boutons">
                      {mine(s).some(estCollective) && <span class="puce puce-collectif">collectif</span>}
                      {s.statut === 'achete' &&
                        mine(s)
                          .filter((a) => !estPourMoi(a))
                          .map((a) =>
                            a.remise === 'donne' ? (
                              <button class="btn btn-petit btn-donne fait" onClick={() => agir((d) => A.annulerRemise(d, a.id), 'Remise annulée')}>
                                <Icon n="ok" taille={16} epaisseur={2.4} /> Donné · annuler
                              </button>
                            ) : (
                              <button class="btn btn-petit btn-donne" onClick={() => agir((d) => A.donner(d, a.id, today()), `« ${s.nom} » donné`)}>
                                Donné
                              </button>
                            ),
                          )}
                    </div>
                  )}
                </CarteSouvenir>
              ))}
            </ul>
          </>
        ) : null,
      )}
    </>
  );
}

export function PersonneFiche({ id }: { id: string }) {
  const db = useDb();
  const v = useVoyage();
  const p = db.personnes.find((x) => x.id === id);
  if (!p) return <Introuvable />;
  const moi = p.id === MOI_ID;
  const c = couverture(db, p, v.id);
  const groupe = db.groupes.find((g) => g.id === p.groupeId);
  const cible: CibleSuggestion = moi ? { type: 'moi' } : { type: 'personne', id: p.id };
  const attrs = moi ? attributionsMoi(db, v.id) : c.attributions;
  return (
    <div class="ecran etroit">
      <div class="barre-fiche">
        <Retour href="personnes" libelle="Personnes" />
        {!moi && (
          <div class="boutons">
            <button class="btn-icone" aria-label="Modifier" onClick={() => ouvrir('Modifier', () => <FormPersonne personne={p} />)}>
              <Icon n="modifier" />
            </button>
            <button
              class="btn-icone"
              aria-label="Supprimer"
              onClick={() =>
                confirmer(`Supprimer ${p.nom} ?`, 'La personne est retirée de ses attributions. Les souvenirs restent.', 'Supprimer', async () => {
                  aller('personnes');
                  await agir((d) => A.supprimerPersonne(d, p.id), `${p.nom} supprimé·e`);
                })
              }
            >
              <Icon n="corbeille" />
            </button>
          </div>
        )}
      </div>
      <div class="tete-personne">
        <Avatar personne={p} ton={moi ? undefined : c.etat} taille={72} />
        <div class="pile" style={{ gap: '6px' }}>
          <h1>{p.nom}</h1>
          <span class="discret">{moi ? 'Achats pour moi' : groupe ? groupe.nom : 'Sans groupe'}</span>
          {!moi && <PuceEtat ton={c.etat} libelle={c.collectif ? `${c.etat === 'donne' ? 'Donné' : 'Acheté'} · collectif` : undefined} />}
        </div>
      </div>
      <button class="btn btn-primaire btn-large" onClick={() => ouvrirSaisie({ pour: pourSelection(p) })}>
        <Icon n="plus" taille={18} epaisseur={2.2} /> Ajouter une idée ou un achat {moi ? 'pour moi' : `pour ${p.nom}`}
      </button>
      <Carte titre="Cadeaux">
        <SouvenirsDe db={db} attributions={attrs} nom={moi ? 'vous' : p.nom} />
      </Carte>
      <Suggestions cible={cible} nom={moi ? 'moi' : p.nom} />
      {!moi && <Indices personne={p} />}
    </div>
  );
}

function Indices({ personne }: { personne: Personne }) {
  const [t, setT] = useState(personne.indices ?? '');
  return (
    <Carte titre="Indices pour l'IA">
      <ZoneTexte valeur={t} onValeur={setT} placeholder="Ex. aime le thé, cuisine beaucoup" />
      <p class="champ-aide">Facultatif. Envoyé tel quel à l'IA pour les suggestions (le prénom ne l'est pas, sauf option).</p>
      <button class="btn btn-petit" style={{ alignSelf: 'flex-start' }} onClick={() => agir((d) => A.modifierIndices(d, personne.id, t), 'Indices enregistrés')}>
        Enregistrer
      </button>
    </Carte>
  );
}

export function GroupeFiche({ id }: { id: string }) {
  const db = useDb();
  const v = useVoyage();
  const g = db.groupes.find((x) => x.id === id);
  if (!g) return <Introuvable />;
  const membres = membresDuGroupe(db, v, g.id);
  const collectifs = db.attributions.filter(
    (a) => a.cible.type === 'groupe' && a.cible.groupeId === g.id && db.souvenirs.some((s) => s.id === a.souvenirId && s.voyageId === v.id),
  );
  return (
    <div class="ecran etroit">
      <Retour href="personnes" libelle="Personnes" />
      <div class="ecran-tete">
        <div>
          <h1>Groupe {g.nom}</h1>
          <p class="sous-ligne">{pluriel(membres.length, 'membre')}</p>
        </div>
      </div>
      <button class="btn btn-primaire btn-large" onClick={() => ouvrirSaisie({ pour: { personnes: [], groupes: [g.id], moi: false } })}>
        <Icon n="plus" taille={18} epaisseur={2.2} /> Cadeau collectif pour le groupe
      </button>
      <Carte titre="Membres">
        {membres.length === 0 ? (
          <Vide>Aucun membre. Glissez des personnes dans ce groupe depuis l'écran Personnes.</Vide>
        ) : (
          <div class="choix-pour">
            {membres.map((p) => {
              const c = couverture(db, p, v.id);
              return (
                <a href={'#/personnes/' + p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', textDecoration: 'none', color: 'inherit' }}>
                  <Avatar personne={p} ton={c.etat} taille={50} />
                  <span class="nom-avatar">{p.nom}</span>
                </a>
              );
            })}
          </div>
        )}
      </Carte>
      <Carte titre="Cadeaux collectifs du groupe">
        <SouvenirsDe db={db} attributions={collectifs} nom={`le groupe ${g.nom}`} />
      </Carte>
      <Suggestions cible={{ type: 'groupe', id: g.id }} nom={`le groupe ${g.nom}`} />
    </div>
  );
}

// ---------------------------------------------------------------- Suggestions IA (F-42)

export function Suggestions({ cible, nom }: { cible: CibleSuggestion; nom: string }) {
  const db = useDb();
  const v = useVoyage();
  const liste = db.suggestions.filter((s) => s.voyageId === v.id && memeCible(s.cible, cible) && s.statut === 'nouvelle');
  const job = db.jobs
    .filter((j) => j.demande.type === 'suggestions' && memeCible(j.demande.cible, cible))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const etatJob = job && job.statut !== 'terminee' ? job : undefined;
  return (
    <Carte
      titre={
        <>
          <Icon n="ia" taille={18} /> Idées de cadeaux
        </>
      }
    >
      <div class="boutons">
        {cleConfiguree.value && (
          <button
            class="btn btn-contour"
            disabled={etatJob?.statut === 'file' || etatJob?.statut === 'en_cours'}
            onClick={async () => {
              try {
                await demander([{ type: 'suggestions', cible }]);
                notifier('Demande de suggestions en file');
              } catch (e) {
                erreur(e);
              }
            }}
          >
            Suggestions pour {nom}
          </button>
        )}
        <button class="btn" onClick={() => ouvrir('Mode manuel (app Claude)', () => <BlocManuel demande={{ type: 'suggestions', cible }} />)}>
          Via l'app Claude
        </button>
      </div>
      {etatJob && <EtatJob statut={etatJob.statut} erreur={etatJob.erreur} />}
      {liste.length === 0 ? (
        <Vide>{cleConfiguree.value ? 'Aucune suggestion en attente.' : 'Ajoutez une clé API dans les paramètres, ou passez par l’app Claude.'}</Vide>
      ) : (
        <ul class="cartes-souvenirs">
          {liste.map((s) => (
            <CarteSuggestion s={s} />
          ))}
        </ul>
      )}
    </Carte>
  );
}

export function EtatJob({ statut, erreur: err }: { statut: string; erreur?: string }) {
  const lib: Record<string, string> = { file: 'En file d’attente…', en_cours: 'Recherche en cours…', terminee: 'Terminée', echec: 'Échec' };
  return (
    <p class={'etat-job' + (statut === 'echec' ? ' alerte-texte' : '')} role="status">
      {lib[statut] ?? statut}
      {err ? ` : ${err}` : ''}
    </p>
  );
}

function CarteSuggestion({ s }: { s: Suggestion }) {
  const db = useDb();
  return (
    <li class="carte-souvenir carte-suggestion">
      <div class="carte-souvenir-tete">
        <Tuile s={{ categorieId: s.categorieId }} ton="idee" taille={48} />
        <span class="carte-souvenir-texte">
          <span class="carte-souvenir-nom" style={{ whiteSpace: 'normal' }}>
            {s.nom}
          </span>
          <span class="carte-souvenir-meta">
            {nomCategorie(db, s.categorieId)}
            {(s.prixMinYen !== undefined || s.prixMaxYen !== undefined) && (
              <>
                {' · '}
                {s.prixMinYen !== undefined ? yen(s.prixMinYen) : ''}
                {s.prixMaxYen !== undefined && s.prixMaxYen !== s.prixMinYen ? ` – ${yen(s.prixMaxYen)}` : ''}
              </>
            )}
            {s.quantiteConseillee && s.quantiteConseillee > 1 ? ` · ×${s.quantiteConseillee}` : ''}
          </span>
        </span>
      </div>
      {s.description && <p>{s.description}</p>}
      {s.pourquoi && <p class="discret">{s.pourquoi}</p>}
      {s.lieux.length > 0 && (
        <p class="discret petite">
          <Icon n="carte" taille={14} /> {s.lieux.map((l) => `${l.nom} (${l.etapeIds.map((e) => nomEtape(db, e)).join(', ')})`).join(' · ')}
        </p>
      )}
      {s.alertes.map((a) => (
        <p class="alerte-texte petite">
          <Icon n="alerte" taille={14} /> {a}
        </p>
      ))}
      <div class="boutons">
        <button class="btn btn-primaire btn-petit" onClick={() => agir((d) => accepterSuggestion(d, s.id), `Idée « ${s.nom} » créée`)}>
          Accepter
        </button>
        <button class="btn btn-petit" onClick={() => agir((d) => ecarterSuggestion(d, s.id), 'Suggestion écartée')}>
          Écarter
        </button>
      </div>
    </li>
  );
}

export function Retour({ href, libelle = 'Retour' }: { href: string; libelle?: string }) {
  return (
    <a class="retour-lien" href={'#/' + href}>
      <Icon n="retourArriere" taille={20} epaisseur={2} /> {libelle}
    </a>
  );
}

export function Introuvable() {
  return (
    <div class="ecran etroit">
      <Retour href="ici" />
      <Vide>Élément introuvable (supprimé ?).</Vide>
    </div>
  );
}

export type { Couverture };
