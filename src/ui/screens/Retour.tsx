// Retour : détaxe, douane, bagages, remise (§7.6, F-50 à F-53).
import { useState } from 'preact/hooks';
import type { Attribution, Bagage, ProfilDouanier, RegleAlcool } from '../../db/types';
import * as A from '../../domain/actions';
import {
  attributionsADonner,
  bilanBagages,
  bilanDouane,
  detaxeARecuperer,
  estPourMoi,
  nomCible,
  personnesDeCible,
  souvenirsDuVoyage,
  ticketsDuVoyage,
  type EtatTicket,
  type LigneDouane,
} from '../../domain/rules';
import { addDays, formatDate, today } from '../../domain/dates';
import { euro, montant, nombre, parseNombre, pluriel, pourcent, yen } from '../../domain/format';
import { agir, essayer, fermer, ouvrir, route } from '../state';
import { groupesTries, useDb, useJour, useVoyage } from '../data';
import { Barre, BadgeStatut, Champ, Interrupteur, LienExterne, Section, Segments, Selecteur, Texte, Vide, ZoneTexte } from '../components/ui';
import { Icon } from '../components/Icon';

type Onglet = 'detaxe' | 'douane' | 'bagages' | 'remise';

export function Retour() {
  const v = useVoyage();
  const q = route.value.query.get('section') as Onglet | null;
  const [onglet, setOnglet] = useState<Onglet>(q ?? (v.detaxeActive ? 'detaxe' : 'douane'));
  return (
    <div class="ecran">
      <div class="ecran-tete">
        <h1>Retour</h1>
      </div>
      <Segments
        label="Sections"
        valeur={onglet}
        onChange={setOnglet}
        valeurs={[
          ...(v.detaxeActive ? [{ id: 'detaxe' as const, libelle: 'Détaxe' }] : []),
          { id: 'douane', libelle: 'Douane' },
          { id: 'bagages', libelle: 'Bagages' },
          { id: 'remise', libelle: 'Remise' },
        ]}
      />
      {onglet === 'detaxe' && <Detaxe />}
      {onglet === 'douane' && <Douane />}
      {onglet === 'bagages' && <Bagages />}
      {onglet === 'remise' && <Remise />}
    </div>
  );
}

// ---------------------------------------------------------------- Détaxe (F-50)

function Detaxe() {
  const db = useDb();
  const v = useVoyage();
  const jour = useJour();
  const tickets = ticketsDuVoyage(db, v);
  const departProche = jour >= addDays(v.dateFin, -1) && jour <= v.dateFin;
  return (
    <>
      <div class={'checklist' + (departProche ? ' evidence' : '')}>
        <h3>
          <Icon n="alerte" taille={18} /> Au départ
        </h3>
        <ul>
          <li>
            Faire la procédure à la borne de détaxe, passeport en main, <strong>avant</strong> d'enregistrer les bagages.
          </li>
          <li>Avoir sur soi tous les articles de chaque ticket : un seul manquant invalide tout le ticket.</li>
          <li>Prévoir du temps pour une éventuelle inspection (résultat rouge à la borne).</li>
          <li>Un article consommé au Japon ne passe pas par la procédure : le signaler au douanier.</li>
        </ul>
      </div>
      <Section titre="À récupérer">
        <p class="total">
          <strong>{yen(detaxeARecuperer(tickets))}</strong>
        </p>
        <p class="discret">Somme des taxes des tickets éligibles et non compromis. Le remboursement passe par la boutique ou son prestataire.</p>
      </Section>
      <Section titre={`Tickets (${tickets.length})`}>
        {tickets.length === 0 ? <Vide>Aucun achat détaxé. Cochez « Détaxé » sur un achat.</Vide> : <ul class="liste">{tickets.map((t) => <Ticket t={t} />)}</ul>}
      </Section>
      <p class="discret petite">
        Source : <LienExterne href="https://www.mlit.go.jp/kankocho/tax-free/page01_000001_00028.html">Japan Tourism Agency</LienExterne>. Délai : 90 jours après l'achat.
      </p>
    </>
  );
}

