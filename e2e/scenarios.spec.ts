// Recette : scénarios de bout en bout S1 à S12 (SPEC §15). Noms de destinataires fictifs.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  achat,
  aller,
  changerDate,
  configurerCle,
  creerPersonne,
  demarrer,
  feuille,
  idee,
  messageOutil,
  ouvrirSouvenir,
  puce,
  simulerClaude,
} from './helpers';

test('S1 Première ouverture le 2026-11-02', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  await expect(page.locator('main h1')).toHaveText('Kyoto');
  await expect(page.locator('.hero')).toContainText('Nuit 4 sur 6');
  await expect(page.locator('.entete-voyage')).toHaveText('Japon 2026');
  await aller(page, 'parametres/voyage');
  await expect(page.getByText('Étapes (12)')).toBeVisible();
  await aller(page, 'personnes');
  await expect(page.getByText("Aucun destinataire pour l'instant", { exact: false })).toBeVisible();
  await expect(page.locator('.carte-personne')).toHaveCount(1);
  await expect(page.locator('.carte-personne')).toContainText('Moi');
  // F-31 CA2 : jour de transition
  await changerDate(page, '2026-11-05');
  await expect(page.locator('main h1')).toHaveText('Kyoto → Osaka');
});

test('S2 Achat express d’un lot réparti', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  for (const n of ['Léa', 'Hugo', 'Inès', 'Tom']) await creerPersonne(page, n, 'Amis');
  await achat(page, { nom: 'Tenugui', prix: 6600, pour: ['Léa', 'Hugo', 'Inès', 'Tom', 'Moi'], quantite: 6 });
  await aller(page, 'souvenirs?seg=a_attribuer');
  const ligne = page.locator('.carte-souvenir').filter({ hasText: 'Tenugui' });
  await expect(ligne).toContainText('×6');
  await expect(ligne).toContainText('1 sans destinataire');
  await aller(page, 'ici');
  await expect(page.locator('.total')).toContainText('6 600 ¥');
  await expect(page.getByText('dont pour moi')).toContainText('1 100 ¥');
  await expect(page.getByRole('link', { name: '1 achat sans destinataire →' })).toBeVisible();
  await aller(page, 'personnes');
  for (const n of ['Léa', 'Hugo', 'Inès', 'Tom'])
    await expect(page.locator('.carte-personne-tete').filter({ hasText: n })).toContainText('Acheté');
});

test('S3 Cadeau collectif au groupe Collègues', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  const noms = ['Aya', 'Ben', 'Clio', 'Dan', 'Eva'];
  for (const n of noms) await creerPersonne(page, n, 'Collègues');
  await achat(page, { nom: 'Boîte de 24 douceurs', prix: 2400, groupes: ['Collègues'] });
  await aller(page, 'personnes');
  for (const n of noms) await expect(page.locator('.carte-personne-tete').filter({ hasText: n })).toContainText('Acheté · collectif');
  await ouvrirSouvenir(page, 'Boîte de 24 douceurs', 'achetes');
  await page.locator('.attribution').getByRole('button', { name: 'Donné' }).click();
  await aller(page, 'personnes');
  for (const n of noms) await expect(page.locator('.carte-personne-tete').filter({ hasText: n })).toContainText('Donné · collectif');
});

test('S4 Achat partiel d’une idée', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  await creerPersonne(page, 'Léa');
  await creerPersonne(page, 'Hugo');
  await idee(page, 'Baguettes laquées', ['Léa', 'Hugo']);
  await ouvrirSouvenir(page, 'Baguettes laquées');
  await page.getByRole('button', { name: "Je l'ai acheté" }).click();
  await puce(page, 'Hugo'); // décocher Hugo
  await feuille(page).getByLabel('Prix en yens').fill('1800');
  await feuille(page).getByRole('button', { name: "Enregistrer l'achat" }).click();
  await aller(page, 'souvenirs?seg=idees');
  const ideeL = page.locator('.carte-souvenir').filter({ hasText: 'Baguettes laquées' });
  await expect(ideeL).toHaveCount(1);
  await expect(ideeL).toContainText('Hugo');
  await expect(ideeL).not.toContainText('Léa');
  await aller(page, 'souvenirs?seg=achetes');
  const achatL = page.locator('.carte-souvenir').filter({ hasText: 'Baguettes laquées' });
  await expect(achatL).toContainText('Léa');
  await expect(achatL).not.toContainText('Hugo');
});

