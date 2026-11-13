// Écran Ici (§7.1, F-31, F-32) : où je suis, ce qu'il ne faut pas rater, ce qu'on peut acheter ici.
import type { Etape, Excursion, Lieu, Souvenir } from '../../db/types';
import * as A from '../../domain/actions';
import {
  achetableIci,
  attributionsDe,
  bilanBagages,
  bilanDouane,
  compteurs,
  derniereChance,
  destinatairesDuVoyage,
  detaxeARecuperer,
  etapesDuVoyage,
  ici as calculIci,
  lieuxDe,
  lieuxIci,
  souvenirsDuVoyage,
  ticketsDuVoyage,
  totaux,
  couverture,
} from '../../domain/rules';
import { addDays, diffDays, formatDate, formatDateCourte } from '../../domain/dates';
import { euro, lienCarte, pluriel, yen } from '../../domain/format';
import { agir, aller, erreur, fermer, notifier, ouvrir } from '../state';
import { nomEtape, useDb, useJour, useVoyage } from '../data';
import { Icon } from '../components/Icon';
import { libelleEtape } from '../components/champs';
import { Anneau, Carte } from '../components/visuel';
import { CarteSouvenir } from '../components/CarteSouvenir';
import { cleConfiguree, demander, fileActive, messageFile } from '../../ai/queue';
import { Remise } from './Retour';
import { ouvrirSaisie } from './Saisie';

