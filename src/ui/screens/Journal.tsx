// Journal d'achats (§7.5, F-60).
import { useState } from 'preact/hooks';
import type { Souvenir } from '../../db/types';
import { etapesDuVoyage, indexAttributions, prixEUR, prixYen, souvenirsDuVoyage } from '../../domain/rules';
import { formatDate } from '../../domain/dates';
import { euro, yen } from '../../domain/format';
import { nomEtape, useDb, useVoyage } from '../data';
import { Section, Selecteur, Vide } from '../components/ui';
import { CarteSouvenir } from '../components/CarteSouvenir';
import { Retour as RetourLien } from './Personnes';
import { libelleEtape } from '../components/champs';

export function journalParJour(achats: Souvenir[]): { date: string; etapes: string[]; souvenirs: Souvenir[]; yen: number; eur: number }[] {
  const m = new Map<string, Souvenir[]>();
  for (const s of achats) {
    const d = s.achat!.date;
    m.set(d, [...(m.get(d) ?? []), s]);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, souvenirs]) => ({
      date,
      etapes: [...new Set(souvenirs.map((s) => s.achat!.etapeId))],
      souvenirs,
      yen: souvenirs.reduce((n, s) => n + prixYen(s), 0),
      eur: Math.round(souvenirs.reduce((n, s) => n + prixEUR(s), 0) * 100) / 100,
    }));
}

export function Journal() {
  const db = useDb();
  const v = useVoyage();
  const [etape, setEtape] = useState('');
  const idx = indexAttributions(db);
  const etapes = etapesDuVoyage(db, v.id);
  const achats = souvenirsDuVoyage(db, v.id).filter((s) => s.statut === 'achete' && s.achat);
  const filtres = etape ? achats.filter((s) => s.achat!.etapeId === etape) : achats;
  const jours = journalParJour(filtres);
  const parEtape = etapes
    .map((e) => {
      const l = achats.filter((s) => s.achat!.etapeId === e.id);
      return { e, n: l.length, yen: l.reduce((n, s) => n + prixYen(s), 0), eur: l.reduce((n, s) => n + prixEUR(s), 0) };
    })
    .filter((x) => x.n > 0);
  return (
    <div class="ecran">
      <RetourLien href="souvenirs?seg=achetes" libelle="Cadeaux" />
      <div class="ecran-tete">
        <h1>Journal des achats</h1>
        <Selecteur valeur={etape} onValeur={setEtape} vide="Toutes les étapes" options={etapes.map((e) => ({ id: e.id, libelle: libelleEtape(e, etapes) }))} />
      </div>
      {jours.length === 0 ? (
        <Vide>Aucun achat enregistré.</Vide>
      ) : (
        jours.map((j) => (
          <Section
            titre={
              <>
                {formatDate(j.date)} · {j.etapes.map((e) => nomEtape(db, e)).join(', ')}
              </>
            }
            action={
              <span class="total-jour">
                {yen(j.yen)} · {euro(j.eur)}
              </span>
            }
          >
            <ul class="cartes-souvenirs">
              {j.souvenirs.map((s) => (
                <CarteSouvenir db={db} s={s} attrs={idx.get(s.id) ?? []} masquerEtat />
              ))}
            </ul>
          </Section>
        ))
      )}
      {parEtape.length > 0 && (
        <Section titre="Sous-totaux par étape">
          <table class="tableau">
            <tbody>
              {parEtape.map((x) => (
                <tr>
                  <th scope="row">{libelleEtape(x.e, etapes)}</th>
                  <td>{x.n}</td>
                  <td class="num">{yen(x.yen)}</td>
                  <td class="num">{euro(x.eur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}
