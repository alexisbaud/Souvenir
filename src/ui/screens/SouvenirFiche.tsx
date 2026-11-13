// Fiche souvenir (§7.3, F-22, F-23, F-24, F-26, F-33, F-41, F-50).
import { useEffect, useState } from 'preact/hooks';
import type { Attribution, Cible, Lieu, LieuData, Souvenir, TypeLieu } from '../../db/types';
import { MOI_ID } from '../../db/types';
import * as A from '../../domain/actions';
import {
  attributionsDe,
  estCollective,
  estPourMoi,
  etatSouvenir,
  etapesDuVoyage,
  etapesPossiblesRestantes,
  etatTicket,
  lieuxDe,
  nomCible,
  prixYen,
  unitesAttribuees,
} from '../../domain/rules';
import { formatDate, today } from '../../domain/dates';
import { euro, lienCarte, nombre, parseNombre, yen } from '../../domain/format';
import { agir, aller, erreur, essayer, fermer, notifier, ouvrir } from '../state';
import { categoriesTriees, nomEtape, useDb, useJour, useVoyage } from '../data';
import { BadgeEtat, Champ, confirmer, Interrupteur, LienExterne, Plier, Section, Selecteur, Texte, Vide, ZoneTexte } from '../components/ui';
import { Icon } from '../components/Icon';
import { EtapeSelect, EtapesChoix, RetourChamps } from '../components/champs';
import { PourQui } from '../components/PourQui';
import { enregistrerPhoto, urlPhoto } from '../components/photo';
import { ouvrirSaisie, Quantite } from './Saisie';
import { Introuvable, Retour as RetourLien, EtatJob } from './Personnes';
import { cleConfiguree, demander, jobPour } from '../../ai/queue';
import { BlocManuel } from './Manuel';

export function SouvenirFiche({ id }: { id: string }) {
  const db = useDb();
  const v = useVoyage();
  const s = db.souvenirs.find((x) => x.id === id);
  if (!s) return <Introuvable />;
  const attrs = attributionsDe(db, s.id);
  const etat = etatSouvenir(s, attrs);
  return (
    <div class="ecran fiche">
      <RetourLien href={s.statut === 'idee' ? 'souvenirs?seg=idees' : 'souvenirs?seg=achetes'} />
      <div class="ecran-tete">
        <div>
          <h1>{s.nom}</h1>
          <p class="discret">
            <BadgeEtat etat={etat} />
            {s.origine === 'ia' && <span class="puce-ia">IA</span>}
          </p>
        </div>
        <div class="boutons">
          {s.statut === 'idee' ? (
            <button class="btn btn-primaire" onClick={() => ouvrirSaisie('achat', { ideeId: s.id })}>
              Marquer acheté
            </button>
          ) : (
            <button
              class="btn btn-petit"
              onClick={() =>
                confirmer('Revenir à l’idée ?', 'Les informations d’achat (prix, boutique, détaxe) seront effacées. Les attributions sont conservées.', 'Revenir à l’idée', () =>
                  agir((d) => A.revenirIdee(d, s.id), 'Repassé en idée'),
                )
              }
            >
              Revenir à l'idée
            </button>
          )}
          <button
            class="btn-icone"
            aria-label="Supprimer"
            onClick={async () => {
              aller(s.statut === 'idee' ? 'souvenirs?seg=idees' : 'souvenirs?seg=achetes');
              await agir((d) => A.supprimerSouvenir(d, s.id), `« ${s.nom} » supprimé`);
            }}
          >
            <Icon n="corbeille" />
          </button>
        </div>
      </div>

      <Essentiel s={s} />
      <PourQuiSection s={s} attrs={attrs} />
      <OuAcheter s={s} />
      {s.statut === 'achete' && s.achat && <AchatSection s={s} />}
      <Section titre="Retour" repliable ouvert={!!(s.retour.alcool || s.retour.tranchant || s.retour.liquide)}>
        <RetourChamps
          valeur={s.retour}
          achete={s.statut === 'achete'}
          onChange={(m) => agir((d) => A.modifierRetour(d, s.id, m))}
        />
      </Section>
      <Section titre="Historique" repliable ouvert={false}>
        <ul class="liste-simple">
          <li>Créé le {formatDate(s.createdAt.slice(0, 10))}</li>
          {s.achat && <li>Acheté le {formatDate(s.achat.date)} à {nomEtape(db, s.achat.etapeId)}</li>}
          {attrs
            .filter((a) => a.remise === 'donne' && a.dateRemise)
            .map((a) => (
              <li>
                Donné à {nomCible(db, a)} le {formatDate(a.dateRemise!)}
              </li>
            ))}
        </ul>
      </Section>
      {v && null}
    </div>
  );
}