test('S5 Dernière chance à Onomichi', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  await idee(page, 'Ramen d’Onomichi');
  await ouvrirSouvenir(page, 'Ramen d’Onomichi');
  await page.getByRole('button', { name: 'Ajouter un lieu' }).click();
  const f = feuille(page);
  await f.getByLabel('Nom', { exact: true }).fill('Shuka-en');
  // Retire l'étape Ici proposée par défaut, choisit Onomichi
  await f.getByRole('button', { name: 'Kyoto', exact: true }).click();
  await f.getByRole('button', { name: 'Onomichi', exact: true }).click();
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await changerDate(page, '2026-11-09');
  await expect(page.locator('#derniere-chance')).toContainText('Dernière chance ici');
  await expect(page.locator('#derniere-chance')).toContainText('Ramen d’Onomichi');
  await changerDate(page, '2026-11-10');
  await expect(page.locator('main h1')).toHaveText('Onomichi → Hiroshima');
  await expect(page.locator('#derniere-chance')).toContainText('Dernière chance ici');
  await changerDate(page, '2026-11-11');
  await expect(page.locator('#derniere-chance')).toContainText('Plus prévue sur le parcours');
  await expect(page.locator('#derniere-chance')).toContainText('Ramen d’Onomichi');
});

const LIEUX_COUTEAU = {
  interpretation: 'Couteau de cuisine japonais (gyuto ou santoku) pour un cuisinier amateur',
  lieux: [
    { nom: 'Aritsugu', type: 'boutique', etapes: ['kyoto'], zone: 'Marché Nishiki', prix_min_yen: 15000, prix_max_yen: 40000, conseil: 'Gravure du nom possible', confiance: 'haute', sources: ['https://www.aritsugu.jp/'] },
    { nom: 'Kappabashi Dougu', type: 'rue_commercante', etapes: ['tokyo2'], zone: 'Asakusa', conseil: 'Plusieurs coutelleries', confiance: 'haute', sources: ['https://www.kappabashi.or.jp/'] },
    { nom: 'Takashimaya', type: 'grand_magasin', etapes: ['osaka', 'nagoya'], conseil: 'Rayon arts de la table', confiance: 'moyenne', sources: ['https://www.takashimaya.co.jp/'] },
    { nom: 'Lieu passé', type: 'boutique', etapes: ['takayama'], conseil: 'Ignoré : étape passée', confiance: 'basse', sources: ['https://exemple.jp/'] },
    { nom: 'Sans source sûre', type: 'boutique', etapes: ['osaka'], conseil: 'Ignoré : source http', confiance: 'basse', sources: ['http://exemple.jp/'] },
  ],
  retour: { tranchant: true, poids_g: 250 },
  alertes: ['Couteau : en soute obligatoirement'],
};

test('S6 IA automatique : recherche de lieux puis alerte bagage', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  const corps = await simulerClaude(page, () => messageOutil('enregistrer_lieux', LIEUX_COUTEAU));
  await configurerCle(page, true);
  await idee(page, 'Couteau de cuisine');
  await ouvrirSouvenir(page, 'Couteau de cuisine');
  await expect(page.locator('.carte-lieu')).toHaveCount(3);
  await expect(page.locator('.carte-lieu').first()).toContainText('source 1');
  await expect(page.getByText('Couteau : en soute obligatoirement')).toBeVisible();
  // Le contexte envoyé ne contient que les étapes restantes et pas de prénom
  const ctx = JSON.stringify(corps[0]);
  expect(ctx).toContain('enregistrer_lieux');
  expect(ctx).not.toContain('takayama');
  // tranchant proposé par l'IA
  await page.getByText('Contraintes de retour (alcool, bagage, douane…)').click();
  await expect(page.getByRole('button', { name: 'Tranchant · IA' })).toHaveAttribute('aria-pressed', 'true');
  // Achat puis rangement en cabine
  await page.getByRole('button', { name: "Je l'ai acheté" }).click();
  await feuille(page).getByLabel('Prix en yens').fill('22000');
  await feuille(page).getByRole('button', { name: "Enregistrer l'achat" }).click();
  await aller(page, 'retour?section=bagages');
  await page.locator('.ligne-rangement').filter({ hasText: 'Couteau de cuisine' }).getByRole('button', { name: 'Sac à dos' }).click();
  await expect(page.getByText('Objet tranchant en cabine : à mettre en soute')).toBeVisible();
});

