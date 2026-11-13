// Fiche souvenir (§7.3, F-22 à F-26, F-33, F-41, F-50) : lecture d'abord, modification à la demande.
import { useEffect, useState } from 'preact/hooks';
import type { Attribution, Cible, Lieu, LieuData, Souvenir, TypeLieu } from '../../db/types';
import * as A from '../../domain/actions';
import {
  attributionsDe,
  estPourMoi,
  etatSouvenir,
  etapesDuVoyage,
  etapesPossiblesRestantes,
  etatTicket,
  lieuxDe,
  nomCible,
  personnesDeCible,
  prixYen,
  unitesNonAttribuees,
} from '../../domain/rules';
import { formatDate, today } from '../../domain/dates';
import { euro, lienCarte, nombre, parseNombre, pluriel, yen } from '../../domain/format';
import { agir, aller, erreur, essayer, fermer, notifier, ouvrir } from '../state';
import { categoriesTriees, nomCategorie, nomEtape, useDb, useJour, useVoyage } from '../data';
import { Champ, confirmer, Interrupteur, LienExterne, Plier, Selecteur, Texte, Vide, ZoneTexte } from '../components/ui';
import { Icon } from '../components/Icon';
import { EtapeSelect, EtapesChoix, RetourChamps } from '../components/champs';
import { PourQui } from '../components/PourQui';
import { enregistrerPhoto, urlPhoto } from '../components/photo';
import { Avancement, Avatar, Carte, PastillesRetour, Tuile, tonSouvenir, type Ton } from '../components/visuel';
import { ouvrirSaisie, Quantite } from './Saisie';
import { EtatJob, Introuvable, Retour as RetourLien } from './Personnes';
import { cleConfiguree, demander, jobPour } from '../../ai/queue';
import { BlocManuel } from './Manuel';

export function SouvenirFiche({ id }: { id: string }) {
  const db = useDb();
  const s = db.souvenirs.find((x) => x.id === id);
  if (!s) return <Introuvable />;
  const attrs = attributionsDe(db, s.id);
  const etat = etatSouvenir(s, attrs);
  const ton = tonSouvenir(etat);
  const autres = attrs.filter((a) => !estPourMoi(a));
  const donnes = autres.filter((a) => a.remise === 'donne').length;
  const cat = nomCategorie(db, s.categorieId);
  return (
    <div class="ecran etroit fiche">
      <div class="barre-fiche">
        <RetourLien href={s.statut === 'idee' ? 'souvenirs?seg=idees' : 'souvenirs?seg=achetes'} libelle="Cadeaux" />
        <div class="boutons">
          <button class="btn-icone" aria-label="Modifier" onClick={() => ouvrir('Modifier', () => <FormEssentiel s={s} />)}>
            <Icon n="modifier" />
          </button>
          <button class="btn-icone" aria-label="Plus d'actions" onClick={() => ouvrir(s.nom, () => <MenuActions s={s} />)}>
            <Icon n="plusActions" taille={24} epaisseur={3} />
          </button>
        </div>
      </div>

      <Carte>
        <div class="fiche-tete">
          <Tuile s={s} ton={ton} taille={64} />
          <div class="pile" style={{ gap: '4px', minWidth: 0 }}>
            <h1>{s.nom}</h1>
            <span class="discret">
              {[cat, s.quantite > 1 ? `×${s.quantite}` : '', s.origine === 'ia' ? 'proposé par l’IA' : ''].filter(Boolean).join(' · ') || 'Sans catégorie'}
            </span>
          </div>
        </div>
        <Avancement etat={etat} donnes={donnes} total={autres.length} />
        <PastillesRetour db={db} s={s} />
        {s.note && <p class="discret">{s.note}</p>}
        {s.statut === 'idee' && (
          <button class="btn btn-primaire btn-large" onClick={() => ouvrirSaisie({ ideeId: s.id })}>
            <Icon n="sac" taille={20} epaisseur={2} /> Je l'ai acheté
          </button>
        )}
      </Carte>

      <PourQuiCarte s={s} attrs={attrs} />
      {s.statut === 'achete' && s.achat && <AchatCarte s={s} />}
      <OuAcheter s={s} />

      <Carte>
        <Plier titre="Contraintes de retour (alcool, bagage, douane…)" ouvert={false}>
          <RetourChamps valeur={s.retour} achete={s.statut === 'achete'} onChange={(m) => agir((d) => A.modifierRetour(d, s.id, m))} />
        </Plier>
        <Plier titre="Historique">
          <ul class="liste-simple">
            <li>Créé le {formatDate(s.createdAt.slice(0, 10))}</li>
            {s.achat && (
              <li>
                Acheté le {formatDate(s.achat.date)} à {nomEtape(db, s.achat.etapeId)}
              </li>
            )}
            {attrs
              .filter((a) => a.remise === 'donne' && a.dateRemise)
              .map((a) => (
                <li>
                  Donné à {nomCible(db, a)} le {formatDate(a.dateRemise!)}
                </li>
              ))}
          </ul>
        </Plier>
      </Carte>
    </div>
  );
}

