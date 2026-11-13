// Personnes et groupes (§7.2, F-10, F-11, F-12, F-42).
import { useState } from 'preact/hooks';
import type { CibleSuggestion, DB, Personne, Suggestion } from '../../db/types';
import { MOI_ID } from '../../db/types';
import * as A from '../../domain/actions';
import {
  attributionsDe,
  attributionsDePersonne,
  couverture,
  destinatairesDuVoyage,
  estCollective,
  estPourMoi,
  membresDuGroupe,
  type Couverture,
} from '../../domain/rules';
import { normaliser, pluriel, yen } from '../../domain/format';
import { today } from '../../domain/dates';
import { agir, aller, erreur, essayer, fermer, notifier, ouvrir, route } from '../state';
import { groupesTries, nomCategorie, nomEtape, useDb, useVoyage } from '../data';
import { BadgeCouverture, Champ, confirmer, Section, Segments, Selecteur, Texte, Vide, ZoneTexte } from '../components/ui';
import { Icon } from '../components/Icon';
import { SouvenirLigne } from '../components/SouvenirLigne';
import { ouvrirSaisie } from './Saisie';
import { accepterSuggestion, ecarterSuggestion } from '../../ai/importer';
import { cleConfiguree, demander } from '../../ai/queue';
import { BlocManuel } from './Manuel';
import { memeCible } from '../../ai/context';

type Filtre = 'tous' | 'rien' | 'idee' | 'achete' | 'a_donner';

