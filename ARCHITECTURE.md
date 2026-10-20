# Architecture du Market Monitor

> **À lire en premier** (humain ou LLM) pour se repérer et reprendre le contexte. Document court et à jour : toute
> modification de structure (fichier, flux, config, workflow, stockage) le met à jour **dans la même PR**.
> Ordre de lecture : ce fichier → `CLAUDE.md` (règles de travail) → `config/` (paramètres) → `RECAP_PROJET.md` (historique
> détaillé des décisions, pièges) → `AUTOMATISATION.md` (exploitation GitHub, cron-job.org).

## 1. En une phrase
Tableau de bord statique (GitHub Pages, https://themrtbo.github.io/market-monitor/) du marché US : breadth (Stockbee + calcul
maison), QQQ / IWM / BTC, T2108, VIX, classement TI65 de 55 ETF sectoriels et des secteurs → industries → actions TradingView,
scan post-market TradingView, onglet Tickers (une liste → secteur, industrie, tendance, short interest, thèmes chauds). Les données sont
récupérées par des workflows GitHub Actions déclenchés par **cron-job.org**, contrôlées, commitées, puis publiées.

## 2. Carte des fichiers
| Fichier / dossier | Rôle |
|---|---|
| `config/*.toml` | **Source unique des paramètres** (voir §4). Jamais de paramètre métier en dur ailleurs. |
| `mmconfig.py` | Lit et valide `config/` ; génère `config_data.js` pour le front (`--js`) ; contrôle la cohérence (`--check`). |
| `config_data.js` | **Généré** (`python mmconfig.py --js`) : `window.MM_CONFIG`. Ne pas éditer. |
| `update_all.py` | Orchestrateur : lance les étapes de `config/sources.toml`, contrôle chaque fichier, restaure l'ancien si invalide, écrit `status_data.js`. |
| `fetch_stockbee.py` · `breadth_own.py` · `fetch_vix.py` · `fetch_prices.py` · `fetch_sectors.py` · `fetch_postmarket.py` | Une source chacun → un fichier `*_data.js`. |
| `fetch_industries.py` | Vue TradingView de l'onglet Secteurs : classification du scanner TradingView + cours Polygon du cache → `industries_data.js` (indices équipondérés des secteurs et industries, affichés en courbe de tendance ; % de titres au TI65 > 1 ; même % pour toutes les actions retenues, série `stocks`) et `industries/<industrie>.js` (actions retenues, OHLC, chargé à l'ouverture d'une industrie) et `tickers_data.js` (toutes les actions US, retenues ou non : secteur, industrie, cap, flottant, TI65, rang dans l'industrie ; onglet Tickers ; sert aussi de composition publiée et de secours si TradingView ne répond pas). |
| `fetch_short.py` | Short interest de l'onglet Tickers (flottant, actions à découvert, % du flottant, days to cover ; Yahoo via yfinance) → `short_data.js`, par lots (`config/short.toml`), lancé seul par `short.yml` l'après-midi. |
| `build_site.py` | Prépare `_site` (GitHub Pages) depuis la liste unique `config/storage.toml [site]` ; appelé par les trois workflows. |
| `fetch_history.py` · `fetch_data.py` | Historique Polygon (cache Actions, hors dépôt) : par titre `[clôture, volume, ouverture, plus haut, plus bas]` (OHLC ajouté le 18/10/2026 ; les lecteurs n'utilisent que `row[0]`, `row[1]` s'ils n'ont pas besoin de l'OHLC) ; client Polygon. |
| `mm/store/` | **Stockage historique** (phase 3) : interface `Store` (upsert idempotent, read, latest), backend `git_csv`, conversion des `*_data.js` (`importers.py`), synchronisation vers la branche `data` (`sync.py`), CLI `python -m mm.store import|sync|check|stats`. |
| `data-store/` | Branche orpheline **`data`** extraite localement (`git worktree`, ignorée sur `main`) : CSV de l'historique. |
| `validate_data.py` | Contrôles de cohérence par source (fraîcheur lue dans `config/sources.toml`, bornes de valeurs dans le code). |
| `*_data.js`, `status_data.js`, `industries/` | Données publiées (variables globales `window.X` ; `industries/*.js` : `window.TV_STOCKS[<fichier>]`), commitées par le robot sur `main`. |
| `stockbee_dashboard.html` | **Tout le front** (HTML + CSS + JS, canvas, aucune librairie) ; ~3 100 lignes, découpage prévu (phase 4). |
| `.github/workflows/update.yml` | Mise à jour complète + publication. |
| `.github/workflows/postmarket.yml` | Scan post-market seul + publication si changement. |
| `.github/workflows/short.yml` | Short interest seul (12:17 UTC, lun-sam) + publication si changement. |
| `.github/workflows/ci.yml` | Tests sur chaque pull request. |
| `tests/` | `run_all.sh` (tout) : config, syntaxe YAML des workflows, 18 tests Node (dashboard en DOM simulé), 7 tests Python (dont `test_industries.py`, `test_short.py`, `test_store.py`, `test_store_sync.py`). |
| `breadth_long.py` | Exploration non versionnée (ignorée). |