function MenuActions({ s }: { s: Souvenir }) {
  return (
    <div class="menu-actions">
      {s.statut === 'achete' && (
        <button
          onClick={() => {
            fermer();
            confirmer(
              'Revenir à l’idée ?',
              'Le prix, la boutique et la détaxe seront effacés. Les destinataires sont conservés.',
              'Revenir à l’idée',
              () => agir((d) => A.revenirIdee(d, s.id), 'Repassé en idée'),
            );
          }}
        >
          <Icon n="ampoule" /> Ce n'est plus qu'une idée
        </button>
      )}
      <button
        class="danger"
        onClick={async () => {
          fermer();
          aller(s.statut === 'idee' ? 'souvenirs?seg=idees' : 'souvenirs?seg=achetes');
          await agir((d) => A.supprimerSouvenir(d, s.id), `« ${s.nom} » supprimé`);
        }}
      >
        <Icon n="corbeille" /> Supprimer
      </button>
    </div>
  );
}

function FormEssentiel({ s }: { s: Souvenir }) {
  const db = useDb();
  const [nom, setNom] = useState(s.nom);
  const [categorie, setCategorie] = useState(s.categorieId ?? '');
  const [quantite, setQuantite] = useState(s.quantite);
  const [note, setNote] = useState(s.note ?? '');
  return (
    <form
      class="pile"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await essayer((d) => A.modifierSouvenir(d, s.id, { nom, categorieId: categorie || null, quantite, note }), 'Modifié')) fermer();
      }}
    >
      <Champ label="Nom">
        <Texte valeur={nom} onValeur={setNom} required />
      </Champ>
      <div class="grille2">
        <Champ label="Catégorie">
          <Selecteur valeur={categorie} onValeur={setCategorie} vide="—" options={categoriesTriees(db).map((c) => ({ id: c.id, libelle: c.libelle }))} />
        </Champ>
        <Champ groupe label="Quantité">
          <Quantite valeur={quantite} onChange={setQuantite} />
        </Champ>
      </div>
      <Champ label="Note">
        <ZoneTexte valeur={note} onValeur={setNote} rows={3} />
      </Champ>
      <button type="submit" class="btn btn-primaire btn-large">
        Enregistrer
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- Pour qui (F-23)

function tonAttribution(s: Souvenir, a: Attribution): Ton {
  if (s.statut === 'idee') return 'idee';
  return a.remise === 'donne' ? 'donne' : 'achete';
}

