# Omiyage

Web app personnelle pour suivre ses souvenirs de voyage : quoi acheter, pour qui, où, ce qui est déjà acheté et à qui le donner. Spécification : [`SPEC.md`](SPEC.md). Choix et arbitrages : [`DECISIONS.md`](DECISIONS.md).

- Application web installable (PWA), en français, utilisable sur téléphone et sur ordinateur.
- Données stockées **sur l'appareil** (IndexedDB), sans compte ni serveur. Fonctionne hors connexion, sauf l'IA et la mise à jour des taux.
- Phases 1 et 2 livrées : personnes et groupes, idées et achats (lots, cadeaux collectifs, « Moi »), écran Ici et dernière chance, lieux d'achat, assistant IA (lieux, suggestions, file automatique, mode copier-coller), photo, journal, détaxe, douane, bagages, remise, sauvegarde.
- Un code couleur unique pour l'état d'un cadeau : gris pointillé = rien, orange = idée, bleu = acheté, vert = donné.

## Prise en main

- **Ajouter** : bouton « + ». Tapez quoi, touchez les personnes concernées, et indiquez le prix si c'est déjà acheté (sans prix, c'est une idée).
- **Ici** : où vous êtes, ce qu'il ne faut pas rater (« Dernière chance »), ce qu'on peut acheter dans la ville avec le bouton « Je l'ai acheté ».
- **Personnes** : une carte par personne avec ses cadeaux et idées. Glissez une carte sur un autre groupe pour l'y déplacer (sur téléphone : appui long, puis glisser). Créez un groupe en bas de la liste.
- **Retour** : détaxe, douane, bagages, puis remise des cadeaux en France.

**Adresse :** https://alexisbaud.github.io/Souvenir/

## Installer sur iPhone

1. Ouvrez l'adresse ci-dessus dans **Safari**.
2. Touchez le bouton **Share** (carré avec une flèche), puis **Add to Home Screen**, puis **Add**.
3. Lancez l'app depuis l'icône « Omiyage » de l'écran d'accueil.

Installée, l'app s'ouvre en plein écran, fonctionne hors connexion et garde ses données : Safari peut effacer les données des sites peu visités, mais pas celles d'une app ajoutée à l'écran d'accueil.

## Sur ordinateur

Ouvrez la même adresse dans un navigateur récent (Safari, Chrome, Edge, Firefox). Chrome et Edge proposent aussi d'installer l'app (icône d'installation dans la barre d'adresse).

Les données **ne se synchronisent pas** entre appareils. Pour passer du téléphone à l'ordinateur (ou l'inverse) : **Paramètres → Sauvegarde → Exporter** sur le premier appareil (sur iPhone : feuille de partage → **Save to Files**), puis **Importer** ce fichier sur le second. L'import remplace les données du second appareil (l'état précédent est conservé et peut être restauré).

## Assistant IA (facultatif)

- **Avec une clé API Claude** : Paramètres → Assistant IA → coller la clé (créée sur console.anthropic.com, facturée à l'usage, séparément de l'abonnement Claude ; une clé dédiée avec une limite de dépense est recommandée). La clé reste sur l'appareil et n'est jamais exportée.
- **Sans clé** : sur une idée ou une personne, « Via l'app Claude » copie une demande à coller dans l'app Claude (recherche web activée), puis importe la réponse collée.

## Développement

Prérequis : Node.js 22.

```bash
npm install
```

```bash
npm run dev
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types et build de production dans `dist/` |
| `npm test` | Tests unitaires (règles de gestion, IA, stockage, sauvegarde) |
| `npm run test:e2e` | Tests de bout en bout des scénarios S1 à S12 (Playwright, date simulée) |
| `npm run lint` | ESLint |

Pour les tests de bout en bout, installez une fois le navigateur de Playwright :

```bash
npx playwright install chromium
```

Organisation du code :

- `src/db` : modèle de données (`types.ts`), données initiales, IndexedDB, mutations atomiques avec annulation (`store.ts`), sauvegarde et migrations.
- `src/domain` : règles de gestion pures (`rules.ts`), actions métier (`actions.ts`), dates, formats, taux de change.
- `src/ai` : prompts et schémas, contexte envoyé, validation, client API, file d'attente persistante.
- `src/ui` : écrans et composants.

## Déploiement

L'app est un site statique hébergé sur **GitHub Pages**. Le workflow `.github/workflows/deploy.yml` lance le lint, les tests unitaires et le build, puis publie `dist/` à chaque push sur `main` (ou sur la branche de développement).

Mise en place, une seule fois : sur GitHub, dans le dépôt, **Settings → Pages → Build and deployment → Source : GitHub Actions**. Relancez ensuite le workflow si besoin (**Actions → Tests et déploiement → Run workflow**).

Le build utilise `BASE_PATH=/<nom du dépôt>/`. Pour un autre hébergeur servant l'app à la racine, lancez simplement `npm run build` et publiez `dist/`.
