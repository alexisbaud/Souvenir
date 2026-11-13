// Ajout rapide (§7.4, F-20, F-21, F-24) : un seul écran. Sans prix = une idée, avec un prix = un achat.
import { useState } from 'preact/hooks';
import type { Retour, Souvenir } from '../../db/types';
import * as A from '../../domain/actions';
import { attributionsDe, dateParDefautPourEtape, estPourMoi, ici, ideesSimilaires, lieuxDe, nomCible } from '../../domain/rules';
import { formatDate, today } from '../../domain/dates';
import { parseNombre, yen } from '../../domain/format';
import { db as lireDb } from '../../db/store';
import { MOI_ID } from '../../db/types';
import { aller, essayer, fermer, ouvrir } from '../state';
import { categoriesTriees, nomEtape, useDb, useJour, useVoyage } from '../data';
import { PourQui } from '../components/PourQui';
import { EtapeSelect, EtapesChoix, PrixChamp, RetourChamps } from '../components/champs';
import { Champ, Interrupteur, Plier, Selecteur, Texte, ZoneTexte } from '../components/ui';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/visuel';
import { enregistrerPhoto } from '../components/photo';

export interface OptionsSaisie {
  pour?: A.SelectionCibles;
  /** Passer une idée existante en achat */
  ideeId?: string;
  nom?: string;
}

export function ouvrirSaisie(opts: OptionsSaisie = {}) {
  if (opts.ideeId) {
    const s = lireDb().souvenirs.find((x) => x.id === opts.ideeId);
    ouvrir(`Acheté : ${s?.nom ?? ''}`, () => <FormSaisie ideeId={opts.ideeId} />);
    return;
  }
  ouvrir('Ajouter', () => <FormSaisie pour={opts.pour} nom={opts.nom} />);
}

export function Quantite(props: { valeur: number; onChange: (n: number) => void; min?: number }) {
  const min = props.min ?? 1;
  return (
    <div class="quantite">
      <button type="button" class="btn-icone" aria-label="Moins" onClick={() => props.onChange(Math.max(min, props.valeur - 1))}>
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Quantité"
        value={props.valeur}
        onChange={(e) => {
          const n = Math.round(parseNombre((e.target as HTMLInputElement).value));
          props.onChange(Number.isFinite(n) ? Math.max(min, n) : min);
        }}
      />
      <button type="button" class="btn-icone" aria-label="Plus" onClick={() => props.onChange(props.valeur + 1)}>
        +
      </button>
    </div>
  );
}

