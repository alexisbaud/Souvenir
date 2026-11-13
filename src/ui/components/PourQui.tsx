// Sélecteur « Pour qui » : Moi, destinataires récents, groupes, création à la volée (F-10 CA1, F-20 CA2).
import { useState } from 'preact/hooks';
import type { SelectionCibles } from '../../domain/actions';
import { creerPersonne, homonymes } from '../../domain/actions';
import { destinatairesDuVoyage } from '../../domain/rules';
import { MOI_ID } from '../../db/types';
import { agir } from '../state';
import { groupesTries, useDb, useVoyage } from '../data';
import { Interrupteur, Puce, Selecteur } from './ui';
import { Icon } from './Icon';

export function PourQui(props: { valeur: SelectionCibles; onChange: (s: SelectionCibles) => void; sansGroupes?: boolean }) {
  const db = useDb();
  const v = useVoyage();
  const [tous, setTous] = useState(false);
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState('');
  const [groupe, setGroupe] = useState('');
  const sel = props.valeur;
  const dest = destinatairesDuVoyage(db, v);
  // Récents : ceux qui ont reçu une attribution récemment
  const recence = new Map<string, string>();
  for (const a of db.attributions)
    if (a.cible.type === 'personnes')
      for (const id of a.cible.ids) if ((recence.get(id) ?? '') < a.createdAt) recence.set(id, a.createdAt);
  const tri = [...dest].sort((a, b) => {
    const ra = recence.get(a.id) ?? a.createdAt;
    const rb = recence.get(b.id) ?? b.createdAt;
    return ra < rb ? 1 : -1;
  });
  const visibles = tous ? [...dest].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) : tri.slice(0, 8);
  for (const id of sel.personnes) if (!visibles.some((p) => p.id === id)) {
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
  const aucun = !sel.moi && sel.personnes.length === 0 && sel.groupes.length === 0;

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
    <div class="pourqui">
      <div class="puces" role="group" aria-label="Destinataires">
        <Puce actif={aucun} onClick={() => props.onChange({ personnes: [], groupes: [], moi: false })}>
          Personne pour l'instant
        </Puce>
        <Puce actif={sel.moi} onClick={() => props.onChange({ ...sel, moi: !sel.moi })}>
          Moi
        </Puce>
        {visibles.map((p) => (
          <Puce actif={sel.personnes.includes(p.id)} onClick={() => basculer(p.id)}>
            {p.nom}
          </Puce>
        ))}
        {dest.length > 8 && (
          <Puce onClick={() => setTous(!tous)}>{tous ? 'Moins' : `Tous (${dest.length})`}</Puce>
        )}
        <Puce onClick={() => setCreation(!creation)} titre="Nouvelle personne">
          <Icon n="plus" taille={14} /> Personne
        </Puce>
      </div>
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
          <Selecteur
            valeur={groupe}
            onValeur={setGroupe}
            vide="Sans groupe"
            options={groupesTries(db).map((g) => ({ id: g.id, libelle: g.nom }))}
          />
          <button type="button" class="btn btn-primaire" onClick={creer}>
            Créer
          </button>
          {nom && homonymes(db.personnes, nom) && <p class="avert">Une personne porte déjà ce nom.</p>}
        </div>
      )}
      {!props.sansGroupes && (
        <div class="puces" role="group" aria-label="Groupes (cadeau collectif)">
          {groupesTries(db).map((g) => (
            <Puce actif={sel.groupes.includes(g.id)} onClick={() => basculerGroupe(g.id)} titre="Cadeau collectif pour tout le groupe">
              Groupe {g.nom}
            </Puce>
          ))}
        </div>
      )}
      {sel.personnes.filter((x) => x !== MOI_ID).length > 1 && (
        <Interrupteur
          label="Un seul cadeau commun"
          aide={sel.commun ? 'Une unité partagée par ces personnes (collectif)' : 'Sinon : une unité pour chacune'}
          checked={!!sel.commun}
          onChange={(c) => props.onChange({ ...sel, commun: c })}
        />
      )}
    </div>
  );
}
