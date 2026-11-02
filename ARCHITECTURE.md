# Architecture du Market Monitor

> **À lire en premier** (humain ou LLM) pour se repérer et reprendre le contexte. Document court et à jour : toute
> modification de structure (fichier, flux, config, workflow, stockage) le met à jour **dans la même PR**.
> Ordre de lecture : ce fichier → `CLAUDE.md` (règles de travail) → `config/` (paramètres) → `RECAP_PROJET.md` (historique
> détaillé des décisions, pièges) → `AUTOMATISATION.md` (exploitation GitHub, cron-job.org).

## 1. En une phrase
Tableau de bord statique (GitHub Pages, https://themrtbo.github.io/market-monitor/) du marché US : breadth (Stockbee + calcul
maison), QQQ / IWM / BTC, T2108, VIX, classement TI65 de 54 ETF sectoriels et des secteurs → industries → actions TradingView, groupes actifs (industries et
thèmes neufs ou chauds) et leurs leaders,
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
| `breadth_soir.py` | **Calcul maison du soir** (28/10/2026) : séance du jour **provisoire** dans `breadth_data.js` (`provisional`), dès le relevé TradingView (≈ 16 h 20 à New York) = cache Polygon jusqu'à la veille (63 dernières séances, restauré en lecture seule par `postmarket.yml`) + clôtures du screener (`fetch_tv_breadth.screener()`), mêmes fonctions que `breadth_own.py` (±25 % mois / trimestre, T2108, `n`) ; ±4 % du relevé TradingView. Contrôles `[breadth_soir]` : cache à la veille (clôtures de la veille identiques), split du jour détecté par l'écart, couverture. `breadth_own.py` recalcule la séance le lendemain matin et retire la marque. `--needed` : séance du relevé absente de `breadth_data.js` ? |
| `fetch_tv_breadth.py` | T2108 (champ SMA40) et **±4 % du jour** (formule TC2000 de `breadth_own.count_breadth`, appliquée à close / close[1] / volume / volume[1]) relevés sur le screener TradingView (actions ordinaires des 3 bourses) → `tv_breadth_data.js`, un relevé par séance ; même relevé, **liste « 9M +4 % »** de l'onglet Secteurs (clé `breakouts` : tickers par séance, `[tv_breadth.breakouts]`) (TradingView n'a pas d'historique de cet agrégat ; série depuis le 20/10/2026). Séance = date de la bougie journalière (juste un jour férié) ; refusé en séance, en pre-market et pendant le différé de 15 min. Lancé par `update_all.py` et par `postmarket.yml` (dès la fin de séance). |
| `fetch_industries.py` | Vue TradingView de l'onglet Secteurs : classification du scanner TradingView + cours Polygon du cache → `industries_data.js` (indices équipondérés des secteurs et industries, affichés en courbe de tendance ; % de titres au TI65 > 1 ; même % pour toutes les actions retenues, série `stocks`) et `industries/<industrie>.js` (actions retenues, OHLC, chargé à l'ouverture d'une industrie) et `tickers_data.js` (toutes les actions US, retenues ou non : secteur, industrie, cap, flottant, TI65, rang dans l'industrie ; onglet Tickers ; sert aussi de composition publiée et de secours si TradingView ne répond pas). |
| `config/themes.toml` | Thèmes suivis de l'onglet Secteurs (refonte du 27/10/2026) : un panier d'actions par thème, suivi comme une industrie (indice, TI65, largeur, leaders) ; liste de départ = paniers des tests 2024-2026 ; le 02/11/2026, l'utilisateur a validé 4 ajouts (Mineurs bitcoin, Hydrogène, compléments Espace et Quantique) : je propose, il accepte ou retire. |
| `fetch_short.py` | Short interest de l'onglet Tickers (flottant, actions à découvert, % du flottant, days to cover ; Yahoo via yfinance) → `short_data.js`, par lots (`config/short.toml`), lancé seul par `short.yml` l'après-midi. |
| `build_site.py` | Prépare `_site` (GitHub Pages) depuis la liste unique `config/storage.toml [site]` ; appelé par les trois workflows. |
| `generated.py` | Fichiers **générés non versionnés** (`config/storage.toml [generated]` : `industries_data.js`, `tickers_data.js`, `industries/`) : `check` (absents ?), `fetch` (secours : version du site publié, installée en bloc), `snapshot` / `restore` (annulation dans `update.yml`). |
| `fetch_history.py` · `fetch_data.py` | Historique Polygon (cache Actions, hors dépôt) : par titre `[clôture, volume, ouverture, plus haut, plus bas]` (OHLC ajouté le 18/10/2026 ; les lecteurs n'utilisent que `row[0]`, `row[1]` s'ils n'ont pas besoin de l'OHLC) ; client Polygon. |
| `mm/store/` | **Stockage historique** (phase 3) : interface `Store` (upsert idempotent, read, latest), backend `git_csv`, conversion des `*_data.js` (`importers.py`), synchronisation vers la branche `data` (`sync.py`), CLI `python -m mm.store import|sync|check|stats`. |
| `data-store/` | Branche orpheline **`data`** extraite localement (`git worktree`, ignorée sur `main`) : CSV de l'historique. |
| `validate_data.py` | Contrôles de cohérence par source (fraîcheur lue dans `config/sources.toml`, bornes de valeurs dans le code). |
| `*_data.js`, `status_data.js` | Données publiées (variables globales `window.X`), commitées par le robot sur `main`. |
| `industries_data.js`, `tickers_data.js`, `industries/` | Données publiées **sans être commitées** (ignorées par `.gitignore` depuis le 20/10/2026 : ~2,7 Mo d'historique Git par séance) ; `industries/*.js` : `window.TV_STOCKS[<fichier>]`. Gardées entre deux passages par le cache Actions `generes-`, secours = site publié (`generated.py`). En local : `python generated.py fetch`. |
| `stockbee_dashboard.html` | **Tout le front** (HTML + CSS + JS, canvas, aucune librairie) ; ~3 100 lignes, découpage prévu (phase 4). |
| `.github/workflows/update.yml` | Mise à jour complète + publication. |
| `.github/workflows/postmarket.yml` | Scan post-market seul + publication si changement. |
| `.github/workflows/short.yml` | Short interest seul (12:17 UTC, lun-sam) + publication si changement. |
| `.github/workflows/ci.yml` | Tests sur chaque pull request. |
| `tests/` | `run_all.sh` (tout) : config, syntaxe YAML des workflows, 27 tests Node (dashboard en DOM simulé), 10 tests Python (dont `test_breadth_soir.py`, `test_industries.py`, `test_short.py`, `test_tv_breadth.py`, `test_store.py`, `test_store_sync.py`, `test_generated.py`). |
| `tests/fixtures/` | Copie figée des fichiers générés lue par les tests (`tests/node/lib/fixtures.js` redirige les lectures ; ~2 Mo, une fois) : mêmes résultats en local et en CI. Format changé dans `fetch_industries.py` → `python tests/make_fixtures.py` (`test_generated.py` le signale). |
| `breadth_long.py` | Exploration non versionnée (ignorée). |

## 3. Flux
```
cron-job.org (heure exacte, UTC)  ─┐            créneaux `schedule` GitHub (secours, souvent en retard)
                                   ▼                         │
  workflow_dispatch → update.yml : fetch_history.py → update_all.py (étapes de config/sources.toml) ─┐
                    → postmarket.yml : fetch_postmarket.py, fetch_tv_breadth.py, breadth_soir.py ────┤
                      (breadth_soir : seulement si la séance manque ; cache `historique-` de update.yml restauré en lecture seule)
                                                                                                      ▼
            validate_data.py (contrôle) → commit des *_data.js sur main (rebase, 3 essais) → déploiement Pages
            fichiers générés (industries_data.js, tickers_data.js, industries/) : cache Actions `generes-` (restauré avant
            update_all.py, sauvegardé après le contrôle ; clé = contenu), secours `generated.py fetch` (site publié) ;
            jamais commités ; postmarket.yml / short.yml les restaurent avant de republier (absents : pas de publication)
            python -m mm.store sync → branche `data` (historique, journal `runs`) ; échec signalé, n'empêche pas la publication
                                                                                                      ▼
  navigateur : stockbee_dashboard.html charge config_data.js + *_data.js (?v=horodatage pour casser le cache), sauf
               industries_data.js (~140 Ko compressés), chargé à la 1re ouverture de Secteurs, Tickers ou Post-market (indLoad) ;
               industries/<industrie>.js à l'ouverture d'une industrie (onglet Secteurs, vue TradingView) ou des Leaders
               actifs (fichiers des industries de leurs leaders, chargés à la demande)
```
Restauration d'une étape en échec : `restore` de `config/sources.toml` accepte un dossier (entrée finissant par `/`, ex. `industries/`).
Contrôle global en échec (`update.yml`) : `*_data.js` commités → `git checkout` ; fichiers générés → `generated.py restore` (copie d'avant `update_all.py`).
Concurrence : les deux workflows partagent le groupe `market-monitor` (jamais deux écritures simultanées).

## 4. Configuration (`config/`)
| Fichier | Contenu | Lu par |
|---|---|---|
| `market.toml` | fuseau, heures de clôture / fin du post-market / début du pre-market | robot, front |
| `schedule.toml` | expressions cron (cron-job.org) et créneaux GitHub de secours, par workflow | front (prochaine mise à jour), `--check` (compare aux workflows) |
| `sources.toml` | étapes du robot : script, fichier, essais, attentes, libellés, **fraîcheur** ; `[stockbee]` (Google Sheet, un gid par année, délai) ; `[tv_breadth]` (relevé TradingView) et `[tv_breadth.breakouts]` (scan 9M +4 % : hausse, volume, volume en hausse, prix minimum, séances gardées, limite d'affichage ; repères : bougie forte `candle_*`, étendu `extended_pct`, « 9M ×n » `repeat_*`, couloirs `lanes` / `lanes_sub`, `edge_note` ; lu aussi par le front) ; `[history]` : profondeur de l'historique Polygon (séances : 490 depuis le 28/10/2026, gardées, appels/min) ; `[breadth_soir]` : contrôles du calcul du soir (tolérance, part identique, split, couverture) | `update_all.py`, `validate_data.py`, `fetch_history.py`, front |
| `postmarket.toml` | filtres du scan (prix, volume, variation), limites, séances gardées, essais / attentes / délai des requêtes au screener (`request_*`), lien de la fiche (`[[links]]` : Finviz ; `{sym}`, `{symd}`, `{tv}`) | `fetch_postmarket.py`, front |
| `sectors.toml` | univers des ETF : symbole, nom, groupe, origine, libellé court, description | `fetch_sectors.py`, front |
| `industries.toml` | vue TradingView : requête du scanner (marché, type, bourses, limite de lignes), filtres des actions retenues (sous-type, prix, volume moyen, capitalisation), indice (base, plafond des variations, titres minimum / « peu de titres »), volume en dollars relatif (`[volume]`), leaders et grappes des groupes actifs (`[leaders]`), séances du calcul (`[output] sessions`, 190 : fenêtre prise à la fin du cache Polygon, plus long depuis le 28/10/2026) et par action, dossier, unité des volumes | `fetch_industries.py`, `validate_data.py`, front |
| `themes.toml` | thèmes suivis (`[[theme]]` : nom, tickers, ETF de confirmation facultatif ; au moins `[index] min_members` symboles) | `fetch_industries.py` (`mmconfig.themes()`), front (noms), `--check` |
| `display.toml` | `[adr]` : fenêtre de l'ADR des listes de tickers (lu aussi par `fetch_industries.py`) ; `[tickers]` : règle des thèmes chauds / émergents, limite de la liste ; seuils du breadth, T2108, fenêtre des records « ▲ / ▼ 3M » du MM (`[breadth] record_sessions`), contrôle croisé avec Stockbee (`compare_sessions`, `compare_min`), sources dont le T2108 déclenche l'alerte, étiquettes de source, repères VIX, couleurs, filtres de l'onglet Secteurs et leur bulle (`group_tips`), cases de la vue TradingView (`[sectors.kpis]` : `tiles` = ind, rot, bo9, t9 depuis le 31/10/2026 ; th, sec, rr, stk réactivables), groupes actifs et Leaders actifs (`[sectors.actifs]` : fraîcheur, fenêtre du neuf, limite de la liste, 9M par groupe `nine_*`, Réveil `reveil_*`, phases d'alerte, familles refuges, libellés), carte des thèmes (`[sectors.map]` : seuil `x_hot`, `y_max`, zones et notes mesurées, bulle), carte de rotation (`[sectors.rrg]` : repliée `folded`, traînée, momentum, tableau « Depuis la veille » `delta_windows` / `major_factor` / `zone_margin` / `table_rows` / `confirm_ti65` / `confirm_breadth` / `pistes_max_rs` / `views` / `tags` / `measure_sessions` / `measure_streak` / `streak_max` / `default_view`), bascule ETF / TradingView, phases de marché `[phases]` (seuils de la spec, signaux, `[[phases.phase]]` : nom, couleur, setups, précision, règle ; `[[phases.signal]]` ; `[phases.own]` : priorité `primary` (sb / own), série maison, choc rapporté à `n`, début `since`, libellés de source, fenêtre du contrôle), indicateur `[ti65]` (nom, fenêtres 7 / 65, miniature `spark` = 63 séances ≈ 3 mois, fenêtre du Δ `delta`, repère `breadth_ref` de la carte « % > 1 » ; `--check` vérifie `spark + long − 1` ≤ `stock_sessions` ≤ `sources.history.sessions`), traductions | front, `fetch_industries.py` (`ti65`) |
| `datasets.toml` | **modèle logique** : jeux de données (= futures tables SQL), clé primaire, colonnes typées, partition | `mm/store/` |
| `storage.toml` | `serving` (ce que lit le site : `js_files`), `[store]` (historique : backend `git_csv`, dossier, branche), `[site]` (fichiers publiés : liste unique), `[generated]` (publiés sans être commités : fichiers, dossiers, URL du site, préfixe du cache ; `--check` vérifie `.gitignore`, `[site]` et les mêmes chemins de cache dans les trois workflows) | `mm/store/`, `build_site.py`, `generated.py` |
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
- **Fichiers générés** (20/10/2026, avance de la phase 3c) : la vue TradingView et l'index Tickers ne sont plus commités sur
  `main` (8 commits en 2 jours = +22 Mo d'historique ; projection 0,5 à 2 Go/an). Ils vivent dans le cache Actions (`generes-`,
  éviction après 7 jours sans accès, 10 Go par dépôt) et sur le site publié (secours). L'historique Git existant n'est pas
  réécrit (pas de force push) : les anciens commits gardent leur poids. Pas encore copiés dans la branche `data`.
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
- **Aperçu local du site** : les fichiers générés ne viennent plus avec `git pull` (un pull les retire même d'un ancien
  dossier) : `python generated.py fetch` (version publiée, ~10 Mo compressés ; `--force` pour rafraîchir) ou
  `fetch_industries.py` ci-dessus.
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
| 3c | `build.py` génère les fichiers du site depuis le stockage ; plus de `*_data.js` commités sur `main` ; « Stats du » sans limite de 20 séances | en cours : vue TradingView et index Tickers déjà hors de `main` (cache Actions + site, `generated.py`, 20/10/2026) ; reste : autres `*_data.js`, fixtures de test pour toutes les données |
| 2 | Paquet Python `mm/` (une interface commune par source, `python -m mm run`) | à faire |
| 4 | Front découpé en modules ES natifs (un par onglet + moteur de graphique) | à faire |
| 5 | Alertes (source muette, pas de liste post-market un jour de semaine), journal des passages | à faire |
Gel des nouvelles fonctions (Benzinga, pre-market) jusqu'à la phase 3. Exceptions accordées le 18/10/2026 : vue TradingView de
l'onglet Secteurs (secteurs → industries → actions, TI65) et onglet Tickers (short interest Yahoo par lots, accord de l'utilisateur) ;
le 20/10/2026 : breadth affiché dès que possible depuis nos sources + T2108 TradingView (voir §9, « Sources du breadth »), puis cases en
tête de la vue TradingView de Secteurs (puis, dans une PR suivante, du Post-market) ; le 21/10/2026 : tableau « Depuis la veille »
au-dessus de la carte de rotation (même vue TradingView) ; le 26/10/2026 : phases de marché en tête de l'onglet MM (bandeau,
frise, voir §9) ; le 27/10/2026 : refonte de l'onglet Secteurs (groupes actifs, Leaders actifs, thèmes suivis, carte repliée ; voir
§9, « Groupes actifs »), à la demande de l'utilisateur après les tests 5 à 16 du document d'analyse ; le 27/10/2026 aussi : bloc
« Breakouts 9M +4 % » de l'onglet Secteurs (scan TC2000 de l'utilisateur, voir §9), puis ordre des blocs sous la frise
changé par glisser-déposer (§9, « Ordre de l'onglet Secteurs »), puis volume en dollars de la liste 9M (Secteurs et Tickers :
colonne, tri, filtre ; §9, « Breakouts 9M +4 % »), puis la liste 9M en niveau du Classement (liste, graphique et fiche) ; le 02/11/2026 : grille de convergence des 9M dans le tableau par zone (§9, « Grille de convergence des 9M »), à la demande de l'utilisateur, sans retirer d'information ; le 31/10/2026 : repères de la liste 9M (couloirs, mini-bougie, étendu, « 9M ×n » ; §9, « Breakouts 9M +4 % »), à la demande de l'utilisateur après les tests hors dépôt 2008-2025 ; le 28/10/2026 : calcul maison du soir (`breadth_soir.py`) et
phases de marché maison affichées d'abord, Stockbee prioritaire dès sa publication (« tout calculer juste après la clôture »), avec
l'historique Polygon allongé à 490 séances pour caler les seuils sur 2025. Détail : proposition privée de l'utilisateur
(hors dépôt) ; résumé ici.

