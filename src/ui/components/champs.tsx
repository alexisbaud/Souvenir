// Champs métier réutilisables : étapes, prix, indicateurs retour, miniature.
import { useEffect, useState } from 'preact/hooks';
import type { Etape, Retour } from '../../db/types';
import { etapesDuVoyage, etapesRestantes } from '../../domain/rules';
import { formatDateCourte } from '../../domain/dates';
import { euro, parseNombre, yen } from '../../domain/format';
import { useDb, useJour, useVoyage } from '../data';
import { Champ, Interrupteur, Puce, Selecteur } from './ui';
import { urlMiniature, versionPhotos } from './photo';

export function EtapesChoix(props: { valeur: string[]; onChange: (ids: string[]) => void; toutes?: boolean; label?: string }) {
  const db = useDb();
  const v = useVoyage();
  const jour = useJour();
  const tout = etapesDuVoyage(db, v.id);
  const etapes = props.toutes ? tout : etapesRestantes(tout, jour);
  const liste = [...etapes, ...tout.filter((e) => props.valeur.includes(e.id) && !etapes.includes(e))];
  return (
    <div class="puces" role="group" aria-label={props.label ?? 'Étapes'}>
      {liste
        .sort((a, b) => a.ordre - b.ordre)
        .map((e) => (
          <Puce
            actif={props.valeur.includes(e.id)}
            onClick={() =>
              props.onChange(props.valeur.includes(e.id) ? props.valeur.filter((x) => x !== e.id) : [...props.valeur, e.id])
            }
          >
            {libelleEtape(e, tout)}
          </Puce>
        ))}
    </div>
  );
}

/** « Tokyo (15/11) » quand la ville apparaît deux fois */
export function libelleEtape(e: Etape, toutes: Etape[]): string {
  const doublon = toutes.filter((x) => x.ville === e.ville).length > 1;
  return doublon ? `${e.ville} (${formatDateCourte(e.arrivee)})` : e.ville;
}

export function EtapeSelect(props: { valeur: string; onValeur: (id: string) => void; id?: string }) {
  const db = useDb();
  const v = useVoyage();
  const tout = etapesDuVoyage(db, v.id);
  return (
    <Selecteur
      id={props.id}
      valeur={props.valeur}
      onValeur={(x) => props.onValeur(x as string)}
      options={tout.map((e) => ({ id: e.id, libelle: `${libelleEtape(e, tout)} · ${formatDateCourte(e.arrivee)}→${formatDateCourte(e.depart)}` }))}
    />
  );
}