## 3. Flux
```
cron-job.org (heure exacte, UTC)  ─┐            créneaux `schedule` GitHub (secours, souvent en retard)
                                   ▼                         │
  workflow_dispatch → update.yml : fetch_history.py → update_all.py (étapes de config/sources.toml) ─┐
                    → postmarket.yml : fetch_postmarket.py ──────────────────────────────────────────┤
                                                                                                      ▼
            validate_data.py (contrôle) → commit des *_data.js sur main (rebase, 3 essais) → déploiement Pages
            python -m mm.store sync → branche `data` (historique, journal `runs`) ; échec signalé, n'empêche pas la publication
                                                                                                      ▼
  navigateur : stockbee_dashboard.html charge config_data.js + *_data.js (?v=horodatage pour casser le cache) ;
               industries/<industrie>.js à l'ouverture d'une industrie (onglet Secteurs, vue TradingView)
```
Restauration d'une étape en échec : `restore` de `config/sources.toml` accepte un dossier (entrée finissant par `/`, ex. `industries/`).
Concurrence : les deux workflows partagent le groupe `market-monitor` (jamais deux écritures simultanées).

## 4. Configuration (`config/`)
| Fichier | Contenu | Lu par |
|---|---|---|
| `market.toml` | fuseau, heures de clôture / fin du post-market / début du pre-market | robot, front |
| `schedule.toml` | expressions cron (cron-job.org) et créneaux GitHub de secours, par workflow | front (prochaine mise à jour), `--check` (compare aux workflows) |
| `sources.toml` | étapes du robot : script, fichier, essais, attentes, libellés, **fraîcheur** ; `[history]` : profondeur de l'historique Polygon (séances, gardées, appels/min) | `update_all.py`, `validate_data.py`, `fetch_history.py`, front |
| `postmarket.toml` | filtres du scan (prix, volume, variation), limites, séances gardées, lien de la fiche (`[[links]]` : Finviz ; `{sym}`, `{symd}`, `{tv}`) | `fetch_postmarket.py`, front |
| `sectors.toml` | univers des ETF : symbole, nom, groupe, origine, libellé court, description | `fetch_sectors.py`, front |
| `industries.toml` | vue TradingView : requête du scanner (marché, type, bourses, limite de lignes), filtres des actions retenues (sous-type, prix, volume moyen, capitalisation), indice (base, plafond des variations, titres minimum / « peu de titres »), séances par action, dossier, unité des volumes | `fetch_industries.py`, `validate_data.py`, front |
| `display.toml` | `[tickers]` : règle des thèmes chauds / émergents, limite de la liste ; seuils du breadth, T2108, repères VIX, couleurs, filtres de l'onglet Secteurs et leur bulle (`group_tips`), cases de la vue TradingView (`[sectors.kpis]`), bascule ETF / TradingView, indicateur `[ti65]` (nom, fenêtres 7 / 65, miniature `spark` = 63 séances ≈ 3 mois, fenêtre du Δ `delta`, repère `breadth_ref` de la carte « % > 1 » ; `--check` vérifie `spark + long − 1` ≤ `stock_sessions` ≤ `sources.history.sessions`), traductions | front, `fetch_industries.py` (`ti65`) |
| `datasets.toml` | **modèle logique** : jeux de données (= futures tables SQL), clé primaire, colonnes typées, partition | `mm/store/` |
| `storage.toml` | `serving` (ce que lit le site : `js_files`), `[store]` (historique : backend `git_csv`, dossier, branche), `[site]` (fichiers publiés : liste unique) | `mm/store/`, `build_site.py` |
| `short.toml` | short interest : taille du lot, pauses, arrêt sur erreurs, ancienneté, correspondance des champs Yahoo | `fetch_short.py`, front |
Après toute modification : `python mmconfig.py --js --check` puis `bash tests/run_all.sh`.
⚠️ `schedule.toml` → `cron_job_org` doit être **recopié à la main** dans cron-job.org (aucune API utilisée) ;
`github_fallback` doit correspondre aux workflows (`--check` échoue sinon).