// ---------------------------------------------------------------- Essentiel

function Essentiel({ s }: { s: Souvenir }) {
  const db = useDb();
  const [nom, setNom] = useState(s.nom);
  const [note, setNote] = useState(s.note ?? '');
  useEffect(() => setNom(s.nom), [s.nom]);
  useEffect(() => setNote(s.note ?? ''), [s.note]);
  return (
    <Section titre="Essentiel">
      <div class="pile">
        <Champ label="Nom">
          <Texte valeur={nom} onValeur={setNom} onBlur={() => nom.trim() !== s.nom && agir((d) => A.modifierSouvenir(d, s.id, { nom }))} />
        </Champ>
        <div class="grille2">
          <Champ label="Catégorie">
            <Selecteur
              valeur={s.categorieId ?? ''}
              onValeur={(c) => agir((d) => A.modifierSouvenir(d, s.id, { categorieId: c || null }))}
              vide="—"
              options={categoriesTriees(db).map((c) => ({ id: c.id, libelle: c.libelle }))}
            />
          </Champ>
          <Champ groupe label="Quantité">
            <Quantite valeur={s.quantite} onChange={(n) => agir((d) => A.modifierSouvenir(d, s.id, { quantite: n }))} />
          </Champ>
        </div>
        <Champ label="Note">
          <ZoneTexte valeur={note} onValeur={setNote} rows={2} />
        </Champ>
        {note !== (s.note ?? '') && (
          <button class="btn btn-petit" onClick={() => agir((d) => A.modifierSouvenir(d, s.id, { note }))}>
            Enregistrer la note
          </button>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- Pour qui (F-23)

function PourQuiSection({ s, attrs }: { s: Souvenir; attrs: Attribution[] }) {
  const db = useDb();
  const k = unitesAttribuees(attrs);
  return (
    <Section
      titre={`Pour qui · ${k}/${s.quantite} attribués`}
      action={
        <button class="btn btn-petit" onClick={() => ouvrir('Attribuer', () => <FormAttribution s={s} />)}>
          <Icon n="plus" taille={16} /> Attribuer
        </button>
      }
    >
      {attrs.length === 0 ? (
        <Vide>Personne pour l'instant.</Vide>
      ) : (
        <ul class="liste">
          {attrs.map((a) => (
            <li class="attribution">
              <div class="attribution-tete">
                <span>
                  <strong>{estPourMoi(a) ? 'Moi' : nomCible(db, a)}</strong>
                  {estCollective(a) && <span class="puce puce-collectif">collectif</span>}
                </span>
                <Quantite valeur={a.quantite} onChange={(n) => agir((d) => A.modifierAttribution(d, a.id, { quantite: n }))} />
              </div>
              <div class="ligne-actions">
                {s.statut === 'achete' && !estPourMoi(a) &&
                  (a.remise === 'donne' ? (
                    <>
                      <span class="badge badge-donne">✓ Donné le {formatDate(a.dateRemise!)}</span>
                      <button class="btn btn-petit" onClick={() => agir((d) => A.annulerRemise(d, a.id), 'Remise annulée')}>
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button class="btn btn-petit btn-primaire" onClick={() => agir((d) => A.donner(d, a.id, today()), 'Marqué donné')}>
                      Donné
                    </button>
                  ))}
                <button class="btn btn-petit" onClick={() => ouvrir('Modifier l’attribution', () => <FormAttribution s={s} attribution={a} />)}>
                  Modifier
                </button>
                <button class="btn btn-petit" onClick={() => agir((d) => A.supprimerAttribution(d, a.id), 'Attribution retirée')}>
                  Retirer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function FormAttribution({ s, attribution }: { s: Souvenir; attribution?: Attribution }) {
  const init: A.SelectionCibles = !attribution
    ? { personnes: [], groupes: [], moi: false }
    : attribution.cible.type === 'groupe'
      ? { personnes: [], groupes: [attribution.cible.groupeId], moi: false }
      : estPourMoi(attribution)
        ? { personnes: [], groupes: [], moi: true }
        : { personnes: attribution.cible.ids, groupes: [], moi: false, commun: attribution.cible.ids.length > 1 };
  const [sel, setSel] = useState<A.SelectionCibles>(init);
  const [quantite, setQuantite] = useState(attribution?.quantite ?? 1);
  const enregistrer = async () => {
    const cibles = A.ciblesDeSelection(sel);
    if (!cibles.length) return erreur(new A.ErreurMetier('Choisissez au moins un destinataire.'));
    const ok = await essayer((d) => {
      if (attribution) {
        if (cibles.length !== 1) throw new A.ErreurMetier('Une attribution vise une seule cible (cochez « cadeau commun » pour plusieurs personnes).');
        A.modifierAttribution(d, attribution.id, { cible: cibles[0] as Cible, quantite });
      } else for (const c of cibles) A.ajouterAttribution(d, s.id, c, quantite, s.statut === 'idee');
    }, attribution ? 'Attribution modifiée' : 'Attribué');
    if (ok) fermer();
  };
  return (
    <div class="pile">
      <PourQui valeur={sel} onChange={setSel} />
      <Champ groupe label="Unités par attribution">
        <Quantite valeur={quantite} onChange={setQuantite} />
      </Champ>
      {s.statut === 'achete' && <p class="champ-aide">Lot de {s.quantite} : la somme des unités attribuées ne peut pas dépasser la quantité.</p>}
      <button class="btn btn-primaire btn-large" onClick={enregistrer}>
        Enregistrer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Où l'acheter (F-33, F-41)

const TYPES_LIEU: { id: TypeLieu; libelle: string }[] = [
  { id: 'boutique', libelle: 'Boutique' },
  { id: 'grand_magasin', libelle: 'Grand magasin' },
  { id: 'marche', libelle: 'Marché' },
  { id: 'rue_commercante', libelle: 'Rue commerçante' },
  { id: 'temple_sanctuaire', libelle: 'Temple ou sanctuaire' },
  { id: 'chaine', libelle: 'Chaîne' },
  { id: 'konbini', libelle: 'Konbini' },
  { id: 'aeroport', libelle: 'Aéroport' },
  { id: 'autre', libelle: 'Autre' },
];

function OuAcheter({ s }: { s: Souvenir }) {
  const db = useDb();
  const v = useVoyage();
  const jour = useJour();
  const lieux = lieuxDe(db, s.id, true);
  const actifs = lieux.filter((l) => !l.ecarte);
  const ecartes = lieux.filter((l) => l.ecarte);
  const job = jobPour(s.id);
  const restantes = etapesPossiblesRestantes(s, db.lieux, etapesDuVoyage(db, v.id), jour);
  const obsoletes = actifs.some((l) => l.obsolete);
  const chercher = async () => {
    try {
      await demander([{ type: 'lieux', souvenirId: s.id }]);
      notifier('Recherche en file');
    } catch (e) {
      erreur(e);
    }
  };
  return (
    <Section
      titre="Où l'acheter"
      action={
        <button class="btn btn-petit" onClick={() => ouvrir('Ajouter un lieu', () => <FormLieu s={s} />)}>
          <Icon n="plus" taille={16} /> Ajouter un lieu
        </button>
      }
    >
      {s.statut === 'idee' && (
        <div class="boutons">
          {cleConfiguree.value && (
            <button class="btn" onClick={chercher} disabled={job?.statut === 'file' || job?.statut === 'en_cours'}>
              <Icon n="ia" taille={16} /> Chercher avec l'IA
            </button>
          )}
          <button class="btn" onClick={() => ouvrir('Mode manuel (app Claude)', () => <BlocManuel demande={{ type: 'lieux', souvenirId: s.id }} />)}>
            Via l'app Claude
          </button>
        </div>
      )}
      {job && job.statut !== 'terminee' && <EtatJob statut={job.statut} erreur={job.erreur} />}
      {obsoletes && (
        <p class="avert">
          L'idée a été renommée après la recherche : lieux IA peut-être obsolètes.{' '}
          {cleConfiguree.value && (
            <button class="lien" onClick={chercher}>
              Relancer
            </button>
          )}
        </p>
      )}
      {s.ia && (
        <div class="encart-ia">
          {s.ia.interpretation && <p>{s.ia.interpretation}</p>}
          {s.ia.alertes.map((a) => (
            <p class="alerte-texte petite">
              <Icon n="alerte" taille={14} /> {a}
            </p>
          ))}
          {s.ia.alternatives && <p class="discret">Alternatives : {s.ia.alternatives.join(' · ')}</p>}
          {s.ia.derniereChance && <p class="discret">Seulement à : {nomEtape(db, s.ia.derniereChance)}</p>}
        </div>
      )}
      {actifs.length === 0 ? <Vide>Aucun lieu d'achat.</Vide> : <ul class="liste">{actifs.map((l) => <CarteLieu l={l} s={s} />)}</ul>}
      {ecartes.length > 0 && (
        <Plier titre={`Lieux écartés (${ecartes.length})`}>
          <ul class="liste">
            {ecartes.map((l) => (
              <CarteLieu l={l} s={s} />
            ))}
          </ul>
        </Plier>
      )}
      {s.statut === 'idee' && (
        <div class="pile">
          <Champ groupe label="Étapes prévues">
            <EtapesChoix valeur={s.etapesPrevues} onChange={(ids) => agir((d) => A.modifierSouvenir(d, s.id, { etapesPrevues: ids }))} />
          </Champ>
          <Interrupteur
            label="Partout"
            aide="Trouvable à toutes les étapes (konbini…)"
            checked={!!s.partout}
            onChange={(c) => agir((d) => A.modifierSouvenir(d, s.id, { partout: c }))}
          />
          <p class="discret">
            {s.partout
              ? 'Achetable à toutes les étapes restantes.'
              : restantes.length
                ? `Dernière étape possible : ${restantes[restantes.length - 1].ville}`
                : 'Aucune étape restante prévue.'}
          </p>
        </div>
      )}
    </Section>
  );
}

function CarteLieu({ l, s }: { l: Lieu; s: Souvenir }) {
  const db = useDb();
  const villes = l.etapeIds.map((e) => nomEtape(db, e));
  return (
    <li class={'carte-lieu' + (l.ecarte ? ' ecarte' : '')}>
      <div class="carte-lieu-tete">
        <strong>{l.nom}</strong>
        <a class="btn-icone" href={lienCarte(l.nom, villes[0] ?? '')} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${l.nom} dans Google Maps`}>
          <Icon n="carte" taille={18} />
        </a>
      </div>
      <p class="discret">
        {TYPES_LIEU.find((t) => t.id === l.type)?.libelle} · {villes.join(', ')}
        {l.zone ? ` · ${l.zone}` : ''}
      </p>
      {(l.prixMinYen !== undefined || l.prixMaxYen !== undefined) && (
        <p class="petite">
          {l.prixMinYen !== undefined ? yen(l.prixMinYen) : '?'}
          {l.prixMaxYen !== undefined && l.prixMaxYen !== l.prixMinYen ? ` – ${yen(l.prixMaxYen)}` : ''}
        </p>
      )}
      {l.horaires && <p class="petite">Horaires : {l.horaires}</p>}
      {l.conseil && <p class="petite">{l.conseil}</p>}
      {l.origine === 'ia' && (
        <p class="petite discret">
          <span class="puce-ia">IA</span> confiance {l.confiance}
          {l.dateRecherche && ` · ${formatDate(l.dateRecherche.slice(0, 10))}`}
          {l.obsolete && ' · peut-être obsolète'}
          {l.sources?.map((u, i) => (
            <>
              {' · '}
              <LienExterne href={u}>source {i + 1}</LienExterne>
            </>
          ))}
        </p>
      )}
      <div class="ligne-actions">
        {s.statut === 'achete' && s.achat && s.achat.lieuId !== l.id && (
          <button
            class="btn btn-petit"
            onClick={() => agir((d) => A.modifierAchat(d, s.id, { lieuId: l.id, boutique: l.nom, etapeId: l.etapeIds[0] }), 'Boutique renseignée')}
          >
            Acheté ici
          </button>
        )}
        {s.achat?.lieuId === l.id && <span class="badge badge-donne">✓ Acheté ici</span>}
        <button class="btn btn-petit" onClick={() => ouvrir('Modifier le lieu', () => <FormLieu s={s} lieu={l} />)}>
          Modifier
        </button>
        <button class="btn btn-petit" onClick={() => agir((d) => A.ecarterLieu(d, l.id, !l.ecarte), l.ecarte ? 'Lieu rétabli' : 'Lieu écarté')}>
          {l.ecarte ? 'Rétablir' : 'Écarter'}
        </button>
        <button class="btn btn-petit" onClick={() => agir((d) => A.supprimerLieu(d, l.id), 'Lieu supprimé')}>
          Supprimer
        </button>
      </div>
    </li>
  );
}

function FormLieu({ s, lieu }: { s: Souvenir; lieu?: Lieu }) {
  const db = useDb();
  const v = useVoyage();
  const jour = useJour();
  const icis = etapesDuVoyage(db, v.id).filter((e) => e.arrivee <= jour && jour <= e.depart);
  const [nom, setNom] = useState(lieu?.nom ?? '');
  const [type, setType] = useState<TypeLieu>(lieu?.type ?? 'boutique');
  const [etapes, setEtapes] = useState<string[]>(lieu?.etapeIds ?? (icis.length ? [icis[icis.length - 1].id] : []));
  const [zone, setZone] = useState(lieu?.zone ?? '');
  const [pmin, setPmin] = useState(lieu?.prixMinYen?.toString() ?? '');
  const [pmax, setPmax] = useState(lieu?.prixMaxYen?.toString() ?? '');
  const [horaires, setHoraires] = useState(lieu?.horaires ?? '');
  const [conseil, setConseil] = useState(lieu?.conseil ?? '');
  const num = (x: string) => {
    const n = parseNombre(x);
    return Number.isFinite(n) ? Math.round(n) : undefined;
  };
  return (
    <form
      class="pile"
      onSubmit={async (e) => {
        e.preventDefault();
        const data: Partial<LieuData> = {
          nom,
          type,
          etapeIds: etapes,
          zone: zone || undefined,
          prixMinYen: num(pmin),
          prixMaxYen: num(pmax),
          horaires: horaires || undefined,
          conseil: conseil || undefined,
        };
        const ok = await essayer(
          (d) => (lieu ? A.modifierLieu(d, lieu.id, data) : A.ajouterLieu(d, s.id, { ...data, origine: 'manuel' } as LieuData)),
          lieu ? 'Lieu modifié' : 'Lieu ajouté',
        );
        if (ok) fermer();
      }}
    >
      <Champ label="Nom">
        <Texte valeur={nom} onValeur={setNom} autoFocus required />
      </Champ>
      <Champ label="Type">
        <Selecteur valeur={type} onValeur={(t) => setType((t || 'boutique') as TypeLieu)} options={TYPES_LIEU} />
      </Champ>
      <Champ groupe label="Étapes">
        <EtapesChoix valeur={etapes} onChange={setEtapes} toutes />
      </Champ>
      <Champ label="Quartier ou adresse">
        <Texte valeur={zone} onValeur={setZone} />
      </Champ>
      <div class="grille2">
        <Champ label="Prix min (¥)">
          <input type="text" inputMode="numeric" value={pmin} onInput={(e) => setPmin((e.target as HTMLInputElement).value)} />
        </Champ>
        <Champ label="Prix max (¥)">
          <input type="text" inputMode="numeric" value={pmax} onInput={(e) => setPmax((e.target as HTMLInputElement).value)} />
        </Champ>
      </div>
      <Champ label="Horaires">
        <Texte valeur={horaires} onValeur={setHoraires} />
      </Champ>
      <Champ label="Conseil">
        <ZoneTexte valeur={conseil} onValeur={setConseil} rows={2} />
      </Champ>
      <button type="submit" class="btn btn-primaire btn-large">
        Enregistrer
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- Achat (F-24, F-26, F-50)

function AchatSection({ s }: { s: Souvenir }) {
  const db = useDb();
  const v = useVoyage();
  const a = s.achat!;
  const [boutique, setBoutique] = useState(a.boutique ?? '');
  const [prix, setPrix] = useState(String(a.prix).replace('.', ','));
  const [taux, setTaux] = useState(String(a.tauxEUR).replace('.', ','));
  const [photo, setPhoto] = useState<string | undefined>();
  useEffect(() => setBoutique(a.boutique ?? ''), [a.boutique]);
  useEffect(() => setPrix(String(a.prix).replace('.', ',')), [a.prix]);
  useEffect(() => setTaux(String(a.tauxEUR).replace('.', ',')), [a.tauxEUR]);
  useEffect(() => {
    let vivant = true;
    if (s.photoId) void urlPhoto(s.photoId).then((u) => vivant && setPhoto(u));
    else setPhoto(undefined);
    return () => {
      vivant = false;
    };
  }, [s.photoId]);
  const ticket = a.ticketDetaxeId ? db.tickets.find((t) => t.id === a.ticketDetaxeId) : undefined;
  const et = ticket ? etatTicket(db, ticket, v) : undefined;
  return (
    <Section titre="Achat">
      <div class="pile">
        <div class="grille2">
          <Champ label="Date">
            <input type="date" value={a.date} onChange={(e) => agir((d) => A.modifierAchat(d, s.id, { date: (e.target as HTMLInputElement).value || a.date }))} />
          </Champ>
          <Champ label="Étape">
            <EtapeSelect valeur={a.etapeId} onValeur={(id) => agir((d) => A.modifierAchat(d, s.id, { etapeId: id }))} />
          </Champ>
        </div>
        <Champ label="Boutique">
          <Texte valeur={boutique} onValeur={setBoutique} onBlur={() => boutique !== (a.boutique ?? '') && agir((d) => A.modifierAchat(d, s.id, { boutique }))} />
        </Champ>
        <div class="grille2">
          <Champ label={`Prix (${a.devise === 'JPY' ? '¥' : '€'})`} aide={a.devise === 'JPY' ? euro(a.prixEUR) : yen(prixYen(s))}>
            <input
              type="text"
              inputMode="decimal"
              value={prix}
              onInput={(e) => setPrix((e.target as HTMLInputElement).value)}
              onBlur={() => {
                const n = parseNombre(prix);
                if (Number.isFinite(n) && n !== a.prix) void agir((d) => A.modifierAchat(d, s.id, { prix: n }));
              }}
            />
          </Champ>
          <Champ label="Taux figé (EUR pour 1 ¥)">
            <input
              type="text"
              inputMode="decimal"
              value={taux}
              onInput={(e) => setTaux((e.target as HTMLInputElement).value)}
              onBlur={() => {
                const n = parseNombre(taux);
                if (n > 0 && n !== a.tauxEUR) void agir((d) => A.modifierAchat(d, s.id, { tauxEUR: n }));
              }}
            />
          </Champ>
        </div>
        <Champ groupe label="Photo">
          {photo && <img src={photo} alt={`Photo de ${s.nom}`} class="photo" />}
          <div class="boutons">
            <label class="btn btn-petit">
              <Icon n="photo" taille={16} /> {s.photoId ? 'Remplacer' : 'Ajouter'}
              <input
                type="file"
                accept="image/*"
                class="masque"
                onChange={async (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (!f) return;
                  try {
                    const id = await enregistrerPhoto(f);
                    await agir((d) => A.modifierSouvenir(d, s.id, { photoId: id }), 'Photo enregistrée');
                  } catch (err) {
                    erreur(err);
                  }
                }}
              />
            </label>
            {s.photoId && (
              <button class="btn btn-petit" onClick={() => agir((d) => A.modifierSouvenir(d, s.id, { photoId: null }), 'Photo supprimée')}>
                Supprimer la photo
              </button>
            )}
          </div>
        </Champ>
        {v.detaxeActive && (
          <Interrupteur
            label="Détaxé"
            aide={ticket ? `Ticket ${ticket.boutique} du ${formatDate(ticket.date)}` : 'Rejoint le ticket de sa boutique et de sa date'}
            checked={!!a.ticketDetaxeId}
            onChange={(c) => agir((d) => A.definirDetaxe(d, s.id, c))}
          />
        )}
        {et && (
          <p class={et.eligible ? 'discret' : 'avert'}>
            Ticket : {yen(et.totalTTC)} TTC · {yen(et.totalHT)} HT · {et.eligible ? `taxe ${yen(et.taxe)}` : 'sous le seuil de 5 000 ¥ HT'}
            {et.compromis.length > 0 && <span class="alerte-texte"> · Ticket compromis</span>}
          </p>
        )}
        <p class="discret petite">
          {nombre(a.tauxEUR, 6)} € / ¥ figé le {formatDate((a.enregistreLe ?? a.date).slice(0, 10))}
        </p>
      </div>
    </Section>
  );
}

export { MOI_ID };