function FormSaisie(props: OptionsSaisie) {
  const db = useDb();
  const v = useVoyage();
  const jour = useJour();
  const icCourant = ici(db, v, jour);
  const etapeIci = icCourant.etapes[icCourant.etapes.length - 1]?.id ?? db.etapes[0]?.id ?? '';
  const [ideeId, setIdeeId] = useState(props.ideeId);
  const idee: Souvenir | undefined = ideeId ? db.souvenirs.find((s) => s.id === ideeId) : undefined;
  const attrsIdee = idee ? attributionsDe(db, idee.id) : [];

  const [nom, setNom] = useState(idee?.nom ?? props.nom ?? '');
  const [prix, setPrix] = useState('');
  const [devise, setDevise] = useState<'JPY' | 'EUR'>('JPY');
  const tauxConnu = db.parametres.taux.jpyEur;
  const [tauxSaisi, setTauxSaisi] = useState('');
  const taux = tauxConnu ?? (parseNombre(tauxSaisi) > 0 ? parseNombre(tauxSaisi) : undefined);
  const [pour, setPour] = useState<A.SelectionCibles>(props.pour ?? A.SELECTION_VIDE);
  const [achetees, setAchetees] = useState<string[]>(attrsIdee.map((a) => a.id));
  const [quantite, setQuantite] = useState(idee?.quantite ?? 1);
  const [etapeId, setEtapeId] = useState(etapeIci);
  const [date, setDate] = useState(today());
  const [rattrapage, setRattrapage] = useState(false);
  const [boutique, setBoutique] = useState(db.parametres.derniereBoutique?.[etapeIci] ?? '');
  const [boutiqueTouchee, setBoutiqueTouchee] = useState(false);
  const [lieuId, setLieuId] = useState<string | undefined>();
  const [categorie, setCategorie] = useState(idee?.categorieId ?? '');
  const [detaxe, setDetaxe] = useState(false);
  const [retour, setRetour] = useState<Retour>(idee?.retour ?? {});
  const [etapes, setEtapes] = useState<string[]>([]);
  const [partout, setPartout] = useState(false);
  const [note, setNote] = useState('');
  const [photoId, setPhotoId] = useState<string | undefined>();
  const [photoEnCours, setPhotoEnCours] = useState(false);

  const p = parseNombre(prix);
  const achat = !!idee || (prix.trim() !== '' && Number.isFinite(p));
  const similaires = !ideeId && nom.trim().length >= 3 ? ideesSimilaires(db, v.id, nom).slice(0, 2) : [];
  const lieux = idee ? lieuxDe(db, idee.id) : [];
  const nbCibles = idee
    ? attrsIdee.filter((a) => achetees.includes(a.id)).reduce((n, a) => n + a.quantite, 0)
    : A.ciblesDeSelection(pour).length;

  const choisirEtape = (id: string) => {
    setEtapeId(id);
    const e = db.etapes.find((x) => x.id === id);
    if (e) setDate(dateParDefautPourEtape(e, jour));
    if (!boutiqueTouchee) setBoutique(db.parametres.derniereBoutique?.[id] ?? '');
  };

  const choisirIdee = (s: Souvenir) => {
    setIdeeId(s.id);
    setNom(s.nom);
    setCategorie(s.categorieId ?? '');
    setQuantite(s.quantite);
    setRetour(s.retour);
    setAchetees(attributionsDe(db, s.id).map((a) => a.id));
  };

  const enregistrer = async (e: Event) => {
    e.preventDefault();
    let id: string | undefined;
    const ok = await essayer(
      (d) => {
        if (!achat) {
          id = A.creerIdee(d, { nom, cibles: pour, quantite: Math.max(quantite, nbCibles), categorieId: categorie, etapesPrevues: etapes, partout, note, retour }).id;
          return;
        }
        if (!Number.isFinite(p)) throw new A.ErreurMetier('Indiquez le prix payé.');
        if (!tauxConnu && taux) A.definirTauxManuel(d, taux, undefined, jour);
        const data: A.DonneesAchat = {
          nom,
          prix: p,
          devise,
          tauxEUR: taux ?? 0,
          quantite: Math.max(quantite, nbCibles),
          date,
          etapeId,
          boutique,
          categorieId: categorie || undefined,
          detaxe,
          retour,
          lieuId,
          photoId,
          note: note || undefined,
        };
        id = idee ? A.acheterIdee(d, idee.id, data, achetees).id : A.creerAchat(d, { ...data, cibles: pour }).id;
      },
      achat ? 'Achat enregistré' : 'Idée ajoutée',
    );
    if (ok) {
      fermer();
      if (id && location.hash.startsWith('#/souvenirs/')) aller('souvenirs/' + id);
    }
  };

  return (
    <form class="pile" onSubmit={enregistrer}>
      <Champ label="Quoi ?">
        <Texte valeur={nom} onValeur={setNom} autoFocus={!idee} placeholder="Tenugui, thé matcha, saké…" required grand />
      </Champ>
      {similaires.map((s) => (
        <button type="button" class="suggestion-doublon" onClick={() => choisirIdee(s)}>
          C'est votre idée « {s.nom} » ? Acheter cette idée
          {attributionsDe(db, s.id).length > 0 && <small> (pour {attributionsDe(db, s.id).map((a) => nomCible(db, a)).join(', ')})</small>}
        </button>
      ))}

      {idee ? (
        attrsIdee.length > 1 ? (
          <Champ groupe label="Acheté pour" aide="Les personnes non cochées gardent l'idée.">
            <div class="choix-pour" role="group" aria-label="Acheté pour">
              {attrsIdee.map((a) => {
                const actif = achetees.includes(a.id);
                const ids = a.cible.type === 'personnes' ? a.cible.ids : [];
                const pers = ids.length === 1 ? db.personnes.find((x) => x.id === ids[0]) : undefined;
                return (
                  <button type="button" aria-pressed={actif} onClick={() => setAchetees(actif ? achetees.filter((x) => x !== a.id) : [...achetees, a.id])}>
                    {pers ? (
                      <Avatar personne={pers} taille={50} actif={actif} />
                    ) : (
                      <span class={'avatar' + (actif ? ' avatar-actif' : '')} style={{ width: '50px', height: '50px', background: 'var(--fond-3)' }} aria-hidden="true">
                        <Icon n="groupe" taille={22} />
                      </span>
                    )}
                    <span class="nom-avatar">{estPourMoi(a) ? 'Moi' : nomCible(db, a)}</span>
                  </button>
                );
              })}
            </div>
          </Champ>
        ) : attrsIdee.length === 1 ? (
          <p class="discret">Pour {estPourMoi(attrsIdee[0]) ? 'moi' : nomCible(db, attrsIdee[0])}</p>
        ) : null
      ) : (
        <Champ groupe label="Pour qui ?">
          <PourQui valeur={pour} onChange={setPour} />
        </Champ>
      )}

      <Champ label={idee ? 'Prix payé' : <>Prix payé <span style={{ fontWeight: 500 }}>(vide = c'est une idée)</span></>} for="prix">
        <PrixChamp id="prix" prix={prix} devise={devise} taux={taux} onPrix={setPrix} onDevise={setDevise} />
      </Champ>
      {achat && !tauxConnu && (
        <Champ label="Taux JPY → EUR" aide="Aucun taux connu : saisissez-le (ex. 0,0058). Il sera mémorisé.">
          <input type="text" inputMode="decimal" value={tauxSaisi} onInput={(e) => setTauxSaisi((e.target as HTMLInputElement).value)} required />
        </Champ>
      )}

      {achat && (
        <>
          <div class="rattrapage">
            <span>
              <Icon n="ici" taille={18} />
              {date === today() ? "Aujourd'hui" : formatDate(date)} · {nomEtape(db, etapeId)}
              {boutique ? ` · ${boutique}` : ''}
            </span>
            <button type="button" class="btn btn-petit" onClick={() => setRattrapage(!rattrapage)} aria-expanded={rattrapage}>
              Changer
            </button>
          </div>
          {lieux.length > 0 && (
            <Champ groupe label="Acheté ici ?">
              <div class="puces">
                {lieux.map((l) => (
                  <button
                    type="button"
                    class={'puce puce-btn' + (lieuId === l.id ? ' actif' : '')}
                    aria-pressed={lieuId === l.id}
                    onClick={() => {
                      setLieuId(l.id);
                      setBoutique(l.nom);
                      setBoutiqueTouchee(true);
                      const e = l.etapeIds.find((x) => icCourant.etapes.some((y) => y.id === x)) ?? l.etapeIds[0];
                      if (e && e !== etapeId) choisirEtape(e);
                    }}
                  >
                    {l.nom} · {l.etapeIds.map((x) => nomEtape(db, x)).join(', ')}
                  </button>
                ))}
              </div>
            </Champ>
          )}
          {rattrapage && (
            <div class="pile">
              <div class="grille2">
                <Champ label="Étape">
                  <EtapeSelect valeur={etapeId} onValeur={choisirEtape} />
                </Champ>
                <Champ label="Date">
                  <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value || date)} />
                </Champ>
              </div>
              <Champ label="Boutique">
                <Texte
                  valeur={boutique}
                  onValeur={(b: string) => {
                    setBoutique(b);
                    setBoutiqueTouchee(true);
                  }}
                  placeholder="Facultatif"
                />
              </Champ>
            </div>
          )}
        </>
      )}

      <Plier titre={achat ? 'Photo, quantité, détaxe, alcool…' : 'Où l’acheter, quantité, catégorie…'}>
        {!achat && (
          <>
            <Champ groupe label="Étapes où l'acheter">
              <EtapesChoix valeur={etapes} onChange={setEtapes} />
            </Champ>
            <Interrupteur label="Partout" aide="Trouvable à toutes les étapes (konbini…)" checked={partout} onChange={setPartout} />
          </>
        )}
        <div class="grille2">
          <Champ label="Catégorie">
            <Selecteur valeur={categorie} onValeur={setCategorie} vide="—" options={categoriesTriees(db).map((c) => ({ id: c.id, libelle: c.libelle }))} />
          </Champ>
          <Champ groupe label="Quantité">
            <Quantite valeur={Math.max(quantite, nbCibles)} min={Math.max(1, nbCibles)} onChange={setQuantite} />
          </Champ>
        </div>
        {achat && (
          <>
            <Champ groupe label="Photo (facultative)">
              <label class="ajout-photo">
                <Icon n="photo" taille={20} />
                {photoEnCours ? 'Compression…' : photoId ? 'Photo prête · changer' : 'Ajouter une photo'}
                <input
                  type="file"
                  accept="image/*"
                  class="masque"
                  onChange={async (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (!f) return;
                    setPhotoEnCours(true);
                    try {
                      setPhotoId(await enregistrerPhoto(f));
                    } finally {
                      setPhotoEnCours(false);
                    }
                  }}
                />
              </label>
            </Champ>
            {v.detaxeActive && (
              <Interrupteur label="Détaxé" aide={`Regroupé par boutique et par jour ; éligible à partir de ${yen(5000)} HT`} checked={detaxe} onChange={setDetaxe} />
            )}
          </>
        )}
        <RetourChamps valeur={retour} achete={achat} onChange={(m) => setRetour({ ...retour, ...m })} />
        <Champ label="Note">
          <ZoneTexte valeur={note} onValeur={setNote} rows={2} />
        </Champ>
      </Plier>

      <div class="actions collantes">
        <button type="submit" class={'btn btn-large ' + (achat ? 'btn-primaire' : 'btn-idee')}>
          <Icon n={achat ? 'sac' : 'ampoule'} taille={20} epaisseur={2} />
          {achat ? "Enregistrer l'achat" : "Enregistrer l'idée"}
        </button>
      </div>
    </form>
  );
}

export { MOI_ID };