## 4 bis. Stockage historique (phase 3)
- **Où** : branche orpheline `data` du même dépôt (aucun service ni secret en plus ; `GITHUB_TOKEN` suffit pour y écrire).
  Localement : `git fetch origin data && git worktree add data-store data` (dossier ignoré sur `main`).
- **Format** : `<jeu>/<AAAA>/<AAAA-MM>.csv` (ou `-JJ` pour les jeux journaliers), en-tête = colonnes du modèle, lignes
  triées par clé primaire ; `_schema/<jeu>.json` et `README.md` générés. Lisible par Excel, Python, DuckDB.
- **Règles** : chaque lot est contrôlé avant écriture (colonnes, types, obligatoires) ; upsert par clé primaire (relancer
  = aucun doublon, fichier inchangé = pas de commit) ; **aucune suppression**.
- **Post-market** : `postmarket_scan` garde **chaque relevé** (`taken_at`) ; la liste finale d'une séance = son dernier
  relevé (jamais l'union : un titre repassé sous le seuil n'en fait pas partie) ; `postmarket_next` = lendemain.
- **Écriture** : `python -m mm.store sync` (workflows) repart toujours de `origin/data`, importe, relit tout, committe, pousse ;
  push refusé → recommence (sans doublon). Mise à jour complète : `--run-id` ajoute le journal `runs` ; scan : `--only postmarket_data.js`.
- **Migrer vers une base** (plus tard) : écrire `mm/store/<backend>.py` (même interface `Store`), changer
  `storage.toml` → `[store] backend`, copier (`read` → `upsert`), double écriture, bascule. Le modèle ne change pas.

## 5. Invariants (ne jamais casser)
1. **Dépôt public** : aucun secret, clé, e-mail personnel, chemin local, donnée du dossier parent. Clés en GitHub Secrets
   (`POLYGON_API_KEY`) ; jeton cron-job.org limité à Actions sur ce seul dépôt.
2. **Pas de perte de données** : un fichier invalide ou plus ancien que la version publiée n'est jamais commité (restauration) ;
   un scan vide n'efface pas la liste précédente ; pas de bougie du jour avant la clôture.
3. **Aucun paramètre métier en dur** : tout nouveau paramètre va dans `config/` (+ `mmconfig.front_config()` si le front en a besoin).
4. **Tests verts avant fusion** (CI sur chaque PR ; `bash tests/run_all.sh` en local).
5. Vocabulaire neutre (pas de « haussier / baissier »), français, axe des valeurs à gauche, valider visuellement (bureau + mobile).
6. Le robot écrit sur `main` : toujours `git pull --rebase origin main` avant de travailler ; branche + PR, l'utilisateur pousse.