test('S7 Douane : whisky et saké', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  await achat(page, { nom: 'Whisky', prix: 6000, alcool: { degre: '43', volume: '0,7' } });
  await achat(page, { nom: 'Saké', prix: 3000, alcool: { degre: '15', volume: '0,72' } });
  await aller(page, 'retour?section=douane');
  const france = page.locator('.section').filter({ hasText: 'France, entrée depuis la Suisse' });
  const prorata = france.locator('.ligne-douane').filter({ hasText: 'Plus de 22 % + 22 % ou moins' });
  await expect(prorata).toContainText('1,06 / 1');
  await expect(prorata).toContainText('Dépassé');
  const suisse = page.locator('.section').filter({ hasText: 'Suisse, arrivée à Genève' });
  const fort = suisse.locator('.ligne-douane').filter({ hasText: 'Plus de 18 %' });
  await expect(fort).toContainText('0,7 L / 1 L');
  await expect(fort).toContainText('OK');
  const doux = suisse.locator('.ligne-douane').filter({ hasText: "Jusqu'à 18 %" });
  await expect(doux).toContainText('0,72 L / 5 L');
  await expect(doux).toContainText('OK');
  await expect(page.getByText('Indicatif, ne remplace pas l\'information officielle.')).toBeVisible();
  await achat(page, { nom: 'Whisky 2', prix: 6000, alcool: { degre: '43', volume: '0,7' } });
  await aller(page, 'retour?section=douane');
  await expect(fort).toContainText('1,4 L / 1 L');
  await expect(fort).toContainText('Dépassé');
});

test('S8 Détaxe : un ticket par boutique et par jour', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  await creerPersonne(page, 'Léa');
  await achat(page, { nom: 'Furoshiki', prix: 3300, boutique: 'Kyoto Handicraft', detaxe: true, pour: ['Léa'] });
  await achat(page, { nom: 'Éventail', prix: 2200, boutique: 'Kyoto Handicraft', detaxe: true });
  await aller(page, 'retour?section=detaxe');
  const ticket = page.locator('.carte-ticket');
  await expect(ticket).toHaveCount(1);
  await expect(ticket).toContainText('5 500 ¥ TTC · 5 000 ¥ HT');
  await expect(ticket).toContainText('Éligible');
  await expect(page.locator('.total')).toContainText('500 ¥');
  await ouvrirSouvenir(page, 'Furoshiki', 'achetes');
  await page.locator('.attribution').getByRole('button', { name: 'Donné' }).click();
  await aller(page, 'retour?section=detaxe');
  await expect(page.locator('.carte-ticket')).toContainText('Ticket compromis');
});

test('S9 Remise après le voyage', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  await creerPersonne(page, 'Léa');
  await achat(page, { nom: 'Tenugui', prix: 1100, pour: ['Léa'] });
  await changerDate(page, '2026-11-21');
  await expect(page.locator('main h1')).toHaveText('De retour');
  await expect(page.getByText('Remise · 0/1 remis')).toBeVisible();
  await page.locator('.groupe-remise').getByRole('button', { name: 'Donné' }).click();
  await expect(page.getByText('Remise · 1/1 remis')).toBeVisible();
  await aller(page, 'personnes');
  await expect(page.locator('.carte-personne-tete').filter({ hasText: 'Léa' })).toContainText('Donné');
  await aller(page, 'ici');
  // Annulation depuis la liste des derniers remis
  await page.getByText('Derniers remis').click();
  await page.locator('details').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByText('Remise · 0/1 remis')).toBeVisible();
  // « Annuler » du toast rétablit l'état précédent
  await page.locator('.groupe-remise').getByRole('button', { name: 'Donné' }).click();
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByText('Remise · 0/1 remis')).toBeVisible();
});

