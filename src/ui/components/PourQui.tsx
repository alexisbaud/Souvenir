// « Pour qui ? » : grille d'avatars à toucher, groupes entiers, création à la volée (F-10 CA1, F-20 CA2).
import { useState } from 'preact/hooks';
import type { SelectionCibles } from '../../domain/actions';
import { creerPersonne, homonymes } from '../../domain/actions';
import { destinatairesDuVoyage } from '../../domain/rules';
import { MOI_ID } from '../../db/types';
import { agir } from '../state';
import { groupesTries, useDb, useVoyage } from '../data';
import { Interrupteur, Selecteur } from './ui';
import { Icon } from './Icon';
import { Avatar } from './visuel';

export function resumeSelection(sel: SelectionCibles): string {
  const pers = sel.personnes.filter((p) => p !== MOI_ID).length;
  const parts: string[] = [];
  if (sel.moi) parts.push('pour moi');
  if (pers) parts.push(sel.commun && pers > 1 ? `un cadeau commun à ${pers}` : pers > 1 ? `${pers} cadeaux, un par personne` : '1 cadeau');
  if (sel.groupes.length) parts.push(sel.groupes.length > 1 ? `${sel.groupes.length} cadeaux collectifs` : 'un cadeau collectif');
  return parts.length ? parts.join(' + ').replace(/^./, (c) => c.toUpperCase()) : 'Personne pour l’instant : vous choisirez plus tard.';
}

export function PourQui(props: { valeur: SelectionCibles; onChange: (s: SelectionCibles) => void; sansGroupes?: boolean }) {
  const db = useDb();
  const v = useVoyage();
  const [tous, setTous] = useState(false);
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState('');
  const [groupe, setGroupe] = useState('');
  const sel = props.valeur;
  const dest = destinatairesDuVoyage(db, v);
  // Les plus récemment choisis d'abord
  const recence = new Map<string, string>();
  for (const a of db.attributions)
    if (a.cible.type === 'personnes')
      for (const id of a.cible.ids) if ((recence.get(id) ?? '') < a.createdAt) recence.set(id, a.createdAt);
  const tri = [...dest].sort((a, b) => ((recence.get(a.id) ?? a.createdAt) < (recence.get(b.id) ?? b.createdAt) ? 1 : -1));
  const LIMITE = 14;
  const visibles = tous ? [...dest].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) : tri.slice(0, LIMITE);
  for (const id of sel.personnes)
    if (!visibles.some((p) => p.id === id)) {
      const p = dest.find((x) => x.id === id);
      if (p) visibles.unshift(p);
    }
  const basculer = (id: string) =>
    props.onChange({
      ...sel,
      personnes: sel.personnes.includes(id) ? sel.personnes.filter((x) => x !== id) : [...sel.personnes, id],
    });
  const basculerGroupe = (id: string) =>
    props.onChange({ ...sel, groupes: sel.groupes.includes(id) ? sel.groupes.filter((x) => x !== id) : [...sel.groupes, id] });

  const creer = async () => {
    const n = nom.trim();
    if (!n) return;
    const p = await agir((d) => creerPersonne(d, { nom: n, groupeId: groupe || undefined }));
    if (p) {
      props.onChange({ ...sel, personnes: [...sel.personnes, p.id] });
      setNom('');
      setCreation(false);
    }
  };

  return (
    <div class="pile">
      <div class="choix-pour" role="group" aria-label="Personnes">
        <button type="button" aria-pressed={sel.moi} onClick={() => props.onChange({ ...sel, moi: !sel.moi })}>
          <Avatar personne={{ id: MOI_ID, nom: 'Moi' }} taille={50} actif={sel.moi} />
          <span class="nom-avatar">Moi</span>
        </button>
        {visibles.map((p) => {
          const actif = sel.personnes.includes(p.id);
          return (
            <button type="button" aria-pressed={actif} onClick={() => basculer(p.id)}>
              <Avatar personne={p} taille={50} actif={actif} />
              <span class="nom-avatar">{p.nom}</span>
            </button>
          );
        })}
        <button type="button" aria-expanded={creation} onClick={() => setCreation(!creation)}>
          <span class="avatar avatar-nouveau" style={{ width: '50px', height: '50px' }} aria-hidden="true">
            <Icon n="plus" taille={22} epaisseur={2.2} />
          </span>
          <span class="nom-avatar">Nouveau</span>
        </button>
      </div>
      {dest.length > LIMITE && (
        <button type="button" class="btn btn-petit" style={{ alignSelf: 'flex-start' }} onClick={() => setTous(!tous)}>
          {tous ? 'Moins de personnes' : `Toutes les personnes (${dest.length})`}
        </button>
      )}
      {creation && (
        <div class="ligne-form">
          <input
            type="text"
            placeholder="Prénom"
            aria-label="Prénom de la nouvelle personne"
            value={nom}
            onInput={(e) => setNom((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void creer())}
          />
          <Selecteur valeur={groupe} onValeur={setGroupe} vide="Sans groupe" options={groupesTries(db).map((g) => ({ id: g.id, libelle: g.nom }))} />
          <button type="button" class="btn btn-primaire" onClick={creer}>
            Créer
          </button>
          {nom && homonymes(db.personnes, nom) && <p class="avert">Une personne porte déjà ce nom.</p>}
        </div>
      )}
      {!props.sansGroupes && db.groupes.length > 0 && (
        <div class="pile" style={{ gap: '6px' }}>
          <span class="champ-aide">ou tout un groupe (un cadeau collectif) :</span>
          <div class="puces" role="group" aria-label="Groupes (cadeau collectif)">
            {groupesTries(db).map((g) => {
              const actif = sel.groupes.includes(g.id);
              return (
                <button
                  type="button"
                  class={'puce puce-btn puce-groupe' + (actif ? ' actif' : '')}
                  aria-pressed={actif}
                  aria-label={`Tout le groupe ${g.nom}`}
                  onClick={() => basculerGroupe(g.id)}
                >
                  <Icon n="groupe" taille={15} />
                  {g.nom}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {sel.personnes.filter((x) => x !== MOI_ID).length > 1 && (
        <Interrupteur
          label="Un seul cadeau commun"
          aide="Sinon : un cadeau pour chacune"
          checked={!!sel.commun}
          onChange={(c) => props.onChange({ ...sel, commun: c })}
        />
      )}
      <span class="champ-aide">{resumeSelection(sel)}</span>
    </div>
  );
}
