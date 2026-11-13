import { render } from 'preact';
import { effect } from '@preact/signals';
import './styles.css';
import { charger, etat } from './db/store';
import { App } from './ui/App';
import { majTaux } from './domain/taux';
import { chargerCle, reprendreInterrompues, traiterFile } from './ai/queue';

async function demarrer() {
  const racine = document.getElementById('app')!;
  try {
    await charger();
  } catch (e) {
    racine.innerHTML = `<div class="ecran"><h1>Stockage indisponible</h1><p>${(e as Error).message}</p><p>Vérifiez que la navigation privée est désactivée.</p></div>`;
    return;
  }
  render(<App />, racine);

  // F-01 CA2 : stockage persistant
  void navigator.storage?.persist?.().catch(() => undefined);

  // F-27 : taux du jour
  void majTaux();
  window.addEventListener('online', () => {
    void majTaux();
    void traiterFile();
  });

  // RG-18 / F-43 CA3 : file IA persistante, reprise à l'ouverture
  await chargerCle();
  await reprendreInterrompues();
  void traiterFile();
  let precedent = 0;
  effect(() => {
    const n = etat.value?.jobs.filter((j) => j.statut === 'file').length ?? 0;
    if (n > precedent) void traiterFile();
    precedent = n;
  });

  // Service worker (hors connexion)
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }
}

void demarrer();