export function Ici() {
  const db = useDb();
  const v = useVoyage();
  const jour = useJour();
  const i = calculIci(db, v, jour);
  const etapes = etapesDuVoyage(db, v.id);

  if (i.mode === 'apres') {
    return (
      <div class="ecran etroit">
        <Carte class="hero">
          <span class="hero-sur">Voyage terminé le {formatDate(v.dateFin)}</span>
          <h1 class="hero-ville">De retour</h1>
          <span class="discret">C'est le moment de donner les cadeaux.</span>
        </Carte>
        <Remise />
      </div>
    );
  }

  const dc = derniereChance(db, v, jour);
  const idees = souvenirsDuVoyage(db, v.id).filter((s) => s.statut === 'idee');
  const urgentes = new Set(dc.ici.map((x) => x.souvenir.id));
  const achetables = idees.filter((s) => achetableIci(s, db.lieux, i.etapes) && !urgentes.has(s.id));
  const derniere = i.etapes[i.etapes.length - 1];
  const prochaine = etapes.find((e) => derniere && e.ordre === derniere.ordre + 1);
  const nbProchaine = prochaine ? idees.filter((s) => achetableIci(s, db.lieux, [prochaine]) && !s.partout).length : 0;
  const t = totaux(db, v.id);
  const sansLieu = idees.filter((s) => !s.partout && lieuxDe(db, s.id).length === 0 && s.etapesPrevues.length === 0);
  const enFile = db.jobs.filter((j) => j.statut === 'file' || j.statut === 'en_cours').length;
  const retourProche = jour >= addDays(v.dateFin, -3);
  const c = compteurs(db, v);
  const dest = destinatairesDuVoyage(db, v);
  const couverts = dest.filter((p) => couverture(db, p, v.id).etat !== 'rien').length;
  const joursAvantVol = diffDays(jour, v.dateFin);

  // Sous-titre de l'en-tête
  let sousTitre = '';
  if (i.manuel) sousTitre = 'Choisi à la main jusqu’à minuit';
  else if (i.mode === 'avant') sousTitre = `Départ le ${formatDate(v.dateDebut)}`;
  else if (i.etapes.length === 2) sousTitre = `Jour de route · arrivée à ${i.etapes[1].ville} ce soir`;
  else if (derniere) {
    const n = diffDays(derniere.arrivee, derniere.depart);
    const k = diffDays(derniere.arrivee, jour) + 1;
    sousTitre = i.mode === 'dernier_jour' ? 'Jour du vol retour' : `Nuit ${k} sur ${n}${prochaine ? ` · ensuite : ${prochaine.ville}` : ''}`;
  }
  const villeAffichee = i.manuel ? (i.excursion?.nom ?? derniere?.ville) : i.etapes.length === 2 ? `${i.etapes[0].ville} → ${i.etapes[1].ville}` : derniere?.ville;
  const indexActuel = derniere ? etapes.findIndex((e) => e.id === derniere.id) : -1;

  return (
    <div class="ecran">
      <div class="grille-ici">
        <Carte class="hero large">
          <div class="ecran-tete" style={{ alignItems: 'flex-start' }}>
            <div>
              <span class="hero-sur">{i.mode === 'avant' ? 'Bientôt' : 'Vous êtes à'}</span>
              <h1 class="hero-ville">{villeAffichee}</h1>
              <span class="discret">{sousTitre}</span>
            </div>
            <button class="btn btn-petit" onClick={() => ouvrir('Je suis ailleurs', () => <Ailleurs etapes={etapes} />)}>
              Je suis ailleurs
            </button>
          </div>
          <p class="vh">{i.libelle}</p>
          <div class="frise" role="img" aria-label={`Étape ${indexActuel + 1} sur ${etapes.length}`}>
            {etapes.map((e, k) => (
              <>
                {k > 0 && <span class={'trait' + (k <= indexActuel ? ' passe' : '')} />}
                <span class={'point' + (k < indexActuel ? ' passe' : k === indexActuel ? ' actuel' : '')} title={e.ville} />
              </>
            ))}
          </div>
          <div class="frise-legende">
            <span>
              {etapes[0]?.ville} · {formatDateCourte(v.dateDebut)}
            </span>
            {joursAvantVol >= 0 && <span>{joursAvantVol === 0 ? 'Vol aujourd’hui' : `${pluriel(joursAvantVol, 'jour')} avant le vol`}</span>}
            <span>{formatDateCourte(v.dateFin)}</span>
          </div>
        </Carte>

        {(dc.ici.length > 0 || dc.plusPrevue.length > 0 || (dc.modeDerniersJours && dc.derniersJours.length > 0)) && (
          <Carte class="carte-alerte large" id="derniere-chance" titre={<><Icon n="alerte" taille={20} epaisseur={2} /> Dernière chance</>}>
            {dc.ici.length > 0 && (
              <>
                <h3 class="sous-titre alerte-texte">Dernière chance ici</h3>
                <ul class="cartes-souvenirs">
                  {dc.ici.map((x) => (
                    <CarteAchetable s={x.souvenir} etapes={i.etapes} info={`Introuvable après ${x.derniere.ville}`} />
                  ))}
                </ul>
              </>
            )}
            {dc.plusPrevue.length > 0 && (
              <>
                <h3 class="sous-titre">Plus prévue sur le parcours</h3>
                <ul class="cartes-souvenirs">
                  {dc.plusPrevue.map((s) => (
                    <CarteAchetable s={s} etapes={[]} info="Aucune étape restante : ajoutez un lieu ou renoncez" />
                  ))}
                </ul>
              </>
            )}
            {dc.modeDerniersJours && dc.derniersJours.length > 0 && (
              <>
                <h3 class="sous-titre">Derniers jours : encore à acheter</h3>
                <ul class="cartes-souvenirs">
                  {dc.derniersJours
                    .filter((x) => !urgentes.has(x.souvenir.id) && !dc.plusPrevue.includes(x.souvenir))
                    .map((x) => (
                      <CarteAchetable
                        s={x.souvenir}
                        etapes={i.etapes}
                        info={x.souvenir.partout ? 'Partout' : x.derniere ? `Jusqu’à ${x.derniere.ville}` : 'Plus prévue'}
                      />
                    ))}
                </ul>
              </>
            )}
          </Carte>
        )}

        <Carte titre="Où en sont les cadeaux">
          <div class="avancement-global">
            <Anneau valeur={couverts} total={dest.length} libelle={`${couverts} personnes sur ${dest.length} ont un cadeau`} />
            <div>
              <strong style={{ fontSize: '1.05rem' }}>
                {couverts} {couverts > 1 ? 'personnes' : 'personne'} sur {dest.length}
              </strong>
              <p class="discret">ont déjà un cadeau</p>
            </div>
          </div>
          <div class="stat-tuiles">
            <a class="stat-tuile ton-rien" href="#/personnes?filtre=rien">
              <strong>{c.sansRien}</strong>
              <span>sans rien</span>
            </a>
            <a class="stat-tuile ton-idee" href="#/souvenirs?seg=idees">
              <strong>{c.ideesAAcheter}</strong>
              <span>idées à acheter</span>
            </a>
            <a class="stat-tuile ton-achete" href="#/retour?section=remise">
              <strong>{c.aDonner}</strong>
              <span>à donner</span>
            </a>
          </div>
          {c.aAttribuer > 0 && (
            <a href="#/souvenirs?seg=a_attribuer" class="discret">
              {pluriel(c.aAttribuer, 'achat', 'achats')} sans destinataire →
            </a>
          )}
        </Carte>

        <Carte titre={`À acheter ici · ${achetables.length}`} id="achetable">
          {achetables.length === 0 ? (
            <p class="vide">Aucune idée prévue ici. Ajoutez des étapes ou des lieux à vos idées.</p>
          ) : (
            <ul class="cartes-souvenirs" style={{ gridTemplateColumns: '1fr' }}>
              {achetables.map((s) => (
                <CarteAchetable s={s} etapes={i.etapes} excursion={i.excursion} />
              ))}
            </ul>
          )}
          {prochaine && (
            <p class="discret">
              Ensuite : <strong>{libelleEtape(prochaine, etapes)}</strong>, le {formatDate(prochaine.arrivee)} · {pluriel(nbProchaine, 'idée prévue', 'idées prévues')}
            </p>
          )}
        </Carte>

        <Carte titre="Dépensé">
          <p class="total">
            <strong style={{ fontSize: '1.5rem' }}>{yen(t.yen)}</strong> · {euro(t.eur)}
          </p>
          <p class="discret">
            dont pour moi : {yen(t.moiYen)} · {euro(t.moiEur)}
          </p>
        </Carte>

        {(cleConfiguree.value || enFile > 0) && (
          <Carte titre={<><Icon n="ia" taille={18} /> Assistant IA</>}>
            <p>
              {pluriel(sansLieu.length, 'idée sans lieu d’achat', 'idées sans lieu d’achat')}
              {sansLieu.length > 0 && cleConfiguree.value && (
                <>
                  {' · '}
                  <button
                    class="lien"
                    onClick={async () => {
                      try {
                        const n = await demander(sansLieu.map((s) => ({ type: 'lieux' as const, souvenirId: s.id })));
                        notifier(`${pluriel(n, 'recherche lancée', 'recherches lancées')}`);
                      } catch (e) {
                        erreur(e);
                      }
                    }}
                  >
                    Chercher où les acheter
                  </button>
                </>
              )}
            </p>
            <p class="discret">
              {enFile > 0 ? `${pluriel(enFile, 'recherche', 'recherches')} en attente${fileActive.value ? ' · en cours' : ''}` : 'Aucune recherche en attente'}
              {messageFile.value ? ` · ${messageFile.value}` : ''}
            </p>
          </Carte>
        )}

        {retourProche && <EncartRetour />}
      </div>
    </div>
  );
}