test('S10 Sauvegarde puis restauration sur une installation vierge', async ({ page, browser }, info) => {
  await demarrer(page, '2026-11-02');
  await simulerClaude(page, () => ({}));
  await configurerCle(page, false);
  await creerPersonne(page, 'Léa', 'Famille');
  await achat(page, { nom: 'Tenugui', prix: 1500, pour: ['Léa'] });
  // Photo sur l'achat
  await ouvrirSouvenir(page, 'Tenugui', 'achetes');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC',
    'base64',
  );
  await page.locator('input[type=file]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('img.photo')).toBeVisible();
  await aller(page, 'parametres/sauvegarde');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter la sauvegarde' }).click();
  const fichier = info.outputPath('sauvegarde.json');
  await (await dl).saveAs(fichier);
  const contenu = readFileSync(fichier, 'utf8');
  expect(contenu).not.toContain('sk-ant-test');
  expect(JSON.parse(contenu).schemaVersion).toBe(1);

  const ctx2 = await browser.newContext({ baseURL: 'http://localhost:4173/' });
  const p2 = await ctx2.newPage();
  await demarrer(p2, '2026-11-02', 'parametres/sauvegarde');
  await p2.locator('input[type=file]').setInputFiles(fichier);
  await feuille(p2).getByRole('button', { name: 'Importer' }).click();
  await expect(p2.locator('main h1')).toHaveText('Kyoto');
  await aller(p2, 'personnes');
  await expect(p2.locator('.carte-personne-tete').filter({ hasText: 'Léa' })).toContainText('Acheté');
  await aller(p2, 'souvenirs?seg=achetes');
  await expect(p2.locator('.carte-souvenir').filter({ hasText: 'Tenugui' })).toContainText('1 500 ¥');
  await expect(p2.locator('.carte-souvenir img.miniature')).toBeVisible();
  await aller(p2, 'parametres/ia');
  await expect(p2.getByPlaceholder('sk-ant-…')).toBeVisible(); // pas de clé
  // Un fichier invalide est refusé sans rien modifier
  await aller(p2, 'parametres/sauvegarde');
  await p2.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion": 99, "voyages": []}') });
  await expect(p2.getByText('Version de sauvegarde inconnue', { exact: false })).toBeVisible();
  await aller(p2, 'personnes');
  await expect(p2.locator('.carte-personne').filter({ hasText: 'Léa' })).toHaveCount(1);
  await ctx2.close();
});

const SUGGESTIONS = {
  analyse: 'Collègues : douceurs à partager, emballées individuellement',
  suggestions: [
    {
      nom: 'Momiji manjū',
      description: 'Gâteaux en forme de feuille d’érable fourrés à l’anko',
      pourquoi: 'Spécialité de Miyajima, emballés individuellement',
      categorie: 'nourriture',
      prix_min_yen: 1200,
      prix_max_yen: 2500,
      quantite_conseillee: 2,
      lieux: [{ nom: 'Momijido', type: 'boutique', etapes: ['hiroshima'], conseil: 'Version frite à goûter', confiance: 'haute', sources: ['https://www.momijido.com/'] }],
      alertes: [],
    },
    {
      nom: 'Kit Kat au matcha',
      description: 'Barres chocolatées au thé vert',
      pourquoi: 'Classique apprécié au bureau',
      categorie: 'nourriture',
      lieux: [{ nom: 'Don Quijote', type: 'chaine', etapes: ['osaka', 'tokyo2'], conseil: 'Rayon souvenirs', confiance: 'moyenne', sources: ['https://www.donki.com/'] }],
      retour: { lait: true },
      alertes: ['Contient du lait'],
    },
  ],
};

