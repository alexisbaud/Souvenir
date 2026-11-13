# Décisions et arbitrages

Ce fichier consigne les choix techniques et les interprétations de la spécification (`SPEC.md`, §0.4). Les références F-xx, RG-xx et Hx renvoient à la spécification.

## Périmètre livré

- **Phases 1 et 2** livrées ensemble (décision d'Alexis, 13/11/2026 : la phase 2 était attendue pour le 12/11). La phase 3 (multi-voyages, modèles de profils douaniers) n'a pas d'écran ; le modèle de données la prévoit déjà (voyages, `voyageId` partout, destinataires par voyage).
- **Ordinateur et téléphone** : l'interface est responsive (barre d'onglets en bas sur téléphone, navigation latérale à partir de 900 px, feuilles modales centrées sur grand écran). Les données restent **locales à chaque appareil** (pas de synchronisation, §13) ; on passe de l'un à l'autre par Exporter/Importer (décision d'Alexis).

## Stack

| Besoin | Choix | Raison |
|---|---|---|
| UI | Preact + `@preact/signals`, TypeScript | API React, ~10 Ko ; les signaux donnent un état global simple sans bibliothèque de gestion d'état. |
| Build | Vite + `vite-plugin-pwa` (Workbox) | Manifeste et service worker générés, mise en cache hors connexion. |
| Stockage | IndexedDB via `idb` | Petite surcouche à promesses. Un object store par entité, plus `photos` (Blob), `secrets` (clé API, jamais exportée), `snapshots` (sauvegarde automatique avant import). |
| IA | SDK officiel `@anthropic-ai/sdk`, `dangerouslyAllowBrowser: true` | Appel direct sans proxy (§11). Le SDK est **chargé à la demande** (import dynamique) : le bundle initial reste à ~60 Ko gzip. |
| Tests | Vitest (+ `fake-indexeddb`) ; Playwright | Unitaires des RG et du stockage ; bout en bout des scénarios §15 avec `page.clock.setFixedTime` (date simulée), taux et API Claude simulés par `page.route`. |
| Hébergement | GitHub Pages, déployé par GitHub Actions | Gratuit, HTTPS, dépôt public déjà sur GitHub. Routage par `#` : aucune réécriture d'URL nécessaire. |

## Architecture

- **Toute la base en mémoire** (signal `etat`) : quelques centaines de souvenirs au plus. Chaque action passe par `commit(f)` : la fonction modifie un *brouillon* (`Draft`), qui enregistre l'état d'avant de chaque enregistrement touché. Les changements s'écrivent dans **une seule transaction IndexedDB** (atomicité, §10) puis l'état en mémoire est remplacé. Une erreur métier avant l'écriture ne modifie rien.
- **Annulation générique (RG-16)** : l'inverse d'un `commit` (états d'avant) est rejoué par « Annuler » pendant 5 s. Toutes les suppressions et tous les changements d'état passent par là.
- Les règles de gestion sont des **fonctions pures** (`src/domain/rules.ts`), les mutations sont dans `src/domain/actions.ts` ; l'interface n'en contient aucune.
- **Horloge** : calculs sur la date locale de l'appareil (`toDateStr`). `setClock` permet d'injecter une horloge ; les tests e2e figent `Date` avec Playwright.
- Photos : orphelines nettoyées au démarrage suivant (pour que l'annulation d'une suppression retrouve la photo).

## Interprétations de la spécification

| Sujet | Choix |
|---|---|
| RG-01, achat uniquement pour « Moi » | « Donné » exige au moins une attribution hors « Moi ». Un achat pour soi reste *Acheté* (il apparaît dans « Pour moi »). |
| Plusieurs personnes dans « Pour qui » | Par défaut, **une attribution individuelle par personne** (1 unité chacune, cf. S2 et S4). L'interrupteur « Un seul cadeau commun » crée une attribution collective unique (RG-03). Un groupe choisi est toujours collectif. La quantité se règle au moins au nombre d'attributions. |
| Retour à l'état d'idée (RG-01) | Les remises éventuelles repassent « à donner » ; l'achat quitte son ticket de détaxe. |
| RG-06, filtres « Acheté » et « À donner » | Mêmes définitions qu'en RG-06 ; « À donner » = au moins une attribution sur un achat non donnée (les deux ensembles coïncident par construction). |
| RG-07, jour du départ final (19/11) | Affiché « Tokyo · jour du départ » ; le mode retour commence le lendemain. Un trou entre deux étapes affiche « En route vers … ». |
| RG-07, avant le voyage | Première étape, libellé « Tokyo · À venir ». |
| RG-09, excursion choisie | Les lieux dont la zone ou le nom contient le premier mot de l'excursion passent en premier. |
| RG-10, « Plus prévue sur le parcours » | Seulement pour une idée qui **avait** des étapes possibles et n'en a plus. Une idée sans aucune étape ni lieu est une idée « sans lieu d'achat » (encart IA, filtre). |
| RG-10, « Derniers jours » | De J-2 au dernier jour inclus. Les idées « partout » y figurent mais jamais en « Dernière chance ici ». |
| RG-11, taux | Taux stocké en EUR pour 1 JPY. Un prix saisi en euros garde un équivalent en yens calculé avec son taux figé. Sans taux connu, la saisie d'achat demande le taux et le mémorise comme taux manuel. |
| RG-13, taux de taxe | 8 % pour la catégorie « Nourriture » et les « Boissons » sans alcool, 10 % sinon (paramétrables). HT = arrondi de TTC × 100 / (100 + taux), par article. La taxe saisie depuis le ticket remplace l'estimation. Le seuil se teste sur le HT (≥ 5 000 ¥). |
| RG-13, regroupement | Clé de ticket : nom de boutique normalisé (casse, accents, espaces) + date. Une boutique est obligatoire pour cocher « Détaxé ». Changer la boutique ou la date d'un achat détaxé le déplace de ticket. |
| RG-13, « ticket compromis » | Remise datée **avant** la date de fin du voyage, ou article « consommé au Japon ». Un ticket compromis n'est plus compté dans « à récupérer ». |
| RG-14, valeur | Achats non consommés au Japon ; taxe japonaise déduite au prorata de la taxe du ticket (tickets éligibles seulement) ; conversion au **taux du jour** (JPY→CHF ou JPY→EUR). |
| RG-14, catégories d'alcool | Une règle porte `types`, `degreMin` (exclu, « plus de ») et `degreMax` (inclus, « jusqu'à ») ; la première règle qui correspond s'applique. Saké classé « 22 % ou moins » (H3). |
| RG-14, statuts | *OK* < 80 %, *Attention* de 80 à 100 % inclus, *Dépassé* au-delà. Un interdit détecté rend le profil *Dépassé*. |
| RG-15 | Alerte 24-70 % : cumul de tous les achats, rappel « emballage d'origine fermé » en dessous de 5 L, alerte au-delà. |
| RG-16, suppression d'étape | Refusée si un achat y est rattaché ; sinon l'étape est retirée des étapes prévues et des lieux (un lieu sans étape est supprimé). |
| F-02 CA2, sauvegarde automatique avant import | Conservée dans IndexedDB (`snapshots`) avec un bouton « Restaurer l'état d'avant le dernier import », plutôt qu'un téléchargement qui ouvrirait la feuille de partage. |
| F-02 CA3, rappel | Référence : dernière sauvegarde, ou date d'installation si aucune. |
| F-02 CA1, iPhone | `navigator.share` avec le fichier sur iOS (Save to Files) ; téléchargement classique ailleurs. |
| F-42, acceptation | L'idée reprend la quantité conseillée ; pour un groupe, toutes les unités sont attribuées au groupe (attribution collective). La description devient la note. Une nouvelle demande remplace les suggestions encore « nouvelles » de la même cible ; les écartées sont envoyées à l'IA **et** filtrées à l'import (par nom normalisé). |
| §5.8, lieux d'une suggestion | Stockés dans la suggestion ; transformés en lieux d'achat à l'acceptation. |
| F-43, file | Une demande en cours lors de la fermeture repasse « en file » à l'ouverture. Hors connexion, la file attend l'événement `online`. Le plafond mensuel compte les demandes réalisées plus celles en file. |
| §9.6, recherche web | `web_search_20260209` (filtrage dynamique) pour Sonnet 5.5 et Opus 5.5, `web_search_20250305` pour Haiku 5.5 ; repli automatique sur `web_search_20250305` si l'API refuse la requête. `tool_choice: auto` (les modèles récents refusent un choix forcé). |
| §9.6, refus | `stop_reason: refusal` = échec explicite. Pour Sonnet 5.5 et Opus 5.5, le repli serveur (`fallbacks: "default"`, bêta `server-side-fallback-2026-07-01`) est activé : un refus est relancé côté serveur sur un modèle de repli. |
| §9.6, nouvelles tentatives | Confiées au SDK (`maxRetries: 2`, attente croissante, 429/5xx/529), délai de 120 s par requête. |
| §9.7, nettoyage | Textes : espaces normalisés, tronqués à la longueur du schéma (au lieu d'un rejet) ; le reste est validé strictement par un petit validateur JSON Schema maison (types, requis, énumérations, bornes, nombre d'éléments). |
| §9.10, CSP | Balise `<meta>` : `connect-src` limité à `api.anthropic.com` et Frankfurter. Aucun script tiers. |
| F-27, source des taux | Frankfurter (taux BCE, sans clé) : `api.frankfurter.dev/v1/latest?base=JPY&symbols=EUR,CHF`, repli sur `api.frankfurter.app`. Le taux du jour est celui de la dernière publication BCE (jours ouvrés). |
| Bandeau d'installation (F-01 CA3) | Affiché seulement sur iOS hors mode installé ; masquable. |

## Hypothèses du §12 non tranchées

H1 (nom « Omiyage »), H3 (saké), H4, H5 (indices conservés), H6, H7 (aéroport et poids à saisir dans l'app) : valeurs par défaut de la spécification.