/** Carte d'une idée achetable ici : lieux de la ville, bouton « Je l'ai acheté » */
function CarteAchetable(props: { s: Souvenir; etapes: Etape[]; info?: string; excursion?: Excursion }) {
  const db = useDb();
  const lieux: Lieu[] = lieuxIci(lieuxDe(db, props.s.id), props.etapes, props.excursion);
  const ville = (l: Lieu) => nomEtape(db, l.etapeIds.find((e) => props.etapes.some((x) => x.id === e)) ?? l.etapeIds[0]);
  return (
    <CarteSouvenir db={db} s={props.s} attrs={attributionsDe(db, props.s.id)} info={props.info} masquerEtat>
      {lieux.slice(0, 2).map((l) => (
        <div class="lieu-ligne">
          <div>
            <strong>{l.nom}</strong>
            <span>
              {[l.zone, l.prixMinYen !== undefined ? `${yen(l.prixMinYen)}${l.prixMaxYen !== undefined && l.prixMaxYen !== l.prixMinYen ? ` – ${yen(l.prixMaxYen)}` : ''}` : '']
                .filter(Boolean)
                .join(' · ') || ville(l)}
            </span>
          </div>
          <a class="btn-icone" href={lienCarte(l.nom, ville(l))} target="_blank" rel="noopener noreferrer" aria-label={`Carte : ${l.nom}`}>
            <Icon n="carte" taille={20} />
          </a>
        </div>
      ))}
      <button class="btn btn-contour" onClick={() => ouvrirSaisie({ ideeId: props.s.id })}>
        <Icon n="sac" taille={18} /> Je l'ai acheté
      </button>
    </CarteSouvenir>
  );
}

