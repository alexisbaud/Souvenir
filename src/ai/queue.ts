// File d'attente persistante des demandes IA (RG-18, F-43) : une seule demande à la fois.
import { signal } from '@preact/signals';
import { commit, db, etat } from '../db/store';
import type { DemandeIA, ID, JobIA, Parametres } from '../db/types';
import { lireSecret, ecrireSecret } from '../db/persistence';
import { moisCourant, nowIso, today } from '../domain/dates';
import { mettreEnFile, ErreurMetier } from '../domain/actions';
import { ici, voyageActif } from '../domain/rules';
import { demandeLieux, demandeSuggestions, type Demande } from './context';
import { ErreurIA, type UsageIA } from './modeles';
import { importerLieux, importerSuggestions, lireReponseLieux, lireReponseSuggestions } from './importer';

export const cleConfiguree = signal(false);
export const fileActive = signal(false);
export const messageFile = signal<string | null>(null);

const CLE = 'claude-api-key';
let cleMemoire: string | null = null;

export async function chargerCle(): Promise<void> {
  cleMemoire = (await lireSecret(CLE)) ?? null;
  cleConfiguree.value = !!cleMemoire;
}

export async function definirCle(cle: string | null): Promise<void> {
  await ecrireSecret(CLE, cle);
  cleMemoire = cle;
  cleConfiguree.value = !!cle;
  if (cle) void traiterFile();
}

export function cleMasquee(): string {
  if (!cleMemoire) return '';
  return `${cleMemoire.slice(0, 7)}…${cleMemoire.slice(-4)}`;
}

export function cleActuelle(): string | null {
  return cleMemoire;
}

function usageMois(p: Parametres) {
  return p.ia.usage[moisCourant()] ?? { demandes: 0, recherches: 0, jetonsEntree: 0, jetonsSortie: 0 };
}

export function plafondAtteint(p: Parametres, enPlus = 0): boolean {
  const u = usageMois(p);
  const enFile = db().jobs.filter((j) => j.statut === 'file' || j.statut === 'en_cours').length;
  return u.demandes + enFile + enPlus > p.ia.maxDemandesMois;
}

/** Ajoute des demandes à la file ; refuse au-delà du plafond mensuel (F-43 CA4) */
export async function demander(demandes: DemandeIA[]): Promise<number> {
  const p = db().parametres;
  if (plafondAtteint(p, demandes.length - 1))
    throw new ErreurMetier(`Plafond mensuel de ${p.ia.maxDemandesMois} demandes atteint. Modifiez-le dans les paramètres.`);
  const r = await commit((d) => demandes.filter((x) => mettreEnFile(d, x)).length, { marquerModifie: false });
  void traiterFile();
  return r.valeur;
}

export function jobPour(souvenirId: ID): JobIA | undefined {
  const l = (etat.value?.jobs ?? []).filter((j) => j.demande.type === 'lieux' && j.demande.souvenirId === souvenirId);
  return l.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
}

function construireDemande(job: JobIA): { demande: Demande; ville?: string } | null {
  const d = db();
  const v = voyageActif(d);
  if (!v) return null;
  const jour = today();
  const i = ici(d, v, jour);
  const ville = i.etapes[i.etapes.length - 1]?.ville;
  if (job.demande.type === 'lieux') {
    const id = job.demande.souvenirId;
    const s = d.souvenirs.find((x) => x.id === id);
    if (!s || s.statut !== 'idee') return null;
    return { demande: demandeLieux(d, v, s, jour), ville };
  }
  return { demande: demandeSuggestions(d, v, job.demande.cible, jour), ville };
}

function ajouterUsage(p: Parametres, u: UsageIA): Parametres {
  const m = moisCourant();
  const cur = usageMois(p);
  return {
    ...p,
    ia: {
      ...p.ia,
      usage: {
        ...p.ia.usage,
        [m]: {
          demandes: cur.demandes + 1,
          recherches: cur.recherches + u.recherches,
          jetonsEntree: cur.jetonsEntree + u.jetonsEntree,
          jetonsSortie: cur.jetonsSortie + u.jetonsSortie,
        },
      },
    },
  };
}