test('S11 Suggestions IA pour le groupe Collègues', async ({ page }) => {
  await demarrer(page, '2026-11-02');
  const corps = await simulerClaude(page, () => messageOutil('enregistrer_suggestions', SUGGESTIONS));
  await configurerCle(page, false);
  for (const n of ['Aya', 'Ben']) await creerPersonne(page, n, 'Collègues');
  await aller(page, 'personnes');
  await page.locator('.zone').filter({ hasText: 'Collègues' }).getByRole('link', { name: 'Idées pour le groupe' }).click();
  await page.getByRole('button', { name: 'Suggestions pour le groupe Collègues' }).click();
  await expect(page.locator('.carte-suggestion')).toHaveCount(2);
  await page.locator('.carte-suggestion').filter({ hasText: 'Momiji manjū' }).getByRole('button', { name: 'Accepter' }).click();
  await page.locator('.carte-suggestion').filter({ hasText: 'Kit Kat au matcha' }).getByRole('button', { name: 'Écarter' }).click();
  await expect(page.locator('.carte-suggestion')).toHaveCount(0);
  // L'idée acceptée est attribuée au groupe (collectif), avec ses lieux
  await expect(page.locator('.carte-souvenir').filter({ hasText: 'Momiji manjū' })).toBeVisible();
  await ouvrirSouvenir(page, 'Momiji manjū');
  await expect(page.locator('.attribution')).toContainText('Collègues');
  await expect(page.locator('.attribution')).toContainText('collectif');
  await expect(page.locator('.carte-lieu')).toContainText('Momijido');
  // Nouvelle demande : la suggestion écartée n'est pas reproposée et figure dans le contexte
  await aller(page, 'groupes/collegues');
  await page.getByRole('button', { name: 'Suggestions pour le groupe Collègues' }).click();
  await expect(page.locator('.carte-suggestion')).toHaveCount(1);
  await expect(page.locator('.carte-suggestion')).toContainText('Momiji manjū');
  const ctx = JSON.stringify(corps[corps.length - 1]);
  expect(ctx).toContain('Kit Kat au matcha');
  expect(ctx).not.toContain('Aya');
});

test('S12 Mode manuel : copier la demande, coller une réponse', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await demarrer(page, '2026-11-02');
  await idee(page, 'Couteau de cuisine');
  await ouvrirSouvenir(page, 'Couteau de cuisine');
  await page.getByRole('button', { name: "Via l'app Claude" }).click();
  await feuille(page).getByRole('button', { name: 'Copier la demande' }).click();
  const copie = await page.evaluate(() => navigator.clipboard.readText());
  expect(copie).toContain('Réponds uniquement par un bloc de code JSON');
  expect(copie).toContain('"etapes_restantes"');
  // Réponse invalide : erreur, rien n'est importé
  await feuille(page).getByPlaceholder('…ou collez la réponse ici').fill('Voici :\n```json\n{"lieux": "pas une liste"}\n```');
  await feuille(page).getByRole('button', { name: 'Importer la réponse collée' }).click();
  await expect(feuille(page).getByRole('alert')).toContainText('Réponse invalide');
  // Réponse valide
  await feuille(page)
    .getByPlaceholder('…ou collez la réponse ici')
    .fill('Voici ma réponse :\n```json\n' + JSON.stringify(LIEUX_COUTEAU) + '\n```');
  await feuille(page).getByRole('button', { name: 'Importer la réponse collée' }).click();
  await expect(page.locator('.feuille')).toHaveCount(0);
  await expect(page.locator('.carte-lieu')).toHaveCount(3);
  // Une réponse invalide ensuite ne modifie rien
  await page.getByRole('button', { name: "Via l'app Claude" }).click();
  await feuille(page).getByPlaceholder('…ou collez la réponse ici').fill('{"interpretation": 3}');
  await feuille(page).getByRole('button', { name: 'Importer la réponse collée' }).click();
  await expect(feuille(page).getByRole('alert')).toContainText('Réponse invalide');
  await page.keyboard.press('Escape');
  await expect(page.locator('.carte-lieu')).toHaveCount(3);
});

test('Personnes : créer un groupe et y glisser une carte', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1800 });
  await demarrer(page, '2026-11-02');
  await creerPersonne(page, 'Léa', 'Amis');
  await aller(page, 'personnes');
  await page.getByLabel('Nom du nouveau groupe').fill('Voisins');
  await page.getByRole('button', { name: 'Créer le groupe' }).click();
  const zone = page.locator('section.zone[aria-label="Voisins"]');
  await expect(zone).toContainText('Glissez des personnes ici');
  const carte = page.locator('.carte-personne[aria-label="Léa"]');
  const a = await carte.boundingBox();
  const b = await zone.boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + 20);
  await page.mouse.down();
  await page.mouse.move(a!.x + a!.width / 2 + 20, a!.y + 40, { steps: 4 });
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 10 });
  await expect(zone).toHaveClass(/zone-survol/);
  await page.mouse.up();
  await expect(zone.locator('.carte-personne')).toContainText('Léa');
  await expect(page.locator('.toast')).toContainText('Léa → Voisins');
  // Le clic qui suit le glisser n'ouvre pas la fiche
  await expect(page.locator('main h1')).toHaveText('Personnes');
});
