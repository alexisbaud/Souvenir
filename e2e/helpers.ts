import { expect, type Page, type Route } from '@playwright/test';

export const TAUX = { EUR: 0.0058, CHF: 0.0054 };

/** Date simulée (heure locale) + taux de change simulés, puis ouverture de l'app */
export async function demarrer(page: Page, date: string, chemin = '') {
  await page.clock.setFixedTime(new Date(`${date}T10:00:00`));
  await page.route(/frankfurter/, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ amount: 1, base: 'JPY', date, rates: TAUX }),
    }),
  );
  await page.goto('/#/' + chemin);
  await expect(page.locator('main h1')).toBeVisible();
}

export async function changerDate(page: Page, date: string, chemin = 'ici') {
  await page.clock.setFixedTime(new Date(`${date}T10:00:00`));
  await page.goto('/#/' + chemin);
  await page.reload();
  await expect(page.locator('main h1')).toBeVisible();
}

export function feuille(page: Page) {
  return page.locator('.feuille').last();
}

export async function aller(page: Page, chemin: string) {
  await page.evaluate((c) => (location.hash = '#/' + c), chemin);
}

export async function creerPersonne(page: Page, nom: string, groupe?: string) {
  await aller(page, 'personnes');
  await page.locator('.ecran-tete').getByRole('button', { name: 'Personne', exact: true }).click();
  const f = feuille(page);
  await f.getByLabel('Nom', { exact: true }).fill(nom);
  if (groupe) await f.locator('select').selectOption({ label: groupe });
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.feuille')).toHaveCount(0);
}

export async function ouvrirSaisie(page: Page) {
  await aller(page, 'ici');
  await page.getByRole('button', { name: 'Ajouter une idée ou un achat' }).click();
}

export async function puce(page: Page, nom: string) {
  await feuille(page).getByRole('button', { name: nom, exact: true }).click();
}

/** Saisit un achat via la saisie express */
export async function achat(
  page: Page,
  o: {
    nom: string;
    prix: number;
    pour?: string[];
    groupes?: string[];
    quantite?: number;
    boutique?: string;
    detaxe?: boolean;
    alcool?: { degre: string; volume: string };
  },
) {
  await ouvrirSaisie(page);
  const f = feuille(page);
  await f.getByLabel('Quoi ?').fill(o.nom);
  await f.getByLabel('Prix en yens').fill(String(o.prix));
  for (const p of o.pour ?? []) await puce(page, p);
  for (const g of o.groupes ?? []) await puce(page, 'Tout le groupe ' + g);
  if (o.boutique) {
    await f.getByRole('button', { name: 'Changer' }).click();
    await f.getByPlaceholder('Facultatif').fill(o.boutique);
  }
  if (o.quantite || o.detaxe || o.alcool) {
    await f.getByText('Photo, quantité, détaxe, alcool…').click();
    if (o.quantite) {
      const q = f.getByRole('textbox', { name: 'Quantité' });
      await q.fill(String(o.quantite));
      await q.press('Tab');
    }
    if (o.detaxe) await f.getByRole('checkbox', { name: /^Détaxé/ }).check();
    if (o.alcool) {
      await f.getByText('Alcool', { exact: true }).click();
      const deg = f.getByLabel('Degré (%)');
      await deg.fill(o.alcool.degre);
      await deg.press('Tab');
      const vol = f.getByLabel('Volume total (L)');
      await vol.fill(o.alcool.volume);
      await vol.press('Tab');
    }
  }
  await f.getByRole('button', { name: "Enregistrer l'achat" }).click();
  await expect(page.locator('.feuille')).toHaveCount(0);
}

export async function idee(page: Page, nom: string, pour: string[] = []) {
  await ouvrirSaisie(page);
  const f = feuille(page);
  await f.getByLabel('Quoi ?').fill(nom);
  for (const p of pour) await puce(page, p);
  await f.getByRole('button', { name: "Enregistrer l'idée" }).click();
  await expect(page.locator('.feuille')).toHaveCount(0);
}

export async function ouvrirSouvenir(page: Page, nom: string, segment = 'idees') {
  await aller(page, 'souvenirs?seg=' + segment);
  await page.locator('.carte-souvenir').filter({ hasText: nom }).first().locator('a.carte-souvenir-tete').click();
  await expect(page.locator('main h1')).toHaveText(nom);
}

/** Simule l'API Claude : modèles (test de clé) et messages (réponse fournie par `reponse`) */
export async function simulerClaude(page: Page, reponse: (body: Record<string, unknown>) => unknown) {
  const corps: Record<string, unknown>[] = [];
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  };
  await page.route('https://api.anthropic.com/**', async (r: Route) => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (req.url().includes('/v1/models'))
      return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data: [], has_more: false, first_id: null, last_id: null }) });
    const body = req.postDataJSON() as Record<string, unknown>;
    corps.push(body);
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(reponse(body)) });
  });
  return corps;
}

export function messageOutil(nom: string, input: unknown) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'tool_use', id: 'toolu_test', name: nom, input }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1200, output_tokens: 300, server_tool_use: { web_search_requests: 3 } },
  };
}

export async function configurerCle(page: Page, auto: boolean) {
  await aller(page, 'parametres/ia');
  await page.getByPlaceholder('sk-ant-…').fill('sk-ant-test-0000000000000000ABCD');
  await page.getByRole('button', { name: 'Tester et enregistrer' }).click();
  await expect(page.getByText('Clé valide et enregistrée.')).toBeVisible();
  if (auto) await page.getByRole('checkbox', { name: /^Mode automatique/ }).check();
}
