// Saisie express (§7.4, F-20, F-21, F-24).
import { useState } from 'preact/hooks';
import type { Retour, Souvenir } from '../../db/types';
import * as A from '../../domain/actions';
import {
  attributionsDe,
  dateParDefautPourEtape,
  ici,
  ideesSimilaires,
  lieuxDe,
  nomCible,
} from '../../domain/rules';
import { formatDate, today } from '../../domain/dates';
import { parseNombre, yen } from '../../domain/format';
import { db as lireDb } from '../../db/store';
import { essayer, fermer, ouvrir, aller } from '../state';
import { categoriesTriees, nomEtape, useDb, useJour, useVoyage } from '../data';
import { PourQui } from '../components/PourQui';
import { EtapeSelect, EtapesChoix, PrixChamp, RetourChamps } from '../components/champs';
import { Champ, Interrupteur, Plier, Puce, Selecteur, Texte, ZoneTexte } from '../components/ui';
import { enregistrerPhoto } from '../components/photo';

export function ouvrirSaisie(type: 'idee' | 'achat', opts: { pour?: A.SelectionCibles; ideeId?: string; nom?: string } = {}) {
  if (opts.ideeId) {
    const s = lireDb().souvenirs.find((x) => x.id === opts.ideeId);
    ouvrir(`Acheter « ${s?.nom ?? ''} »`, () => <FormAchat ideeId={opts.ideeId} />);
    return;
  }
  ouvrir(type === 'idee' ? 'Nouvelle idée' : 'Nouvel achat', () =>
    type === 'idee' ? <FormIdee pour={opts.pour} nom={opts.nom} /> : <FormAchat pour={opts.pour} nom={opts.nom} />,
  );
}