## 8. Paramètres encore en dur (connus, à migrer)
- Bornes de valeurs des contrôles (`validate_data.py` : ex. 0-5 000 titres, VIX 5-150) → déclarées par source en phase 2.
- Liste des fichiers chargés au démarrage par le front (chargeur en tête de `stockbee_dashboard.html`) → phase 3c (`_site` : déjà centralisé, `config/storage.toml [site]`).
- Constantes d'interface du graphique (marges, préréglages 3M…5A, longueur de pente, hauteur de la frise des phases `PH_STRIP`) dans le front → phase 4.
- Colonnes de la vue TradingView par niveau (`TV_LEVEL`), choix de « Classer par » par niveau (`SORT_OPTS`), largeurs des colonnes (`#secTable`), taille de la miniature (60 × 18)
  → phase 4. `display.toml [postmarket.sector_fr]` sert aussi à l'onglet Secteurs (nom historique, à renommer en phase 4).
- Défilement : `scrollWithin` (conteneur seul) remplace `scrollIntoView` dans Secteurs, qui faisait descendre la page à chaque
  changement de date ; les onglets Tickers et Post-market utilisent encore `scrollIntoView` (à vérifier).
- Constantes d'interface des onglets Secteurs / Post-market : seuil « liste et détail empilés » (`isStacked`, ≤ 1000 px),
  seuils du balayage entre titres (60 px, horizontal ≥ 2 × vertical, < 700 ms) → phase 4.