## 6. Recettes
- **Ajouter un ETF** : un bloc `[[etf]]` dans `config/sectors.toml` → `python mmconfig.py --js`.
- **Régler la vue TradingView** (seuils des actions retenues, titres minimum) : `config/industries.toml` → `--js --check` → tests ;
  en local : `../tradingview-bot/venv/bin/python fetch_industries.py` (il faut le cache Polygon de `fetch_history.py`).
- **Changer un seuil, un filtre, une heure** : le fichier de `config/` concerné → `--js --check` → tests.
- **Changer un horaire** : `config/schedule.toml` + workflow (`github_fallback`) + cron-job.org (à la main) + `AUTOMATISATION.md`.
- **Ajouter une source** (ex. Benzinga) : script `fetch_x.py` → fichier `x_data.js` ; étape `[[step]]` dans `config/sources.toml`
  (avec `freshness` ; `separate = "<workflow>"` si elle a son propre passage) ; contrôle `check_x` dans `validate_data.py` ;
  chargement dans le front ; fichier dans `config/storage.toml [site]` (`--check` le vérifie), à la place de la copie dans `_site` des deux
  workflows ; test. Clé éventuelle : GitHub Secret, jamais dans le dépôt. (Phase 2 : un module + une entrée de config.)

## 7. Refonte en cours (décision utilisateur 14/10/2026 : « arranger avant d'itérer »)
| Phase | Contenu | Statut |
|---|---|---|
| 0 | CI des tests sur chaque PR | ✅ (PR « CI ») |
| 1 | Configuration centralisée `config/` + `mmconfig.py` + `config_data.js` | ✅ (PR « config centralisée ») |
| 3a | Stockage : `mm/store/` (interface + backend `git_csv`), branche `data`, reprise de l'historique (43 446 lignes, 2018 →) | ✅ (PR « stockage 3a ») |
| 3b | Les workflows synchronisent leurs `*_data.js` vers la branche `data` après chaque passage (double écriture) ; journal `runs` (statut, durée, dernière séance par source) | ✅ (PR « stockage 3b ») — période d'observation d'une semaine avant 3c |
| 3c | `build.py` génère les fichiers du site depuis le stockage ; plus de `*_data.js` commités sur `main` ; « Stats du » sans limite de 20 séances | à faire |
| 2 | Paquet Python `mm/` (une interface commune par source, `python -m mm run`) | à faire |
| 4 | Front découpé en modules ES natifs (un par onglet + moteur de graphique) | à faire |
| 5 | Alertes (source muette, pas de liste post-market un jour de semaine), journal des passages | à faire |
Gel des nouvelles fonctions (Benzinga, pre-market) jusqu'à la phase 3. Exceptions accordées le 18/10/2026 : vue TradingView de
l'onglet Secteurs (secteurs → industries → actions, TI65) et onglet Tickers (short interest Yahoo par lots, accord de l'utilisateur) ;
le 20/10/2026 : cases en tête de la vue TradingView de Secteurs (puis, dans une PR suivante, du Post-market). Détail : proposition privée de l'utilisateur
(hors dépôt) ; résumé ici.

## 8. Paramètres encore en dur (connus, à migrer)
- Bornes de valeurs des contrôles (`validate_data.py` : ex. 0-5 000 titres, VIX 5-150) → déclarées par source en phase 2.
- Liste des fichiers chargés au démarrage par le front (chargeur en tête de `stockbee_dashboard.html`) → phase 3c (`_site` : déjà centralisé, `config/storage.toml [site]`).
- Constantes d'interface du graphique (marges, préréglages 3M…5A, longueur de pente) dans le front → phase 4.
- Colonnes de la vue TradingView par niveau (`TV_LEVEL`), choix de « Classer par » par niveau (`SORT_OPTS`), largeurs des colonnes (`#secTable`), taille de la miniature (60 × 18)
  → phase 4. `display.toml [postmarket.sector_fr]` sert aussi à l'onglet Secteurs (nom historique, à renommer en phase 4).
- Constantes d'interface des onglets Secteurs / Post-market : seuil « liste et détail empilés » (`isStacked`, ≤ 1000 px),
  seuils du balayage entre titres (60 px, horizontal ≥ 2 × vertical, < 700 ms) → phase 4.
