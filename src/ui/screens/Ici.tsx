// Écran Ici (§7.1, F-31, F-32).
import type { Etape, Lieu, Souvenir } from '../../db/types';
import * as A from '../../domain/actions';
import {
  achetableIci,
  bilanBagages,
  bilanDouane,
  compteurs,
  derniereChance,
  detaxeARecuperer,
  etapesDuVoyage,
  ici as calculIci,
  lieuxDe,
  lieuxIci,
  souvenirsDuVoyage,
  ticketsDuVoyage,
  totaux,
} from '../../domain/rules';
import { addDays, formatDate } from '../../domain/dates';
import { euro, lienCarte, pluriel, yen } from '../../domain/format';
import { agir, aller, fermer, ouvrir } from '../state';
import { nomEtape, useDb, useJour, useVoyage } from '../data';
import { Section, Vide } from '../components/ui';
import { Icon } from '../components/Icon';
import { libelleEtape } from '../components/champs';
import { cleConfiguree, demander, fileActive, messageFile } from '../../ai/queue';
import { Remise } from './Retour';
import { erreur, notifier } from '../state';

export function Ici() {
  const db = useDb();
  const v = useVoyage();
  const jour = useJour();
  const i = calculIci(db, v, jour);
  const etapes = etapesDuVoyage(db, v.id);
  const c = compteurs(db, v);

  if (i.mode === 'apres') {
    return (
      <div class="ecran">
        <div class="ici-tete">
          <h1>De retour</h1>
          <p class="discret">Voyage terminé le {formatDate(v.dateFin)}</p>
        </div>
        <Compteurs c={c} />
        <Remise />
      </div>
    );
  }

  const dc = derniereChance(db, v, jour);
  const idees = souvenirsDuVoyage(db, v.id).filter((s) => s.statut === 'idee');
  const achetables = idees.filter((s) => achetableIci(s, db.lieux, i.etapes));
  const derniere = i.etapes[i.etapes.length - 1];
  const prochaine = etapes.find((e) => derniere && e.ordre === derniere.ordre + 1);
  const nbProchaine = prochaine
    ? idees.filter((s) => achetableIci(s, db.lieux, [prochaine]) && !s.partout).length
    : 0;
  const t = totaux(db, v.id);
  const sansLieu = idees.filter((s) => !s.partout && lieuxDe(db, s.id).length === 0 && s.etapesPrevues.length === 0);
  const enFile = db.jobs.filter((j) => j.statut === 'file' || j.statut === 'en_cours').length;
  const retourProche = jour >= addDays(v.dateFin, -3);

  return (
    <div class="ecran">
      <div class="ici-tete">
        <div>
          <h1>{i.libelle}</h1>
          {i.manuel && <p class="discret">Lieu choisi à la main jusqu'à minuit</p>}
        </div>
        <button class="btn btn-petit" onClick={() => ouvrir('Je suis ailleurs', () => <Ailleurs etapes={etapes} />)}>
          Je suis ailleurs
        </button>
      </div>

      <Compteurs c={c} />

      {(dc.ici.length > 0 || dc.plusPrevue.length > 0 || dc.modeDerniersJours) && (
        <Section titre="Dernière chance" id="derniere-chance">
          {dc.ici.length > 0 && (
            <>
              <h4 class="sous-titre alerte-texte">
                <Icon n="alerte" taille={16} /> Dernière chance ici
              </h4>
              <ul class="liste">
                {dc.ici.map((x) => (
                  <LigneIdee s={x.souvenir} etapes={i.etapes} info={`Dernière étape : ${x.derniere.ville}`} />
                ))}
              </ul>
            </>
          )}
          {dc.plusPrevue.length > 0 && (
            <>
              <h4 class="sous-titre">Plus prévue sur le parcours</h4>
              <ul class="liste">
                {dc.plusPrevue.map((s) => (
                  <LigneIdee s={s} etapes={[]} info="Aucune étape restante : ajoutez un lieu ou changez d'avis" />
                ))}
              </ul>
            </>
          )}
          {dc.modeDerniersJours && dc.derniersJours.length > 0 && (
            <>
              <h4 class="sous-titre">Derniers jours</h4>
              <ul class="liste">
                {dc.derniersJours.map((x) => (
                  <LigneIdee
                    s={x.souvenir}
                    etapes={i.etapes}
                    info={x.souvenir.partout ? 'Partout' : x.derniere ? `Dernière étape : ${x.derniere.ville}` : 'Plus prévue'}
                  />
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      <Section titre={`Achetable ici (${achetables.length})`} id="achetable">
        {achetables.length === 0 ? (
          <Vide>Aucune idée prévue ici. Ajoutez des étapes ou des lieux à vos idées.</Vide>
        ) : (
          <ul class="liste">
            {achetables.map((s) => (
              <LigneIdee s={s} etapes={i.etapes} excursion={i.excursion} />
            ))}
          </ul>
        )}
      </Section>

      {prochaine && (
        <Section titre="Ensuite">
          <p>
            <strong>{libelleEtape(prochaine, etapes)}</strong>, arrivée {formatDate(prochaine.arrivee)} ·{' '}
            {pluriel(nbProchaine, 'idée prévue', 'idées prévues')}
          </p>
        </Section>
      )}

      <Section titre="Total dépensé">
        <p class="total">
          <strong>{yen(t.yen)}</strong> · {euro(t.eur)}
        </p>
        <p class="discret">
          dont pour moi : {yen(t.moiYen)} · {euro(t.moiEur)}
        </p>
      </Section>

      {(cleConfiguree.value || enFile > 0) && (
        <Section titre={<><Icon n="ia" taille={16} /> Assistant IA</>}>
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
                      notifier(`${pluriel(n, 'demande ajoutée', 'demandes ajoutées')} à la file`);
                    } catch (e) {
                      erreur(e);
                    }
                  }}
                >
                  Rechercher
                </button>
              </>
            )}
          </p>
          <p class="discret">
            {enFile > 0 ? `${pluriel(enFile, 'demande', 'demandes')} en file${fileActive.value ? ' · en cours' : ''}` : 'File vide'}
            {messageFile.value ? ` · ${messageFile.value}` : ''}
          </p>
        </Section>
      )}

      {retourProche && <EncartRetour />}
    </div>
  );
}

function Compteurs({ c }: { c: ReturnType<typeof compteurs> }) {
  const cases: [number, string, string][] = [
    [c.sansRien, 'Personnes sans rien', 'personnes?filtre=rien'],
    [c.ideesAAcheter, 'Idées à acheter', 'souvenirs?seg=idees'],
    [c.aAttribuer, 'Achats à attribuer', 'souvenirs?seg=a_attribuer'],
    [c.aDonner, 'Cadeaux à donner', 'retour?section=remise'],
  ];
  return (
    <div class="compteurs">
      {cases.map(([n, l, href]) => (
        <a class="compteur" href={'#/' + href}>
          <strong>{n}</strong>
          <span>{l}</span>
        </a>
      ))}
    </div>
  );
}

function LigneIdee(props: { s: Souvenir; etapes: Etape[]; info?: string; excursion?: Etape['excursions'][number] }) {
  const db = useDb();
  const lieux: Lieu[] = lieuxIci(lieuxDe(db, props.s.id), props.etapes, props.excursion);
  return (
    <li class="ligne-idee">
      <a href={'#/souvenirs/' + props.s.id} class="ligne-lien">
        <span class="ligne-titre">
          {props.s.nom}
          {props.s.quantite > 1 && <span class="discret"> ×{props.s.quantite}</span>}
          {props.s.partout && <span class="puce">Partout</span>}
        </span>
        {props.info && <span class="discret">{props.info}</span>}
      </a>
      {lieux.length > 0 && (
        <ul class="lieux-ici">
          {lieux.slice(0, 4).map((l) => (
            <li>
              <span>
                <strong>{l.nom}</strong>
                {l.zone && <span class="discret"> · {l.zone}</span>}
                {(l.prixMinYen !== undefined || l.prixMaxYen !== undefined) && (
                  <span class="discret">
                    {' '}
                    · {l.prixMinYen !== undefined ? yen(l.prixMinYen) : '?'}
                    {l.prixMaxYen !== undefined && l.prixMaxYen !== l.prixMinYen ? ` – ${yen(l.prixMaxYen)}` : ''}
                  </span>
                )}
              </span>
              <a
                class="btn-icone"
                href={lienCarte(l.nom, nomEtape(db, l.etapeIds.find((e) => props.etapes.some((x) => x.id === e)) ?? l.etapeIds[0]))}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Carte : ${l.nom}`}
              >
                <Icon n="carte" taille={18} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
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
              {libelleEtape(e, etapes)} <span class="discret">{e.region}</span>
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
  const alertesBag = bag.bagages.reduce((n, b) => n + b.alertes.filter((a) => a.grave).length + (b.depasse ? 1 : 0), 0) +
    bag.alertesGenerales.filter((a) => a.grave).length;
  return (
    <Section titre={<><Icon n="retour" taille={16} /> Retour</>}>
      <ul class="liste-simple">
        {v.detaxeActive && (
          <li>
            Détaxe à récupérer : <strong>{yen(detaxeARecuperer(tickets))}</strong>
            {compromis > 0 && <span class="alerte-texte"> · {pluriel(compromis, 'ticket compromis', 'tickets compromis')}</span>}
          </li>
        )}
        <li>
          Douane :{' '}
          {douane.length === 0 ? 'rien à signaler' : douane.map((b) => `${b.profil.nom.split(',')[0]} (${b.statut === 'depasse' ? 'dépassé' : 'attention'})`).join(', ')}
        </li>
        <li>
          Bagages : {alertesBag === 0 ? 'aucune alerte' : pluriel(alertesBag, 'alerte')} · {pluriel(bag.nonRanges.length, 'achat non rangé', 'achats non rangés')}
        </li>
      </ul>
      <button class="btn btn-petit" onClick={() => aller('retour')}>
        Préparer le retour
      </button>
    </Section>
  );
}