- `fetch_data.py` (univers Polygon, âge max du cache), `breadth_own.py` (formules TC2000 : ne pas modifier sans accord).
- Essais et attentes HTTP internes de `fetch_data.py` (Polygon) et `fetch_prices.py` (Coinbase) : constantes techniques, à
  regrouper avec les autres en phase 2 (le scan post-market et Stockbee lisent déjà les leurs dans `config/`).

## 9. Pièges principaux (détail : `RECAP_PROJET.md` §9)
- **Phases de marché** (onglet MM, spec du 26/10/2026, `config/display.toml [phases]`) : une phase par séance, calculée une fois
  au chargement (`PHASES`). Deux moteurs séparés (`phaseSeries`) : `PH_SB` (Stockbee, univers Worden) et `PH_OWN` (série maison
  `breadth_data.js`, provisoire le soir puis Polygon ; paramètres `[phases.own]` : choc = part de `n`, titres cotés la séance et la
  veille, seuil 0,19 ≈ 0,15 × univers Worden ÷ `n` ; mise en route `PH_WARM` séances). **`[phases.own] primary = "sb"`**
  (décision du 28/10/2026, « pour le moment ») : **notre phase s'affiche d'abord** (le soir, séance que Stockbee n'a pas publiée,
  « Calcul maison provisoire · Stockbee : pas encore publié »), **puis celle de Stockbee dès sa publication** ; l'autre série est
  écrite à côté en contrôle (bandeau « Stockbee · calcul maison : même phase » ou sa phase ; bulle : accord sur `compare_sessions`
  séances). `"own"` = maison partout (Stockbee avant le début de la série maison), à n'activer qu'après le calage sur 2025 et
  l'accord de l'utilisateur. **Comparaison du 28/10/2026** (99 séances, juin-octobre 2026) : 89 % de phases identiques, état de
  fond 100 % ; ±4 % et ratios 5 / 10 j à 1-2 % ; écarts sur −25 % mois (−10 titres, 7 %), ±25 % trimestre (fin octobre −35 /
  +90) et T2108 (−1,4 à +5,4 points selon le mois) ; **choc du 05/06/2026 manqué** (965 baisses ÷ 5 094 = 0,189 < 0,19 ;
  Stockbee 972 ÷ 6 467 = 0,150) ; aucune surchauffe sur la période. ⚠️ À recaler sur 2025 (historique Polygon allongé à 490
  séances, rattrapage en 3-4 matins). Test 22 : cas de la spec sur Stockbee seul (calcul maison vidé) ; série maison
  synthétique (copie de Stockbee) + une séance provisoire, dans les deux modes (`primary`), désaccord forcé. Priorité : choc > surchauffe > expansion chaude > expansion A / B / C >
  reprise > lessivage > contraction ; état de fond expansion / contraction après `confirm` clôtures de mq de l'autre côté de 1.
  Surchauffe **sans hystérésis** (décision du 26/10/2026 : mesure faite, gardée pour plus tard). **Reprise sur le ratio 5 j**
  ≥ `rep_r5` dans les `rep_window` séances après un lessivage (note du 26/10/2026 : le ratio 10 j de Stockbee n'avait jamais été
  testé ; 21 épisodes au lieu de 5 depuis 2019, reprise ≈ 9,5 % des séances au lieu de 2 %). **Fin de la reprise** à l'expansion, au choc ou à un **nouveau lessivage** (ratio mois qui repasse sous `wash_rm` pendant la reprise ; un lessivage déjà en cours au déclenchement ne la coupe pas, le ratio mois restant bas des semaines après un krach). Décision du 29/10/2026 : le lessivage n'est pas un feu vert, la reprise l'est sur un setup excellent (setups « EP + Breakouts A+ ») ; mesure Stockbee 2018-2026 : 25 épisodes au lieu de 22, 7,6 % des séances au lieu de 9,5 %, plus long 18 séances au lieu de 44 (avril-juin 2021 coupé par les lessivages des 12/04 et 13/05) ; avril 2025 gardé (11/04 → 24/04). **mq sur 20 séances = réglage
  fragile** (choisi sur le journal, valable entre 15 et 20 séances : `mq_lag_valid`, vérifié par `--check`, écrit dans la bulle) ;
  suivi vers le 26/04/2027 sur les seuls trades nouveaux (journal hors dépôt). **Bandeau** au-dessus des
  cases (`renderPhase`, suit « Stats du » et le survol comme les cases), trois colonnes : phase (séances dans la phase,
  précédente, état de fond) · jauge de bascule au milieu (momentum trimestre mq, 0 à 2, trait = 1, compteur de confirmation) ·
  **setups recommandés** : l'essentiel court (`setups` : EP et / ou breakouts, en-tête `setups_label` « EP = Episodic Pivot »),
  la précision dessous (`detail`), puis le signal du jour ou le dernier signal (premier jour d'une série). Toujours en positif,
  sigles en clair ; jamais d'interdit, de nombre de trades ni de taille de position (préférences de l'utilisateur). Bulle ⓘ
  (`TIPS.phase` : **pourquoi cette phase**, chaque étape de l'arbre avec les chiffres de la séance (`phWhy`), puis les règles
  des neuf phases dans l'ordre du calcul (`phRules`)) ; bulles dédiées : état de fond et momentum trimestre (`phfond`), setups de
  toutes les phases et sigles (`phsetups`), signaux (`phsig`), règles (`phrules`, légendes des deux frises). Le ratio mois n'y
  figure pas (case juste en dessous). **Évolution** (décision du 29/10/2026, maquette validée) : courbe du momentum trimestre sur `mq_spark` séances (3 mois, `mq_spark_label`) sous la jauge (`mqSpark`, trait = 1), masquable d'un clic sur son titre (`.phsptog`, mémorisé `mm.mqspark`) ; **seuils de bascule de la phase affichée** (« Stats du », sinon la dernière séance ; pas le survol, qui ne redessine pas les graphiques) tracés en orange pointillé sur Ratio 5 j, Ratio mois et le détail des histogrammes ±4 % (`phLines` / `phLineDraw`, table `[phases.lines]` : [graphique, seuil de `[phases]`, libellé] ; `rep_r5` seulement pendant la fenêtre de reprise, avec les séances restantes ; choc = `choc_pct` × univers de la séance), légendes `#legPhR5` / `#legPhRm` / `#legPhD4`. Ratio mois et Ratio trimestre en **échelle logarithmique** (`[breadth] rm_log`, `rq_log` : seuil du lessivage 0,3 lisible, mars-mai 2021 plus écrasés par le pic de 20,8), bas de l'axe adapté aux valeurs (plancher 0,05, au plus 0,5). **Lisibilité** (29/10/2026, maquette validée) : seuils de phase en trait fin semi-transparent, valeur en orange sur l'axe, aucun libellé sur la courbe ; légende des seuils en gris (orange sur le trait seulement) ; zones bleue / rouge des ratios allégées (`ratio_zone_alpha`) ; triangles des records 3 mois inchangés (un par jour, choix de l'utilisateur). Séance
  pas encore calculée : phase de la dernière séance calculée, avec la mention. Mobile (≤ 640 px) : compact (phase et setups),
  un toucher déplie le reste, mémorisé (`mm.phase`). **Frise** au pied du graphique des prix (`drawPhaseStrip`, couleurs de la config) +
  légende `#phLeg` ; phase de la séance dans la légende du graphique (`.phx`). **Onglet SA** : même bande au pied de tous les graphiques (QQQ, IWM,
  BTC, T2108, VIX, base 100 ; week-end de BTC = phase de la séance précédente, `phaseKeyAt`), phase dans chaque infobulle
  (`phTipLine`), légende `#cmpPhLeg` (repliée avec la légende sur mobile). **Onglet Secteurs** : la même bande est fusionnée
  dans la frise temporelle (sous la courbe des industries TI65 > 1, phase dans le libellé de la séance, légende `#secPhLeg`). Test : `tests/node/22_phases_marche.js` (17 dates
  de la spec, seuils lus dans la config, séance non publiée, frise, mobile).
