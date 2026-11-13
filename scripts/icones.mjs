// Génère les icônes PNG à partir de public/icon.svg (node scripts/icones.mjs).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
for (const [nom, taille, marge] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['apple-touch-icon.png', 180, 0]]) {
  await p.setViewportSize({ width: taille, height: taille });
  // Fond plein (pas de transparence) pour iOS et l'icône « maskable »
  await p.setContent(`<html><body style="margin:0;background:#2f54d6">${svg.replace('<svg ', `<svg width="${taille - marge * 2}" height="${taille - marge * 2}" `)}</body></html>`);
  await p.screenshot({ path: new URL('../public/' + nom, import.meta.url).pathname });
}
await b.close();