/** Saisie d'un prix en yens (défaut) ou en euros, avec conversion en direct (F-21 CA2) */
export function PrixChamp(props: {
  prix: string;
  devise: 'JPY' | 'EUR';
  taux: number | undefined;
  onPrix: (s: string) => void;
  onDevise: (d: 'JPY' | 'EUR') => void;
  id?: string;
}) {
  const n = parseNombre(props.prix);
  let conv = '';
  if (Number.isFinite(n) && props.taux) conv = props.devise === 'JPY' ? '≈ ' + euro(n * props.taux) : '≈ ' + yen(n / props.taux);
  return (
    <div class="prix">
      <div class="prix-ligne">
        <input
          id={props.id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={props.prix}
          aria-label={`Prix en ${props.devise === 'JPY' ? 'yens' : 'euros'}`}
          onInput={(e) => props.onPrix((e.target as HTMLInputElement).value)}
        />
        <div class="segments mini" role="group" aria-label="Devise">
          <button type="button" class={'segment' + (props.devise === 'JPY' ? ' actif' : '')} aria-pressed={props.devise === 'JPY'} onClick={() => props.onDevise('JPY')}>
            ¥
          </button>
          <button type="button" class={'segment' + (props.devise === 'EUR' ? ' actif' : '')} aria-pressed={props.devise === 'EUR'} onClick={() => props.onDevise('EUR')}>
            €
          </button>
        </div>
      </div>
      <span class="champ-aide" aria-live="polite">
        {conv || ' '}
      </span>
    </div>
  );
}

const DRAPEAUX: [keyof Retour, string][] = [
  ['viande', 'Viande'],
  ['lait', 'Produits laitiers'],
  ['vegetal', 'Végétal'],
  ['liquide', 'Liquide (> 100 ml)'],
  ['tranchant', 'Tranchant'],
  ['fragile', 'Fragile'],
];

/** Indicateurs retour (§5.5) ; `onChange` reçoit uniquement les champs modifiés */
export function RetourChamps(props: { valeur: Retour; onChange: (m: Partial<Retour>) => void; achete: boolean }) {
  const db = useDb();
  const v = useVoyage();
  const r = props.valeur;
  const ia = new Set(r.sourceIA ?? []);
  const marque = (k: string) => (ia.has(k) ? <span class="puce-ia" title="Proposé par l'IA">IA</span> : null);
  const [alcool, setAlcool] = useState(!!r.alcool);
  useEffect(() => setAlcool(!!r.alcool), [!!r.alcool]);
  return (
    <div class="pile">
      <Interrupteur
        label={<>Alcool {marque('alcool')}</>}
        checked={alcool}
        onChange={(c) => {
          setAlcool(c);
          props.onChange({ alcool: c ? { type: 'autre', degre: 15, volumeL: 0.72 } : undefined });
        }}
      />
      {alcool && r.alcool && (
        <div class="grille3">
          <Champ label="Type">
            <Selecteur
              valeur={r.alcool.type}
              onValeur={(t) => props.onChange({ alcool: { ...r.alcool!, type: (t || 'autre') as 'vin' } })}
              options={[
                { id: 'vin', libelle: 'Vin tranquille' },
                { id: 'biere', libelle: 'Bière' },
                { id: 'autre', libelle: 'Autre (saké, whisky…)' },
              ]}
            />
          </Champ>
          <Champ label="Degré (%)">
            <input
              type="text"
              inputMode="decimal"
              value={String(r.alcool.degre).replace('.', ',')}
              onChange={(e) => {
                const n = parseNombre((e.target as HTMLInputElement).value);
                if (Number.isFinite(n)) props.onChange({ alcool: { ...r.alcool!, degre: n } });
              }}
            />
          </Champ>
          <Champ label="Volume total (L)">
            <input
              type="text"
              inputMode="decimal"
              value={r.alcool.volumeL !== undefined ? String(r.alcool.volumeL).replace('.', ',') : ''}
              onChange={(e) => {
                const n = parseNombre((e.target as HTMLInputElement).value);
                props.onChange({ alcool: { ...r.alcool!, volumeL: Number.isFinite(n) ? n : undefined } });
              }}
            />
          </Champ>
        </div>
      )}
      <div class="puces" role="group" aria-label="Contraintes">
        {DRAPEAUX.map(([k, l]) => (
          <Puce actif={!!r[k]} onClick={() => props.onChange({ [k]: r[k] ? undefined : true })}>
            {l}
            {ia.has(k) ? ' · IA' : ''}
          </Puce>
        ))}
      </div>
      <div class="grille2">
        <Champ label={<>Poids estimé (g) {marque('poidsG')}</>}>
          <input
            type="text"
            inputMode="numeric"
            value={r.poidsG ?? ''}
            onChange={(e) => {
              const n = parseNombre((e.target as HTMLInputElement).value);
              props.onChange({ poidsG: Number.isFinite(n) && n > 0 ? Math.round(n) : undefined });
            }}
          />
        </Champ>
        {props.achete && (
          <Champ label="Bagage">
            <Selecteur
              valeur={r.bagageId ?? ''}
              onValeur={(b) => props.onChange({ bagageId: b || undefined })}
              vide="Non rangé"
              options={db.bagages.filter((b) => b.voyageId === v.id).map((b) => ({ id: b.id, libelle: `${b.nom} (${b.type})` }))}
            />
          </Champ>
        )}
      </div>
      <Interrupteur
        label="Consommé au Japon"
        aide="Ne passe ni la détaxe ni la douane"
        checked={!!r.consommeAuJapon}
        onChange={(c) => props.onChange({ consommeAuJapon: c || undefined })}
      />
    </div>
  );
}

export function Miniature({ id, taille = 44 }: { id?: string; taille?: number }) {
  void versionPhotos.value;
  const url = urlMiniature(id);
  if (!id) return <span class="mini-vide" style={{ width: `${taille}px`, height: `${taille}px` }} aria-hidden="true" />;
  return url ? (
    <img class="miniature" src={url} width={taille} height={taille} alt="" />
  ) : (
    <span class="mini-vide" style={{ width: `${taille}px`, height: `${taille}px` }} aria-hidden="true" />
  );
}