- `fetch_data.py` (univers Polygon, âge max du cache), `breadth_own.py` (formules TC2000 : ne pas modifier sans accord).

## 9. Pièges principaux (détail : `RECAP_PROJET.md` §9)
- Planification GitHub non fiable (créneaux sautés, jusqu'à 3-5 h de retard) → cron-job.org.
- Yahoo renvoie le soir la bougie du jour sans clôture → étape « en retard », version précédente gardée (pas un échec).
- TradingView vide les champs post-market pendant la séance régulière ; données différées de 15 min.
- `?v=` doit être numérique pour que le chargeur casse le cache des fichiers de données (cache Pages 10 min).
- Ne pas utiliser « Re-run » d'une ancienne exécution (rejoue l'ancien workflow) : « Run workflow ».
- Vue TradingView : navigation Secteurs → Industries (toutes, rang global ; pastilles de secteur et « TI65 > 1 » = filtres
  qui masquent des lignes sans changer les rangs) → actions d'une industrie. Graphiques : bougies pour les ETF et les actions
  (vrais cours) ; courbe de tendance pour un secteur / une industrie (un indice équipondéré n'a pas de vrai plus haut / plus
  bas), avec sous le score la carte « % des actions au TI65 > 1 » dans le temps (décision du 18/10/2026). Le passage du
  cache à l'OHLC et l'allongement à 190 séances retéléchargent chaque séance une fois : 2 passages de `update.yml` (~20 + ~18 min),
  les plus récentes d'abord ; d'ici là, les séances anciennes restent en courbe.
- **Calendrier du matin** (mesuré du 13 au 17/10/2026) : Polygon (plan gratuit) publie la séance D entre 03:17 et 05:17 UTC
  à D+1 ; le passage de 05:17 UTC la prend (site à jour vers 05:30 UTC), 06:17 et 07:17 UTC rattrapent. Échéance : début
  du pre-market US = 04:00 à New York = **08:00 UTC** (heure d'été US) ou 09:00 UTC (hiver US), soit 10:00 à Paris, mais 09:00
  à Paris entre le changement d'heure européen et l'américain (fin octobre → 1er dimanche de novembre ; 2e → dernier dimanche
  de mars). Les créneaux cron-job.org sont en **UTC** (vérifié sur les heures des commits) : ils ne bougent pas aux
  changements d'heure. Le soir, la vue TradingView montre la veille (alerte « séance … pas encore publiée » dans l'onglet).
- **Cases de la vue TradingView** (Secteurs, décision du 20/10/2026) : industries, secteurs et actions au TI65 > 1, rotation
  = industries qui **franchissent 1** en `rotation_window` séances (solde en grand, « +entrées / −sorties » dessous, comme le ±4 % ;
  pas les rangs : un classement est à somme nulle, ▲ et ▼ s'y équilibrent toujours) (`config/display.toml [sectors.kpis]` :
  ordre, fenêtre de la rotation, fenêtre des records). **Ratio rotation 5 j** (`rr`) : entrées ÷ sorties de chaque séance,
  cumulées sur `rotation_ratio_sessions` = [5, 10] séances (5 j en grand, « 10 jours : … » dessous, comme « Ratio 5 j » du MM), couleurs `rotation_ratio` (rouge < 1, bleu ≥ 1,5) comme le ratio 5 / 10 j des
  ±4 % ; toucher = industries entrées dans la fenêtre et toujours au-dessus de 1 ; bulle : repère IWM recalculé à chaque chargement. Séance = celle survolée sur un graphique de
  l'onglet, sinon « Stats du » ; séries précalculées une fois par fichier. Toucher une case = raccourci (filtre TI65 > 1,
  industries entrées au-dessus de 1, tri % > 1), second toucher = retour au classement. **Flux par secteur** (toucher la case
  Rotation) : entrées / sorties regroupées par secteur, résumé « ↑ 3 premiers · ↓ 3 premiers », puis blocs « L'argent arrive » /
  « L'argent repart » / « se compensent » ; toucher un secteur ouvre ses industries. La case Rotation affiche ↑ / ↓ à la place de la jauge. « Actions TI65 > 1 » = série `stocks` de `industries_data.js`, calculée par
  `fetch_industries.py` (le navigateur ne charge pas les fichiers des 127 industries) ; absente d'un ancien fichier : case masquée.
  Mise en page des cases comme le MM : une ligne sur bureau, 3 colonnes sous 1 100 px, 2 sous 640 px (pas de défilement
  horizontal, demande du 20/10/2026) ; sous-titres courts (« +14 / −6 »), le détail est dans la bulle ⓘ.