function PourQuiCarte({ s, attrs }: { s: Souvenir; attrs: Attribution[] }) {
  const db = useDb();
  const libres = unitesNonAttribuees(s, attrs);
  return (
    <Carte
      titre="Pour qui ?"
      action={
        <button class="btn btn-petit" onClick={() => ouvrir('Pour qui ?', () => <GererPourQui s={s} />)}>
          {attrs.length ? 'Changer' : 'Choisir'}
        </button>
      }
    >
      {attrs.length === 0 && <p class="vide">Personne pour l'instant.</p>}
      <div>
        {attrs.map((a) => {
          const moi = estPourMoi(a);
          const ids = a.cible.type === 'personnes' ? a.cible.ids : [];
          const seule = ids.length === 1 ? db.personnes.find((p) => p.id === ids[0]) : undefined;
          const t = tonAttribution(s, a);
          return (
            <div class="pour-ligne attribution">
              {seule ? (
                <Avatar personne={seule} ton={moi ? undefined : t} taille={44} />
              ) : (
                <span class={`avatar anneau-${t}`} style={{ width: '44px', height: '44px', background: 'var(--fond-3)' }} aria-hidden="true">
                  <Icon n="groupe" taille={20} />
                </span>
              )}
              <span class="nom">
                {moi ? 'Moi' : nomCible(db, a)}
                {a.quantite > 1 && <span class="discret"> ×{a.quantite}</span>}
                {a.cible.type === 'groupe' || ids.length > 1 ? (
                  <span class="discret petite" style={{ display: 'block', fontWeight: 400 }}>
                    Cadeau collectif · {pluriel(personnesDeCible(db, a).length, 'personne')}
                  </span>
                ) : null}
              </span>
              {s.statut === 'achete' && !moi &&
                (a.remise === 'donne' ? (
                  <button class="btn btn-petit btn-donne fait" onClick={() => agir((d) => A.annulerRemise(d, a.id), 'Remise annulée')}>
                    <Icon n="ok" taille={16} epaisseur={2.4} /> Donné
                  </button>
                ) : (
                  <button class="btn btn-petit btn-donne" onClick={() => agir((d) => A.donner(d, a.id, today()), 'Marqué donné')}>
                    Donné
                  </button>
                ))}
            </div>
          );
        })}
      </div>
      {s.statut === 'achete' && libres > 0 && (
        <p class="avert">
          {libres === 1 ? '1 exemplaire n’a pas encore de destinataire.' : `${libres} exemplaires n’ont pas encore de destinataire.`}{' '}
          <button class="lien" onClick={() => ouvrir('Pour qui ?', () => <FormAttribution s={s} />)}>
            Choisir
          </button>
        </p>
      )}
    </Carte>
  );
}

function GererPourQui({ s }: { s: Souvenir }) {
  const db = useDb();
  const cur = db.souvenirs.find((x) => x.id === s.id) ?? s;
  const attrs = attributionsDe(db, s.id);
  return (
    <div class="pile">
      {attrs.length > 0 && (
        <ul class="liste">
          {attrs.map((a) => (
            <li class="ligne-rangement">
              <strong>{estPourMoi(a) ? 'Moi' : nomCible(db, a)}</strong>
              <span class="boutons">
                <Quantite valeur={a.quantite} onChange={(n) => agir((d) => A.modifierAttribution(d, a.id, { quantite: n }))} />
                <button class="btn btn-petit" onClick={() => agir((d) => A.supprimerAttribution(d, a.id), 'Retiré')}>
                  Retirer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {cur.quantite > 1 && (
        <p class="discret">
          {cur.quantite} exemplaires · {unitesNonAttribuees(cur, attrs)} sans destinataire
        </p>
      )}
      <h3 class="sous-titre">Ajouter</h3>
      <FormAttribution s={cur} />
    </div>
  );
}

function FormAttribution({ s }: { s: Souvenir }) {
  const [sel, setSel] = useState<A.SelectionCibles>({ personnes: [], groupes: [], moi: false });
  const enregistrer = async () => {
    const cibles = A.ciblesDeSelection(sel);
    if (!cibles.length) return erreur(new A.ErreurMetier('Choisissez au moins une personne.'));
    const ok = await essayer((d) => {
      for (const c of cibles) A.ajouterAttribution(d, s.id, c as Cible, 1, s.statut === 'idee');
    }, 'Ajouté');
    if (ok) fermer();
  };
  return (
    <div class="pile">
      <PourQui valeur={sel} onChange={setSel} />
      {s.statut === 'achete' && <p class="champ-aide">Un exemplaire par personne choisie ; il faut assez d'exemplaires (quantité) pour tout le monde.</p>}
      <button class="btn btn-primaire btn-large" onClick={enregistrer}>
        Ajouter
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Achat (F-24, F-26, F-50)

function AchatCarte({ s }: { s: Souvenir }) {
  const db = useDb();
  const v = useVoyage();
  const a = s.achat!;
  const [photo, setPhoto] = useState<string | undefined>();
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
  const choisirPhoto = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const id = await enregistrerPhoto(f);
      await agir((d) => A.modifierSouvenir(d, s.id, { photoId: id }), 'Photo enregistrée');
    } catch (err) {
      erreur(err);
    }
  };
  return (
    <Carte
      titre="Acheté"
      action={
        <button class="btn btn-petit" onClick={() => ouvrir('Modifier l’achat', () => <FormAchat s={s} />)}>
          Modifier
        </button>
      }
    >
      <div class="prix-grand">
        <strong>{a.devise === 'JPY' ? yen(a.prix) : euro(a.prix)}</strong>
        <span class="discret">{a.devise === 'JPY' ? euro(a.prixEUR) : yen(prixYen(s))}</span>
      </div>
      <dl class="infos">
        <div>
          <dt>Quand</dt>
          <dd>{formatDate(a.date)}</dd>
        </div>
        <div>
          <dt>Où</dt>
          <dd>
            {nomEtape(db, a.etapeId)}
            {a.boutique ? ` · ${a.boutique}` : ''}
          </dd>
        </div>
      </dl>
      {photo ? (
        <>
          <img src={photo} alt={`Photo de ${s.nom}`} class="photo" />
          <div class="boutons">
            <label class="btn btn-petit">
              <Icon n="photo" taille={16} /> Remplacer
              <input type="file" accept="image/*" class="masque" onChange={choisirPhoto} />
            </label>
            <button class="btn btn-petit" onClick={() => agir((d) => A.modifierSouvenir(d, s.id, { photoId: null }), 'Photo supprimée')}>
              Supprimer la photo
            </button>
          </div>
        </>
      ) : (
        <label class="ajout-photo">
          <Icon n="photo" taille={20} /> Ajouter une photo
          <input type="file" accept="image/*" class="masque" onChange={choisirPhoto} />
        </label>
      )}
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
    </Carte>
  );
}

function FormAchat({ s }: { s: Souvenir }) {
  const a = s.achat!;
  const [date, setDate] = useState(a.date);
  const [etapeId, setEtapeId] = useState(a.etapeId);
  const [boutique, setBoutique] = useState(a.boutique ?? '');
  const [prix, setPrix] = useState(String(a.prix).replace('.', ','));
  const [taux, setTaux] = useState(String(a.tauxEUR).replace('.', ','));
  return (
    <form
      class="pile"
      onSubmit={async (e) => {
        e.preventDefault();
        const p = parseNombre(prix);
        const t = parseNombre(taux);
        if (await essayer((d) => A.modifierAchat(d, s.id, { date, etapeId, boutique, prix: p, tauxEUR: t }), 'Achat modifié')) fermer();
      }}
    >
      <div class="grille2">
        <Champ label="Date">
          <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value || date)} />
        </Champ>
        <Champ label="Étape">
          <EtapeSelect valeur={etapeId} onValeur={setEtapeId} />
        </Champ>
      </div>
      <Champ label="Boutique">
        <Texte valeur={boutique} onValeur={setBoutique} />
      </Champ>
      <div class="grille2">
        <Champ label={`Prix (${a.devise === 'JPY' ? '¥' : '€'})`}>
          <input type="text" inputMode="decimal" value={prix} onInput={(e) => setPrix((e.target as HTMLInputElement).value)} />
        </Champ>
        <Champ label="Taux figé (€ pour 1 ¥)">
          <input type="text" inputMode="decimal" value={taux} onInput={(e) => setTaux((e.target as HTMLInputElement).value)} />
        </Champ>
      </div>
      <p class="champ-aide">
        Taux figé le {formatDate((a.enregistreLe ?? a.date).slice(0, 10))} : {nombre(a.tauxEUR, 6)} € pour 1 ¥. Changer le taux du jour ne modifie pas cet achat.
      </p>
      <button type="submit" class="btn btn-primaire btn-large">
        Enregistrer
      </button>
    </form>
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
      notifier('Recherche lancée');
    } catch (e) {
      erreur(e);
    }
  };
  return (
    <Carte
      titre={s.statut === 'idee' ? "Où l'acheter" : 'Adresses'}
      action={
        <button class="btn btn-petit" onClick={() => ouvrir('Ajouter un lieu', () => <FormLieu s={s} />)}>
          <Icon n="plus" taille={16} /> Ajouter un lieu
        </button>
      }
    >
      {s.statut === 'idee' && (
        <div class="boutons">
          {cleConfiguree.value && (
            <button class="btn btn-contour" onClick={chercher} disabled={job?.statut === 'file' || job?.statut === 'en_cours'}>
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
          L'idée a été renommée après la recherche : ces lieux sont peut-être obsolètes.{' '}
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
      {actifs.length === 0 ? <Vide>Aucune adresse pour l'instant.</Vide> : <ul class="liste">{actifs.map((l) => <CarteLieu l={l} s={s} />)}</ul>}
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
        <Plier titre="Étapes prévues">
          <EtapesChoix valeur={s.etapesPrevues} onChange={(ids) => agir((d) => A.modifierSouvenir(d, s.id, { etapesPrevues: ids }))} />
          <Interrupteur
            label="Partout"
            aide="Trouvable à toutes les étapes (konbini…)"
            checked={!!s.partout}
            onChange={(c) => agir((d) => A.modifierSouvenir(d, s.id, { partout: c }))}
          />
        </Plier>
      )}
      {s.statut === 'idee' && (
        <p class="discret">
          {s.partout
            ? 'Achetable à toutes les étapes restantes.'
            : restantes.length
              ? `Dernière étape possible : ${restantes[restantes.length - 1].ville}`
              : 'Aucune étape restante prévue.'}
        </p>
      )}
    </Carte>
  );
}

function CarteLieu({ l, s }: { l: Lieu; s: Souvenir }) {
  const db = useDb();
  const villes = l.etapeIds.map((e) => nomEtape(db, e));
  return (
    <li class={'carte-lieu' + (l.ecarte ? ' ecarte' : '')}>
      <div class="lieu-ligne">
        <div>
          <strong>{l.nom}</strong>
          <span>
            {TYPES_LIEU.find((t) => t.id === l.type)?.libelle} · {villes.join(', ')}
            {l.zone ? ` · ${l.zone}` : ''}
            {l.prixMinYen !== undefined || l.prixMaxYen !== undefined
              ? ` · ${l.prixMinYen !== undefined ? yen(l.prixMinYen) : '?'}${l.prixMaxYen !== undefined && l.prixMaxYen !== l.prixMinYen ? ` – ${yen(l.prixMaxYen)}` : ''}`
              : ''}
          </span>
        </div>
        <a class="btn-icone" href={lienCarte(l.nom, villes[0] ?? '')} target="_blank" rel="noopener noreferrer" aria-label={`Ouvrir ${l.nom} dans Google Maps`}>
          <Icon n="carte" taille={20} />
        </a>
      </div>
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
          <button class="btn btn-petit" onClick={() => agir((d) => A.modifierAchat(d, s.id, { lieuId: l.id, boutique: l.nom, etapeId: l.etapeIds[0] }), 'Boutique renseignée')}>
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
