import { useState } from 'preact/hooks';
import { onglet, ouvrir, route } from './state';
import { useDb, useVoyage } from './data';
import { Feuilles, ToastView } from './components/ui';
import { Icon } from './components/Icon';
import { Ici } from './screens/Ici';
import { GroupeFiche, PersonneFiche, Personnes } from './screens/Personnes';
import { Souvenirs } from './screens/Souvenirs';
import { SouvenirFiche } from './screens/SouvenirFiche';
import { Journal } from './screens/Journal';
import { Retour } from './screens/Retour';
import { Parametres } from './screens/Parametres';
import { ChoixSaisie } from './screens/Saisie';
import { rappelSauvegarde } from '../db/backup';
import { commit } from '../db/store';
import { now } from '../domain/dates';

const ONGLETS: [string, string, string][] = [
  ['ici', 'Ici', 'ici'],
  ['personnes', 'Personnes', 'personnes'],
  ['souvenirs', 'Souvenirs', 'souvenirs'],
  ['journal', 'Journal', 'journal'],
  ['retour', 'Retour', 'retour'],
];

function Ecran() {
  const [a, b] = route.value.chemin;
  // La clé force un nouvel état local à chaque changement de route
  const cle = route.value.chemin.join('/') + '?' + route.value.query.toString();
  switch (a) {
    case 'personnes':
      return b ? <PersonneFiche key={cle} id={b} /> : <Personnes key={cle} />;
    case 'groupes':
      return <GroupeFiche key={cle} id={b} />;
    case 'souvenirs':
      return b ? <SouvenirFiche key={cle} id={b} /> : <Souvenirs key={cle} />;
    case 'journal':
      return <Journal />;
    case 'retour':
      return <Retour key={cle} />;
    case 'parametres':
      return <Parametres key={cle} />;
    default:
      return <Ici />;
  }
}

function estIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function estInstallee(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** F-01 CA3 : bandeau d'installation dans Safari */
function BandeauInstallation() {
  const db = useDb();
  if (!estIOS() || estInstallee() || db.parametres.bandeauInstallationMasque) return null;
  return (
    <div class="bandeau" role="note">
      <p>
        <strong>Installez l'app</strong> : bouton <em>Share</em> puis <em>Add to Home Screen</em>. Safari peut effacer les données des sites peu
        utilisés ; installée, l'app les garde.
      </p>
      <button
        class="btn-icone"
        aria-label="Masquer"
        onClick={() => commit((d) => d.params((p) => ({ ...p, bandeauInstallationMasque: true })), { marquerModifie: false })}
      >
        <Icon n="fermer" taille={18} />
      </button>
    </div>
  );
}

/** F-02 CA3 : rappel discret de sauvegarde */
function RappelSauvegarde() {
  const db = useDb();
  const [masque, setMasque] = useState(false);
  if (masque || !rappelSauvegarde(db.parametres, now())) return null;
  return (
    <div class="bandeau discret-bandeau" role="note">
      <p>
        Dernière sauvegarde il y a plus de 3 jours. <a href="#/parametres/sauvegarde">Exporter</a>
      </p>
      <button class="btn-icone" aria-label="Masquer" onClick={() => setMasque(true)}>
        <Icon n="fermer" taille={18} />
      </button>
    </div>
  );
}

export function App() {
  const v = useVoyage();
  const o = onglet.value;
  const fab = ['ici', 'personnes', 'souvenirs', 'journal'].includes(o) && !route.value.chemin[1];
  return (
    <div class="app">
      <a class="saut" href="#contenu">
        Aller au contenu
      </a>
      <nav class="barre-onglets" aria-label="Navigation principale">
        <div class="marque">
          <span class="logo" aria-hidden="true">
            <Icon n="souvenirs" taille={22} />
          </span>
          <span>Omiyage</span>
        </div>
        {ONGLETS.map(([id, l, ic]) => (
          <a href={'#/' + id} class={'onglet' + (o === id || (id === 'personnes' && o === 'groupes') ? ' actif' : '')} aria-current={o === id ? 'page' : undefined}>
            <Icon n={ic} taille={22} />
            <span>{l}</span>
          </a>
        ))}
        <a href="#/parametres" class={'onglet onglet-reglages' + (o === 'parametres' ? ' actif' : '')} aria-current={o === 'parametres' ? 'page' : undefined}>
          <Icon n="reglages" taille={22} />
          <span>Paramètres</span>
        </a>
      </nav>
      <div class="colonne">
        <header class="entete">
          <span class="entete-voyage">{v.nom}</span>
          <a href="#/parametres" class="btn-icone entete-reglages" aria-label="Paramètres">
            <Icon n="reglages" />
          </a>
        </header>
        <BandeauInstallation />
        <RappelSauvegarde />
        <main id="contenu">
          <Ecran />
        </main>
      </div>
      {fab && (
        <button class="fab" aria-label="Ajouter une idée ou un achat" onClick={() => ouvrir('Ajouter', () => <ChoixSaisie />)}>
          <Icon n="plus" taille={28} />
        </button>
      )}
      <Feuilles />
      <ToastView />
    </div>
  );
}