- **Sources du breadth** (décision du 20/10/2026 : « le plus autonome possible, vérifié avec Stockbee ») : chaque case du MM affiche
  le chiffre dès qu'il existe, avec sa **source** en étiquette (Stockbee / maison / TradingView). Priorité : Stockbee (dès sa
  publication, il remplace nos chiffres) > calcul maison Polygon (`breadth_data.js`, toutes les colonnes) > relevé TradingView
  (`tv_breadth_data.js` : T2108 et ±4 %, disponibles dès 16 h 20 à New York ; ratios 5 / 10 j recalculés dans le navigateur ;
  ±25 % : le soir par `breadth_soir.py`, ligne maison provisoire, puis le lendemain matin par Polygon). L'**alerte d'extrême du T2108** (case orange, records 3 mois)
  n'existe que sur un chiffre Stockbee : notre T2108 a un biais de niveau (univers ≈ 5 150 titres contre ≈ 6 550 chez Worden). Contrôle
  croisé (corrélation, écart moyen, sur `config/display.toml [breadth] compare_sessions` séances) : pied de page et bulles ⓘ.
  Sur l'onglet SA, trait plein = Stockbee seul ; la variation du T2108 se calcule dans la même source (pas de faux saut).
- **Stockbee, chaque janvier** : un nouvel onglet par année dans son Google Sheet ; ajouter son gid dans `config/sources.toml
  [stockbee] gids`, sinon la série s'arrête au 31/12 (`--check` échoue dès le 1er janvier, donc la CI aussi ; `fetch_stockbee.py`
  l'écrit dans son journal ; le contrôle de fraîcheur échoue après `max_age` jours).
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
- **Audit de l'onglet Secteurs** (31/10/2026, à la demande de l'utilisateur ; tests hors dépôt 2008-2025) : 4 cases par défaut
  (`tiles = ["ind", "rot", "bo9", "t9"]` : Industries TI65 > 1, Rotation, **9M à regarder** = bougies fortes pas étendues de la
  liste 9M de la séance (`boCountAt`), **Thèmes 9M** = industries à `nine_min` titres et `nine_share` % en 9M sur `nine_window`
  séances, dont « Réveil » ; secteurs, ratio de rotation, actions, thèmes chauds : code gardé, réactivable par la config) ;
  Breakouts 9M avant Groupes actifs ; Groupes actifs : 9M par groupe (`nineAt` : listes 9M gardées × index Tickers, chargé à la
  demande), chauds triés par 9M puis leaders, section **Réveil** (9M fort, ni chaud ni neuf ; toucher = actions de l'industrie),
  **pionniers retirés** (test 8), ⚑ s'essouffle et ◆ refuge au survol seulement ; courbe « Score TI65 » repliée par défaut
  (`mm.fold.score`) ; « + N autres » de Leaders actifs : ligne `tr.rkmore` (la classe `more` est la feuille « Plus » du mobile,
  en position fixe : le bouton flottait en bas de l'écran). Tests : 20, 23, 24, 25.
  **Carte des thèmes** (`#secMap`, bloc déplaçable `map`, repli `mm.fold.map`, `config/display.toml [sectors.map]`) : à la place
  de la carte de rotation (masquée, zones sans avance). Chaque industrie classée : x = rang TI65 parmi les industries (0-100),
  y = part de ses actions retenues en 9M sur `nine_window` séances (`nineAt`), taille = leaders, couleur = neuf, chaud + 9M fort,
  9M fort seul (Réveil), chaud, autre ; traits `x_hot` et `nine_share` / `nine_intense` ; zones et notes mesurées hors dépôt
  (revérifiées le 01/11/2026 avec les définitions du site, actions retenues : Réveil +1,8 % sur 21 séances mais 11 années
  sur 18 (13 / 18 à 42 séances), thème qui dure +0,7 % instable, tendance seule et calme ≈ 0 ; bougie forte du site + 9M
  ×1,19 sur +8 % en 5 j, 18 / 18 ; couloir étendu : plus de gros mouvements, médiane à 21 j plus faible). SVG à la largeur du bloc (texte lisible sur mobile, zones de droite sur deux
  lignes). Évolution (demande du 01/11/2026) : traînée des `trail` dernières séances (`mapAt` par séance), toujours sur les
  points 9M fort ou neufs, au survol pour les autres ; toucher un point le choisit (`mapSel` : traînée appuyée, barre « rang TI65 a → b,
  9M a → b, leaders » et bouton « Ses leaders › » (`goAct`) ou « Ses actions › » (`goInd`)). Test : 23 (et 25 pour l'ordre).
  Lisibilité (retour du 01/11/2026 : « on n'est pas censé aller que de gauche à droite ? ») : titres d'axes et ligne de lecture
  (`x_title`, `y_title`, `read_hint` : ce n'est pas un graphique dans le temps), flèche au bout de la traînée (sens du mouvement),
  axe des 9M de 0 à 100 % (`y_max`) en pseudo-log (`y_scale = "log"`, log(1 + part / `y_log_k`) : log au-delà de
  quelques %, 0 % gardé, ce qu'un vrai log ne peut pas ; `sqrt` et `linear` possibles ; `y_ticks`), notes des zones sous le graphique ; bascule
  **Tableau par zone** (`#secZone`, `renderSecZone` + `mapBoardHtml`, `[sectors.map.board]`, demande du 01/11/2026 : « 2
  composants côte à côte ») : remplace la bascule Carte / Dans le temps. Deux cartes dans `#secMapRow` (bloc déplaçable `map`,
  poignée sur les deux) en flex (`row-reverse wrap`) : côte à côte quand la place le permet (`map_min` + `zone_min` px, parts
  `side_share`), l'une au-dessus de l'autre sinon (le tableau d'abord) ; côte à côte, même hauteur (étirement) et la carte grandit
  d'au plus `grow_max` px (`mapFill`) pour ne pas laisser de vide ; repli propre (`mm.fold.zone`) ; Copier : tout le tableau ou une zone. Une ligne par industrie Réveil, thème qui dure ou neuve, triée par titres en 9M ; dans la zone Réveil, les industries **délaissées** (rang TI65 sous `[sectors.map.board] low_rank` = 40) d'abord, avec l'étiquette `low_label` et sa bulle (`low_tip` : tests 2008-2025 hors dépôt, `cache/analyse_scans/verif_reveil_rang.txt`, 01/11/2026 : rang < 40 +2,8 % sur 21 s, 12 ans / 18, contre +0,7 % au rang ≥ 60 ; pente du rang sans effet)) ; **ordre des zones selon la phase de la séance** (`phase_rule` : phases, `order` des zones rev / both / neuf, `low` = étiquette « délaissée » ou non, `tip` ; `default_order` si la phase est inconnue ; séance pas encore calculée = dernière phase calculée, comme le bandeau ; ligne de tête `phase_label` « Phase X : zone d'abord » ; `mmconfig --check` exige chaque phase dans une seule règle). Tests hors dépôt `verif_zones_phases.txt` (phases du site 2019-2025) : Expansion → Thème qui dure d'abord, Réveil délaissée sans étiquette en Expansion A-B-C ; Choc, Lessivage, Reprise, Surchauffe, Contraction → Réveil d'abord : pastilles = membres (remplies : en
  9M ; jusqu'à `dots_max`), courbe de la part en 9M sur `time_sessions` séances (ligne `nine_share`), titres en 9M triés bougie forte puis 9M le plus récent (▲ vert : bougie
  forte d'après l'historique `nine`, et les listes TradingView gardées), rang TI65, leaders, `basket` (≥ 2 titres 9M dans un panier de
  `config/themes.toml`), `same_day` (tous partis la même séance, d'après `nine` ; non testé à part) ; `lift_label` (concentration : part des membres en 9M ÷ part de toutes les actions
  retenues en 9M, mise en avant dès `lift_hi`, aussi dans « 9M actif ailleurs » ; information : verif_sousgroupes, les sous-groupes
  par corrélation ont été testés et rejetés le 01/11/2026) ; `age_label` (âge de la grappe : séances
  consécutives avec ≥ `nine_min` titres en 9M sur `nine_window`, « ≥ » au bout de l'historique ; tranches `age_buckets` et notes
  `age_notes` mesurées hors dépôt, verif_age.txt : l'avance moyenne grandit après 5 séances, pas la régularité) ; puis « 9M actif ailleurs »
  (≥ 2 titres, `other_max` puis « + N autres », `mapOther`). Toucher une ligne = choisir le point (`mapSel`) ; toucher un titre =
  sa fenêtre graphique. Test : 23.
- **Fenêtre graphique d'un ticker** (`#tkPop`, `openPop`, 01/11/2026) : titres du tableau par zone et du bloc 9M (le bloc garde
  son bouton vers le Classement). Bougies et MM de l'onglet Tickers (`tkRow`, `tkStock(r, after)`, fichier de l'industrie),
  moteur commun avec son contexte `popCtx` (genre `pop` dans `withCtx`, `isPrice`, `setHover`, la boucle des canvas, `render`) ;
  « Fiche › » = onglet Tickers ; Échap, ✕ ou fond = fermer. Tests : 23, 24, 27.
- **Bougies 9M sur les graphiques de prix** (`nineFlags`, `nineTag`, `config/display.toml [chart_nine]`, 01/11/2026) : seuils du
  scan 9M (`[tv_breadth.breakouts]` pct, min_volume, volume_up, min_price) recalculés sur les barres ; couleur `--c9m` (cyan) ;
  ▲ dessous plein = bougie forte (candle_close_pct, ADR 14 j en $, range de la veille), creux = faible ; « · 9M » dans la
  légende OHLC. `drawPrice` (MM, Secteurs, Tickers, Post-market, fenêtre) et `drawMini` (QQQ · IWM) ; pas sur `skip` (BTC) ni
  le VIX (sans volume). Test : 18.
- **Copier** : ajouté au tableau par zone (tout, par zone) et aux Groupes actifs (leaders actifs, `actSyms`).
- **Grille de convergence des 9M** (02/11/2026, demande de l'utilisateur : « le site fait l'historique et la convergence des 9M que
  je fais de tête chaque matin sur TC2000 », sans perdre d'information) : le tableau par zone devient « Convergence des 9M »
  (`[sectors.map.board] label`). Ajouts, rien de retiré : sous chaque ligne, `grid_sessions` cases = titres du groupe en 9M **à
  chaque séance** (historique `nine` ; pâle 1, moyen 2, foncé 3 et plus ; point = EP probable, bulle avec les titres) ; rang TI65
  en barre (zone délaissée ombrée sous `low_rank`) et ↑ pour un rang ≥ `low_rank` qui gagne plus de `rank_up_pts` points en
  `rank_up_sessions` séances ; ligne « Sur `moves_sessions` séances » (groupes entrés dans les zones, sortis) ; « Sortis
  récemment » : groupes sortis depuis au plus `gone_sessions` séances, grisés (`gone_max`). **Thèmes suivis** (`config/themes.toml`)
  dans les zones comme les industries (`mapAt` → `th` / `tby` : rang de l'indice du panier placé parmi les industries ; étiquette
  `theme_tag`, jamais « délaissée » ; pas de point sur la carte, ligne non sélectionnable). Mobile (≤ 640 px) : grille seule, la
  carte est masquée (illisible ; choix de l'utilisateur). Bloc 9M : étiquettes « EP » (repère 4 de `nine` : la séance doit être
  dans l'historique, donc le lendemain matin) et « groupe » (titre d'un groupe en zone, même séance que les leaders actifs),
  libellés dans `[tv_breadth.breakouts] marks_text`. **EP probable** : `fetch_industries.nine()` ajoute le repère 4 (C / C1 ≥
  1 + `ep_pct` %, volume ≥ `ep_vol_mult` × moyenne des `ep_vol_sessions` séances d'avant, clôture ≥ `ep_min_price`) ; actions
  retenues seulement. Tests hors dépôt (cache/analyse_scans/verif_grille_alerte.txt, verif_grille_dynamique.txt,
  verif_ep_replay.txt, verif_2026_hors_echantillon.txt) : convergence = dérive sur 21-42 séances (lignes affichées +1,4 % sur
  21 s, 13 ans / 18), pas un déclencheur à 5 j. Pas fait (données absentes du site) : capitulations (−20 % en 5 j + −9M). Tests :
  `tests/test_industries.py` (EP), node 23 (cases, barre, entrés, EP, sortis).
- **Thèmes ETF** (01/11/2026, `fetch_etf_themes.py`, `config/etf_themes.toml`, étape séparée `etf_themes` →
  `.github/workflows/etf_themes.yml`, le 3 de chaque mois, secret `SEC_UA`) : dernière composition N-PORT-P (SEC EDGAR, gratuit)
  de 31 ETF thématiques, reliée aux tickers de `tickers_data.js` (ticker, CUSIP appris, nom normalisé ; écartés : hors actions,
  cotés hors des États-Unis, CUSIP « N/A ») → `etf_themes_data.js` (`window.ETF_THEMES` : themes, etfs, h = compositions,
  stocks = au plus `max_per_stock` thèmes par action, poids ≥ `min_weight`) ; ETF illisible : composition publiée gardée ;
  `--from-dir` : fichiers N-PORT déjà téléchargés. Contrôle : `validate_data.py etf_themes` ; tests : `tests/test_etf_themes.py`,
  node 23. Page : `themesOf` / `themesSum` → ligne « thèmes 9M » du tableau par zone, infobulles des titres (tableau, bloc 9M,
  « 9M actif ailleurs »), fenêtre graphique. ÉTIQUETTES d'information : comme signal, ces paniers font moins bien que les
  industries (hors dépôt : cache/analyse_scans/verif_etf.txt).
- **Courbes de l'onglet Secteurs sur 12 mois** (01/11/2026, « au moins 6 mois, voire 12 ») : `industries.toml [output]`
  `sessions = stock_sessions = 316` (252 séances de courbes + 64 de recul du TI65 ; `industries_data.js` ≈ 1,2 Mo, ≈ 320 Ko
  compressé ; fichiers d'industrie ≈ +65 %), `[ti65] spark = 252`, `[sectors.map] time_sessions = 252`, `[phases] mq_spark = 252`,
  `[sectors.kpis] record_sessions = 252` (jauge `record_label`, « plus haut / plus bas `record_text` »), fenêtre graphique
  `[ticker_popup] range = "1A"`. `mmconfig.py` borne les fenêtres par `industries.output.sessions`. En local, le cache Polygon
  peut être plus court (287 séances le 01/11/2026) : courbes plus courtes, pas d'erreur. Case « 9M à regarder » : courbe et jauge
  depuis l'historique `nine` (repères 1 = bougie forte, 2 = étendu, `nineBo`), chiffre du jour de la liste TradingView quand elle
  existe, sinon calcul maison (`tiles_text.bo9_own`).
- **Libellés en config** (audit du 01/11/2026) : `[sectors.map.text]` (carte, tableau, barre d'information ; paires
  [singulier, pluriel]), `[ticker_popup]`, `[sectors.kpis] tiles_text` (cases 9M), `[tv_breadth.breakouts] marks_text` (repères du
  bloc 9M) et `adr_sessions` (ADR de la bougie forte, robot et page) ; `tpl(s, o)` remplit les `{x}`, `plu(paire, n)` accorde.
  Style de la carte allégé (grille et zones plus pâles, points calmes plus petits, traînées plus fines) ; les noms évitent
  les libellés des zones, un nom décalé est relié à son point par un trait fin, un nom sans place libre n'est pas écrit.
  **Historique des 9M** (01/11/2026) : `fetch_industries.py` publie `nine` = actions retenues en 9M à chaque séance de la fenêtre
  (scan `[tv_breadth.breakouts]` sur clôtures et volumes du cache Polygon ajustés des splits) ; `nineAt` le lit d'abord (9M des
  groupes, case Thèmes 9M, carte), les listes TradingView gardées × index Tickers ne servent plus que de secours (ancien fichier).
  Depuis le 01/11/2026, une 3e valeur 1 marque la bougie forte (`strong_candle` : repères de `[tv_breadth.breakouts]` sur l'OHLC du
  cache ; 10 / 10 d'accord avec les repères TradingView du 30/10) : le vert du tableau par zone couvre toute la fenêtre.
  Contrôle : `validate_data.py` (industries) ; test : `tests/test_industries.py`.
- **Cases de la vue TradingView** (Secteurs, décision du 20/10/2026) : industries, secteurs et actions au TI65 > 1, rotation
  = industries qui **franchissent 1** en `rotation_window` séances (solde en grand, « +entrées / −sorties » dessous, comme le ±4 % ;
  pas les rangs : un classement est à somme nulle, ▲ et ▼ s'y équilibrent toujours) (`config/display.toml [sectors.kpis]` :
  ordre, fenêtre de la rotation, fenêtre des records). **Ratio rotation 5 j** (`rr`) : entrées ÷ sorties de chaque séance,
  cumulées sur `rotation_ratio_sessions` = [5, 10] séances (5 j en grand, « 10 jours : … » dessous, comme « Ratio 5 j » du MM), couleurs `rotation_ratio` (rouge < 1, bleu ≥ 1,5) comme le ratio 5 / 10 j des
  ±4 % ; toucher = industries entrées dans la fenêtre et toujours au-dessus de 1 ; bulle : repère IWM recalculé à chaque chargement. Séance = celle survolée sur un graphique de
  l'onglet, sinon « Stats du » ; séries précalculées une fois par fichier. Toucher une case = raccourci (filtre TI65 > 1,
  industries entrées au-dessus de 1, tri % > 1), second toucher = retour au classement. **Une seule case active à la fois** :
  toucher une case annule l'effet de la précédente (`skMode`, `skToggle`). **Flux par secteur** (toucher la case
  Rotation) : entrées / sorties regroupées par secteur, résumé « ↑ 3 premiers · ↓ 3 premiers », puis blocs « L'argent arrive » /
  « L'argent repart » / « se compensent » ; toucher un secteur ouvre ses industries. La case Rotation affiche ↑ / ↓ à la place de la jauge.
- **ADR 20 j sur toutes les listes de tickers** (`config/display.toml [adr]`) = 100 × (moyenne des 20 dernières séances de plus
  haut ÷ plus bas − 1) : Secteurs, niveau actions (calcul depuis l'OHLC du fichier de l'industrie, à la séance du classement ; filtre
  « ADR > x % » `mm.adrmin`, tri dans « Classer par ») ; onglet Tickers (colonne `adr` de `tickers_data.js`, calculée par
  `fetch_industries.py` pour toutes les actions US) ; Post-market (bougies Yahoo du scan, à la séance du scan, sinon l'index) ;
  fiche standard. « — » sans plus haut / plus bas sur toute la fenêtre. Bouton Copier (tickers affichés, ordre et filtres) : scan
  post-market, actions de Secteurs, onglet Tickers (`copyTickers`). Ratio 10 j : plus affiché nulle part (données gardées).
- **Ordre de l'onglet Secteurs**, une seule page (choix de l'utilisateur, 20/10/2026 : pas de sous-vues) : **cases** (point
  d'ancrage, jamais repliées), **frise des phases** en séparateur (bordures haut et bas ; titre = phase de la séance, depuis
  combien de séances, setups recommandés ; `#secKpiNote` = séance ; survol = aperçu, clic = « Stats du »), flux par secteur (au
  toucher de la case Rotation), **Breakouts 9M +4 %** (`mm.fold.bo`), **Groupes actifs** (ordre inversé le 31/10/2026), **Carte des thèmes** (`mm.fold.map`), **Classement** (liste et graphique) :
  ordre par défaut, que l'utilisateur change par glisser-déposer (exception au gel du 27/10/2026) : poignée ⠿ (`.dragh`,
  `data-drag`) en tête de ces 4 blocs, au pointeur (souris, doigt) ou aux flèches ↑ ↓ ; ordre mémorisé (`mm.secorder`,
  `SEC_BLK` / `applySecOrder` / `moveSec`), carte de rotation toujours en fin d'onglet ; test `tests/node/25_secteurs_ordre_blocs.js`. Retours UX du 27/10/2026 (règles NN/g :
  divulgation progressive, design minimaliste) : Groupes actifs et Classement se replient (titre à chevron, résumé d'une ligne ;
  `mm.fold.act`, `mm.fold.list`) ; un seul écart entre blocs (`--blk` : 16 px, 12 px sur mobile), 8 px dans un bloc ; consignes
  dans les bulles ⓘ. Côte à côte, la liste finit à la hauteur de la colonne de droite (`fitSecLayout`).
  **Plus de bascule ETF / TradingView** (27/10/2026) : l'ETF est un niveau au bout du fil (`data-etf`, retour par « ‹ Leaders
  actifs », `data-tvback`) ; `secView` reste l'état interne ; cases, frise et Groupes actifs restent affichés au niveau ETF. La
  bascule unique de la mise à jour (`mm.secrefonte`) ouvre la vue TradingView, niveau Leaders actifs.
  **Carte de rotation retirée de la page** (`config/display.toml [sectors.rrg] shown = false`, réversible ; code et test 21
  gardés) : aucune avance mesurée (tests 13-14).
- **Groupes actifs** (refonte du 27/10/2026 ; tests 5 à 16 du document d'analyse, sur 2019-2026) : le robot écrit, par industrie,
  les leaders par séance (`l` : actions à +`gain_pct` % sur `sessions` séances, `config/industries.toml [leaders]`) et la **grappe**
  (`g` : au moins `grappe_min` leaders et une part ≥ `grappe_ratio` × celle de l'univers) ; les **thèmes** de `config/themes.toml`
  (panier suivi comme une industrie ; `h` = au moins `theme_share_pct` % du panier leader) ; la **liste des leaders** des
  `list_sessions` dernières séances. Le navigateur en déduit, à la séance des cases : **chaud** (règle de l'onglet Tickers, seuil du
  top 20 % calculé sur les industries seules), **neuf** (signal parti depuis au plus `neuf_window` séances, sans signal ni état
  chaud dans les `fresh_sessions` d'avant), l'information « s'essouffle » (au survol) et les 9M du groupe (`nine_*`) (`config/display.toml [sectors.actifs]`).
  Bloc à l'écran : une ligne d'état (phase, setups recommandés, alerte en pastille), une ligne « Sur `trend_sessions` s » qui
  montre ce qui change (phase, chauds, neufs, leaders, groupes qui s'essoufflent : biais de statu quo, « voir à temps qu'il faut
  lever le pied » ; des faits, pas de consigne), puis des cartes d'une ligne (nom, « thème », 9M « n · part % », leaders ; s'essouffle et
  famille refuge au survol) : tous les neufs, les Réveils, les `chauds_shown` chauds qui ont le plus de 9M puis de leaders, le reste derrière « + N autres ».
  **Lien avec la carte de rotation** : au niveau secteurs, pastille du nombre d'industries actives par secteur (couleur Neuf s'il y
  en a une) ; au niveau industries, anneau ; tableau « Depuis la veille » : état Neuf / Chaud devant les industries actives ;
  toucher un point : ses groupes actifs en boutons (leurs leaders).
  Niveau **Leaders actifs** de la vue TradingView (`tvNav.lvl = 'act'`) : leaders des groupes neufs ou chauds, rang = ordre du gain
  sur 21 séances, `list_limit` lignes puis « + N autres », graphique et fiche comme le niveau actions (fichiers d'industrie
  chargés à la demande). Ce qui tient sur les deux périodes : la grappe (53 % devant le marché à 42 séances), les thèmes pour les
  groupes dilués, le tri ; ce qui ne tient pas (« neuf » comme gage de performance, âge, étirement) reste affiché comme
  information. Ancien `industries_data.js` sans ces champs : bloc, case et niveau absents (repli sur Secteurs).
- **Breakouts 9M +4 %** (Secteurs, sous Groupes actifs ; exception au gel du 27/10/2026) : scan TC2000 de l'utilisateur
  (C / C1 ≥ 1,04, V > 8,9 M, V > V1 ; `config/sources.toml [tv_breadth.breakouts]`) appliqué par `fetch_tv_breadth.py` au relevé
  du soir (aucune requête de plus) ; `keep_sessions` séances gardées dans `tv_breadth_data.js` (clé `breakouts`, colonnes
  `bo_columns`). TradingView n'a pas d'historique de ce scan : la liste commence au premier relevé (27/10/2026). Sans séance choisie,
  le bloc montre le **dernier relevé** (le soir, avant la séance Polygon des cases, avec la mention) ; séance choisie ou survolée :
  sa liste. ★ = leader actif (groupe neuf ou chaud) de la séance ; toucher un titre = sa fiche dans Tickers (liste envoyée),
  « Tickers » / « Copier » = toute la liste. Condition TC2000 « Price History > 0,8 » = clôture > 0,80 $
  (`min_price = 0.8`, sens confirmé le 27/10/2026) ; volumes TradingView ≠ TC2000 : la liste peut différer un peu. Comme TC2000
  (choix de l'utilisateur du 27/10/2026), la liste ajoute les ADR (`dr`) et les ETF (`fund/etf`), CBOE compris (`extra`,
  `extra_exchanges`) : le relevé les demande au screener, mais T2108 et ±4 % restent sur les actions ordinaires des bourses de
  `[tv_breadth]` (`common()`). Contrôle du 27/10/2026 : 62 titres sur 62 de la liste TC2000 finale, même ordre, ON en plus.
  **Repères** (31/10/2026, tests hors dépôt 2008-2025 : bougie forte + 9M = 41 % de +8 % en 5 séances contre 32 %, 18 années sur
  18) : le même relevé demande `high`, `low`, `high[1]`, `low[1]`, `ADR` (TradingView, 14 j, en $) et `Perf.W` ; chaque titre reçoit
  `pos` (clôture dans la bougie, 0-100), `rr` (range ÷ ADR), `rp` (range ÷ range de la veille), `w` (semaine, %) : valeurs brutes,
  seuils dans `[tv_breadth.breakouts]`. Le front range la liste en trois couloirs (bougie forte pas étendue, bougie forte étendue,
  bougie faible repliée : `boWeak`), dessine une mini-bougie (`boCdl`) et ajoute « +X % sem. » et « 9M ×n » (listes gardées des
  `repeat_sessions` séances d'avant). Listes d'avant le 31/10/2026 (sans repères) : grille d'origine. Test : `tests/node/24_secteurs_breakouts_9m.js`,
  `tests/test_tv_breadth.py`.
  **Volume en dollars** (exception au gel du 27/10/2026) : colonne `dvol` (clôture × volume du jour, 5e de `bo_columns` ; absente
  des listes d'avant) ; ordre de la liste = `sort` (`"dvol"` : du plus haut au plus bas, choix de l'utilisateur ; `"pct"` : hausse),
  montant sur chaque pastille. Envoyée vers Tickers, la liste garde sa séance (`mm.tkbo`) : colonne **Vol $** (tri par défaut,
  aussi au chargement), filtre « Vol $ > x M$ » (`mm.tkdvmin`, pas `display.toml [tickers] dvol_step` ; un ticker hors de la
  liste est masqué quand le filtre est actif) ; sur mobile, Vol $ remplace Days to cover (dans la fiche). « Effacer » retire
  colonne et filtre ; une liste tapée sans ticker du scan n'en a pas. Test : `tests/node/26_tickers_volume_dollars.js`.
  **Niveau « Breakouts 9M » du Classement** (demande du 27/10/2026, sur le modèle de Leaders actifs) : bouton du fil
  (`data-bo`, `short_label`) et du bloc (« Breakouts 9M (N) › », `data-bogo`) ; toucher un titre du bloc l'ouvre dans ce niveau.
  `boLevel()` : liste du dernier relevé (ou de la séance de « Stats du »), même ordre que le bloc (rang = cet ordre), colonnes
  Vol $ / % jour / Volume (`dv`, `pbo`, `bvol`) / Industrie / ADR, tri mémorisé (`mm.tvsort.bo`) ; graphique et fiche à droite :
  cours du fichier de l'industrie de chaque action (index Tickers chargé à la demande, `tkRow`, fichier « hors filtres » si
  besoin). La bougie de la séance du scan arrive le lendemain matin (Polygon) ; ETF et ADR : dans la liste, sans graphique.
  Test : `tests/node/27_secteurs_classement_9m.js`.
- **Frise temporelle** (Secteurs / TradingView, sous les cases) : bande des phases de marché seule (demande du 27/10/2026 ; la
  courbe Industries TI65 > 1 est retirée, la case du même nom la donne) ; survol souris ou
  glisser au doigt = cases, flux et carte de rotation à cette séance (aperçu, comme le survol du MM) ; clic ou doigt levé = la
  séance devient celle de « Stats du » (`showDate`, le classement suit). `touch-action: pan-y` : la page défile toujours à la verticale.
- **Carte de rotation** (retirée de la page le 27/10/2026, `shown = false` ; description gardée pour une réactivation) (type RRG, Secteurs / TradingView) : chaque secteur (ou industrie du secteur filtré) placé par sa force
  relative au **marché** (x = 100 × TI65 de indice ÷ marché) et son accélération (y = 100 × x / x d'il y a `momentum` séances),
  traînée sur `trail` séances, taille = volume en dollars relatif au marché ; zones Meneur / S'affaiblit / En retard / S'améliore
  (`config/display.toml [sectors.rrg]`). Marché = série `stocks.c` de `industries_data.js` (indice équipondéré de toutes les actions
  retenues) ; ancien fichier : indices des secteurs pondérés par leur nombre de titres (« marché approché »). Volume en dollars
  relatif `rv` (secteurs, industries, marché) : `config/industries.toml [volume]` (5 / 50 séances), calculé par `fetch_industries.py`
  (+30 Ko compressés). Pleine largeur (hauteur = moitié de la largeur, plafonnée) ; repliée par défaut sur mobile (`mm.rrg`).
  **Ordre** : tableau « Depuis la veille » (périmètre écrit dans son en-tête), puis fil « ‹ Secteurs › … » et tickers juste
  au-dessus du dessin (le fil décrit la carte, pas le tableau ; retour du 21/10/2026).
  **Arbre** : la carte suit le niveau de la liste (secteurs → industries d'un secteur → actions d'une industrie, clôtures du
  fichier de l'industrie, volume relatif recalculé), fil « ‹ Secteurs › secteur › industrie » pour remonter. **Survol** : point
  et traînée (datée) en avant, les autres atténués. **Tickers** (champ au-dessus, `mm.rrgtk`, index `tickers_data.js` chargé à
  la demande) : secteurs / industries / actions des tickers en avant ; pastille = descente jusqu'à l'industrie du ticker.
  **Tableau « Depuis la veille »** (au-dessus de la carte, demandes du 21/10/2026 : « repérer les changements majeurs assez
  rapidement », « confirmer un secteur hot et donner des pistes sur le prochain » ; remplace la liste « plus gros mouvements », son
  bouton et le choix 1 j / 5 j). **Au niveau secteurs de la carte, il liste les industries de tout le marché** (secteur et nombre
  de titres sous le nom ; leurs secteurs mis en avant sur la carte ; toucher = son secteur en avant et « Ouvrir › » sous la carte,
  à nouveau = l'industrie s'ouvre, ses actions ; `rrgTabInd` / `rrgTabHot` / `rrgOpenInd`). Vue propre dans un secteur ou une
  industrie (`rrgViewIn`, `mm.rrgviewin`, `default_view_in` = Tous : Pistes y filtrait presque tout, retour du 21/10/2026), parce que le repère mesuré trouve un signal au niveau des industries
  et pas des secteurs ; aux niveaux industries et actions, il suit la carte. Séance affichée comparée à e − `delta_windows[0]` et e − `delta_windows[1]` (suit la frise et
  l'arbre). Colonnes : nom (pastille de zone), zone (« avant → après » si elle change, « limite » à moins de `zone_margin` de l'axe
  franchi), force relative + mini-courbe sur `trail` séances, TI65 seul (sans le marché), Δ courte, Δ longue, largeur (secteur :
  industries au TI65 > 1 « 3/4 +2 −1 » = entrées / sorties de la rotation sur `[sectors.kpis] rotation_window`, mêmes chiffres
  et mêmes séries précalculées (`secKpiData().iser` / `.rot`) que le flux par secteur ; industrie : part des actions > 1, série `b`, et
  sa variation en points ; actions : « — »), volume relatif. Colonne **Depuis** (vues Pistes et Confirmés) : séances consécutives dans l'état, jusqu'à
  `streak_max` (`rrgStreak`, états mis en cache par périmètre et par séance dans `RRD.st`). Vues (`mm.rrgview`, `default_view` =
  Pistes à la première visite) : **Confirmés** (Meneur,
  TI65 seul > `confirm_ti65`, part des membres > 1 ≥ `confirm_breadth`, Δ longue > 0, tri force relative ; « s'essouffle » =
  accélération en baisse sur la fenêtre longue), **Pistes** (force relative ≤ `pistes_max_rs`, Δ longue > 0, accélération en hausse,
  largeur qui s'élargit, tri persistance, élargissement puis Δ longue ; puis « surveillance » = En retard dont la baisse ralentit),
  **Changements** (mouvements « forts » = déplacement ≥ `major_factor` × médiane de la séance, puis bascules, « limite » en
  dernier), **Tous** (lien sous le tableau, tri force relative). `table_rows` lignes puis « Voir les N autres ». Explications dans des bulles ⓘ placées là où elles servent (demandes du
  21/10/2026 : rien sous le tableau, et pas tout au même endroit) : titre, chaque bouton de vue, chaque en-tête de colonne, lien
  « Tous » (`skpi:rt…`, textes `rrgNotes` qui suivent le niveau affiché). Libellés des vues et étiquettes : `views` / `tags`. **Repère mesuré** (bulles Confirmés et Pistes, demande du 21/10/2026) :
  `rrgMeasure` rejoue `rrgRows` (la fonction des lignes du tableau, partagée) sur chaque séance de l'historique au niveau des
  industries, puis donne la force relative `measure_sessions` séances plus tard (moyenne, nombre de cas, % en hausse) face à toutes
  les industries, les Pistes présentes depuis au moins `measure_streak` séances à part, et la part des Pistes passées en Confirmés (des « surveillance » passées en Pistes ou Confirmés) ; une fois par
  fichier (`RRD.meas`).
  Lignes atteignables au clavier (Tab, Entrée / Espace = toucher). Séance sans historique sur la carte : tableau vidé. Repliable seul (« ▾ Depuis la veille », `mm.rrgtab`, demande du 21/10/2026 :
  réduire le tableau sans réduire la carte) : replié, l'en-tête et les vues restent et pilotent toujours la mise en avant sur la carte. Les
  lignes de la vue sont mises en avant sur la carte (traînée épaissie, flèche, nom écrit), les autres en
  retrait ; mobile : zone sous le nom, colonnes force relative et zone masquées. Toucher une ligne = mettre en avant, à nouveau =
  ouvrir. Priorité : survol > tickers > vue du tableau. Toucher un point : détail ; à nouveau : ouvre le secteur / l'industrie. « Actions TI65 > 1 » = série `stocks` de `industries_data.js`, calculée par
  `fetch_industries.py` (le navigateur ne charge pas les fichiers des 127 industries) ; absente d'un ancien fichier : case masquée.
  Mise en page des cases comme le MM : une ligne sur bureau, 3 colonnes sous 1 100 px, 2 sous 640 px (pas de défilement
  horizontal, demande du 20/10/2026) ; sous-titres courts (« +14 / −6 »), le détail est dans la bulle ⓘ.
- Vue TradingView sur mobile (≤ 640 px) : les colonnes Δ 5 j et « % > 1 » sont masquées ; la rangée **« Classer par »**
  (TI65 · Δ 5 j · % > 1, Cap. au niveau des actions) trie à leur place, même état que les en-têtes, et la ligne sous l'écart
  montre la valeur du tri actif. Tri mémorisé par niveau (`mm.tvsort.<sec|ind|stk>`). Trier par Écart ou 3 mois = même ordre
  que le rang (Écart = TI65 − 1), d'où l'absence de ces choix (décision du 20/10/2026).
- Vue TradingView : composition (titres retenus) figée par séance : les passages suivants de la même séance la reprennent
  des fichiers publiés (restaurés du cache `generes-` ou du site) sans réinterroger TradingView (`--rescan` pour forcer). Fichiers d'industrie chargés avec `?v=<séance>`.
- Vue TradingView : **secours** si TradingView ne répond pas (muet, vide, liste tronquée) : la dernière composition publiée
  (`tickers_data.js`) est reprise avec les clôtures du jour (`comp.fallback`, signalé dans l'onglet Tickers) ; le passage suivant
  réessaie. Sans composition publiée (ni cache ni site joignable) : arrêt, fichiers non modifiés.
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
- Vue TradingView : historique = les `config/industries.toml [output] sessions` dernières séances du cache Polygon (190 ≈ 6 mois de TI65 ; cache
  allongé à 490 séances le 28/10/2026 pour le breadth maison, sans effet sur la vue ; au plus `max_downloads` = 100 séances téléchargées par passage, ≈ 20 min) ; composition des
  secteurs / industries = celle du jour, appliquée à tout l'historique ; TradingView ne fournit aucun historique d'industrie
  (indices recalculés ici, ils ne reproduisent pas la variation affichée par TradingView, pondérée par capitalisation).
  Pas encore copiée dans le stockage historique (branche `data`).