export function ChoixSaisie() {
  return (
    <div class="choix-saisie">
      <button
        class="btn btn-grand"
        onClick={() => {
          fermer();
          ouvrirSaisie('idee');
        }}
      >
        <strong>Idée</strong>
        <small>À acheter plus tard</small>
      </button>
      <button
        class="btn btn-grand btn-primaire"
        onClick={() => {
          fermer();
          ouvrirSaisie('achat');
        }}
      >
        <strong>Achat</strong>
        <small>Acheté à l'instant ou plus tôt</small>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Idée

function FormIdee(props: { pour?: A.SelectionCibles; nom?: string }) {
  const db = useDb();
  const [nom, setNom] = useState(props.nom ?? '');
  const [pour, setPour] = useState<A.SelectionCibles>(props.pour ?? A.SELECTION_VIDE);
  const [categorie, setCategorie] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [etapes, setEtapes] = useState<string[]>([]);
  const [partout, setPartout] = useState(false);
  const [note, setNote] = useState('');
  const nbCibles = A.ciblesDeSelection(pour).length;

  const enregistrer = async (e: Event) => {
    e.preventDefault();
    let id: string | undefined;
    const ok = await essayer((d) => {
      id = A.creerIdee(d, { nom, cibles: pour, quantite, categorieId: categorie, etapesPrevues: etapes, partout, note }).id;
    }, 'Idée ajoutée');
    if (ok) {
      fermer();
      if (id && location.hash.startsWith('#/souvenirs/')) aller('souvenirs/' + id);
    }
  };

  return (
    <form class="pile" onSubmit={enregistrer}>
      <Champ label="Nom">
        <Texte valeur={nom} onValeur={setNom} autoFocus placeholder="Ex. Tenugui, thé matcha…" required />
      </Champ>
      <Champ groupe label="Pour qui">
        <PourQui valeur={pour} onChange={setPour} />
      </Champ>
      <Plier titre="Plus de détails">
        <Champ label="Catégorie">
          <Selecteur
            valeur={categorie}
            onValeur={setCategorie}
            vide="—"
            options={categoriesTriees(db).map((c) => ({ id: c.id, libelle: c.libelle }))}
          />
        </Champ>
        <Champ groupe label="Quantité">
          <Quantite valeur={Math.max(quantite, nbCibles)} min={Math.max(1, nbCibles)} onChange={setQuantite} />
        </Champ>
        <Champ groupe label="Étapes prévues">
          <EtapesChoix valeur={etapes} onChange={setEtapes} />
        </Champ>
        <Interrupteur label="Partout" aide="Trouvable à toutes les étapes (konbini…)" checked={partout} onChange={setPartout} />
        <Champ label="Note">
          <ZoneTexte valeur={note} onValeur={setNote} rows={2} />
        </Champ>
      </Plier>
      <div class="actions collantes">
        <button type="submit" class="btn btn-primaire btn-large">
          Enregistrer l'idée
        </button>
      </div>
    </form>
  );
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

// ---------------------------------------------------------------- Achat

function FormAchat(props: { pour?: A.SelectionCibles; ideeId?: string; nom?: string }) {
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
  const [photoId, setPhotoId] = useState<string | undefined>();
  const [photoEnCours, setPhotoEnCours] = useState(false);

  const similaires = !ideeId && nom.trim().length >= 3 ? ideesSimilaires(db, v.id, nom).slice(0, 3) : [];
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
    const p = parseNombre(prix);
    let id: string | undefined;
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
    };
    const ok = await essayer((d) => {
      if (!tauxConnu && taux) A.definirTauxManuel(d, taux, undefined, jour);
      id = idee ? A.acheterIdee(d, idee.id, data, achetees).id : A.creerAchat(d, { ...data, cibles: pour }).id;
    }, 'Achat enregistré');
    if (ok) {
      fermer();
      if (id && location.hash.startsWith('#/souvenirs/')) aller('souvenirs/' + id);
    }
  };

  return (
    <form class="pile" onSubmit={enregistrer}>
      <Champ label="Nom">
        <Texte valeur={nom} onValeur={setNom} autoFocus={!idee} placeholder="Ex. Tenugui" required />
      </Champ>
      {similaires.map((s) => (
        <button type="button" class="suggestion-doublon" onClick={() => choisirIdee(s)}>
          Acheter l'idée « {s.nom} »
          {attributionsDe(db, s.id).length > 0 && <small> · pour {attributionsDe(db, s.id).map((a) => nomCible(db, a)).join(', ')}</small>}
        </button>
      ))}
      <Champ label="Prix total payé (TTC)" for="prix">
        <PrixChamp id="prix" prix={prix} devise={devise} taux={taux} onPrix={setPrix} onDevise={setDevise} />
      </Champ>
      {!tauxConnu && (
        <Champ label="Taux JPY → EUR" aide="Aucun taux connu : saisissez-le (ex. 0,0058). Il sera mémorisé.">
          <input type="text" inputMode="decimal" value={tauxSaisi} onInput={(e) => setTauxSaisi((e.target as HTMLInputElement).value)} required />
        </Champ>
      )}
      {idee ? (
        attrsIdee.length > 1 ? (
          <Champ groupe label="Acheté pour" aide="Achat partiel : les destinataires non cochés gardent l'idée.">
            <div class="puces">
              {attrsIdee.map((a) => (
                <Puce
                  actif={achetees.includes(a.id)}
                  onClick={() => setAchetees(achetees.includes(a.id) ? achetees.filter((x) => x !== a.id) : [...achetees, a.id])}
                >
                  {nomCible(db, a)}
                </Puce>
              ))}
            </div>
          </Champ>
        ) : attrsIdee.length === 1 ? (
          <p class="discret">Pour {nomCible(db, attrsIdee[0])}</p>
        ) : null
      ) : (
        <Champ groupe label="Pour qui">
          <PourQui valeur={pour} onChange={setPour} />
        </Champ>
      )}
      <Champ groupe label="Quantité">
        <Quantite valeur={Math.max(quantite, nbCibles)} min={Math.max(1, nbCibles)} onChange={setQuantite} />
      </Champ>
      <div class="rattrapage">
        <span>
          {formatDate(date)} · {nomEtape(db, etapeId)}
        </span>
        <button type="button" class="btn btn-petit" onClick={() => setRattrapage(!rattrapage)} aria-expanded={rattrapage}>
          Changer
        </button>
      </div>
      {rattrapage && (
        <div class="grille2">
          <Champ label="Étape">
            <EtapeSelect valeur={etapeId} onValeur={choisirEtape} />
          </Champ>
          <Champ label="Date">
            <input type="date" value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value || date)} />
          </Champ>
        </div>
      )}
      {lieux.length > 0 && (
        <Champ groupe label="Acheté ici ?">
          <div class="puces">
            {lieux.map((l) => (
              <Puce
                actif={lieuId === l.id}
                onClick={() => {
                  setLieuId(l.id);
                  setBoutique(l.nom);
                  setBoutiqueTouchee(true);
                  const e = l.etapeIds.find((x) => icCourant.etapes.some((y) => y.id === x)) ?? l.etapeIds[0];
                  if (e && e !== etapeId) choisirEtape(e);
                }}
              >
                {l.nom} · {l.etapeIds.map((x) => nomEtape(db, x)).join(', ')}
              </Puce>
            ))}
          </div>
        </Champ>
      )}
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
      <Plier titre="Catégorie, photo, détaxe, retour">
        <Champ label="Catégorie">
          <Selecteur
            valeur={categorie}
            onValeur={setCategorie}
            vide="—"
            options={categoriesTriees(db).map((c) => ({ id: c.id, libelle: c.libelle }))}
          />
        </Champ>
        <Champ groupe label="Photo (facultative)">
          <input
            type="file"
            accept="image/*"
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
          {photoEnCours && <span class="champ-aide">Compression…</span>}
          {photoId && <span class="champ-aide">Photo prête</span>}
        </Champ>
        {v.detaxeActive && (
          <Interrupteur
            label="Détaxé"
            aide={`Regroupé par boutique et par jour ; éligible à partir de ${yen(5000)} HT`}
            checked={detaxe}
            onChange={setDetaxe}
          />
        )}
        <RetourChamps valeur={retour} achete onChange={(m) => setRetour({ ...retour, ...m })} />
      </Plier>
      <div class="actions collantes">
        <button type="submit" class="btn btn-primaire btn-large">
          Enregistrer l'achat
        </button>
      </div>
    </form>
  );
}
