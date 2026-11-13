// Taux de change automatiques (F-27) : API Frankfurter (taux de référence BCE), sans clé, au plus une fois par jour.
import { commit, db } from '../db/store';
import { today } from './dates';

const URLS = [
  'https://api.frankfurter.dev/v1/latest?base=JPY&symbols=EUR,CHF',
  'https://api.frankfurter.app/latest?from=JPY&to=EUR,CHF',
];

export async function lireTauxDistants(): Promise<{ eur: number; chf: number; date: string }> {
  let derniere: unknown;
  for (const u of URLS) {
    try {
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { date: string; rates: { EUR?: number; CHF?: number } };
      if (!(j.rates?.EUR && j.rates?.CHF)) throw new Error('Réponse incomplète');
      return { eur: j.rates.EUR, chf: j.rates.CHF, date: j.date };
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere instanceof Error ? derniere : new Error('Taux indisponibles');
}

/** Mise à jour automatique ; ne remplace pas un taux saisi à la main le jour même. */
export async function majTaux(forcer = false): Promise<boolean> {
  const p = db().parametres;
  const jour = today();
  if (!forcer && p.taux.derniereTentative === jour) return false;
  if (!forcer && p.taux.source === 'manuel' && p.taux.date === jour) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const t = await lireTauxDistants();
    await commit(
      (d) => d.params((x) => ({ ...x, taux: { jpyEur: t.eur, jpyChf: t.chf, date: t.date, source: 'auto', derniereTentative: jour } })),
      { marquerModifie: false },
    );
    return true;
  } catch (e) {
    await commit((d) => d.params((x) => ({ ...x, taux: { ...x.taux, derniereTentative: jour } })), { marquerModifie: false });
    if (forcer) throw e;
    return false;
  }
}