- Vue TradingView sur mobile (≤ 640 px) : les colonnes Δ 5 j et « % > 1 » sont masquées ; la rangée **« Classer par »**
  (TI65 · Δ 5 j · % > 1, Cap. au niveau des actions) trie à leur place, même état que les en-têtes, et la ligne sous l'écart
  montre la valeur du tri actif. Tri mémorisé par niveau (`mm.tvsort.<sec|ind|stk>`). Trier par Écart ou 3 mois = même ordre
  que le rang (Écart = TI65 − 1), d'où l'absence de ces choix (décision du 20/10/2026).
- Vue TradingView : composition (titres retenus) figée par séance : les passages suivants de la même séance la reprennent
  des fichiers publiés sans réinterroger TradingView (`--rescan` pour forcer). Fichiers d'industrie chargés avec `?v=<séance>`.
- Vue TradingView : **secours** si TradingView ne répond pas (muet, vide, liste tronquée) : la dernière composition publiée
  (`tickers_data.js`) est reprise avec les clôtures du jour (`comp.fallback`, signalé dans l'onglet Tickers) ; le passage suivant
  réessaie. Sans composition publiée : arrêt, fichiers non modifiés.
- **Fiche standard** d'un ticker (`stdFiche`, même contenu partout : Tickers, Post-market, niveau actions de Secteurs) :
  clôture, TI65 de l'action et rang dans l'industrie, industrie (rang, écart, % > 1, chaud / émergent), secteur (rang),
  capitalisation, flottant, short interest, liens (Finviz, Secteurs, Tickers) ; chaque onglet ajoute ses infos (post-market : cours
  et volume AH, résultats, lendemain). Le scan post-market s'envoie dans Tickers (bouton « Tickers ») ; ses tickers passent
  en tête du lot Yahoo du lendemain (`config/short.toml postmarket_first`).
- Onglet Tickers : liste + fiche côte à côte (bureau) ou liste / fiche (mobile, ‹ › et balayage, comme le post-market) ;
  fiche = bougies (fichier `industries/<industrie>.js`, chargé à la demande), TI65 dans le temps, cap, flottant, short ;
  action « hors filtres » : graphique depuis `industries/<industrie>--hors.js` (`publish_all`, chargé seulement pour sa fiche) ;
  seules les actions sans historique de cours Polygon (≈ 130 : introductions récentes, ADR) n'ont pas de graphique.
- Onglet Tickers : short interest Yahoo (`fetch_short.py`) publié deux fois par mois par les marchés ; rafraîchi par lots de 800
  (cycle complet de ~5 200 actions en ~7 passages). Yahoo n'a pas d'API officielle : en cas de blocage, les valeurs déjà
  publiées restent (date du relevé affichée). Créneau cron-job.org `17 12 * * 1-6` à créer à la main (sinon : secours GitHub).
- Vue TradingView : historique limité au cache Polygon (`config/sources.toml [history] sessions`, 190 ≈ 6 mois de TI65 ; au plus `max_downloads` = 100 séances téléchargées par passage, ≈ 20 min) ; composition des
  secteurs / industries = celle du jour, appliquée à tout l'historique ; TradingView ne fournit aucun historique d'industrie
  (indices recalculés ici, ils ne reproduisent pas la variation affichée par TradingView, pondérée par capitalisation).
  Pas encore copiée dans le stockage historique (branche `data`).