function Ticket({ t }: { t: EtatTicket }) {
  const [taxe, setTaxe] = useState(t.ticket.taxeYen?.toString() ?? '');
  const [note, setNote] = useState(t.ticket.note ?? '');
  return (
    <li class="carte-ticket">
      <div class="carte-lieu-tete">
        <strong>
          {t.ticket.boutique} · {formatDate(t.ticket.date)}
        </strong>
        <Selecteur
          valeur={t.ticket.statut}
          onValeur={(s) => agir((d) => A.modifierTicket(d, t.ticket.id, { statut: (s || 'a_valider') as 'valide' }), 'Statut du ticket modifié')}
          options={[
            { id: 'a_valider', libelle: 'À valider' },
            { id: 'valide', libelle: 'Validé' },
            { id: 'rembourse', libelle: 'Remboursé' },
          ]}
        />
      </div>
      <p>
        {yen(t.totalTTC)} TTC · {yen(t.totalHT)} HT ·{' '}
        {t.eligible ? (
          <span class="badge statut-ok">✓ Éligible</span>
        ) : (
          <span class="badge statut-attention">! Sous le seuil de 5 000 ¥ HT</span>
        )}
      </p>
      <p class="discret">
        {t.souvenirs.map((s) => s.nom).join(', ')} · avant le {formatDate(t.dateLimite)}
      </p>
      {t.compromis.length > 0 && (
        <div class="alerte" role="alert">
          <strong>Ticket compromis</strong>
          {t.compromis.map((c) => (
            <p>{c}</p>
          ))}
        </div>
      )}
      <div class="grille2">
        <Champ label="Taxe du ticket (¥)" aide={t.taxeEstimee ? `Estimée : ${yen(t.taxe)}` : 'Saisie depuis le ticket'}>
          <input
            type="text"
            inputMode="numeric"
            value={taxe}
            placeholder={String(t.taxe)}
            onInput={(e) => setTaxe((e.target as HTMLInputElement).value)}
            onBlur={() => {
              const n = parseNombre(taxe);
              void agir((d) => A.modifierTicket(d, t.ticket.id, { taxeYen: taxe.trim() && Number.isFinite(n) ? Math.round(n) : undefined }));
            }}
          />
        </Champ>
        <Champ label="Note">
          <input
            type="text"
            value={note}
            placeholder="Mode de remboursement…"
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            onBlur={() => note !== (t.ticket.note ?? '') && agir((d) => A.modifierTicket(d, t.ticket.id, { note: note || undefined }))}
          />
        </Champ>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- Douane (F-51)

function Douane() {
  const db = useDb();
  const v = useVoyage();
  const profils = db.profils.filter((p) => p.voyageId === v.id).sort((a, b) => a.ordre - b.ordre);
  return (
    <>
      <p class="avert">Indicatif, ne remplace pas l'information officielle.</p>
      {!db.parametres.taux.jpyEur && <p class="avert">Taux de change manquant : renseignez-le dans les paramètres.</p>}
      {profils.map((p, i) => {
        const b = bilanDouane(db, v, p);
        return (
          <Section
            titre={
              <>
                {i + 1}. {p.nom} <BadgeStatut s={b.statut} />
              </>
            }
            action={
              <button class="btn btn-petit" onClick={() => ouvrir(`Profil : ${p.nom}`, () => <FormProfil p={p} />, { large: true })}>
                Modifier
              </button>
            }
          >
            <LigneD l={b.valeur} format={(n) => montant(n, p.devise)} />
            <p class="discret petite">{p.regleValeur}</p>
            {b.alcool.map((l) => (
              <LigneD l={l} format={(n) => (l.unite === 'prorata' ? nombre(n, 2) : `${nombre(n, 2)} L`)} />
            ))}
            {b.sansCategorie.length > 0 && <p class="avert">Alcool non classé : {b.sansCategorie.map((s) => s.nom).join(', ')}</p>}
            {b.interdits.length > 0 ? (
              b.interdits.map((x) => (
                <div class="alerte" role="alert">
                  <strong>{x.libelle} : interdit</strong>
                  <p>{x.souvenirs.map((s) => s.nom).join(', ')}</p>
                </div>
              ))
            ) : (
              <p class="discret">Aucun produit interdit détecté.</p>
            )}
            <p class="discret petite">{p.interdits.texte}</p>
            <p class="discret petite">
              Vérifié le {formatDate(p.verifieLe)} ·{' '}
              {p.sources.map((u, k) => (
                <>
                  {k > 0 && ' · '}
                  <LienExterne href={u}>source {k + 1}</LienExterne>
                </>
              ))}
            </p>
          </Section>
        );
      })}
    </>
  );
}

function LigneD({ l, format }: { l: LigneDouane; format: (n: number) => string }) {
  return (
    <div class="ligne-douane">
      <div class="ligne-douane-tete">
        <span>{l.libelle}</span>
        <span>
          {l.unite === 'prorata' ? `${format(l.valeur)} / 1` : `${format(l.valeur)} / ${format(l.limite)}`} <BadgeStatut s={l.statut} />
        </span>
      </div>
      <Barre ratio={l.ratio} statut={l.statut} />
      {l.detail && <p class="discret petite">{l.detail}</p>}
      {l.souvenirs.length > 0 && l.unite !== l.libelle && l.libelle !== 'Valeur des achats' && (
        <p class="discret petite">{l.souvenirs.map((s) => s.nom).join(', ')}</p>
      )}
    </div>
  );
}

function FormProfil({ p }: { p: ProfilDouanier }) {
  const [nom, setNom] = useState(p.nom);
  const [franchise, setFranchise] = useState(String(p.franchiseValeur));
  const [regle, setRegle] = useState(p.regleValeur);
  const [regles, setRegles] = useState<RegleAlcool[]>(p.reglesAlcool);
  const [interdits, setInterdits] = useState(p.interdits);
  const [verifie, setVerifie] = useState(p.verifieLe);
  const [sources, setSources] = useState(p.sources.join('\n'));
  return (
    <form
      class="pile"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = parseNombre(franchise);
        const ok = await essayer(
          (d) =>
            A.modifierProfil(d, p.id, {
              nom,
              franchiseValeur: Number.isFinite(f) ? f : p.franchiseValeur,
              regleValeur: regle,
              reglesAlcool: regles,
              interdits,
              verifieLe: verifie,
              sources: sources.split(/\s+/).filter((u) => /^https?:\/\//.test(u)),
            }),
          'Profil modifié',
        );
        if (ok) fermer();
      }}
    >
      <Champ label="Nom">
        <Texte valeur={nom} onValeur={setNom} />
      </Champ>
      <Champ label={`Franchise (${p.devise})`}>
        <input type="text" inputMode="decimal" value={franchise} onInput={(e) => setFranchise((e.target as HTMLInputElement).value)} />
      </Champ>
      <Champ label="Au-delà">
        <ZoneTexte valeur={regle} onValeur={setRegle} rows={2} />
      </Champ>
      <fieldset class="pile">
        <legend>Alcool (limites en litres)</legend>
        {regles.map((r, i) => (
          <Champ label={`${r.libelle}${r.groupeProrata ? ' (prorata)' : ''}`}>
            <input
              type="text"
              inputMode="decimal"
              value={String(r.limiteL).replace('.', ',')}
              onChange={(e) => {
                const n = parseNombre((e.target as HTMLInputElement).value);
                if (n > 0) setRegles(regles.map((x, j) => (j === i ? { ...x, limiteL: n } : x)));
              }}
            />
          </Champ>
        ))}
      </fieldset>
      <fieldset class="pile">
        <legend>Interdits</legend>
        <Interrupteur label="Viande" checked={interdits.viande} onChange={(c) => setInterdits({ ...interdits, viande: c })} />
        <Interrupteur label="Produits laitiers" checked={interdits.lait} onChange={(c) => setInterdits({ ...interdits, lait: c })} />
        <Interrupteur label="Végétaux" checked={interdits.vegetal} onChange={(c) => setInterdits({ ...interdits, vegetal: c })} />
        <ZoneTexte valeur={interdits.texte} onValeur={(t) => setInterdits({ ...interdits, texte: t })} rows={3} />
      </fieldset>
      <Champ label="Sources (une URL par ligne)">
        <ZoneTexte valeur={sources} onValeur={setSources} rows={3} />
      </Champ>
      <Champ label="Vérifié le">
        <input type="date" value={verifie} onInput={(e) => setVerifie((e.target as HTMLInputElement).value || verifie)} />
      </Champ>
      <button type="submit" class="btn btn-primaire btn-large">
        Enregistrer
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- Bagages (F-52)

function Bagages() {
  const db = useDb();
  const v = useVoyage();
  const b = bilanBagages(db, v);
  const bagages = db.bagages.filter((x) => x.voyageId === v.id);
  return (
    <>
      {v.detaxeActive && (
        <p class="avert">
          <Icon n="alerte" taille={16} /> Détaxe : présentez les articles détaxés à la borne <strong>avant</strong> l'enregistrement des bagages.
        </p>
      )}
      {b.alertesGenerales.map((a) => (
        <p class={a.grave ? 'alerte' : 'avert'} role={a.grave ? 'alert' : undefined}>
          {a.texte}
          {a.souvenir ? ` : ${a.souvenir.nom}` : ''}
        </p>
      ))}
      {b.bagages.map((x) => (
        <Section
          titre={
            <>
              {x.bagage.nom} <span class="discret">({x.bagage.type})</span>
            </>
          }
          action={
            <button class="btn btn-petit" onClick={() => ouvrir(`Bagage : ${x.bagage.nom}`, () => <FormBagage b={x.bagage} />)}>
              Modifier
            </button>
          }
        >
          <p>
            Souvenirs : {nombre(x.poidsSouvenirsKg, 2)} kg
            {x.bagage.poidsHorsSouvenirsKg ? ` · total ${nombre(x.poidsTotalKg, 2)} kg` : ''}
            {x.bagage.poidsMaxKg ? ` / ${nombre(x.bagage.poidsMaxKg, 1)} kg max` : ''}
            {x.depasse && <span class="badge statut-depasse"> ✕ Dépassé</span>}
          </p>
          {x.bagage.poidsMaxKg ? <Barre ratio={x.poidsTotalKg / x.bagage.poidsMaxKg} statut={x.depasse ? 'depasse' : x.poidsTotalKg / x.bagage.poidsMaxKg >= 0.8 ? 'attention' : 'ok'} /> : null}
          {x.alertes.map((a) => (
            <p class={a.grave ? 'alerte' : 'avert'}>
              {a.souvenir?.nom} : {a.texte}
            </p>
          ))}
          {x.souvenirs.length === 0 ? (
            <Vide>Rien de rangé.</Vide>
          ) : (
            <ul class="liste">
              {x.souvenirs.map((s) => (
                <li class="ligne-rangement">
                  <a href={'#/souvenirs/' + s.id}>{s.nom}</a>
                  <span class="discret">{s.retour.poidsG ? `${s.retour.poidsG} g` : 'poids ?'}</span>
                  <button class="btn btn-petit" onClick={() => agir((d) => A.rangerDansBagage(d, s.id, undefined))}>
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ))}
      <Section titre={`Non rangés (${b.nonRanges.length})`}>
        {b.nonRanges.length === 0 ? (
          <Vide>Tout est rangé.</Vide>
        ) : (
          <ul class="liste">
            {b.nonRanges.map((s) => (
              <li class="ligne-rangement">
                <a href={'#/souvenirs/' + s.id}>{s.nom}</a>
                <span class="boutons">
                  {bagages.map((bg) => (
                    <button class="btn btn-petit" onClick={() => agir((d) => A.rangerDansBagage(d, s.id, bg.id), `Rangé dans ${bg.nom}`)}>
                      {bg.nom}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <button class="btn" onClick={() => ouvrir('Nouveau bagage', () => <FormBagage />)}>
        <Icon n="plus" taille={16} /> Bagage
      </button>
    </>
  );
}

export function FormBagage({ b }: { b?: Bagage }) {
  const [nom, setNom] = useState(b?.nom ?? '');
  const [type, setType] = useState<'soute' | 'cabine'>(b?.type ?? 'soute');
  const [max, setMax] = useState(b?.poidsMaxKg?.toString().replace('.', ',') ?? '');
  const [hors, setHors] = useState(b?.poidsHorsSouvenirsKg?.toString().replace('.', ',') ?? '');
  const n = (x: string) => {
    const v = parseNombre(x);
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  return (
    <form
      class="pile"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await essayer((d) => A.enregistrerBagage(d, { id: b?.id, nom, type, poidsMaxKg: n(max), poidsHorsSouvenirsKg: n(hors) }), 'Bagage enregistré');
        if (ok) fermer();
      }}
    >
      <Champ label="Nom">
        <Texte valeur={nom} onValeur={setNom} required />
      </Champ>
      <Champ label="Type">
        <Selecteur valeur={type} onValeur={(t) => setType((t || 'soute') as 'soute')} options={[{ id: 'soute', libelle: 'Soute' }, { id: 'cabine', libelle: 'Cabine' }]} />
      </Champ>
      <div class="grille2">
        <Champ label="Poids max (kg)">
          <input type="text" inputMode="decimal" value={max} onInput={(e) => setMax((e.target as HTMLInputElement).value)} />
        </Champ>
        <Champ label="Poids hors souvenirs (kg)">
          <input type="text" inputMode="decimal" value={hors} onInput={(e) => setHors((e.target as HTMLInputElement).value)} />
        </Champ>
      </div>
      <div class="actions">
        {b && (
          <button
            type="button"
            class="btn btn-danger"
            onClick={async () => {
              fermer();
              await agir((d) => A.supprimerBagage(d, b.id), 'Bagage supprimé');
            }}
          >
            Supprimer
          </button>
        )}
        <button type="submit" class="btn btn-primaire">
          Enregistrer
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Remise (F-53)

export function Remise() {
  const db = useDb();
  const v = useVoyage();
  const [parGroupe, setParGroupe] = useState(false);
  const aDonner = attributionsADonner(db, v.id);
  const achetes = new Set(souvenirsDuVoyage(db, v.id).filter((s) => s.statut === 'achete').map((s) => s.id));
  const total = db.attributions.filter((a) => achetes.has(a.souvenirId) && !estPourMoi(a));
  const remis = total.filter((a) => a.remise === 'donne');
  const recents = [...remis].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 10);

  // Regroupement : par destinataire (personne ou cible collective) ou par groupe
  const groupes = new Map<string, { titre: string; attrs: Attribution[] }>();
  for (const a of aDonner) {
    let cle: string;
    let titre: string;
    if (parGroupe) {
      const gid = a.cible.type === 'groupe' ? a.cible.groupeId : db.personnes.find((p) => personnesDeCible(db, a).includes(p.id))?.groupeId;
      cle = gid ?? '';
      titre = groupesTries(db).find((g) => g.id === gid)?.nom ?? 'Sans groupe';
    } else {
      cle = a.cible.type === 'groupe' ? 'g:' + a.cible.groupeId : a.cible.ids.slice().sort().join('+');
      titre = nomCible(db, a) + (a.cible.type === 'groupe' ? ' (groupe)' : '');
    }
    const e = groupes.get(cle) ?? { titre, attrs: [] };
    e.attrs.push(a);
    groupes.set(cle, e);
  }
  const liste = [...groupes.values()].sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
  return (
    <Section
      titre={`Remise · ${remis.length}/${total.length} remis`}
      action={<Interrupteur label="Par groupe" checked={parGroupe} onChange={setParGroupe} />}
    >
      <Barre ratio={total.length ? remis.length / total.length : 0} statut="ok" />
      <p class="discret">{total.length ? pourcent(remis.length / total.length) : '—'}</p>
      {liste.length === 0 ? (
        <Vide>Rien à donner.</Vide>
      ) : (
        liste.map((g) => (
          <div class="groupe-remise">
            <h4 class="sous-titre">{g.titre}</h4>
            <ul class="liste">
              {g.attrs.map((a) => {
                const s = db.souvenirs.find((x) => x.id === a.souvenirId)!;
                return (
                  <li class="ligne-rangement">
                    <a href={'#/souvenirs/' + s.id}>
                      {s.nom}
                      {a.quantite > 1 ? ` ×${a.quantite}` : ''}
                      {parGroupe && <span class="discret"> · {nomCible(db, a)}</span>}
                    </a>
                    <button class="btn btn-primaire btn-petit" onClick={() => agir((d) => A.donner(d, a.id, today()), `« ${s.nom} » donné à ${nomCible(db, a)}`)}>
                      Donné
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
      {recents.length > 0 && (
        <details class="plier">
          <summary>Derniers remis</summary>
          <ul class="liste">
            {recents.map((a) => {
              const s = db.souvenirs.find((x) => x.id === a.souvenirId)!;
              return (
                <li class="ligne-rangement">
                  <span>
                    {s.nom} → {nomCible(db, a)} <span class="discret">{a.dateRemise && formatDate(a.dateRemise)}</span>
                  </span>
                  <button class="btn btn-petit" onClick={() => agir((d) => A.annulerRemise(d, a.id), 'Remise annulée')}>
                    Annuler
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </Section>
  );
}

export { euro, pluriel };