export function Personnes() {
  const db = useDb();
  const v = useVoyage();
  const q = route.value.query;
  const [filtre, setFiltre] = useState<Filtre>((q.get('filtre') as Filtre) || 'tous');
  const [recherche, setRecherche] = useState('');
  const dest = destinatairesDuVoyage(db, v);
  const couv = new Map(dest.map((p) => [p.id, couverture(db, p, v.id)]));
  const garde = (p: Personne) => {
    const c = couv.get(p.id)!;
    if (recherche && !normaliser(p.nom).includes(normaliser(recherche))) return false;
    if (filtre === 'tous') return true;
    if (filtre === 'a_donner') return c.aDonner > 0;
    return c.etat === filtre;
  };
  const sections: { id: string; titre: string; personnes: Personne[] }[] = groupesTries(db).map((g) => ({
    id: g.id,
    titre: g.nom,
    personnes: dest.filter((p) => p.groupeId === g.id),
  }));
  const sansGroupe = dest.filter((p) => !p.groupeId || !db.groupes.some((g) => g.id === p.groupeId));
  if (sansGroupe.length) sections.push({ id: '', titre: 'Sans groupe', personnes: sansGroupe });
  const moi = db.personnes.find((p) => p.id === MOI_ID)!;
  const nbMoi = db.attributions.filter((a) => estPourMoi(a) && db.souvenirs.some((s) => s.id === a.souvenirId && s.voyageId === v.id)).length;

  return (
    <div class="ecran">
      <div class="ecran-tete">
        <h1>Personnes</h1>
        <button class="btn btn-petit" onClick={() => ouvrir('Nouvelle personne', () => <FormPersonne />)}>
          <Icon n="plus" taille={16} /> Personne
        </button>
      </div>
      <Segments
        label="Filtrer"
        valeur={filtre}
        onChange={setFiltre}
        valeurs={[
          { id: 'tous', libelle: 'Tous' },
          { id: 'rien', libelle: 'Rien' },
          { id: 'idee', libelle: 'Idée' },
          { id: 'achete', libelle: 'Acheté' },
          { id: 'a_donner', libelle: 'À donner' },
        ]}
      />
      <div class="recherche">
        <Icon n="recherche" taille={18} />
        <input type="search" placeholder="Rechercher" aria-label="Rechercher une personne" value={recherche} onInput={(e) => setRecherche((e.target as HTMLInputElement).value)} />
      </div>

      {filtre === 'tous' && !recherche && (
        <ul class="liste">
          <li>
            <a class="ligne-lien personne-ligne" href={'#/personnes/' + MOI_ID}>
              <span class="ligne-titre">{moi.nom}</span>
              <span class="discret">{pluriel(nbMoi, 'souvenir')}</span>
            </a>
          </li>
        </ul>
      )}

      {dest.length === 0 ? (
        <Vide>Aucun destinataire pour l'instant. Ajoutez une personne, ou créez-la directement depuis « Pour qui » en saisissant un souvenir.</Vide>
      ) : (
        sections.map((sec) => {
          const visibles = sec.personnes.filter(garde);
          if (filtre !== 'tous' || recherche) if (!visibles.length) return null;
          const couverts = sec.personnes.filter((p) => couv.get(p.id)!.etat !== 'rien').length;
          return (
            <Section
              repliable
              titre={`${sec.titre} · ${couverts}/${sec.personnes.length} couverts`}
              action={
                sec.id && (
                  <a class="btn btn-petit" href={'#/groupes/' + sec.id}>
                    Groupe
                  </a>
                )
              }
            >
              {visibles.length === 0 ? (
                <Vide>Personne dans ce groupe.</Vide>
              ) : (
                <ul class="liste">
                  {visibles.map((p) => {
                    const c = couv.get(p.id)!;
                    return (
                      <li>
                        <a class="ligne-lien personne-ligne" href={'#/personnes/' + p.id}>
                          <span class="ligne-titre">{p.nom}</span>
                          <span class="personne-droite">
                            <BadgeCouverture etat={c.etat} collectif={c.collectif} />
                            <span class="discret">{c.nbSouvenirs}</span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          );
        })
      )}
    </div>
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

/** Souvenirs d'une personne, y compris via cadeaux collectifs (F-12 CA3) */
function ListeSouvenirsDe(props: { db: DB; attributions: ReturnType<typeof attributionsDePersonne> }) {
  const { db } = props;
  const ids = [...new Set(props.attributions.map((a) => a.souvenirId))];
  const souvenirs = ids.map((id) => db.souvenirs.find((s) => s.id === id)!).filter(Boolean);
  const groupes: [string, typeof souvenirs][] = [
    ['Idées', souvenirs.filter((s) => s.statut === 'idee')],
    ['Achats', souvenirs.filter((s) => s.statut === 'achete' && props.attributions.some((a) => a.souvenirId === s.id && a.remise !== 'donne'))],
    ['Donnés', souvenirs.filter((s) => s.statut === 'achete' && props.attributions.filter((a) => a.souvenirId === s.id).every((a) => a.remise === 'donne'))],
  ];
  if (!souvenirs.length) return <Vide>Rien pour l'instant.</Vide>;
  return (
    <>
      {groupes.map(([titre, l]) =>
        l.length ? (
          <>
            <h4 class="sous-titre">{titre}</h4>
            <ul class="liste">
              {l.map((s) => {
                const mine = props.attributions.filter((a) => a.souvenirId === s.id);
                return (
                  <SouvenirLigne
                    db={db}
                    s={s}
                    attrs={attributionsDe(db, s.id)}
                    extra={
                      <div class="ligne-actions">
                        {mine.some(estCollective) && <span class="puce puce-collectif">collectif</span>}
                        {s.statut === 'achete' &&
                          mine
                            .filter((a) => !estPourMoi(a))
                            .map((a) =>
                              a.remise === 'donne' ? (
                                <button class="btn btn-petit" onClick={() => agir((d) => A.annulerRemise(d, a.id), 'Remise annulée')}>
                                  Annuler « Donné »
                                </button>
                              ) : (
                                <button class="btn btn-petit btn-primaire" onClick={() => agir((d) => A.donner(d, a.id, today()), `« ${s.nom} » donné`)}>
                                  Donné
                                </button>
                              ),
                            )}
                      </div>
                    }
                  />
                );
              })}
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
  return (
    <div class="ecran">
      <Retour href="personnes" />
      <div class="ecran-tete">
        <div>
          <h1>{p.nom}</h1>
          <p class="discret">
            {moi ? 'Achats pour moi' : groupe ? groupe.nom : 'Sans groupe'}
            {!moi && (
              <>
                {' · '}
                <BadgeCouverture etat={c.etat} collectif={c.collectif} />
              </>
            )}
          </p>
        </div>
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
      <div class="boutons">
        <button class="btn" onClick={() => ouvrirSaisie('idee', { pour: moi ? { personnes: [], groupes: [], moi: true } : { personnes: [p.id], groupes: [], moi: false } })}>
          <Icon n="plus" taille={16} /> Idée pour {p.nom}
        </button>
        <button class="btn" onClick={() => ouvrirSaisie('achat', { pour: moi ? { personnes: [], groupes: [], moi: true } : { personnes: [p.id], groupes: [], moi: false } })}>
          <Icon n="plus" taille={16} /> Achat
        </button>
      </div>
      <Section titre="Souvenirs">
        <ListeSouvenirsDe db={db} attributions={moi ? db.attributions.filter((a) => estPourMoi(a) && db.souvenirs.some((s) => s.id === a.souvenirId && s.voyageId === v.id)) : c.attributions} />
      </Section>
      <Suggestions cible={cible} nom={p.nom} />
      {!moi && (
        <Section titre="Indices pour l'IA" repliable ouvert={false}>
          <Indices personne={p} />
        </Section>
      )}
    </div>
  );
}

function Indices({ personne }: { personne: Personne }) {
  const [t, setT] = useState(personne.indices ?? '');
  return (
    <div class="pile">
      <ZoneTexte valeur={t} onValeur={setT} placeholder="Ex. aime le thé, cuisine beaucoup" />
      <p class="champ-aide">Facultatif. Envoyé tel quel à l'IA pour les suggestions (le prénom ne l'est pas, sauf option).</p>
      <button class="btn btn-petit" onClick={() => agir((d) => A.modifierIndices(d, personne.id, t), 'Indices enregistrés')}>
        Enregistrer
      </button>
    </div>
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
    <div class="ecran">
      <Retour href="personnes" />
      <div class="ecran-tete">
        <h1>Groupe {g.nom}</h1>
        <button class="btn btn-petit" onClick={() => ouvrirSaisie('idee', { pour: { personnes: [], groupes: [g.id], moi: false } })}>
          <Icon n="plus" taille={16} /> Cadeau collectif
        </button>
      </div>
      <Section titre={`Membres (${membres.length})`}>
        {membres.length === 0 ? (
          <Vide>Aucun membre.</Vide>
        ) : (
          <ul class="liste">
            {membres.map((p) => {
              const c = couverture(db, p, v.id);
              return (
                <li>
                  <a class="ligne-lien personne-ligne" href={'#/personnes/' + p.id}>
                    <span class="ligne-titre">{p.nom}</span>
                    <BadgeCouverture etat={c.etat} collectif={c.collectif} />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section titre="Cadeaux collectifs du groupe">
        <ListeSouvenirsDe db={db} attributions={collectifs} />
      </Section>
      <Suggestions cible={{ type: 'groupe', id: g.id }} nom={`le groupe ${g.nom}`} />
    </div>
  );
}

/** Suggestions de cadeaux IA (F-42) */
export function Suggestions({ cible, nom }: { cible: CibleSuggestion; nom: string }) {
  const db = useDb();
  const v = useVoyage();
  const liste = db.suggestions.filter((s) => s.voyageId === v.id && memeCible(s.cible, cible) && s.statut === 'nouvelle');
  const job = db.jobs
    .filter((j) => j.demande.type === 'suggestions' && memeCible(j.demande.cible, cible))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const etatJob = job && job.statut !== 'terminee' ? job : undefined;
  return (
    <Section titre={<><Icon n="ia" taille={16} /> Suggestions de cadeaux</>}>
      <div class="boutons">
        {cleConfiguree.value && (
          <button
            class="btn"
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
        <Vide>{cleConfiguree.value ? 'Aucune suggestion en attente.' : 'Configurez une clé API dans les paramètres, ou utilisez le mode manuel.'}</Vide>
      ) : (
        <ul class="liste">
          {liste.map((s) => (
            <CarteSuggestion s={s} />
          ))}
        </ul>
      )}
    </Section>
  );
}

export function EtatJob({ statut, erreur: err }: { statut: string; erreur?: string }) {
  const lib: Record<string, string> = { file: 'En file', en_cours: 'En cours…', terminee: 'Terminée', echec: 'Échec' };
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
    <li class="carte-suggestion">
      <div>
        <strong>{s.nom}</strong>
        {(s.prixMinYen !== undefined || s.prixMaxYen !== undefined) && (
          <span class="discret">
            {' '}
            · {s.prixMinYen !== undefined ? yen(s.prixMinYen) : ''}
            {s.prixMaxYen !== undefined && s.prixMaxYen !== s.prixMinYen ? ` – ${yen(s.prixMaxYen)}` : ''}
          </span>
        )}
        {s.quantiteConseillee && s.quantiteConseillee > 1 && <span class="discret"> · ×{s.quantiteConseillee}</span>}
      </div>
      {s.description && <p>{s.description}</p>}
      {s.pourquoi && <p class="discret">{s.pourquoi}</p>}
      {nomCategorie(db, s.categorieId) && <span class="puce">{nomCategorie(db, s.categorieId)}</span>}
      {s.lieux.length > 0 && (
        <ul class="liste-simple petite">
          {s.lieux.map((l) => (
            <li>
              {l.nom} · {l.etapeIds.map((e) => nomEtape(db, e)).join(', ')}
            </li>
          ))}
        </ul>
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

export function Retour({ href }: { href: string }) {
  return (
    <a class="retour-lien" href={'#/' + href}>
      <Icon n="retourArriere" taille={18} /> Retour
    </a>
  );
}

export function Introuvable() {
  return (
    <div class="ecran">
      <Retour href="ici" />
      <Vide>Élément introuvable (supprimé ?).</Vide>
    </div>
  );
}

export type { Couverture };