/** Importe une réponse (automatique ou collée) pour une demande */
export async function importerReponse(demande: DemandeIA, brut: unknown, jobId?: ID, usage?: UsageIA, journal?: string[]): Promise<number> {
  const jour = today();
  const maintenant = nowIso();
  const cats = db().categories.map((c) => c.id);
  const lu = demande.type === 'lieux' ? lireReponseLieux(brut) : lireReponseSuggestions(brut, cats);
  const r = await commit((d) => {
    const n =
      demande.type === 'lieux'
        ? importerLieux(d, demande.souvenirId, lu as ReturnType<typeof lireReponseLieux>, jour, maintenant)
        : importerSuggestions(d, demande.cible, lu as ReturnType<typeof lireReponseSuggestions>, jour, maintenant);
    if (jobId) d.patch('jobs', jobId, (j) => ({ ...j, statut: 'terminee', erreur: undefined, journal }));
    if (usage) d.params((p) => ajouterUsage(p, usage));
    return n;
  });
  return r.valeur;
}

let enCours = false;

/** Reprend les demandes interrompues (app fermée pendant un appel) */
export async function reprendreInterrompues(): Promise<void> {
  const l = db().jobs.filter((j) => j.statut === 'en_cours');
  if (l.length) await commit((d) => l.forEach((j) => d.patch('jobs', j.id, (x) => ({ ...x, statut: 'file' }))), { marquerModifie: false });
}

export async function traiterFile(): Promise<void> {
  if (enCours || !etat.value) return;
  enCours = true;
  fileActive.value = true;
  try {
    for (;;) {
      const cle = cleMemoire;
      if (!cle) {
        messageFile.value = db().jobs.some((j) => j.statut === 'file') ? 'Clé API absente : utilisez le mode manuel.' : null;
        break;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        messageFile.value = 'Hors connexion : la file reprendra au retour du réseau.';
        break;
      }
      const job = [...db().jobs].filter((j) => j.statut === 'file').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
      if (!job) {
        messageFile.value = null;
        break;
      }
      const p = db().parametres;
      if (usageMois(p).demandes >= p.ia.maxDemandesMois) {
        messageFile.value = `Plafond mensuel de ${p.ia.maxDemandesMois} demandes atteint.`;
        break;
      }
      const dem = construireDemande(job);
      if (!dem) {
        await commit((d) => d.patch('jobs', job.id, (j) => ({ ...j, statut: 'terminee', erreur: 'Sans objet' })), { marquerModifie: false });
        continue;
      }
      messageFile.value = null;
      await commit((d) => d.patch('jobs', job.id, (j) => ({ ...j, statut: 'en_cours', tentatives: j.tentatives + 1 })), {
        marquerModifie: false,
      });
      try {
        const max = job.demande.type === 'lieux' ? p.ia.maxRecherchesLieux : p.ia.maxRecherchesSuggestions;
        const { executer } = await import('./client');
        const res = await executer(cle, p.ia.modele, dem.demande, max, dem.ville);
        await importerReponse(job.demande, res.input, job.id, res.usage, res.journal);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await commit((d) => d.patch('jobs', job.id, (j) => ({ ...j, statut: 'echec', erreur: msg })), { marquerModifie: false });
        if (e instanceof ErreurIA && msg === 'Clé invalide') {
          messageFile.value = 'Clé API invalide : vérifiez-la dans les paramètres.';
          break;
        }
        if (msg.startsWith('Réseau')) break;
      }
    }
    await nettoyerJobs();
  } finally {
    enCours = false;
    fileActive.value = false;
  }
}

/** Garde l'historique récent des demandes terminées */
async function nettoyerJobs(): Promise<void> {
  const fini = db()
    .jobs.filter((j) => j.statut === 'terminee')
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(50);
  if (fini.length) await commit((d) => fini.forEach((j) => d.del('jobs', j.id)), { marquerModifie: false });
}

export async function relancer(jobId: ID): Promise<void> {
  await commit((d) => d.patch('jobs', jobId, (j) => ({ ...j, statut: 'file', erreur: undefined })), { marquerModifie: false });
  void traiterFile();
}
