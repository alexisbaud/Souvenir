// Mode sans clé, via l'app Claude (F-44, §9.9).
import { useState } from 'preact/hooks';
import type { DemandeIA } from '../../db/types';
import { demandeLieux, demandeSuggestions, texteManuel } from '../../ai/context';
import { extraireJSON } from '../../ai/validate';
import { importerReponse } from '../../ai/queue';
import { db as lireDb } from '../../db/store';
import { today } from '../../domain/dates';
import { voyageActif } from '../../domain/rules';
import { pluriel } from '../../domain/format';
import { fermer, notifier } from '../state';
import { ZoneTexte } from '../components/ui';
import { Icon } from '../components/Icon';

function construire(d: DemandeIA): string {
  const db = lireDb();
  const v = voyageActif(db)!;
  if (d.type === 'lieux') {
    const id = d.souvenirId;
    const s = db.souvenirs.find((x) => x.id === id)!;
    return texteManuel(demandeLieux(db, v, s, today()));
  }
  return texteManuel(demandeSuggestions(db, v, d.cible, today()));
}

export function BlocManuel({ demande }: { demande: DemandeIA }) {
  const [texte, setTexte] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const copier = async () => {
    const t = construire(demande);
    try {
      await navigator.clipboard.writeText(t);
      setCopie(true);
    } catch {
      setTexte('');
      setErr('Copie impossible : sélectionnez le texte ci-dessous.');
      setTexteDemande(t);
    }
  };
  const [texteDemande, setTexteDemande] = useState<string | null>(null);

  const importer = async (brut: string) => {
    setErr(null);
    try {
      const json = extraireJSON(brut);
      const n = await importerReponse(demande, json);
      notifier(demande.type === 'lieux' ? `${pluriel(n, 'lieu importé', 'lieux importés')}` : `${pluriel(n, 'suggestion importée', 'suggestions importées')}`);
      fermer();
    } catch (e) {
      setErr((e as Error).message); // F-44 CA3 : rien n'est importé
    }
  };

  return (
    <div class="pile">
      <ol class="etapes-manuel">
        <li>
          <button class="btn" onClick={copier}>
            <Icon n="copier" taille={16} /> Copier la demande
          </button>
          {copie && <span class="champ-aide"> Copiée.</span>}
        </li>
        <li>Collez-la dans l'app Claude, recherche web activée, puis copiez la réponse.</li>
        <li>
          <button
            class="btn"
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText();
                setTexte(t);
                await importer(t);
              } catch {
                setErr('Lecture du presse-papiers refusée : collez la réponse ci-dessous.');
              }
            }}
          >
            <Icon n="coller" taille={16} /> Coller la réponse
          </button>
        </li>
      </ol>
      {texteDemande && <textarea readOnly rows={6} value={texteDemande} aria-label="Texte de la demande" />}
      <ZoneTexte valeur={texte} onValeur={setTexte} rows={6} placeholder="…ou collez la réponse ici" />
      {err && (
        <p class="alerte-texte" role="alert">
          {err}
        </p>
      )}
      <button class="btn btn-primaire" disabled={!texte.trim()} onClick={() => importer(texte)}>
        Importer la réponse collée
      </button>
    </div>
  );
}
