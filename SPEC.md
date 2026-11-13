# Omiyage — Spécification fonctionnelle

> Web app personnelle pour suivre ses souvenirs de voyage : quoi acheter, pour qui, où, ce qui est déjà acheté et à qui le donner.

| | |
|---|---|
| Version | 1.0, 2 novembre 2026 |
| Product owner | Alexis |
| Destinataire | Claude Code (cloud), dans ce dépôt |
| Statut | Prête pour le développement |

## En bref

- **Utilisateur unique, téléphone uniquement, sans compte.** Les données restent sur l'appareil (PWA installée sur l'écran d'accueil) et une sauvegarde est exportable.
- **Un souvenir passe par trois états : Idée, puis Acheté, puis Donné.** Il peut aller à une personne, à plusieurs (cadeau collectif), être réparti en lot, ou être pour soi.
- **L'app connaît les étapes du voyage.** L'écran **Ici** montre ce qu'on peut acheter là où l'on est, et ce qu'on ne trouvera plus ensuite.
- **Chaque idée a sa liste d'endroits où l'acheter.** On la remplit à la main, ou une IA (Claude avec recherche web) la remplit seule. L'IA propose aussi des **idées de cadeaux** par personne ou par groupe.
- **L'onglet Retour prépare l'aéroport et les frontières** : détaxe japonaise, douane suisse puis française, bagages. Il gère ensuite la remise des cadeaux.
- **Livrer la phase 1 au plus vite** : le voyage se termine le 19 novembre 2026.

## Sommaire

0. Consignes pour Claude Code
1. Contexte et problème
2. Objectifs et principes
3. Utilisateur et contextes d'usage
4. Glossaire
5. Modèle de données
6. Règles de gestion
7. Navigation et écrans
8. Fonctionnalités et critères d'acceptation
9. Assistant IA : conception détaillée et prompts système
10. Exigences non fonctionnelles
11. Cadre technique
12. Hypothèses et points ouverts
13. Hors périmètre
14. Plan de livraison
15. Recette : scénarios de bout en bout
- Annexes : A. Données initiales · B. Règles du retour et sources · C. Exemple de sauvegarde · D. Prompt de démarrage

---

## 0. Consignes pour Claude Code