function Ailleurs({ etapes }: { etapes: Etape[] }) {
  const db = useDb();
  const jour = useJour();
  const choisir = async (etapeId: string, excursionId?: string) => {
    await agir((d) => A.definirIciManuel(d, { etapeId, excursionId }, jour));
    fermer();
  };
  return (
    <div class="pile">
      <p class="discret">Le choix vaut jusqu'à minuit, puis le calendrier reprend.</p>
      {db.parametres.ici?.date === jour && (
        <button
          class="btn"
          onClick={async () => {
            await agir((d) => A.definirIciManuel(d, null, jour));
            fermer();
          }}
        >
          Revenir au calendrier
        </button>
      )}
      <ul class="liste">
        {etapes.map((e) => (
          <li>
            <button class="ligne-btn" onClick={() => choisir(e.id)}>
              <strong>{libelleEtape(e, etapes)}</strong> <span class="discret">{e.region}</span>
            </button>
            {e.excursions.map((x) => (
              <button class="ligne-btn retrait" onClick={() => choisir(e.id, x.id)}>
                {x.nom} <span class="discret">depuis {e.ville}</span>
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EncartRetour() {
  const db = useDb();
  const v = useVoyage();
  const tickets = ticketsDuVoyage(db, v);
  const compromis = tickets.filter((t) => t.compromis.length).length;
  const douane = db.profils
    .filter((p) => p.voyageId === v.id)
    .map((p) => bilanDouane(db, v, p))
    .filter((b) => b.statut !== 'ok');
  const bag = bilanBagages(db, v);
  const alertesBag =
    bag.bagages.reduce((n, b) => n + b.alertes.filter((a) => a.grave).length + (b.depasse ? 1 : 0), 0) +
    bag.alertesGenerales.filter((a) => a.grave).length;
  return (
    <Carte titre={<><Icon n="retour" taille={18} /> Préparer le retour</>}>
      <ul class="liste-simple">
        {v.detaxeActive && (
          <li>
            Détaxe à récupérer : <strong>{yen(detaxeARecuperer(tickets))}</strong>
            {compromis > 0 && <span class="alerte-texte"> · {pluriel(compromis, 'ticket compromis', 'tickets compromis')}</span>}
          </li>
        )}
        <li>
          Douane :{' '}
          {douane.length === 0
            ? 'rien à signaler'
            : douane.map((b) => `${b.profil.nom.split(',')[0]} (${b.statut === 'depasse' ? 'dépassé' : 'attention'})`).join(', ')}
        </li>
        <li>
          Bagages : {alertesBag === 0 ? 'aucune alerte' : pluriel(alertesBag, 'alerte')} · {pluriel(bag.nonRanges.length, 'achat non rangé', 'achats non rangés')}
        </li>
      </ul>
      <button class="btn btn-petit" style={{ alignSelf: 'flex-start' }} onClick={() => aller('retour')}>
        Préparer le retour
      </button>
    </Carte>
  );
}
