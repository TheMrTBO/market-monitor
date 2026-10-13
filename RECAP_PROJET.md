# Market Monitor — récapitulatif complet du projet

> Document de reprise. À lire en premier dans une nouvelle discussion : il contient l'état exact du projet, les décisions
> prises (et pourquoi), les pièges rencontrés, et le plan des prochains travaux.
> Dernière mise à jour : 13 octobre 2026 (refonte UX de l'onglet principal + mobile, branche `feat/ux-onglet-principal`). Dépôt : https://github.com/TheMrTBO/market-monitor · Site : https://themrtbo.github.io/market-monitor/

---

## 1. En une page

**Quoi.** Un dashboard web statique (un seul fichier HTML + des fichiers de données `.js`) qui suit le *breadth* du marché
américain (nombre d'actions à +4 % / −4 %, +25 % / −25 % sur un mois et un trimestre, T2108…), affiche des graphiques de
prix (QQQ, IWM, BTC) avec moyennes mobiles et fond de tendance, un classement momentum d'ETF sectoriels, le VIX et le
T2108 en bougies japonaises.

**Pour qui.** Alexandre (usage personnel de trading / suivi de marché, éventuellement visuels de carrousels LinkedIn avec
attribution). Pas de service multi-utilisateurs.

**Où ça tourne.** Mise à jour automatique sur GitHub Actions (gratuit), publication sur GitHub Pages. Aucun serveur ; aucune
clé ni secret dans le dépôt (une seule clé, `POLYGON_API_KEY`, vit dans les GitHub Secrets pour le calcul maison du breadth).

**État.** Production personnelle opérationnelle depuis le 13/10/2026 (premier run réussi : update 46 s + deploy 51 s).
Toutes les sources sont publiques et gratuites.

---

## 2. Architecture

```
GitHub Actions (cron 22:17 et 05:43 UTC, ou « Run workflow »)
   ├─ fetch_history.py (clé POLYGON_API_KEY en Secret) → cache/history/ + cache/splits.json   (hors dépôt, cache Actions)
   └─ update_all.py  ── lance 5 scripts, contrôle chaque fichier (validate_data.py), restaure l'ancien si invalide
        ├─ fetch_stockbee.py → stockbee_data.js + stockbee_market_monitor.csv   (Google Sheet public de Stockbee)
        ├─ breadth_own.py    → breadth_data.js                                  (calcul maison +4 %/−4 %, ratios 5/10 j)
        ├─ fetch_vix.py      → vix_data.js                                      (CSV public du CBOE)
        ├─ fetch_prices.py   → prices_data.js                                   (QQQ, IWM : Yahoo ; BTC : Coinbase)
        └─ fetch_sectors.py  → sectors_data.js                                  (55 ETF : Yahoo)
   └─ status_data.js (horodatage + dernière séance par source)
   └─ commit des fichiers de données dans main, puis déploiement de _site/ sur GitHub Pages
```

### Fichiers du dépôt (racine = `agents/market-monitor/`)
| Fichier | Rôle |
|---|---|
| `stockbee_dashboard.html` | **Tout le front** (≈ 1 540 lignes : HTML + CSS + JS, canvas, aucune librairie externe) |
| `index.html` | Redirection vers le dashboard |
| `update_all.py` | Orchestrateur : 3 essais par source, contrôle, restauration, écrit `status_data.js`, code de sortie 1 si échec |
| `validate_data.py` | Contrôles de cohérence (volume minimal, fraîcheur, dates, bornes, OHLC, sauts, trous) ; utilisable seul |
| `fetch_stockbee.py` | Récupère les onglets 2019–2026 du Google Sheet Stockbee (sheet `1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE`, gids dans le script) |
| `fetch_vix.py` | CSV CBOE `VIX_History.csv` (redirige vers `cdn-api.cboe.com`), depuis 2018 |
| `fetch_prices.py` | QQQ/IWM Yahoo (yfinance) ; BTC Coinbase `BTC-USD` en fenêtres de 299 jours ; option `--source polygon` |
| `fetch_sectors.py` | Liste d'ETF (`UNIVERSE`), descriptions (`DESC`), données OHLCV sur 900 jours |
| `fetch_data.py` | **Ancien** calcul du breadth +4 %/−4 % depuis Polygon (grouped daily). Toujours importé par `fetch_prices.py` et `fetch_history.py` (client Polygon, univers, splits) |
| `fetch_history.py` | **Calcul maison, lot 1.** Télécharge les clôtures/volumes bruts (1 appel `grouped daily` par séance), les splits à part et l'univers ; cache `cache/history/` (hors dépôt), reprenable, élagué à 400 séances |
| `breadth_own.py` | **Calcul maison, lot 1.** Formules TC2000 (+4 %/−4 %, volume ≥ 100 000 et croissant, splits) et ratios 5/10 j → `breadth_data.js` (agrégats seuls, lignes déjà publiées conservées) |
| `.github/workflows/update.yml` | Planification, validation, commit, publication ; actions épinglées par SHA ; runner `ubuntu-24.04` |
| `.github/dependabot.yml` | Propose chaque semaine les mises à jour pip et actions |
| `requirements.txt` | `requests==2.33.1`, `yfinance==1.2.1` |
| `tests/` | `run_all.sh`, 12 tests Node (DOM simulé), un test Python d'annulation et un test Python du calcul maison (voir §8) |
| `AUTOMATISATION.md` | Guide de mise en place et d'exploitation du pipeline |
| `RECAP_PROJET.md`, `CLAUDE.md` | Ce document ; consignes de travail auto-chargées par Claude Code |

Fichiers locaux **non versionnés** (dans `.gitignore`) : `.env`, `.venv/`, `.claude/`, `cache/`, `monitor_data.*`, `*.log`.

### Formats de données (variables globales chargées par `<script src>`)
| Fichier | Variable | Contenu |
|---|---|---|
| `stockbee_data.js` | `window.STOCKBEE` | `{columns, rows}` ; colonnes : `date, up4, down4, ratio5, ratio10, up25q, down25q, up25m, down25m, up50m, down50m, up13_34d, down13_34d, universe, t2108, sp500` ; 1 964 séances depuis 2018-12-18 |
| `breadth_data.js` | `window.BREADTH_OWN` | `{columns:[date, up4, down4, ratio5, ratio10], rows, asof, universe}` ; calcul maison, depuis 2026-07 (séries cumulées au fil des jours) |
| `prices_data.js` | `window.PRICES` | `{QQQ, IWM, BTC}` = listes `[date, open, high, low, close, volume]` depuis 2019-01-01 |
| `vix_data.js` | `window.VIX` | `[[date, open, high, low, close], …]` depuis 2018-01-02 |
| `sectors_data.js` | `window.SECTORS` | `{asof, dates, symbols:[{s, n, g, o, d, c, op, h, l, v}]}` ; 55 ETF, 618 séances |
| `status_data.js` | `window.STATUS` | `{updated, sources:{stockbee, breadth, vix, prices, sectors:{ok, attempts, last, error?}}}` |

Le bouton « ↻ Actualiser » recharge la page avec `?v=<horodatage>` ; un petit chargeur inline ajoute ce paramètre aux
fichiers de données (GitHub Pages met les fichiers en cache 10 min).

---

## 3. Sources de données : choisies, rejetées, et pourquoi

| Donnée | Source retenue | Rejetées / raisons |
|---|---|---|
| Breadth (+4 %…, T2108) | **Google Sheet public de Stockbee** (Pradeep Bonde) | TradingView : seulement l'instantané (mais `close[1]`/`volume[1]` existent : voir §10 point 1) ; Polygon : plan gratuit limité à ~2 ans |
| QQQ, IWM | **Yahoo Finance (yfinance)** | Polygon gratuit : 2 ans max ; Stooq : exige maintenant une clé |
| BTC | **Coinbase Exchange `BTC-USD`** (300 bougies/appel, pagination par dates) | Binance : refuse les IP américaines (GitHub) ; Kraken : ne renvoie que ~720 bougies |
| VIX | **CBOE CSV officiel** | Polygon : indices non inclus dans le plan gratuit |
| ETF sectoriels | **Yahoo Finance** (un seul `yf.download` groupé) | — |

Contraintes connues :
- **Yahoo** : pas d'API officielle, erreurs 429 fréquentes depuis des IP de serveurs, usage « personnel » selon yfinance. Le
  premier run GitHub a pourtant réussi du premier coup. À surveiller.
- **Cloisonnement** : `pip` est bloqué dans le sandbox de Claude (erreur de certificat) ; `yfinance` est exécuté avec
  l'interpréteur `../tradingview-bot/venv/bin/python` (yfinance 1.2.1). Dans le terminal de l'utilisateur, `pip install -r
  requirements.txt` suffit.
- Les clôtures QQQ/IWM sont **non ajustées des dividendes** (comme TC2000/Polygon).
- Le BTC Coinbase diffère de Binance de 0,1 % en moyenne (max 2,9 % le 2019-04-26) ; son volume est celui de Coinbase.
- L'historique BTC contient la bougie du jour en cours (partielle).

---

## 4. Le dashboard (fonctionnalités)

Trois onglets (barre en haut ; barre d'onglets en bas sur mobile), thème « graphique » noir : bougies **jaunes** (hausse) /
**rouges** (baisse), grille sombre. Histogrammes et soldes nets : **bleu** = haussiers, **rouge** = baissiers.

**En-tête (refonte UX du 13/10/2026)** : marque, onglets segmentés (Marché · QQQ · IWM · BTC · Secteurs), **pastille de
fraîcheur** = bouton Actualiser (« Séance du … · vérifié à … », ⚠ si source en échec ou données > 30 h ; le clic relit
`status_data.js` sans cache et compare l'horodatage → message « Déjà à jour, prochaine MAJ vers … » ou « Nouvelles données →
Afficher » ; vérification auto au retour sur l'onglet après 15 min et toutes les 30 min), bouton **Réglages** (panneau unique :
MM, fond de tendance, espaces haut/droite, thème clair/sombre/système, opacité des histogrammes, réinitialiser). La plage de
dates (3M · 6M · **YTD** · 1A · 2A · 5A · Tout) et le zoom sont dans la barre du graphique de l'onglet actif (`placeRanges`).
**Bulles d'information** ⓘ (clic/toucher/Entrée, et survol à la souris) : définition, règle de couleur, échelle, lecture du jour.

### Onglet « Marché » (ex-« Détail » : bandeau d'état + QQQ / IWM / BTC + breadth)
- **Bandeau d'état** (`renderKpis`) : case **Indices** QQQ/IWM/BTC (cours, variation, état du filtre de tendance des graphiques :
  forte / haussière / essoufflée / **baissière = MM10 sous MM20** ; clic = change l'instrument du graphique) + 5 cases colorées
  (Haussier / Neutre / Baissier) : solde ±4 % (couleur = somme 5 j : < −200 / ≥ +400), ratio 5 j (< 1 / ≥ 1,5 ; 10 j en
  sous-titre), ratio trimestre ±25 % (< 1 / ≥ 1,5), ratio mois ±25 % (< 1 / ≥ 2), T2108 (survente < 20 %, surachat > 70 %).
  Seuils **calibrés sur la tendance d'IWM 2019-2026** (C > SMA10, C > SMA20, SMA10 > SMA20), changement **immédiat**
  (décision utilisateur). Analyse : exactitude équilibrée 82-91 % sur IWM, seuil 1 stable hors échantillon (2023+).
- Légende du graphique **posée sur le fond noir** (date, OHLC, variation, état de tendance, valeur de chaque MM à la séance
  survolée, sinon la dernière) ; remplace l'infobulle flottante sur le graphique principal. Étiquette du dernier cours sur l'axe.
- Fond de tendance adouci, une zone par série d'états (plus de stries), noms explicites. Axe des dates : un repère par mois.
- **Graphique de prix** (≈ 50 % de la hauteur de fenêtre) : bougies + volume, 6 moyennes mobiles (SMA 5, 10, 20, 50, 100, 200)
  configurables (longueur, SMA/EMA, couleur, masquer) via le menu ▾ de la barre du graphique ; fond de tendance **ChillLax**
  (voir §6) ; sélecteur d'instrument « QQQ Daily ▾ ».
- **Mécaniques de graphique** : zoom molette ancré sur la dernière séance, glisser pour déplacer, double-clic = 6 mois,
  boutons +/−, préréglages 3M / 6M / 1A / 2A / 5A / Tout, **espace à droite** et **espace en haut** réglables par curseurs et
  par poignées ▲ (axe du temps) et ◀ (axe des prix), fenêtre partagée avec les histogrammes.
- **Cartes de breadth** (réorganisables par glisser-déposer de la poignée ⠿ ou Alt+↑/↓, repliables au clic sur le titre,
  résumé d'une ligne quand repliées) :
  - +4 % / −4 % sur la séance : **solde net** en vue principale, histogrammes bruts en divulgation progressive ;
  - +25 % / −25 % sur un mois et sur un trimestre : **histogramme brut** en vue principale, solde net en détail.
  - Histogramme « même plan » : −x % au premier plan, +x % derrière, axe uniquement positif.
- **Tableau** des séances visibles : en-têtes groupés (instrument · séance ±4 % · ratios · mois · trimestre · T2108), intensité
  de couleur relative au 95e centile de l'année, ratios colorés selon les seuils du bandeau ; ligne surlignée au survol.
- Cartes : titres courts, ⓘ, lecture du jour toujours visible ; superposé = −X % au premier plan **translucide** (0,6).
- La molette ne zoome **que** sur les graphiques de prix (sur les histogrammes elle fait défiler la page).

### Onglet « QQQ · IWM · BTC »
Trois graphiques de prix côte à côte (même thème, MM, fond de tendance, espaces) et, dessous, deux boîtes : **T2108** et
**VIX** en bougies japonaises. T2108 : Stockbee ne publie que la clôture → bougie construite (ouverture = clôture de la
veille, pas de mèches). Fenêtre de dates partagée, survol synchronisé.

### Onglet « Secteurs »
Liste à gauche, graphique de l'ETF sélectionné à droite (même moteur que le graphique principal, contexte propre `secCtx`).
- Classement par **avgC7 / avgC65** (moyenne des 7 dernières clôtures ÷ moyenne des 65 dernières), décroissant, sans seuil.
- Colonnes : Rang, Symbole, Nom, Groupe, **Description** (thème), **Écart avg** (= avgC7/avgC65 − 1, en %), **Δ rang 5 j**.
  Colonnes triables (clic) et **déplaçables** (glisser-déposer des en-têtes), ordre mémorisé. ↑↓ au clavier.
- Les ETF avec moins de 65 séances (ex. NCLD) restent listés **sans rang**, toujours en bas.
- 55 ETF : les 31 symboles TC2000 de l'utilisateur (YINN, ETF à levier ×3, **retiré**) + 24 ajouts (SPDR manquants,
  industries, mines, thèmes). Liste et descriptions dans `fetch_sectors.py`.

### Autres
Pied de page de statut dans un bloc repliable « Sources et état des données » (date, ✓/⚠ par source, écart calcul maison /
Stockbee). Thème clair/sombre/système pour le cadre (les graphiques de prix restent noirs).
**Mobile (≤ 640 px)** : barre du haut compacte (instrument + cours, ↻, ⚙), ligne de fraîcheur, indicateurs en défilement
horizontal, graphique pleine largeur, légende réduite, barre d'onglets en bas + « Plus » (réglages, vérifier, sources, lien
« Run workflow »), Réglages en feuille, période 3M et cartes ±25 % repliées par défaut. ≤ 1000 px : pastille réduite.

### Clés `localStorage` (préférences, aucune donnée sensible)
`mm.mas` (MM), `mm.pad` / `mm.top` (espaces), `mm.tab`, `mm.order` (cartes), `mm.raw4|raw25m|raw25` (détails),
`mm.card.c4|c25m|c25q` (repli), `mm.seccols` (colonnes), `mm.secsel` (ETF sélectionné), `mm.theme` (thème),
`mm.hsolid` (histogrammes opaques).

---

## 5. Organisation du code du dashboard (`stockbee_dashboard.html`)

Un seul IIFE JavaScript. Repères :
- **État de graphique** : `ALLT` (dates), `vp = {from, to}` (fenêtre en index, peut dépasser la fin = espace à droite),
  `T` / `offset` (dates visibles), `bars` (Map date → barre), `hover`. `inCtx(secCtx, fn)` échange ces variables pour faire
  tourner le même moteur sur le graphique des secteurs (réentrant). `withTabCtx` / `withCtx(kind, fn)` choisissent le contexte.
- **Dessin** : `setup(cv, chartTheme)` → `{g, W, H, n, pw, ph, bw, th, X}` ; `grid`, `xLabels`, `cursor` ; `drawPrice(cv)`,
  `drawHist`, `drawNet`, `drawMini` / `drawBox` (onglet comparatif), `renderSectors` / `secRedraw`.
- **Interactions** : boucle unique de gestionnaires pointer/wheel pour tous les canvas (`kind` = price | sec | hist…),
  `zoomAt`, `anchorFrac`, `panBars`, `clampViewport`, `presetViewport`, poignées `onHandle` / `onTopHandle`.
- **Données dérivées** : `maSeries` (SMA/EMA, EMA amorcée par SMA), `trendState`, `barsFor(name)` (cache par config MM),
  `secBarsFor`, `secScore` / `secRanks`.
- **Menus** : `openMenu(anchor, key, html, el)`, un menu par carte (`menu`, `menuSec`).

---

## 6. Formules et définitions

- **TC2000 (breadth journalier, ne pas modifier sans accord)**
  - Haussier : `100*(C−C1)/C1 ≥ 4` ET `V ≥ 100000` ET `V > V1`.
  - Baissier : `C/C1 ≤ 96/100` ET `V ≥ 100000` ET `V > V1`. (C1, V1 = veille.)
  - Splits : veille ajustée le jour du split (prix ÷ ratio, volume × ratio).
- **Ratios 5/10 j** = somme des +4 % / somme des −4 % sur 5 / 10 séances.
- **T2108** = % de titres au-dessus de leur moyenne mobile 40 jours (Worden common stock universe, ≈ 6 550 titres).
- **avgC7 / avgC65** : `mean(close[-7:]) / mean(close[-65:])` ; rang décroissant ; Δ rang = rang(t−5) − rang(t).
- **Fond de tendance ChillLax** (indicateur TradingView « Chilllax Moving Averages with Qullamaggie colors », chilllaxtrader,
  MPL 2.0) : MM1 = SMA 10, MM2 = SMA 20 (les 2e et 3e lignes de la barre), « monte » = valeur > valeur d'il y a 5 barres ;
  vert foncé (les deux montent), vert clair (seule MM1 monte), jaune (aucune ne monte), tous avec MM1 > MM2 ; sinon rien.

---

## 7. Automatisation, sécurité, confidentialité

- **Déclencheurs** : `schedule` (22:17 et 05:43 UTC, tous les jours), `workflow_dispatch`, `push` sur main (si le workflow, le
  dashboard ou `index.html` changent). Les commits du robot n'en redéclenchent pas.
- **Garde-fous** : retry ×3 par source, validation avant commit, `git checkout --` des fichiers invalides, job marqué en échec
  si une source échoue (e-mail GitHub) mais site publié avec les dernières données valides.
- **Identité Git publique** : `TheMrTBO <37185398+TheMrTBO@users.noreply.github.com>` (config **locale** du dépôt ; la
  config globale du Mac contient l'e-mail personnel : ne jamais committer sans la config locale).
  Réglages GitHub faits : « Keep my email addresses private » activé ; « Block command line pushes that expose my email » à activer.
- **Audit du contenu public** : aucun secret, nom ou e-mail personnel dans les fichiers (vérifié par recherche ; à refaire à
  chaque ajout de fichier). Ne **jamais** publier le dossier parent `21StudentSearch` (profil, mémoire, candidatures).
- **Droits sur les données** : Yahoo « usage personnel » (conditions de Yahoo non lues) ; contenu Stockbee de Pradeep Bonde
  (attribution dans le pied de page) ; GitHub Pages n'est pas prévu pour un service commercial ; limites : site ≤ 1 Go,
  100 Go/mois, 10 min de déploiement.
- **À faire côté utilisateur** : supprimer l'ancienne clé Polygon (inutilisée, a transité dans une conversation).
- **Dependabot** : 7 branches/PR ouvertes (actions en versions majeures supérieures, `requests 2.34.2`, `yfinance 1.7.0`).
  **Non testées** : ne pas fusionner à l'aveugle (voir backlog).
- **Runner** : `ubuntu-24.04` fixé (ubuntu-latest migre vers Ubuntu 26 le 19/10/2026) ; avertissement Node 20 déprécié sur
  `checkout`, `setup-python`, `configure-pages`, `upload-artifact` (sans effet pour l'instant).

---

## 8. Tests et vérifications

```bash
cd agents/market-monitor
bash tests/run_all.sh       # 11 tests Node (DOM simulé, sans dépendance) + 1 test Python (annulation des données invalides)
python3 validate_data.py    # valide les 4 fichiers de données courants
```
- Les tests Node chargent `stockbee_dashboard.html` et les données réelles dans un faux DOM (canvas simulé) et vérifient
  les positions, comptes de barres, ordres de tri, valeurs d'infobulles (recalculées indépendamment), mémorisations.
  Certaines valeurs attendues dépendent des données du moment : en cas d'échec après une mise à jour, vérifier d'abord si
  c'est l'assertion qui est datée.
- **Limite importante : le rendu n'a jamais été vu à l'écran.** Pendant tout le développement, le navigateur intégré de
  Claude ne pouvait pas inspecter les fichiers locaux. **Le site étant maintenant en https**, un contrôle visuel réel
  (captures, émulation mobile 375×812) est possible : à faire en priorité pour les points 2 et 3.

---

## 9. Pièges et enseignements

- Avant toute modification locale : `git pull --rebase origin main` (le robot commit sur main), sinon « fetch first ».
- `git init` / `git config` dans ce dossier sont bloqués par le sandbox de Claude (protection de `.git/config` et des hooks) :
  ils ont été exécutés hors sandbox sur demande explicite. Le sandbox bloque aussi `pip` et le réseau vers des hôtes non listés.
- Avec les données Stockbee, la ligne du **2026-05-20** semble erronée (S&P +1,4 %, T2108 +14 pts alors que Stockbee affiche
  135 / 162 ; notre calcul Polygon donnait 533 / 92). Les autres jours concordent à ±13 titres.
- Le fichier `sectors_data.js` pèse 1,1 Mo et le dépôt grossit d'environ 1–2 Mo/jour (données versionnées pour conserver les
  dernières valeurs valides) : prévoir une stratégie de purge avant ~1 Go.
- Vert foncé / vert clair / jaune du fond de tendance : lisibilité limitée pour un daltonien, et le jaune se confond avec les
  bougies jaunes sur fond noir.
- yfinance renvoie parfois du bruit de virgule flottante : les prix sont arrondis à 4 décimales à l'écriture.

---

## 10. Travail à venir (priorités fixées par l'utilisateur)

> **État au 13/10/2026 (fin de journée)** : PR n°8 fusionnée, mais le **premier passage en production du calcul maison a échoué**
> (`status_data.js` : « Historique insuffisant : 0 séances en cache ») — journaux Actions à lire (étape `fetch_history.py`,
> Secret, restauration du cache). UX de l'onglet principal + mobile (points 3 et 2) **faite** en 4 lots sur la branche
> `feat/ux-onglet-principal` (commits ec41929, bbe233b, 3c3321e, 495909f), **non poussée** : à publier après accord.
> Maquettes, analyse des seuils et sources UX : conservées hors dépôt (espace de travail de l'utilisateur).
> Reste : (a) corriger le calcul maison en production, (b) suite mobile ci-dessous, (c) lots 2 et 3 du calcul maison.

### Point 1 — Calculer les indicateurs nous-mêmes, sans dépendre de Stockbee
> **Statut : lot 1 fait** (+4 %/−4 %, ratios 5/10 j) ; lots 2 (±25 % mois, T2108) et 3 (±25 % trimestre) à faire — voir « Avancement du point 1 » plus haut.
**Objectif** : produire `up4/down4, ratio5/10, up25q/down25q, up25m/down25m, up50m/down50m, up13_34d/down13_34d, T2108,
univers` à partir de données de marché brutes, avec le même format que `stockbee_data.js`, et garder Stockbee comme
contrôle croisé facultatif.

Ce qui existe déjà :
- `fetch_data.py` calcule **+4 % / −4 %** depuis Polygon (endpoint `grouped daily`, univers via `/v3/reference/tickers`
  type `CS` sur XNYS/XNAS/XASE, actifs + radiés = 11 951 tickers, ajustement des splits, état incrémental dans `cache/`).
  Validé contre Stockbee sur 205 séances : corrélation 0,9998, écart absolu moyen 2,7 (+4 %) / 2,9 (−4 %) titres, ≤ 17 de max.
- TradingView `tradingview_screener` expose `close[1]`, `volume[1]`, `close[2]`, `volume[2]` seulement (pas d'historique profond).

Ce qui manque :
1. Les fenêtres longues : **+25 % / −25 % en un trimestre et un mois, +50 % en un mois, +13 % / −13 % en 34 jours, T2108** :
   exigent l'historique par titre (≈ 65–70 séances de clôtures pour ≈ 6 500 titres).
2. Les **définitions exactes** des fenêtres ⚠ (non documentées dans notre matériel) : hypothèses à calibrer en minimisant
   l'écart avec la série Stockbee sur 2019–2026 : trimestre = 63 ou 65 séances, mois = 21 ou 22, « 34 jours » = 34 séances ;
   rendement = `C/C[n] − 1` ; T2108 = part des titres avec `C > SMA40`. Vérifier aussi si le volume minimum s'applique aux
   fenêtres longues.
3. Un **univers** proche du « Worden common stock universe » (≈ 6 550 titres) : actions ordinaires NYSE/Nasdaq/AMEX, sans ETF,
   ADR, warrants, OTC (notre univers brut en compte 11 951 car il inclut les radiés).

Options de source (à trancher avec l'utilisateur) :
| Option | Atouts | Limites |
|---|---|---|
| **Polygon/Massive plan gratuit** (clé en **GitHub Secret**) | 1 appel `grouped daily` = tout le marché ; déjà codé et validé | ~2 ans d'historique, 5 appels/min (≈ 250 appels pour 1 an), il faut une clé (sûre en Secret même en dépôt public) |
| **Yahoo (yfinance) par lots** + liste de tickers NASDAQ Trader | Sans clé | ≈ 6 500 tickers : forts risques de 429, lent, usage personnel |
| **Autre fournisseur à clé gratuite** (Tiingo, etc.) | À évaluer | Quotas et conditions à vérifier |
Recommandation de départ : Polygon en Secret + historique glissant stocké hors dépôt public (cache Actions) et **seuls les
agrégats** (comptes) committés, pour ne pas redistribuer de données brutes.

Critères d'acceptation : mêmes colonnes que Stockbee ; écart absolu moyen ≤ 3 titres et corrélation ≥ 0,999 sur
2024-2026 pour les colonnes calculables ; historique antérieur conservé tel quel (Stockbee figé) ; aucun secret dans le dépôt ;
exécution < 10 min dans GitHub Actions ; échec d'une source = anciennes données conservées (mécanique existante).

### Point 2 — Affichage mobile, inspiré de TradingView
> **Fait (13/10/2026)** : gabarit ≤ 640 px, barre du haut, barre d'onglets en bas + « Plus », feuilles (Réglages, Plus), cibles
> ≥ 44 px, zones sûres, cartes repliées par défaut, tableau défilant (1re colonne fixe). **Reste** : gestes (pincement,
> appui long = réticule, double-tap), Secteurs en maître/détail, onglet Comparer en mobile, PWA, essai sur un vrai téléphone.

Constat initial : mise en page pensée pour le bureau ; seuls quelques `@media` (grilles) ; événements pointeur sans **pincement** ;
zoom à la molette ; menus déroulants ; en-tête qui se replie sur plusieurs lignes ; tableaux larges.
À faire :
- Gabarit mobile (≤ 600 px) : **graphique plein écran**, barre supérieure compacte (symbole + période), **barre d'onglets en
  bas**, feuilles modales (« bottom sheets ») pour réglages, moyennes mobiles et sélection d'instrument ; cibles tactiles ≥ 44 px ;
  zones sûres (`env(safe-area-inset-*)`).
- Gestes : **pincement** à deux doigts (zoom), glisser (déplacement), **appui long = réticule** avec valeurs, double-tap = reset ;
  désactiver la molette/poignées sur tactile (curseurs d'espaces dans les réglages).
- Secteurs : liste → détail (navigation maître/détail avec retour) au lieu de deux colonnes ; colonnes réduites.
- Cartes de breadth repliées par défaut ; tableau en liste de cartes ou défilement horizontal.
- PWA : `manifest.json`, icônes, ajout à l'écran d'accueil, thème de la barre d'état.
- Contrôle : émulation 375×812 sur le site https (captures), puis vrai téléphone.

### Point 3 — UX plus propre
> **Fait pour l'onglet Marché (13/10/2026)** : en-tête une ligne, réglages unifiés, bulles d'information, Actualiser avec
> retour, thème, vocabulaire (« Marché », « tendance forte / haussière / essoufflée »). Navigation : burger écarté au profit
> d'onglets visibles + « Plus » (NN/g : navigation cachée −20 % de découvrabilité ; Material/Apple : barre d'onglets pour 3-5
> sections). **Reste** : harmoniser les onglets Comparer et Secteurs (curseurs d'espaces encore dans leurs barres), états
> vides/chargement, raccourcis clavier, première visite (indices d'usage).

Constats initiaux : en-tête surchargé (titre, onglets, préréglages, zoom, actualiser, résumé) ; réglages dupliqués à 3 endroits
(curseurs ▲/◀ dans chaque onglet) ; mélange français/anglais (« Daily », « SMA ») ; légendes denses ; peu de découvrabilité
des gestes (poignées, glisser-déposer) ; sémantique des couleurs hétérogène (jaune/rouge bougies vs bleu/rouge breadth) ;
pas d'états de chargement/vide/erreur soignés ; style de cartes/menus à unifier.
Pistes : panneau « Réglages » unique (MM, espaces, thème, colonnes, réinitialiser l'affichage), design tokens
(espacements 4/8 px, échelle typographique, rayons), icônes cohérentes, légendes compactes cliquables, indices d'usage
(info-bulles à la première visite), états vides/chargement, raccourcis clavier, contraste et focus (accessibilité),
option palette daltonien, bascule thème clair/sombre/système, nettoyage du vocabulaire technique.

### Avancement du point 1 (calcul maison) — lots
**Décisions de l'utilisateur (13/10/2026)** : source = Polygon/Massive plan gratuit, clé en GitHub Secret uniquement ; historique brut
dans le cache Actions, seuls les agrégats sont committés ; Stockbee = base historique et contrôle croisé ; on vise la **tendance**
(corrélation ≥ 0,95 en test, biais stable), pas le chiffre exact ; mois = 20 séances.
- **Lot 1 (fait, cette PR)** : +4 %/−4 % et ratios 5/10 j. Validé sur 42 séances (juil.–sept. 2026) : écart abs. moyen 2,6 / 2,7 titres,
  corrélation 0,9998. Stockbee reste affiché ; notre calcul est en pointillé et complète une séance non publiée.
- **Lot 2 (à faire)** : ±25 % mois (piste : filtre « prix de base ≥ 5 $ », corr. 1,00 / 0,96) et T2108 (corr. 0,98, mais biais +1 à +5 pts qui dérive :
  univers Worden ≈ 6 555 titres non reproductible ; échecs documentés : filtres prix/volume, SMA 30/50, décalage 1 j, ADR, correction affine).
- **Lot 3 (à faire)** : ±25 % trimestre (piste : référence min/max sur 60-65 séances ; seulement 12 séances testées ; −25 % trim. = 0,82). Nécessite
  ~12 mois d'historique avec open/high/low pour valider hors échantillon. Abandonnés : +50 % mois et +13 %/34 j (non utilisés par le dashboard).
- Le cache d'historique stocke des clôtures **non ajustées** + un journal des splits (comme `fetch_data.py`) : une mise à jour incrémentale ne
  peut pas mélanger données ajustées et brutes. Pour les fenêtres longues il faudra cumuler les facteurs de split (à implémenter au lot 2).
- Le premier passage du workflow télécharge ~72 séances à 5 appels/min (~15 min) ; ensuite 1 à 2 appels par jour (+ univers chaque semaine).

### Backlog technique
- **À faire en premier (validation du lot 1)** : lancer « Run workflow » après la fusion de la PR n°8 ; premier passage ~15-20 min ;
  vérifier dans le pied de page « Calcul maison <date> ✓ » et l'écart moyen avec Stockbee (~3 titres). Vérifier que le Secret
  s'appelle exactement `POLYGON_API_KEY` et que `actions/cache@5a3ec84…` (v4.2.3) s'exécute (SHA lu via l'API GitHub, jamais exécuté).
- **Lots 2 et 3 (plus tard)** : télécharger ~12 mois avec open/high/low (~65 min à 5 appels/min) ; cumuler les facteurs de split pour les
  fenêtres longues ; calibrer sur 2/3 de la période et tester sur le dernier tiers (critère : corrélation ≥ 0,95, biais stable).
  Fichier d'exploration non versionné : `breadth_long.py`.
- Période de transition : tant que Stockbee publie, il reste prioritaire à l'affichage ; décider plus tard d'une bascule
  (avec marqueur « changement de source » et seuils propres au T2108, dont le biais de +1 à +5 pts dérive).
- Tester puis fusionner (ou fermer) les 7 PR Dependabot ; tester yfinance 1.7.0 avant de lever l'épinglage.
- Activer « Block command line pushes that expose my email » ; supprimer l'ancienne clé Polygon.
- Stratégie de purge/stockage des données (dépôt > 1 Go d'ici ~2 ans) ; éventuel passage à un fichier par symbole.
- Alerte d'absence de signal (heartbeat) en plus du bandeau ⚠ ; badge de statut du workflow.
- Filtre par groupe (Secteur, Industrie, Thème) dans l'onglet Secteurs ; éventuel score composite (avgC7/avgC65 + rendement 3 mois
  + force relative vs SPY) proposé mais **non retenu pour l'instant** (« formule seule, sans seuil »).
- Épingler aussi les dépendances indirectes de yfinance (pandas, numpy) ; test des échecs réseau.

---

## 11. Préférences de travail de l'utilisateur
- Réponses et commentaires **en français**, concis ; récapitulatif structuré après toute modification.
- **Gratuit** avant tout ; **rien de privé** dans un dépôt public (pas de clé, pas d'e-mail personnel) ; accepte le public
  tant que ce n'est pas sensible.
- Demande des propositions + questions quand c'est ambigu ; apprécie les alternatives comparées et les sources citées
  (« d'après les forums spécialisés »).
- Veut voir des **visuels** avant de trancher sur l'interface ; veut que les commandes soient exécutées à sa place quand c'est
  possible, mais valide les actions publiques (publication, création de dépôt).
- Ne pas changer de source de données sans demander ; ne pas modifier les formules TC2000 sans accord.

---

## 12. Commandes utiles
```bash
cd agents/market-monitor
git pull --rebase origin main            # toujours avant de travailler
python3 update_all.py                    # met à jour les 4 sources (avec yfinance dispo) et écrit status_data.js
python3 validate_data.py                 # contrôle des fichiers de données
bash tests/run_all.sh                    # tous les tests
gh workflow run update.yml && gh run watch   # forcer une mise à jour sur GitHub
git add -A && git commit -m "…" && git push  # publier (redéploie si le dashboard/workflow change)
```