1. Ce document est la source de vérité. Les identifiants F-xx (fonctionnalités), RG-xx (règles de gestion) et CA (critères d'acceptation) servent de référence dans les commits, les tests et `DECISIONS.md`.
2. Livre par phases (§14). Commence par la phase 1 : elle doit être déployée et utilisable avant d'attaquer la suivante.
3. Le modèle de données est complet dès la phase 1, y compris le retour et le multi-voyages, pour éviter toute migration douloureuse. Les écrans correspondants arrivent plus tard.
4. En cas d'ambiguïté, choisis l'option la plus simple compatible avec les principes (§2), consigne-la dans `DECISIONS.md` et continue sans bloquer.
5. N'ajoute rien de ce qui est hors périmètre (§13).
6. Les choix techniques sont libres dans le cadre du §11. Vérifie dans la documentation officielle les éléments datés : versions des outils de l'API Claude, API de taux de change, comportement du stockage dans Safari.
7. Chaque règle de gestion est couverte par des tests unitaires. Chaque scénario de recette (§15) est couvert par un test de bout en bout. La date du jour doit pouvoir être simulée.

---

## 1. Contexte et problème

Alexis voyage au Japon du 15 octobre au 19 novembre 2026, en 12 étapes, de Tokyo à Tokyo (annexe A). Les souvenirs s'achètent au fil du parcours, pour des proches, pour des groupes (collègues, famille…) et pour soi. Il existe à la fois :

- des idées sans destinataire ;
- des idées précises pour des personnes précises ;
- des achats déjà faits, avec ou sans destinataire.

Sans outil, il est difficile de savoir à un instant donné :

- qui n'a encore rien, et ce qu'il reste à acheter ;
- ce qui a été acheté, et pour qui ;
- où trouver chaque idée sur la suite du parcours, et quand c'est la dernière occasion ;
- au retour, à qui donner quoi ;
- si les achats passeront la détaxe, la douane et les bagages.

Au moment de la rédaction (2 novembre, étape de Kyoto), la moitié du voyage est passée. Des achats ont déjà été faits et devront être saisis après coup.

## 2. Objectifs et principes

**Objectifs**

| Id | Objectif | Mesure |
|---|---|---|
| O1 | Vue claire | Depuis l'accueil, en moins de 5 s : nombre de personnes sans rien, d'idées à acheter, et ce qui est achetable ici |
| O2 | Saisie express | Un achat en boutique enregistré en moins de 15 s (nom, prix, destinataire ; le reste est prérempli ou facultatif) |
| O3 | Rien d'oublié | Aucune idée ratée faute d'avoir vu qu'on quittait la dernière ville où la trouver ; aucun cadeau oublié au retour |
| O4 | Retour serein | Détaxe récupérée, douane et bagages anticipés |
| O5 | Recherche déléguée | Les endroits où acheter et des idées de cadeaux arrivent sans effort, grâce à une IA |

**Principes**

- **Mobile d'abord** : utilisable d'une main, debout, en boutique.
- **Local d'abord** : les données vivent sur le téléphone. Tout fonctionne sans réseau, sauf l'IA et la mise à jour du taux de change.
- **Zéro perte** : stockage persistant, sauvegarde exportable, annulation des actions destructrices.
- **Sobre** : design minimal et utilitaire, information dense, aucun décor.
- **L'IA propose, Alexis décide** : les endroits trouvés s'ajoutent directement, car ce ne sont que des pistes. Les idées de cadeaux s'acceptent ou s'écartent d'un tap.

## 3. Utilisateur et contextes d'usage

- **Utilisateur** : Alexis, seul. Pas de compte, pas de partage, pas de synchronisation entre appareils.
- **Appareil** : téléphone (iPhone, Safari), app ajoutée à l'écran d'accueil.
- **Langue de l'interface** : français.
- **Réseau** : disponible en permanence au Japon (eSIM).

| Contexte | Quand | Besoin principal |
|---|---|---|
| En boutique | Pendant le voyage | Saisir un achat ou vérifier une idée en quelques secondes |
| Le soir, au calme | Pendant le voyage | Voir qui n'a rien, ce qui s'achète aux étapes suivantes ; lancer l'IA |
| À l'aéroport | 19 novembre | Détaxe, bagages, douane |
| En France | Après le 19 novembre | Donner les cadeaux et les cocher au fur et à mesure |

## 4. Glossaire

| Terme | Définition |
|---|---|
| Voyage | Séjour daté composé d'étapes. Un seul voyage est actif à la fois. |
| Étape | Ville où l'on dort, avec dates d'arrivée et de départ (ex. Kyoto, du 30/10 au 5/11). |
| Excursion | Lieu visité à la journée depuis une étape (ex. Nara depuis Kyoto). |
| Ici | L'étape du jour, déduite des dates, ou le lieu choisi à la main. |
| Souvenir | Objet suivi par l'app. C'est une idée tant qu'il n'est pas acheté. |
| Destinataire | Personne qui reçoit un souvenir. « Moi » est un destinataire système. |
| Groupe | Catégorie de destinataires (Famille, Amis, Collègues…), utilisable aussi comme cible collective. |
| Attribution | Lien entre un souvenir (ou une partie de ses unités) et un ou plusieurs destinataires. Porte l'état de remise. |
| Cadeau collectif | Attribution à plusieurs personnes ou à un groupe entier (ex. une boîte de douceurs pour l'équipe). |
| Lot | Souvenir acheté en plusieurs unités à répartir (ex. 6 tenugui). |
| Lieu d'achat | Endroit où acheter une idée (boutique, marché, chaîne…), saisi à la main ou trouvé par l'IA. |
| Suggestion | Idée de cadeau proposée par l'IA, à accepter ou écarter. |
| Ticket détaxe | Ensemble des achats détaxés d'une même boutique, un même jour. |
| Profil douanier | Règles d'une frontière franchie au retour (ex. la Suisse à Genève). |
| Remise | Le fait de donner un souvenir à son destinataire. |

---

## 5. Modèle de données

**Conventions**

- Identifiants UUID. Dates au format `AAAA-MM-JJ`. Montants en yens entiers ; euros et francs suisses à deux décimales.
- Chaque entité porte `createdAt` et `updatedAt`. La base porte un `schemaVersion`.
- **Globales** (partagées entre voyages) : Personnes, Groupes, Catégories, Paramètres.
- **Par voyage** : Étapes, Souvenirs, Attributions, Lieux d'achat, Suggestions, Tickets détaxe, Bagages, Profils douaniers.

### 5.1 Voyage

| Champ | Type | Oblig. | Notes |
|---|---|---|---|
| nom | texte | oui | « Japon 2026 » |
| dateDebut, dateFin | date | oui | 2026-10-15 → 2026-11-19 |
| deviseLocale | code ISO | oui | JPY |
| deviseReference | code ISO | oui | EUR |
| actif | booléen | oui | Un seul voyage actif |
| destinataires | ids de Personne | non | Personnes concernées par ce voyage (RG-17) |
| itineraireRetour | texte | non | Ex. « Vol Tokyo → Genève avec correspondance, puis route ou train vers la France ». Envoyé à l'IA. |
| detaxeActive | booléen | oui | Vrai pour le Japon |

### 5.2 Étape

| Champ | Type | Oblig. | Notes |
|---|---|---|---|
| ordre | entier | oui | Ordre de passage |
| ville | texte | oui | |
| region | texte | non | Ex. Kansai |
| zone | texte | non | Quartier du logement (aide l'IA) |
| arrivee, depart | date | oui | Nuitées de `arrivee` incluse à `depart` exclu |
| excursions | liste de {nom, date?} | non | Ex. {Nara, 2026-11-02} |
| note | texte | non | |

### 5.3 Groupe

| Champ | Type | Oblig. |
|---|---|---|
| nom | texte | oui |
| ordre | entier | oui |

### 5.4 Personne

| Champ | Type | Oblig. | Notes |
|---|---|---|---|
| nom | texte | oui | Prénom ou surnom |
| groupeId | id | non | |
| indices | texte | non | Facultatif, sert uniquement aux suggestions de l'IA (§9). Absent des listes. |
| systeme | booléen | — | Vrai pour « Moi » : non supprimable, sans groupe |

### 5.5 Souvenir

| Champ | Type | Oblig. | Notes |
|---|---|---|---|
| nom | texte | oui | |
| statut | `idee` / `achete` | oui | « Donné » se lit sur les attributions (RG-01) |
| categorieId | id | non | |
| note | texte | non | |
| quantite | entier ≥ 1 | oui | Défaut 1 |
| etapesPrevues | ids d'Étape | non | Où l'on compte l'acheter |
| partout | booléen | non | Trouvable à toutes les étapes (ex. konbini) |
| achat.date | date | si acheté | Défaut : aujourd'hui |
| achat.etapeId | id | si acheté | Défaut : étape Ici |
| achat.boutique | texte | non | |
| achat.prix | montant | si acheté | Prix total payé, taxes comprises, pour toute la quantité |
| achat.devise | JPY / EUR | si acheté | Défaut JPY |
| achat.tauxEUR | nombre | si acheté | Figé à l'enregistrement (RG-11) |
| achat.prixEUR | montant | calculé | Figé |
| achat.lieuId | id | non | Lieu d'achat où l'objet a été acheté |
| achat.ticketDetaxeId | id | non | |
| photo | image | non | Une seule, toujours facultative |
| retour.alcool | {type : `vin` / `biere` / `autre`, degre %, volumeL} | non | volumeL = volume total de la ligne |
| retour.viande, retour.lait, retour.vegetal | booléens | non | Restrictions alimentaires |
| retour.liquide, retour.tranchant, retour.fragile | booléens | non | Contraintes de bagages |
| retour.poidsG | entier | non | Poids estimé |
| retour.bagageId | id | non | |
| retour.consommeAuJapon | booléen | non | Pour la détaxe (RG-13) |
| retour.sourceIA | liste de champs | non | Champs remplis par l'IA et non encore modifiés à la main |
| origine | `manuel` / `ia` | oui | |

### 5.6 Attribution

| Champ | Type | Oblig. | Notes |
|---|---|---|---|
| souvenirId | id | oui | |
| cible | {type : `personnes`, ids} ou {type : `groupe`, groupeId} | oui | |
| quantite | entier ≥ 1 | oui | Unités du souvenir affectées. Défaut 1. |
| remise | `a_donner` / `donne` | oui | Sans objet pour « Moi » (RG-05) |
| dateRemise | date | si donné | |

### 5.7 Lieu d'achat

| Champ | Type | Oblig. | Notes |
|---|---|---|---|
| souvenirId ou suggestionId | id | oui | |
| nom | texte | oui | |
| type | `boutique` / `grand_magasin` / `marche` / `rue_commercante` / `temple_sanctuaire` / `chaine` / `konbini` / `aeroport` / `autre` | oui | |
| etapeIds | ids d'Étape | oui | Une chaîne peut couvrir plusieurs étapes |
| zone | texte | non | Quartier ou adresse |
| prixMinYen, prixMaxYen | entiers | non | |
| horaires | texte | non | |
| conseil | texte | non | |
| sources | URLs | oui si IA | |
| confiance | `haute` / `moyenne` / `basse` | oui si IA | |
| origine | `manuel` / `ia` | oui | |
| ecarte | booléen | non | Masqué mais conservé pour ne pas être reproposé |
| obsolete | booléen | non | Mis à vrai si l'idée a été renommée après la recherche |
| dateRecherche | date-heure | oui si IA | |
| lienCarte | URL | calculé | Recherche Google Maps « nom + ville » |

### 5.8 Suggestion

| Champ | Type | Notes |
|---|---|---|
| cible | personne / groupe / `moi` | |
| nom, description, pourquoi | texte | |
| categorieId | id | |
| prixMinYen, prixMaxYen | entiers | |
| quantiteConseillee | entier | Utile pour un groupe |
| lieux | Lieux d'achat | |
| retour | mêmes indicateurs que Souvenir.retour | |
| alertes | textes | |
| statut | `nouvelle` / `acceptee` / `ecartee` | |
| genereeLe | date-heure | |

### 5.9 Ticket détaxe

| Champ | Type | Notes |
|---|---|---|
| boutique | texte | |
| etapeId | id | |
| date | date | |
| totalTTCYen | entier | Somme des achats liés |
| taxeYen | entier | Saisie depuis le ticket ; à défaut, estimée (RG-13) |
| statut | `a_valider` / `valide` / `rembourse` | |
| note | texte | Ex. mode de remboursement indiqué par la boutique |

Les souvenirs sont liés au ticket par `achat.ticketDetaxeId`.

### 5.10 Bagage

| Champ | Type | Notes |
|---|---|---|
| nom | texte | « Valise », « Sac à dos » |
| type | `soute` / `cabine` | |
| poidsMaxKg | nombre | Facultatif |
| poidsHorsSouvenirsKg | nombre | Facultatif, pour estimer la marge |

### 5.11 Profil douanier

| Champ | Type | Notes |
|---|---|---|
| nom | texte | Ex. « Suisse, arrivée à Genève (avion) » |
| ordre | entier | Ordre de passage au retour |
| devise | code ISO | CHF, EUR |
| franchiseValeur | montant | |
| regleValeur | texte | Ce qui se passe au-delà |
| reglesAlcool | liste de {libelle, types?, degreMin?, degreMax?, limiteL, groupeProrata?} | Voir annexe B |
| interdits | {viande, lait, vegetal} + texte | |
| sources | URLs | |
| verifieLe | date | |

### 5.12 Paramètres

- **Taux de change** : JPY→EUR et JPY→CHF, date, source (automatique ou manuelle).
- **Détaxe** : taux de taxe par défaut (10 % et 8 %, modifiables).
- **IA** : clé API, modèle, mode automatique, limites, option « Envoyer les prénoms » (§9).
- **Sauvegarde** : date de la dernière sauvegarde.
- **Ici** : lieu choisi à la main et sa date d'expiration (RG-07).

---

## 6. Règles de gestion

**RG-01 Cycle de vie.** Un souvenir naît `idee` et devient `achete` par « Marquer acheté ». L'état affiché est :
- *Idée* ;
- *Acheté* ;
- *Partiellement donné* : au moins une attribution donnée, mais pas toutes ;
- *Donné* : toutes les attributions hors « Moi » sont données, et aucune unité n'est sans destinataire.

Le retour à l'état d'idée est possible après confirmation. Il efface les champs d'achat et conserve les attributions.

**RG-02 Unités.** La somme des quantités des attributions d'un souvenir ne dépasse jamais sa quantité. Unités non attribuées = quantité − somme. Un achat qui a des unités non attribuées apparaît dans « À attribuer ».

**RG-03 Cadeau collectif.** Une attribution est collective quand sa cible compte plusieurs personnes ou un groupe entier. Elle consomme 1 unité par défaut (modifiable) et se remet en une fois. Une cible de type groupe couvre les membres du groupe au moment du calcul.

**RG-04 Lot.** Un souvenir de quantité N peut recevoir plusieurs attributions. L'interface affiche « k/N attribués ». Réduire la quantité sous le nombre d'unités attribuées est refusé, avec un message.

**RG-05 « Moi ».** Destinataire système, toujours présent, non supprimable. Une attribution à « Moi » n'a pas d'état de remise. « Moi » n'apparaît ni dans « Personnes sans rien », ni dans « À donner ».

**RG-06 Couverture d'un destinataire**, pour le voyage actif, en comptant les attributions directes et celles reçues via un groupe :
- *Rien* : aucune attribution ;
- *Idée* : seulement des attributions sur des idées ;
- *Acheté* : au moins une attribution sur un achat, non encore donnée ;
- *Donné* : toutes ses attributions sur des achats sont données, et il en a au moins une.

La mention « collectif » s'ajoute quand la couverture *Acheté* ou *Donné* ne vient que de cadeaux collectifs. Alexis peut ainsi décider d'ajouter un cadeau individuel.

**RG-07 Ici.** L'étape du jour se calcule sur la date locale de l'appareil :
- jour J compris dans [arrivée, départ[ d'une étape : cette étape, affichée « Kyoto · nuit 4/6 » ;
- jour de transition (départ de l'étape n = arrivée de n+1) : les deux étapes, affichées « Kyoto → Osaka » ;
- avant le voyage : la première étape, affichée « À venir » ;
- après la fin du voyage : mode retour, l'écran Ici affiche la remise (F-53).

Le choix manuel « Je suis ailleurs » accepte n'importe quelle étape ou excursion du voyage. Il vaut jusqu'à minuit, puis le calcul automatique reprend.

**RG-08 Étapes possibles d'une idée.** Ce sont les étapes prévues, plus les étapes de ses lieux d'achat non écartés. « Partout » signifie toutes les étapes restantes. Une étape est restante si sa date de départ est postérieure ou égale à aujourd'hui.

**RG-09 Achetable ici.** Une idée est achetable ici si ses étapes possibles contiennent le lieu Ici, ou si elle est marquée « partout ». Pour une excursion, on prend son étape de rattachement, et les lieux dont la zone mentionne l'excursion passent en premier.

**RG-10 Dernière chance.** Ce calcul suit le calendrier et ignore le choix manuel d'Ici.
- Une idée dont la dernière étape possible restante est une étape du jour apparaît dans « Dernière chance ici ».
- Une idée sans étape possible restante, et non marquée « partout », apparaît dans « Plus prévue sur le parcours ».
- À partir de deux jours avant la fin du voyage, toute idée non achetée apparaît dans « Derniers jours ».

**RG-11 Prix et conversion.** Le prix se saisit en yens (par défaut) ou en euros. Le taux du jour sert à la conversion et se fige sur l'achat à l'enregistrement ; il reste modifiable sur la fiche. Les yens s'arrondissent à l'unité, les euros et francs au centime. Sans taux disponible, le dernier taux connu s'applique ; à défaut, l'app demande un taux.

**RG-12 Totaux.** Le total dépensé est la somme des prix des achats du voyage, affiché en yens et en euros. La part « pour moi » est la somme, pour chaque achat, de prix × unités attribuées à « Moi » / quantité. Aucun budget n'est géré.

**RG-13 Détaxe japonaise** (système de remboursement en vigueur depuis le 1er novembre 2026, annexe B) :
- un achat se marque « détaxé » et rejoint le ticket de sa boutique et de sa date, créé automatiquement s'il n'existe pas ;
- un ticket est éligible si son total hors taxe atteint 5 000 ¥, sinon l'app le signale ;
- le montant à récupérer est la somme des taxes des tickets. La taxe se saisit depuis le ticket ; à défaut, elle s'estime avec les taux paramétrés ;
- l'alerte « Ticket compromis » s'affiche si un souvenir du ticket est marqué donné avant le départ du Japon ou « consommé au Japon ». À la borne, un seul article manquant invalide tout le ticket ;
- délai : 90 jours après l'achat.

**RG-14 Douane.** Pour chaque profil douanier du voyage, dans l'ordre de passage :
- la valeur des achats est la somme des prix (tous destinataires, « Moi » compris), moins la taxe japonaise des achats détaxés, convertie dans la devise du profil ;
- les volumes d'alcool se comptent par catégorie du profil, avec la règle du prorata quand elle existe (annexe B) ;
- les produits interdits (viande, lait, végétal) sont listés avec les souvenirs concernés ;
- chaque ligne a un statut : *OK*, *Attention* (au moins 80 % d'une franchise) ou *Dépassé* ;
- chaque profil affiche ses sources et sa date de vérification. Ses valeurs restent modifiables, et la mention « Indicatif, ne remplace pas l'information officielle » est visible.

**RG-15 Bagages.**
- Chaque achat peut être rangé dans un bagage. L'app calcule le poids des souvenirs par bagage et le compare au poids maximal s'il est renseigné.
- Alertes :
  - liquide ou objet tranchant en cabine : à mettre en soute ;
  - alcool à plus de 70 % : interdit en avion ;
  - alcool entre 24 et 70 % : 5 L au total au maximum, en emballage d'origine fermé ;
  - fragile en soute : vérifier la protection.
- Rappel détaxe : les articles détaxés se présentent à la borne avant l'enregistrement des bagages.

**RG-16 Suppression et annulation.** Toute suppression et tout changement d'état proposent « Annuler » pendant 5 s.
- Supprimer une personne la retire de ses attributions ; une attribution devenue vide est supprimée.
- Supprimer un groupe utilisé comme cible convertit ces attributions en listes de ses membres.

**RG-17 Destinataires d'un voyage.** Une personne créée pendant un voyage y est ajoutée. Les listes et compteurs ne portent que sur les destinataires du voyage actif. Un nouveau voyage propose de reprendre ceux du précédent.

**RG-18 IA** (détail au §9) :
- une seule demande à la fois, dans une file d'attente persistante ;
- une recherche ne modifie jamais un lieu saisi à la main ;
- une nouvelle recherche remplace les lieux IA précédents de l'idée, sauf les écartés, conservés pour ne pas être reproposés.

---

## 7. Navigation et écrans

**Barre d'onglets** : Ici · Personnes · Souvenirs · Journal · Retour.

**En-tête** : nom du voyage (sélecteur en phase 3) et accès aux Paramètres.

**Bouton « + »** flottant sur Ici, Personnes, Souvenirs et Journal. Il propose « Idée » ou « Achat ».

### 7.1 Ici (accueil)

- **En-tête** : « Kyoto · nuit 4/6 », ou « Kyoto → Osaka » un jour de transition. Lien « Je suis ailleurs » (RG-07).
- **Quatre compteurs cliquables** : Personnes sans rien · Idées à acheter · Achats à attribuer · Cadeaux à donner.
- **Dernière chance** (RG-10), en premier quand la liste n'est pas vide.
- **Achetable ici** (RG-09) : chaque idée avec ses lieux dans cette ville (nom, zone, fourchette de prix, lien carte).
- **Ensuite** : prochaine étape, date d'arrivée et nombre d'idées qui y sont prévues.
- **Total dépensé** : en yens et en euros, dont « pour moi ».
- **Encart IA**, si une clé est configurée : « 4 idées sans lieu d'achat · Rechercher », et l'état de la file.
- **Encart Retour**, à partir de trois jours avant la fin : détaxe à récupérer, alertes douane et bagages.

### 7.2 Personnes

- **Liste** groupée par groupe en sections repliables, « Moi » en tête. Chaque ligne affiche le nom, l'état (RG-06) et le nombre de souvenirs. L'en-tête de section indique « x/y couverts ».
- **Filtres rapides** : Tous · Rien · Idée · Acheté · À donner. Recherche.
- **Fiche personne** :
  - nom et groupe ;
  - souvenirs (idées, achats, donnés), avec l'action « Donné » ;
  - « + Idée pour {nom} » ;
  - « Suggestions de cadeaux » (IA) et la liste des suggestions à accepter ou écarter ;
  - section repliée « Indices pour l'IA ».
- **Fiche groupe** (depuis l'en-tête de section) : membres, cadeaux collectifs du groupe, « Suggestions pour le groupe ».

### 7.3 Souvenirs

- **Segments** : Idées · Achetés · À attribuer · Donnés · Pour moi.
- **Filtres** : catégorie, étape, sans lieu d'achat, détaxé, avec alerte retour.
- **Recherche** : insensible aux accents, sur le nom, la note, la boutique et les destinataires.
- **Ligne** : miniature de la photo, nom, « ×6 » pour un lot, destinataires (puces), étape, prix.
- **Fiche souvenir**, en sections :
  - *Essentiel* : nom, catégorie, quantité, note ;
  - *Pour qui* : attributions, « k/N attribués » ;
  - *Où l'acheter* : lieux, « + Ajouter un lieu », « Chercher avec l'IA », étapes prévues, « Partout » ;
  - *Achat* (si acheté) : date, étape, boutique, prix, taux, photo, détaxe ;
  - *Retour* : alcool, viande, lait, végétal, liquide, tranchant, fragile, poids, bagage, consommé au Japon ;
  - *Historique* : créé, acheté, donné.

### 7.4 Saisie express (bouton « + »)

- **Idée** :
  - nom, avec focus automatique ;
  - pour qui : « Moi », destinataires récents, groupes, « Personne pour l'instant » ;
  - replié : catégorie, quantité, étapes prévues, note.
- **Achat** :
  - nom, prix (pavé numérique), pour qui, quantité ;
  - prérempli : date du jour, étape Ici, dernière boutique saisie à cette étape ;
  - replié : catégorie, photo, détaxé, retour.
- **Doublon probable** : si le nom tapé ressemble à une idée existante, l'app propose « Acheter l'idée « X » » (F-24).
- **Rattrapage** : la date et l'étape se changent en un tap, pour saisir les achats déjà faits.

### 7.5 Journal

- Fil chronologique groupé par jour (date et étape) : miniature, nom, prix, destinataires, total du jour.
- Sous-totaux par étape, filtre par étape.
- Lecture seule ; un tap ouvre la fiche.

### 7.6 Retour

Quatre sections : Détaxe · Douane · Bagages · Remise.

- **Détaxe** : tickets (boutique, date, total, taxe, éligibilité, statut), total à récupérer, liste de contrôle du départ (F-50).
- **Douane** : un bloc par profil douanier, avec barres de progression (valeur, alcool), interdits détectés et souvenirs concernés, sources.
- **Bagages** : un bloc par bagage (souvenirs, poids total sur poids max, alertes). Une liste « Non rangés » permet l'affectation rapide.
- **Remise** : « À donner », groupé par destinataire ou par groupe ; « Donné » en un tap ; progression « 12/30 remis ».

### 7.7 Paramètres

Voyages · Étapes · Groupes · Catégories · Taux de change · Détaxe · Douane · Bagages · IA · Sauvegarde · À propos (version, espace de stockage utilisé).

---

## 8. Fonctionnalités et critères d'acceptation

Les phases sont détaillées au §14.

### E1 Socle

**F-01 Installer l'app et garder ses données** (phase 1)
*En tant qu'utilisateur, je veux installer l'app sur mon écran d'accueil et retrouver mes données à chaque ouverture.*
- CA1 L'app est une PWA installable (manifeste, icônes, affichage plein écran). Elle s'ouvre hors connexion après la première visite.
- CA2 Les données sont stockées localement (IndexedDB) et l'app demande le stockage persistant (`navigator.storage.persist()`).
- CA3 Ouverte dans Safari sans être installée, l'app affiche un bandeau. Il explique comment l'ajouter (Share → Add to Home Screen) et pourquoi : Safari peut effacer les données des sites peu utilisés.
- CA4 Fermer puis rouvrir l'app, ou redémarrer le téléphone, ne perd aucune donnée.

**F-02 Sauvegarder et restaurer** (phase 1)
- CA1 « Exporter » produit un fichier JSON complet et daté, avec ou sans photos, sans la clé API. Sur iPhone, il passe par la feuille de partage (Save to Files).
- CA2 « Importer » remplace les données après confirmation, et après une sauvegarde automatique de l'état courant. Un fichier invalide ou d'une version inconnue est refusé sans rien modifier.
- CA3 Un rappel discret apparaît si la dernière sauvegarde a plus de 3 jours et que des données ont changé depuis.
- CA4 Le fichier porte `schemaVersion`. Une sauvegarde plus ancienne est migrée à l'import.

**F-03 Données initiales** (phase 1)
- CA1 Au premier lancement, l'app contient :
  - le voyage « Japon 2026 », actif, avec ses 12 étapes et leurs excursions (annexe A) ;
  - les groupes Famille, Amis, Collègues et les catégories (annexe A) ;
  - les profils douaniers (annexe B) ;
  - deux bagages, « Valise » en soute et « Sac à dos » en cabine ;
  - le destinataire « Moi ».
- CA2 Aucune donnée personnelle (destinataire, idée, achat) n'est préremplie.

### E2 Personnes et groupes

**F-10 Gérer les destinataires** (phase 1)
- CA1 Créer une personne avec un nom (obligatoire) et un groupe (facultatif) sur un seul écran. La création à la volée est possible depuis le champ « Pour qui » de la saisie express.
- CA2 Modifier ou supprimer une personne (RG-16). « Moi » n'est ni modifiable ni supprimable.
- CA3 Deux personnes peuvent porter le même nom : l'app avertit sans bloquer.

**F-11 Gérer les groupes** (phase 1)
- CA1 Créer, renommer, réordonner et supprimer un groupe (RG-16).
- CA2 Un groupe peut être choisi comme cible d'un cadeau collectif.

**F-12 Voir qui a quoi** (phase 1)
- CA1 Chaque destinataire affiche son état (RG-06) par un libellé et un pictogramme, jamais par la seule couleur.
- CA2 Les filtres Rien, Idée, Acheté et À donner renvoient exactement les destinataires correspondants.
- CA3 La fiche d'une personne liste tous ses souvenirs, y compris ceux reçus via un cadeau collectif, marqués « collectif ».

### E3 Souvenirs

**F-20 Ajouter une idée** (phase 1)
- CA1 Une idée s'enregistre avec son seul nom.
- CA2 « Pour qui » accepte zéro, une ou plusieurs personnes, un groupe, ou « Moi ».
- CA3 Quand le mode automatique de l'IA est actif (F-43), l'enregistrement place l'idée dans la file de recherche de lieux.

**F-21 Ajouter un achat** (phase 1)
- CA1 Un achat s'enregistre avec un nom et un prix. La date, l'étape et la devise sont préremplies ; le destinataire est facultatif.
- CA2 Le prix en euros s'affiche en direct pendant la saisie en yens (RG-11).
- CA3 La date et l'étape se changent en un tap pour un achat passé. Choisir une étape passée cale la date sur le premier jour de cette étape (modifiable).
- CA4 Si le nom ressemble à une idée existante, l'app propose d'acheter cette idée plutôt que d'en créer une nouvelle.
- CA5 Nom, prix, un destinataire et enregistrement prennent moins de 15 s.

**F-22 Fiche souvenir** (phase 1, section Retour en phase 2)
- CA1 Tous les champs du §5.5 sont visibles et modifiables, regroupés selon le §7.3.
- CA2 La section Retour est aussi disponible sur une idée, pour anticiper (alcool, couteau…).

**F-23 Attribuer** (phase 1)
- CA1 Un souvenir s'attribue à une personne, à plusieurs (collectif), à un groupe entier (collectif) ou à « Moi ».
- CA2 Pour un lot, les unités se répartissent entre plusieurs attributions. « k/N attribués » s'affiche et RG-02 et RG-04 sont respectées.
- CA3 Une attribution se retire ou se modifie à tout moment.
- CA4 Un achat dont des unités ne sont pas attribuées apparaît dans « À attribuer » et dans le compteur de l'écran Ici.

**F-24 Passer une idée en achat** (phase 1)
- CA1 « Marquer acheté » ouvre la saisie d'achat, préremplie avec l'idée : nom, attributions, catégorie, quantité, indicateurs retour.
- CA2 Achat partiel : si l'idée vise plusieurs destinataires, on peut n'acheter que pour certains. L'app crée alors un achat pour eux et laisse l'idée aux autres.
- CA3 Les lieux de l'idée restent consultables sur l'achat. Choisir l'un d'eux comme « Acheté ici » remplit la boutique et l'étape.

**F-25 Listes, filtres et recherche** (phase 1)
- CA1 Chaque segment (§7.3) renvoie exactement les souvenirs correspondants.
- CA2 La recherche ignore les accents et la casse.
- CA3 Les filtres se combinent et se réinitialisent en un tap.

**F-26 Photo** (phase 2)
- CA1 Une photo, toujours facultative, s'ajoute depuis l'appareil photo ou la photothèque. Une seule par souvenir.
- CA2 Elle est compressée (côté long de 1 600 px au plus) et accompagnée d'une miniature. On peut la remplacer ou la supprimer.
- CA3 Aucune saisie n'exige de photo.

**F-27 Taux de change** (phase 1)
- CA1 Les taux JPY→EUR et JPY→CHF se mettent à jour automatiquement, au plus une fois par jour, quand le réseau est disponible. La source est une API gratuite sans clé fondée sur les taux de référence de la BCE (par exemple Frankfurter, disponibilité à vérifier).
- CA2 Un taux manuel peut remplacer le taux automatique.
- CA3 Chaque achat garde le taux de son enregistrement : changer le taux du jour ne modifie pas les achats passés.

### E4 Parcours et écran Ici

**F-30 Étapes et excursions** (phase 1)
- CA1 Créer, modifier et supprimer les étapes et les excursions du voyage actif.
- CA2 Les étapes ne se chevauchent pas et restent dans les dates du voyage ; l'app refuse une saisie incohérente.

**F-31 Écran Ici** (phase 1)
- CA1 Le contenu suit le §7.1.
- CA2 Le 2026-11-02, l'en-tête affiche « Kyoto · nuit 4/6 ». Le 2026-11-05, il affiche « Kyoto → Osaka ».
- CA3 « Je suis ailleurs » permet de choisir Osaka ou Nara : la section « Achetable ici » se met à jour, et le choix expire à minuit.
- CA4 Chaque compteur ouvre la liste filtrée correspondante.

**F-32 Dernière chance** (phase 1)
- CA1 Les trois listes de RG-10 sont calculées et affichées sur l'écran Ici.
- CA2 Chaque idée affiche sa dernière étape possible restante.

**F-33 Lieux d'achat manuels** (phase 1)
- CA1 On ajoute un lieu à une idée avec un nom (obligatoire), une ou des étapes (Ici par défaut), une zone, une fourchette de prix et un conseil. Le lien carte se génère seul.
- CA2 On peut modifier, écarter ou supprimer un lieu.
- CA3 Les étapes des lieux alimentent RG-08.
- CA4 Le lien carte ouvre Google Maps sur la recherche « nom + ville ».

### E5 Assistant IA (phase 2, conception au §9)

**F-40 Configurer l'IA**
- CA1 La clé API Claude se saisit dans les paramètres. Elle est stockée sur l'appareil uniquement, masquée, jamais exportée. Boutons « Tester » et « Supprimer la clé ».
- CA2 Les paramètres règlent :
  - le modèle ;
  - le mode automatique ;
  - les limites (recherches web par demande, demandes par mois) ;
  - l'option « Envoyer les prénoms », désactivée par défaut.
- CA3 Des compteurs mensuels affichent les demandes, les recherches web et les jetons consommés.

**F-41 Trouver où acheter une idée**
- CA1 « Chercher avec l'IA » sur une idée lance une demande. Son état s'affiche : en file, en cours, terminée, échec.
- CA2 À l'issue, 0 à 6 lieux s'ajoutent à l'idée, marqués « IA », avec leur confiance, leurs sources cliquables et leur date. L'interprétation et les alertes s'affichent sur la fiche.
- CA3 Les indicateurs retour proposés par l'IA ne remplissent que les champs vides de la fiche.
- CA4 Les lieux saisis à la main ne sont jamais modifiés (RG-18).
- CA5 Un lieu rattaché à une étape absente des étapes restantes est ignoré.

**F-42 Suggérer des cadeaux**
- CA1 Sur une personne, un groupe ou « Moi », « Suggestions de cadeaux » lance une demande.
- CA2 3 à 6 suggestions s'affichent : nom, raison, prix, lieux, alertes.
- CA3 « Accepter » crée une idée attribuée à la cible (collective pour un groupe), avec ses lieux, sa catégorie, sa quantité conseillée et ses indicateurs retour. « Écarter » masque la suggestion, qui ne sera plus reproposée.
- CA4 Une nouvelle demande tient compte des idées existantes et des suggestions écartées.

**F-43 Automatisation**
- CA1 En mode automatique, chaque nouvelle idée sans lieu entre dans la file de recherche, sans action d'Alexis.
- CA2 Deux actions groupées existent : « Chercher les lieux de toutes les idées sans lieu » et « Suggestions pour tous les destinataires sans rien ». Une confirmation indique le nombre de demandes.
- CA3 La file est persistante. Interrompue (app fermée, réseau coupé), elle reprend à la prochaine ouverture.
- CA4 Une seule demande tourne à la fois. Le plafond mensuel bloque les nouvelles demandes avec un message.
- CA5 Si une idée est renommée après une recherche, ses lieux IA passent « peut-être obsolètes », avec un bouton « Relancer ».

**F-44 Mode sans clé, via l'app Claude**
- CA1 « Copier la demande » copie un texte autonome (§9.9).
- CA2 « Coller la réponse » accepte le texte collé ou lu dans le presse-papiers. L'app en extrait le bloc JSON, le valide et l'importe comme une réponse automatique.
- CA3 Une réponse invalide affiche l'erreur et n'importe rien.

### E6 Retour (phase 2)

**F-50 Détaxe**
- CA1 Marquer un achat « détaxé » le range dans le ticket de sa boutique et de sa date (RG-13).
- CA2 L'écran Détaxe liste les tickets, leur éligibilité, la taxe de chacun et le total à récupérer.
- CA3 Une liste de contrôle du départ s'affiche en évidence la veille et le jour du vol :
  - faire la procédure à la borne, passeport en main, **avant** d'enregistrer les bagages ;
  - avoir sur soi tous les articles de chaque ticket ;
  - prévoir du temps pour une éventuelle inspection.
- CA4 L'alerte « Ticket compromis » suit RG-13.
- CA5 Le statut d'un ticket passe de « à valider » à « validé », puis « remboursé ».

**F-51 Douane**
- CA1 Un bloc par profil douanier suit RG-14 : valeur, alcool, interdits, statuts.
- CA2 Le scénario S7 (§15) donne les résultats attendus.
- CA3 Les valeurs d'un profil sont modifiables, et ses sources s'ouvrent depuis l'écran.

**F-52 Bagages**
- CA1 Chaque achat peut être rangé dans un bagage. Le poids total et les alertes suivent RG-15.
- CA2 La liste « Non rangés » permet l'affectation rapide.

**F-53 Remise** (indispensable dès le 20 novembre)
- CA1 « À donner » regroupe les attributions non données, par destinataire ou par groupe.
- CA2 « Donné » enregistre la date et reste annulable.
- CA3 Après la date de fin du voyage, l'écran Ici affiche la remise.

### E7 Journal (phase 2)

**F-60 Journal d'achats**
- CA1 Le contenu suit le §7.5.
- CA2 Les totaux du jour et par étape sont égaux à la somme des achats concernés.

### E8 Multi-voyages (phase 3)

**F-70 Gérer plusieurs voyages**
- CA1 Créer un voyage (nom, dates, devises, étapes, profils douaniers, bagages) et le rendre actif. Les autres restent consultables.
- CA2 Les personnes et les groupes sont partagés entre voyages, et chaque voyage a sa liste de destinataires (RG-17).
- CA3 Les données saisies en phase 1 s'ouvrent sans migration.

**F-71 Modèles de profils douaniers**
- CA1 Un nouveau voyage puise dans des modèles : « Suisse, arrivée en avion », « France, arrivée en avion depuis un pays hors UE », « France, arrivée par la route ou le train » (annexe B).

---

## 9. Assistant IA : conception détaillée et prompts système

### 9.1 Deux usages, un même moteur

| Usage | Déclencheur | Entrée | Sortie | Outil de sortie |
|---|---|---|---|---|
| A. Où l'acheter | Une idée | Idée + parcours + contraintes | 0 à 6 lieux d'achat | `enregistrer_lieux` |
| B. Idées de cadeaux | Une personne, un groupe ou « Moi » | Cible + parcours + contraintes | 3 à 6 suggestions, chacune avec 1 à 3 lieux | `enregistrer_suggestions` |

Deux modes :

- **Automatique** : l'app appelle l'API Claude avec la clé d'Alexis et l'outil de recherche web. Aucune intervention n'est nécessaire.
- **Manuel** : l'app copie une demande prête à coller dans l'app Claude, puis importe la réponse collée (F-44).

Les deux modes partagent les mêmes prompts, le même contexte et le même schéma de sortie.

### 9.2 Contexte envoyé

L'app construit un objet JSON « contexte ». Exemple pour l'usage A :

```json
{
  "date_du_jour": "2026-11-02",
  "voyage": {
    "nom": "Japon 2026",
    "du": "2026-10-15",
    "au": "2026-11-19",
    "retour": "Vol Tokyo → Genève avec correspondance, puis route ou train vers la France"
  },
  "ici": { "etape_id": "kyoto", "ville": "Kyoto", "lieu_choisi": "Osaka" },
  "etapes_restantes": [
    { "id": "kyoto", "ville": "Kyoto", "zone": "Nishikyōgoku", "du": "2026-10-30", "au": "2026-11-05", "excursions": ["Nara (2/11)"] },
    { "id": "osaka", "ville": "Osaka", "du": "2026-11-05", "au": "2026-11-08", "excursions": ["Kōyasan (6/11)"] },
    { "id": "onomichi", "ville": "Onomichi", "du": "2026-11-08", "au": "2026-11-10", "excursions": ["Himeji (8/11, en route)", "Shimanami Kaidō et Ōmishima (9/11)"] },
    { "id": "hiroshima", "ville": "Hiroshima", "zone": "Heiwa Ōdōri", "du": "2026-11-10", "au": "2026-11-13", "excursions": ["Miyajima (12/11)"] },
    { "id": "nagoya", "ville": "Nagoya", "zone": "Ōharu, hors centre", "du": "2026-11-13", "au": "2026-11-15", "excursions": ["Magome, Tsumago et Naegi (14/11)"] },
    { "id": "tokyo2", "ville": "Tokyo", "zone": "Asakusa", "du": "2026-11-15", "au": "2026-11-19", "excursions": ["Aéroport de départ (19/11)"] }
  ],
  "idee": {
    "nom": "Couteau de cuisine japonais",
    "categorie": "cuisine",
    "note": "Pour quelqu'un qui cuisine beaucoup",
    "quantite": 1,
    "pour": [{ "type": "personne", "groupe": "Famille" }]
  },
  "categories": [
    { "id": "nourriture", "libelle": "Nourriture et douceurs" },
    { "id": "cuisine", "libelle": "Cuisine et vaisselle" }
  ],
  "contraintes_retour": {
    "detaxe": "Achats d'au moins 5 000 ¥ hors taxe par boutique et par jour ; taxe payée en caisse puis remboursée après validation à la borne de l'aéroport, avant l'enregistrement des bagages.",
    "douane": [
      "Suisse (arrivée à Genève) : TVA si la valeur totale dépasse 150 CHF ; alcool jusqu'à 18 % : 5 L, plus de 18 % : 1 L ; viande et produits laitiers de pays hors UE interdits.",
      "France (depuis la Suisse, route ou train) : franchise de 300 € ; vins tranquilles 4 L, bières 16 L, boissons de plus de 22 % : 1 L, de 22 % ou moins : 2 L ; viande et produits laitiers interdits."
    ],
    "bagages": [
      "Liquides de plus de 100 ml et objets tranchants : en soute.",
      "Alcool de plus de 70 % interdit en avion ; de 24 à 70 % : 5 L au maximum par passager, emballage d'origine fermé."
    ]
  }
}
```

Pour l'usage B, le bloc `idee` est remplacé par :

```json
{
  "cible": {
    "type": "groupe",
    "groupe": "Collègues",
    "nb_personnes": 8,
    "collectif": true,
    "indices": "Aiment le thé ; à partager au bureau"
  },
  "deja_prevu": ["Boîte de senbei"],
  "ecartees": ["Kit Kat au matcha"]
}
```

Règles de construction :

- Les contraintes sont générées à partir des profils douaniers, des bagages et des paramètres de détaxe du voyage, jamais écrites en dur.
- `etapes_restantes` reprend RG-08 ; l'étape finale porte l'excursion « Aéroport de départ ».
- **Confidentialité** : par défaut, aucun prénom n'est envoyé. Une personne devient « Destinataire » avec son groupe. L'option « Envoyer les prénoms » ajoute le champ `nom`. Les indices sont envoyés tels quels ; l'aide du champ le précise.
- Les catégories envoyées sont celles de l'app. L'énumération du champ `categorie` du schéma B est générée à partir d'elles.

### 9.3 Prompt système A : où acheter une idée

```text
Tu es l'assistant shopping d'un voyageur français au Japon. Ta mission : trouver où acheter un souvenir précis sur la suite de son parcours.

Tu reçois un objet JSON « contexte » avec : la date du jour, le lieu où se trouve le voyageur, les étapes restantes du voyage (identifiant, ville, quartier du logement, dates, excursions prévues), l'idée de souvenir (nom, catégorie, note, quantité, destinataires) et les contraintes du retour (détaxe, douane, bagages).

Méthode
1. Comprends précisément l'objet. Si le nom est vague, retiens l'interprétation la plus utile et résume-la dans « interpretation ».
2. Cherche sur le web des endroits réels et toujours en activité, dans les villes des étapes restantes et les excursions prévues. Commence par le lieu actuel et les étapes les plus proches dans le temps. Cherche aussi en japonais quand c'est utile (par exemple « 手ぬぐい 専門店 京都 »).
3. Retiens 3 à 6 endroits complémentaires : au moins un près du lieu actuel si possible, une valeur sûre (grand magasin, chaîne présente dans plusieurs étapes) et, si l'objet est une spécialité d'une région du parcours, la meilleure adresse de cette région. Si l'objet ne se trouve que dans une seule étape, indique son identifiant dans « derniere_chance ».
4. Pour chaque endroit, renseigne : le nom exact (tel qu'il apparaît sur Google Maps si possible), le type, les identifiants des étapes concernées (pour une excursion, l'étape de rattachement), le quartier ou l'adresse, la fourchette de prix constatée en yens, les horaires si tu les as trouvés, un conseil court et concret (rayon, étage, produit précis à demander, affluence), ta confiance et les sources consultées.
5. Indique ce qui compte pour le retour dans « retour » (alcool : type, degré, volume ; viande ; produits laitiers ; végétaux ; liquide ; objet tranchant ; fragile ; poids estimé) et, en phrases courtes, dans « alertes ». Par exemple : « Couteau : en soute obligatoirement » ou « Détaxe possible si les achats d'une même boutique atteignent 5 000 ¥ hors taxe le même jour ».

Règles
- N'invente jamais un lieu, une adresse, un prix ou des horaires. Chaque endroit s'appuie sur au moins une source consultée pendant cette recherche. Laisse vide ce que tu n'as pas trouvé.
- Confiance : « haute » si une source récente et directe confirme le lieu et le produit ; « moyenne » si le produit y est probable sans être confirmé ; « basse » si la source est ancienne ou indirecte.
- Reste sur le parcours : aucune adresse hors des villes et excursions listées, sauf l'aéroport de départ.
- Ne propose pas d'autres idées de cadeau. Exception : si l'objet est introuvable sur le parcours, propose au plus deux alternatives proches dans « alternatives ».
- Rédige en français, de façon concise. Les prix sont en yens.
- Termine en appelant une seule fois l'outil « enregistrer_lieux ». N'écris rien en dehors de cet outil.
```

Message utilisateur :

```text
Voici le contexte. Trouve où acheter cette idée sur la suite du parcours.

<contexte JSON>
```

### 9.4 Prompt système B : idées de cadeaux

```text
Tu es un conseiller en souvenirs japonais pour un voyageur français. Ta mission : proposer des idées de cadeaux adaptées à une cible (une personne, un groupe ou le voyageur lui-même) et dire où les acheter sur la suite du parcours.

Tu reçois un objet JSON « contexte » avec : la date du jour, le lieu où se trouve le voyageur, les étapes restantes (identifiant, ville, quartier, dates, excursions prévues), la cible (type, groupe, nombre de personnes, indices facultatifs), les souvenirs déjà prévus ou achetés pour elle, les suggestions déjà écartées, les catégories disponibles et les contraintes du retour (détaxe, douane, bagages).

Méthode
1. Analyse la cible : relation (famille, amis, collègues…), indices, cadeau individuel ou à partager. Pour des collègues, privilégie des douceurs emballées individuellement, en nombre suffisant pour le groupe. Pour le voyageur lui-même, privilégie ce qui rappelle les étapes du parcours.
2. Cherche sur le web des produits et des boutiques réels, en priorité les spécialités des étapes restantes et ce qui est difficile à trouver en France.
3. Propose 5 idées variées : des catégories différentes, au moins une spécialité d'une étape à venir, au moins une idée à petit prix et une plus marquante. N'en propose aucune qui ressemble à un souvenir déjà prévu ou à une suggestion écartée.
4. Pour chaque idée, renseigne : un nom clair, une description en une phrase, la raison pour laquelle elle convient à cette cible, la catégorie (parmi celles fournies), la fourchette de prix en yens, la quantité conseillée pour un groupe, 1 à 3 endroits où l'acheter (mêmes champs et mêmes exigences qu'une recherche de lieux), les indicateurs « retour » et les alertes.

Règles
- N'invente aucun produit, lieu, prix ni horaire. Chaque endroit s'appuie sur une source consultée pendant cette recherche. Laisse vide ce que tu n'as pas trouvé.
- Respecte les contraintes du retour : écarte les produits contenant de la viande ou des produits laitiers ; signale l'alcool (type, degré, volume), les liquides et les objets tranchants.
- Reste sur le parcours : villes et excursions listées, aéroport de départ.
- Rédige en français, de façon concise. Les prix sont en yens.
- Termine en appelant une seule fois l'outil « enregistrer_suggestions ». N'écris rien en dehors de cet outil.
```

Message utilisateur :

```text
Voici le contexte. Propose des idées de cadeaux pour cette cible.

<contexte JSON>
```

### 9.5 Schémas de sortie

Deux sous-schémas sont communs aux deux outils.

Sous-schéma `lieu` :

```json
{
  "type": "object",
  "properties": {
    "nom": { "type": "string", "maxLength": 80 },
    "type": { "type": "string", "enum": ["boutique", "grand_magasin", "marche", "rue_commercante", "temple_sanctuaire", "chaine", "konbini", "aeroport", "autre"] },
    "etapes": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "zone": { "type": "string", "maxLength": 120 },
    "prix_min_yen": { "type": "integer", "minimum": 0 },
    "prix_max_yen": { "type": "integer", "minimum": 0 },
    "horaires": { "type": "string", "maxLength": 80 },
    "conseil": { "type": "string", "maxLength": 280 },
    "confiance": { "type": "string", "enum": ["haute", "moyenne", "basse"] },
    "sources": { "type": "array", "items": { "type": "string" }, "minItems": 1, "maxItems": 3 }
  },
  "required": ["nom", "type", "etapes", "conseil", "confiance", "sources"]
}
```

Sous-schéma `retour` :

```json
{
  "type": "object",
  "properties": {
    "alcool": {
      "type": "object",
      "properties": {
        "type": { "type": "string", "enum": ["vin", "biere", "autre"] },
        "degre": { "type": "number", "minimum": 0, "maximum": 100 },
        "volume_l": { "type": "number", "minimum": 0 }
      },
      "required": ["type", "degre"]
    },
    "viande": { "type": "boolean" },
    "lait": { "type": "boolean" },
    "vegetal": { "type": "boolean" },
    "liquide": { "type": "boolean" },
    "tranchant": { "type": "boolean" },
    "fragile": { "type": "boolean" },
    "poids_g": { "type": "integer", "minimum": 0 }
  }
}
```

Outil `enregistrer_lieux` (usage A) :

```json
{
  "name": "enregistrer_lieux",
  "description": "Enregistre dans l'app les endroits où acheter l'idée. À appeler une seule fois, à la fin de la recherche.",
  "input_schema": {
    "type": "object",
    "properties": {
      "interpretation": { "type": "string", "maxLength": 200 },
      "lieux": { "type": "array", "maxItems": 6, "items": { "$ref": "#/$defs/lieu" } },
      "derniere_chance": { "type": "string" },
      "retour": { "$ref": "#/$defs/retour" },
      "alertes": { "type": "array", "maxItems": 5, "items": { "type": "string", "maxLength": 200 } },
      "alternatives": { "type": "array", "maxItems": 2, "items": { "type": "string", "maxLength": 120 } }
    },
    "required": ["interpretation", "lieux", "alertes"]
  }
}
```

Outil `enregistrer_suggestions` (usage B) :

```json
{
  "name": "enregistrer_suggestions",
  "description": "Enregistre dans l'app les idées de cadeaux pour la cible. À appeler une seule fois, à la fin de la recherche.",
  "input_schema": {
    "type": "object",
    "properties": {
      "analyse": { "type": "string", "maxLength": 300 },
      "suggestions": {
        "type": "array",
        "minItems": 1,
        "maxItems": 6,
        "items": {
          "type": "object",
          "properties": {
            "nom": { "type": "string", "maxLength": 80 },
            "description": { "type": "string", "maxLength": 200 },
            "pourquoi": { "type": "string", "maxLength": 200 },
            "categorie": { "type": "string" },
            "prix_min_yen": { "type": "integer", "minimum": 0 },
            "prix_max_yen": { "type": "integer", "minimum": 0 },
            "quantite_conseillee": { "type": "integer", "minimum": 1 },
            "lieux": { "type": "array", "minItems": 1, "maxItems": 3, "items": { "$ref": "#/$defs/lieu" } },
            "retour": { "$ref": "#/$defs/retour" },
            "alertes": { "type": "array", "maxItems": 4, "items": { "type": "string", "maxLength": 200 } }
          },
          "required": ["nom", "description", "pourquoi", "categorie", "lieux"]
        }
      }
    },
    "required": ["analyse", "suggestions"]
  }
}
```

Notes pour l'implémentation :

- Ajouter les sous-schémas `lieu` et `retour` sous `input_schema.$defs`, ou les recopier en place si `$ref` pose problème.
- Le champ `categorie` reçoit à l'exécution une énumération des identifiants de catégories de l'app.

### 9.6 Appel de l'API (mode automatique)

**Requête** : `POST https://api.anthropic.com/v1/messages`

**En-têtes** :
- `x-api-key` : la clé d'Alexis ;
- `anthropic-version: 2023-06-01` ;
- `content-type: application/json` ;
- `anthropic-dangerous-direct-browser-access: true`, obligatoire pour un appel depuis le navigateur. Avec le SDK TypeScript officiel, l'option équivalente est `dangerouslyAllowBrowser: true`.

**Corps** (exemple pour l'usage A) :

```json
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 6000,
  "system": "<prompt système A>",
  "messages": [
    { "role": "user", "content": "Voici le contexte. Trouve où acheter cette idée sur la suite du parcours.\n\n<contexte JSON>" }
  ],
  "tools": [
    {
      "type": "web_search_20250305",
      "name": "web_search",
      "max_uses": 5,
      "user_location": { "type": "approximate", "city": "Kyoto", "country": "JP", "timezone": "Asia/Tokyo" }
    },
    { "name": "enregistrer_lieux", "description": "<voir §9.5>", "input_schema": {} }
  ],
  "tool_choice": { "type": "auto" }
}
```

**Paramètres** :
- **Modèle** par défaut : `claude-sonnet-5-5`. Choix proposés : `claude-haiku-5-5` (plus économique), `claude-opus-5-5` (plus précis, plus cher).
- **Recherches web** : `max_uses` vaut 5 pour l'usage A et 8 pour l'usage B ; réglable.
- **Position** : `user_location.city` reprend la ville Ici.
- **Version de l'outil** : `web_search_20250305` suffit. Des versions plus récentes existent (filtrage dynamique) ; pour un appel direct, elles exigent `allowed_callers: ["direct"]`. À vérifier dans la documentation avant d'en changer.

**Boucle de traitement** (quatre requêtes au plus par demande) :
1. Envoyer la requête.
2. Si `stop_reason` vaut `pause_turn`, ajouter le contenu de l'assistant tel quel aux messages et renvoyer.
3. Si la réponse contient un bloc `tool_use` nommé `enregistrer_lieux` (ou `enregistrer_suggestions`), lire son `input`, le valider (§9.7) et l'enregistrer. Inutile de renvoyer un `tool_result` : la demande est terminée.
4. Si la réponse se termine sans cet appel, ajouter le contenu de l'assistant puis le message « Appelle maintenant l'outil enregistrer_… avec tes résultats », et renvoyer une seule fois.

**Erreurs** :
- 401 ou 403 : « Clé invalide ».
- 429, 529 ou 5xx : deux nouvelles tentatives au plus, avec attente croissante, puis échec.
- Délai de 120 s par requête.
- Les blocs `web_search_tool_result_error` arrivent dans une réponse HTTP 200 (ex. `max_uses_exceeded`, `too_many_requests`). Ils se journalisent sans faire échouer la demande.

**Usage** : lire `usage.input_tokens`, `usage.output_tokens` et `usage.server_tool_use.web_search_requests` pour alimenter les compteurs (F-40).

**Test de la clé** : un appel léger, par exemple `GET https://api.anthropic.com/v1/models` avec les mêmes en-têtes.

### 9.7 Contrôles à l'import (modes automatique et manuel)

- Validation stricte par le schéma (JSON Schema ou équivalent). Une réponse invalide n'importe rien et affiche l'erreur.
- Un lieu sans étape valide parmi les étapes restantes est ignoré.
- Une source doit être une URL `https`. Un lieu sans source valide est ignoré.
- Doublons : un lieu IA de même nom normalisé et de même étape qu'un lieu existant n'est pas ajouté.
- Les textes sont nettoyés : espaces superflus retirés, longueurs du schéma respectées.
- Les sources s'affichent comme liens vers les pages d'origine.

### 9.8 Coûts et limites

- La recherche web coûte 10 $ pour 1 000 recherches, en plus des jetons. Les résultats de recherche comptent comme jetons d'entrée.
- Une demande de l'usage A coûte donc au plus 5 recherches, plus ses jetons.
- Plafond mensuel par défaut : 100 demandes, modifiable.
- Avant une action groupée, l'app affiche le nombre de demandes et de recherches au maximum.
- La clé API Claude est facturée à l'usage, séparément de l'abonnement Claude. Sans clé, le mode manuel reste disponible.

### 9.9 Mode manuel (copier-coller via l'app Claude)

« Copier la demande » met dans le presse-papiers un texte unique, composé de :
1. le prompt système de l'usage, dont la dernière règle est remplacée par : « Réponds uniquement par un bloc de code JSON conforme au schéma ci-dessous, sans texte autour. » ;
2. le contexte JSON ;
3. le schéma de l'outil de sortie, avec ses sous-schémas.

Alexis colle ce texte dans l'app Claude, recherche web activée, puis copie la réponse. « Coller la réponse » extrait le premier bloc JSON, le valide (§9.7) et l'importe comme une réponse automatique.

### 9.10 Sécurité de la clé

- La clé est stockée uniquement sur l'appareil, dans un espace séparé. Elle n'est jamais exportée, journalisée ni affichée en clair (format « sk-ant-…XXXX »).
- Une politique de sécurité du contenu (CSP) limite les appels réseau à `api.anthropic.com` et à l'API de taux de change. Aucun script tiers n'est chargé.
- Une clé dédiée à cette app est recommandée, avec une limite de dépense si la console Claude le permet.

---

## 10. Exigences non fonctionnelles

| Domaine | Exigence |
|---|---|
| Plateforme | PWA mobile d'abord, ciblant Safari sur un iOS récent. Installable, en plein écran, respectant les zones sûres. Utilisable de 360 à 430 px de large, en portrait. |
| Hors connexion | Tout fonctionne hors connexion, sauf l'IA et la mise à jour des taux. Le service worker met l'app en cache. |
| Persistance | IndexedDB, stockage persistant demandé, bandeau d'installation (F-01), sauvegarde (F-02). |
| Performance | Ouverture en moins d'1 s ; listes fluides jusqu'à 500 souvenirs ; photos compressées. |
| Fiabilité | Aucune écriture partielle : chaque action est atomique. Les migrations de schéma sont testées. |
| Date et heure | Calculs sur la date locale de l'appareil. Horloge injectable pour les tests. |
| Accessibilité | Cibles tactiles d'au moins 44 px ; contrastes AA ; texte agrandissable ; libellés accessibles ; aucune information portée par la seule couleur. |
| Langue et formats | Interface en français. Dates « lun. 2 nov. », montants « 12 800 ¥ », « 84,30 € ». |
| Confidentialité | Aucune télémétrie. Seuls sortent de l'appareil le contexte IA (§9.2) et les demandes de taux. |
| Design | Minimal et utilitaire : police système, palette neutre, une seule couleur d'accent, rouge réservé aux alertes, mode sombre automatique, listes denses, actions principales à portée de pouce, transitions de 200 ms au plus, aucun ornement. |
| Qualité | Tests unitaires des RG, tests de bout en bout du §15, lint, README avec le déploiement et l'installation sur iPhone. |

## 11. Cadre technique

- **Application** : web statique (SPA) installable (PWA). Aucun serveur applicatif. HTTPS.
- **Stockage** : IndexedDB, via une petite bibliothèque si utile (ex. Dexie ou idb). Schéma versionné avec migrations. Photos stockées en Blob.
- **Stack** : libre, à justifier dans `DECISIONS.md`. Privilégier la simplicité et un bundle léger.
- **Hébergement** : au choix de Claude Code, parmi les hébergeurs statiques gratuits avec HTTPS et déploiement depuis le dépôt (Netlify, Cloudflare Pages, GitHub Pages…). L'URL et la procédure se documentent dans le README.
- **Réseau** : seuls `api.anthropic.com` et l'API de taux de change sont appelés. Polices système, aucun CDN.
- **IA** : appel direct depuis le navigateur avec la clé de l'utilisateur, sans proxy (§9.6).
- **Tests** : unitaires pour les RG ; bout en bout pour les scénarios du §15, avec une date simulée.
- **Dépôt** : `README.md` (installation, déploiement, ajout à l'écran d'accueil) et `DECISIONS.md` (choix et arbitrages).

## 12. Hypothèses et points ouverts

| # | Sujet | Décision par défaut | À confirmer |
|---|---|---|---|
| H1 | Nom de l'app | « Omiyage » (お土産, le souvenir qu'on rapporte de voyage), provisoire | Alexis |
| H2 | Langue de l'interface | Français | Alexis |
| H3 | Classement du saké en douane française | Compté dans les boissons de 22 % ou moins (2 L), la catégorie la plus stricte. La page des douanes ne le classe pas. | Infos Douane Service, 0 800 94 40 40 |
| H4 | Passage Genève puis France | Les seuils suisses, puis français, sont affichés. Le cas d'un simple transit par la Suisse n'est pas traité. | OFDF (Suisse) |
| H5 | Indices sur les personnes | Champ facultatif ajouté pour l'IA. Le questionnaire ne retenait que le groupe. | Alexis : garder ou retirer |
| H6 | Taux de la taxe japonaise | 10 % et 8 % par défaut, modifiables. Le montant du ticket fait foi. | — |
| H7 | Aéroport de départ et poids maximal des bagages | À renseigner dans l'app | Alexis |
| H8 | Clé API Claude | Facturée à l'usage, séparément de l'abonnement. Le mode manuel couvre l'absence de clé. | Alexis |

## 13. Hors périmètre (v1)

- Plusieurs utilisateurs, partage, comptes, synchronisation entre appareils.
- Budgets, globaux ou par personne. Seul le total dépensé est suivi.
- Mise à jour de l'app depuis une conversation Claude, en dehors du mode copier-coller de l'IA.
- Export PDF ou CSV. Seule la sauvegarde JSON existe.
- Notifications push et géolocalisation. Le lieu Ici vient des dates.
- Goûts, tailles et occasions de remise sur les fiches personnes. Seuls le groupe et les indices facultatifs pour l'IA y figurent.
- État « repéré » (vu en boutique, pas encore acheté).
- Scan de tickets (OCR), tabac.

## 14. Plan de livraison

| Phase | Cible | Contenu | Fonctionnalités |
|---|---|---|---|
| 1 : MVP | Au plus vite (vers le 4/11) | Socle PWA, stockage, sauvegarde, données initiales ; personnes et groupes ; idées, achats, attributions (individuel, collectif, lot, « Moi ») ; prix et taux ; écran Ici ; lieux d'achat manuels ; dernière chance. Modèle de données complet. | F-01 à F-03, F-10 à F-12, F-20 à F-25, F-27, F-30 à F-33 |
| 2 : Voyage complet | Avant l'arrivée à Tokyo (vers le 12/11) | IA (lieux, suggestions, automatisation, mode manuel) ; photo ; journal ; détaxe, douane, bagages ; remise | F-26, F-40 à F-44, F-50 à F-53, F-60 |
| 3 : Après le voyage | Libre | Multi-voyages, modèles de profils douaniers | F-70, F-71 |

Une phase est terminée quand :
- tous ses critères d'acceptation passent ;
- les tests de ses RG et de ses scénarios sont verts ;
- l'app est déployée et l'URL documentée ;
- le README est à jour.

## 15. Recette : scénarios de bout en bout

Les noms de destinataires sont fictifs.

| # | Scénario | Résultat attendu |
|---|---|---|
| S1 | Première ouverture, date simulée 2026-11-02 | Voyage « Japon 2026 » actif, 12 étapes, en-tête « Kyoto · nuit 4/6 », aucun destinataire hormis « Moi ». |
| S2 | Achat express d'un lot : « Tenugui », quantité 6, 6 600 ¥, à Kyoto, attribué à Léa, Hugo, Inès, Tom (1 chacun) et à « Moi » (1) | « 5/6 attribués » ; l'achat apparaît dans « À attribuer » ; total 6 600 ¥, dont 1 100 ¥ pour moi ; Léa, Hugo, Inès et Tom sont à l'état *Acheté*. |
| S3 | Cadeau collectif : « Boîte de 24 douceurs » attribuée au groupe Collègues (5 membres) | Les 5 collègues sont à l'état *Acheté · collectif* ; « Donné » sur l'attribution les fait tous passer à *Donné*. |
| S4 | Achat partiel : idée « Baguettes laquées » pour Léa et Hugo, achetée pour Léa seule | Un achat pour Léa est créé ; l'idée reste pour Hugo seul. |
| S5 | Dernière chance : idée dont le seul lieu est à Onomichi | Le 2026-11-09, elle figure dans « Dernière chance ici ». Le 2026-11-10, jour de transition, aussi. Le 2026-11-11, elle passe dans « Plus prévue sur le parcours ». |
| S6 | IA, recherche de lieux : idée « Couteau de cuisine » créée en mode automatique | La demande entre seule dans la file. 3 à 6 lieux apparaissent sur les étapes restantes, avec sources. `tranchant` est proposé ; le ranger dans « Sac à dos » (cabine) déclenche l'alerte « à mettre en soute ». |
| S7 | Douane : whisky 0,7 L à 43 % et saké 0,72 L à 15 % | France : 0,7/1 + 0,72/2 = 1,06, statut *Dépassé* (alcool). Suisse : plus de 18 %, 0,7 L sur 1 L, soit 70 %, *OK* ; jusqu'à 18 %, 0,72 L sur 5 L, *OK*. Ajouter une seconde bouteille de whisky de 0,7 L fait passer la Suisse à *Dépassé* (1,4 L sur 1 L). |
| S8 | Détaxe : deux achats détaxés dans la même boutique le même jour, 3 300 ¥ et 2 200 ¥ TTC | Un seul ticket de 5 500 ¥ TTC, soit 5 000 ¥ HT à 10 % : éligible, taxe de 500 ¥. Marquer l'un des deux « donné » avant le 19/11 affiche « Ticket compromis ». |
| S9 | Remise après le voyage, date simulée 2026-11-21 | L'écran Ici affiche la remise. « Donné » met à jour les états ; « Annuler » rétablit l'état précédent. |
| S10 | Sauvegarde puis restauration sur une installation vierge | Données identiques, photos comprises si elles ont été exportées ; la clé API est absente. |
| S11 | IA, suggestions pour le groupe Collègues ; on en accepte une, on en écarte une autre | L'idée acceptée est créée, attribuée au groupe (collectif) avec ses lieux. Une nouvelle demande ne repropose pas la suggestion écartée. |
| S12 | Mode manuel : copier la demande, coller une réponse JSON valide, puis une réponse invalide | La première s'importe comme en mode automatique. La seconde affiche une erreur et ne modifie rien. |

---

## Annexe A. Données initiales

### A.1 Voyage

« Japon 2026 », du 2026-10-15 au 2026-11-19, devises JPY et EUR, détaxe active.
Itinéraire de retour : « Vol Tokyo → Genève avec correspondance, puis route ou train vers la France ».

### A.2 Étapes

Source : le site du voyage (le-japon-des-legendes.netlify.app). Les étapes passées servent à saisir les achats déjà faits.

| # | id | Ville | Région | Zone | Arrivée | Départ | Excursions |
|---|---|---|---|---|---|---|---|
| 1 | tokyo1 | Tokyo | Kantō | Komagome | 2026-10-15 | 2026-10-22 | Nikkō, Kamakura, Yokohama |
| 2 | fujiyoshida | Fujiyoshida | Fuji | | 2026-10-22 | 2026-10-24 | Mitsutōge (23/10) |
| 3 | matsumoto | Matsumoto | Alpes japonaises | | 2026-10-24 | 2026-10-26 | |
| 4 | hirayu | Hirayu Onsen | Alpes japonaises | | 2026-10-26 | 2026-10-27 | Kamikōchi |
| 5 | takayama | Takayama | Alpes japonaises | | 2026-10-27 | 2026-10-29 | Shirakawa-gō ou Ainokura |
| 6 | kanazawa | Kanazawa | Hokuriku | | 2026-10-29 | 2026-10-30 | |
| 7 | kyoto | Kyoto | Kansai | Nishikyōgoku | 2026-10-30 | 2026-11-05 | Nara (2/11) |
| 8 | osaka | Osaka | Kansai | | 2026-11-05 | 2026-11-08 | Kōyasan (6/11) |
| 9 | onomichi | Onomichi | Setouchi | | 2026-11-08 | 2026-11-10 | Himeji (8/11, en route), Shimanami Kaidō et Ōmishima (9/11) |
| 10 | hiroshima | Hiroshima | Setouchi | Heiwa Ōdōri | 2026-11-10 | 2026-11-13 | Miyajima (12/11) |
| 11 | nagoya | Nagoya | Tōkai | Ōharu, hors centre | 2026-11-13 | 2026-11-15 | Magome, Tsumago et Naegi (14/11) |
| 12 | tokyo2 | Tokyo | Kantō | Asakusa | 2026-11-15 | 2026-11-19 | Aéroport de départ (19/11) |

### A.3 Groupes

Famille · Amis · Collègues (modifiables).

### A.4 Catégories

| id | Libellé |
|---|---|
| nourriture | Nourriture et douceurs |
| boisson | Boissons et alcool |
| artisanat | Artisanat |
| cuisine | Cuisine et vaisselle |
| textile | Textile et vêtements |
| papeterie | Papeterie |
| deco | Déco et maison |
| beaute | Beauté et soins |
| pop | Pop culture et jeux |
| autre | Autre |

### A.5 Bagages

- « Valise », en soute.
- « Sac à dos », en cabine.

Poids maximaux à renseigner (H7).

## Annexe B. Règles du retour et sources (vérifiées le 2 novembre 2026)

Ces valeurs initialisent les profils et les contraintes envoyées à l'IA. Elles sont indicatives et modifiables dans l'app.

### B.1 Détaxe japonaise (système de remboursement, depuis le 1er novembre 2026)

- En boutique, on paie le prix taxes comprises. La taxe est remboursée après la confirmation, au départ, que les articles quittent le Japon.
- Achats d'au moins 5 000 ¥ hors taxe par boutique et par jour. Pas d'autre plafond que ce qu'on peut emporter soi-même.
- Au départ, dans les 90 jours suivant l'achat : passer à une borne de détaxe avec son passeport.
  - Résultat vert : la procédure est terminée.
  - Résultat rouge : présenter les articles au contrôle douanier.
- Tous les articles doivent être avec soi à la borne. La procédure est impossible une fois les bagages enregistrés.
- Le contrôle se fait par ticket : un seul article manquant disqualifie tout le ticket.
- Un article consommé au Japon ne doit pas passer par la procédure : il faut le signaler au douanier.
- Le remboursement est versé par la boutique ou son prestataire ; les modalités varient selon la boutique.
- Source : Japan Tourism Agency, https://www.mlit.go.jp/kankocho/tax-free/page01_000001_00028.html

### B.2 Profil 1 : Suisse, arrivée à Genève (avion), devise CHF

- **Valeur** : la TVA est due si la valeur totale des marchandises dépasse 150 CHF, par personne et par jour. Elle porte alors sur la valeur totale.
- **Alcool** (17 ans et plus) :
  - jusqu'à 18 % vol. : 5 L ;
  - plus de 18 % vol. : 1 L.
- **Interdits** : viande et produits laitiers en provenance de pays hors UE, dans les provisions de voyage.
- **Règles de l'app** : catégories par degré, sans prorata.
- Sources :
  - https://www.bazg.admin.ch/fr/informations-generales-sur-les-franchises-et-les-limites-de-valeur
  - https://www.bazg.admin.ch/dam/fr/sd-web/Mv9dMMMmYzCG/Info-Zoll-Wertfreigrenze-Freimengen_f.pdf

### B.3 Profil 2 : France, entrée depuis la Suisse par la route ou le train, devise EUR

- **Valeur** : 300 € par voyageur de 15 ans et plus arrivant par la route ou le train. Au-delà, la déclaration est obligatoire, et droits et TVA portent sur la valeur totale, pas seulement sur l'excédent.
- **Alcool** (17 ans et plus) :
  - vins tranquilles : 4 L ;
  - bières : 16 L ;
  - boissons de plus de 22 % : 1 L ;
  - boissons de 22 % ou moins : 2 L.
- **Prorata** : les deux dernières catégories se combinent (ex. 0,5 L à plus de 22 % et 1 L à 22 % ou moins). L'app calcule `volume(>22 %)/1 + volume(≤22 %)/2 ≤ 1`.
- **Classement dans l'app** :
  - type `vin` : vins tranquilles ;
  - type `biere` : bières ;
  - type `autre` : selon le degré (saké, umeshu, whisky, vin mousseux…), voir H3.
- **Interdits** :
  - viande et produits laitiers venant d'un pays hors UE. Exceptions : lait en poudre pour nourrissons et aliments médicaux, jusqu'à 2 kg sous conditions ;
  - produits de la pêche : 20 kg au plus ;
  - autres produits sans viande ni lait (miel…) : 2 kg au plus ;
  - végétaux : certificat phytosanitaire requis.
- Sources :
  - https://www.douane.gouv.fr/fiche/franchises-douanieres-et-fiscales-en-quantites-et-en-valeurs (mise à jour du 06/08/2026)
  - https://www.douane.gouv.fr/particuliers/vous-voyagez/tabacs-et-boissons-alcooliques
  - https://europa.eu/youreurope/citizens/travel/carry/meat-dairy-animal/index_fr.htm

### B.4 Modèles pour de futurs voyages (F-71)

- « France, arrivée en avion depuis un pays hors UE » : 300 € remplacés par 430 €, le reste à l'identique du profil 2.
- Source : la même page douane.gouv.fr.

### B.5 Bagages

- **Alcool en soute** :
  - de 24 à 70 % : 5 L au plus par passager, en emballage de vente fermé ;
  - plus de 70 % : interdit.
- Cette règle du transport aérien est reprise par exemple par la TSA : https://tsa.gov/travel/security-screening/whatcanibring/items/wine-bottle. À vérifier auprès de la compagnie.
- **Liquides de plus de 100 ml et objets tranchants** : en soute (règle générale de sûreté).

## Annexe C. Exemple de sauvegarde (extrait)

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-11-02T22:00:00+09:00",
  "voyages": [{ "id": "v1", "nom": "Japon 2026", "dateDebut": "2026-10-15", "dateFin": "2026-11-19", "deviseLocale": "JPY", "deviseReference": "EUR", "actif": true }],
  "personnes": [
    { "id": "moi", "nom": "Moi", "systeme": true },
    { "id": "p1", "nom": "Léa", "groupeId": "g2" }
  ],
  "groupes": [{ "id": "g2", "nom": "Amis", "ordre": 2 }],
  "souvenirs": [
    {
      "id": "s1",
      "voyageId": "v1",
      "nom": "Tenugui",
      "statut": "achete",
      "quantite": 6,
      "achat": { "date": "2026-11-02", "etapeId": "kyoto", "boutique": "Kamawanu", "prix": 6600, "devise": "JPY", "tauxEUR": 0.0058, "prixEUR": 38.28 }
    }
  ],
  "attributions": [
    { "id": "a1", "souvenirId": "s1", "cible": { "type": "personnes", "ids": ["p1"] }, "quantite": 1, "remise": "a_donner" },
    { "id": "a2", "souvenirId": "s1", "cible": { "type": "personnes", "ids": ["moi"] }, "quantite": 1 }
  ],
  "parametres": { "ia": { "modele": "claude-sonnet-5-5", "auto": true } }
}
```

Le taux de change de cet extrait est fictif.

## Annexe D. Prompt de démarrage pour Claude Code

```text
Lis SPEC.md en entier. Implémente la phase 1 (§14) : PWA mobile d'abord, stockage local et sauvegarde, données initiales (annexe A), personnes et groupes, souvenirs (idées, achats, attributions individuelles, collectives, lots, « Moi »), prix et taux de change, écran Ici, lieux d'achat manuels, dernière chance. Mets en place le modèle de données complet du §5. Choisis la stack et l'hébergement (§11) et note tes choix dans DECISIONS.md. Écris les tests des règles RG-01 à RG-12, RG-16 et RG-17, ainsi que les scénarios S1 à S5 et S10. Déploie l'app, puis donne-moi l'URL et les étapes pour l'installer sur mon iPhone.
```
