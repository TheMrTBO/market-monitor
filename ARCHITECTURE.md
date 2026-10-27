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
| `fetch_tv_breadth.py` | T2108 (champ SMA40) et **±4 % du jour** (formule TC2000 de `breadth_own.count_breadth`, appliquée à close / close[1] / volume / volume[1]) relevés sur le screener TradingView (actions ordinaires des 3 bourses) → `tv_breadth_data.js`, un relevé par séance ; même relevé, **liste « 9M +4 % »** de l'onglet Secteurs (clé `breakouts` : tickers par séance, `[tv_breadth.breakouts]`) (TradingView n'a pas d'historique de cet agrégat ; série depuis le 20/10/2026). Séance = date de la bougie journalière (juste un jour férié) ; refusé en séance, en pre-market et pendant le différé de 15 min. Lancé par `update_all.py` et par `postmarket.yml` (dès la fin de séance). |
| `fetch_industries.py` | Vue TradingView de l'onglet Secteurs : classification du scanner TradingView + cours Polygon du cache → `industries_data.js` (indices équipondérés des secteurs et industries, affichés en courbe de tendance ; % de titres au TI65 > 1 ; même % pour toutes les actions retenues, série `stocks`) et `industries/<industrie>.js` (actions retenues, OHLC, chargé à l'ouverture d'une industrie) et `tickers_data.js` (toutes les actions US, retenues ou non : secteur, industrie, cap, flottant, TI65, rang dans l'industrie ; onglet Tickers ; sert aussi de composition publiée et de secours si TradingView ne répond pas). |
| `config/themes.toml` | Thèmes suivis de l'onglet Secteurs (refonte du 27/10/2026) : un panier d'actions par thème, suivi comme une industrie (indice, TI65, largeur, leaders) ; liste de départ = paniers des tests 2024-2026, **à valider par l'utilisateur**. |
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
| `tests/` | `run_all.sh` (tout) : config, syntaxe YAML des workflows, 24 tests Node (dashboard en DOM simulé), 9 tests Python (dont `test_industries.py`, `test_short.py`, `test_tv_breadth.py`, `test_store.py`, `test_store_sync.py`, `test_generated.py`). |
| `tests/fixtures/` | Copie figée des fichiers générés lue par les tests (`tests/node/lib/fixtures.js` redirige les lectures ; ~2 Mo, une fois) : mêmes résultats en local et en CI. Format changé dans `fetch_industries.py` → `python tests/make_fixtures.py` (`test_generated.py` le signale). |
| `breadth_long.py` | Exploration non versionnée (ignorée). |

## 3. Flux
```
cron-job.org (heure exacte, UTC)  ─┐            créneaux `schedule` GitHub (secours, souvent en retard)
                                   ▼                         │
  workflow_dispatch → update.yml : fetch_history.py → update_all.py (étapes de config/sources.toml) ─┐
                    → postmarket.yml : fetch_postmarket.py, fetch_tv_breadth.py ─────────────────────┤
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
| `sources.toml` | étapes du robot : script, fichier, essais, attentes, libellés, **fraîcheur** ; `[tv_breadth]` (relevé TradingView) et `[tv_breadth.breakouts]` (scan 9M +4 % : hausse, volume, volume en hausse, prix minimum, séances gardées, limite d'affichage ; lu aussi par le front) ; `[history]` : profondeur de l'historique Polygon (séances, gardées, appels/min) | `update_all.py`, `validate_data.py`, `fetch_history.py`, front |
| `postmarket.toml` | filtres du scan (prix, volume, variation), limites, séances gardées, lien de la fiche (`[[links]]` : Finviz ; `{sym}`, `{symd}`, `{tv}`) | `fetch_postmarket.py`, front |
| `sectors.toml` | univers des ETF : symbole, nom, groupe, origine, libellé court, description | `fetch_sectors.py`, front |
| `industries.toml` | vue TradingView : requête du scanner (marché, type, bourses, limite de lignes), filtres des actions retenues (sous-type, prix, volume moyen, capitalisation), indice (base, plafond des variations, titres minimum / « peu de titres »), volume en dollars relatif (`[volume]`), leaders et grappes des groupes actifs (`[leaders]`), séances par action, dossier, unité des volumes | `fetch_industries.py`, `validate_data.py`, front |
| `themes.toml` | thèmes suivis (`[[theme]]` : nom, tickers, ETF de confirmation facultatif ; au moins `[index] min_members` symboles) | `fetch_industries.py` (`mmconfig.themes()`), front (noms), `--check` |
| `display.toml` | `[adr]` : fenêtre de l'ADR des listes de tickers (lu aussi par `fetch_industries.py`) ; `[tickers]` : règle des thèmes chauds / émergents, limite de la liste ; seuils du breadth, T2108, contrôle croisé avec Stockbee (`compare_sessions`, `compare_min`), sources dont le T2108 déclenche l'alerte, étiquettes de source, repères VIX, couleurs, filtres de l'onglet Secteurs et leur bulle (`group_tips`), cases de la vue TradingView (`[sectors.kpis]`, dont `th` : thèmes chauds), groupes actifs et Leaders actifs (`[sectors.actifs]` : fraîcheur, fenêtre du neuf, limite de la liste, pionniers, phases d'alerte, familles refuges, libellés), carte de rotation (`[sectors.rrg]` : repliée `folded`, traînée, momentum, tableau « Depuis la veille » `delta_windows` / `major_factor` / `zone_margin` / `table_rows` / `confirm_ti65` / `confirm_breadth` / `pistes_max_rs` / `views` / `tags` / `measure_sessions` / `measure_streak` / `streak_max` / `default_view`), bascule ETF / TradingView, phases de marché `[phases]` (seuils de la spec, signaux, `[[phases.phase]]` : nom, couleur, setups, précision, règle ; `[[phases.signal]]`), indicateur `[ti65]` (nom, fenêtres 7 / 65, miniature `spark` = 63 séances ≈ 3 mois, fenêtre du Δ `delta`, repère `breadth_ref` de la carte « % > 1 » ; `--check` vérifie `spark + long − 1` ≤ `stock_sessions` ≤ `sources.history.sessions`), traductions | front, `fetch_industries.py` (`ti65`) |
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
« Breakouts 9M +4 % » de l'onglet Secteurs (scan TC2000 de l'utilisateur, voir §9). Détail : proposition privée de l'utilisateur
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

## 9. Pièges principaux (détail : `RECAP_PROJET.md` §9)
- **Phases de marché** (onglet MM, spec du 26/10/2026, `config/display.toml [phases]`) : une phase par séance **publiée par
  Stockbee** (`STOCKBEE.rows`, jamais le complément maison : seuils réglés sur l'univers Worden, pas d'univers dans le calcul
  maison), calculée une fois au chargement (`PHASES`). Priorité : choc > surchauffe > expansion chaude > expansion A / B / C >
  reprise > lessivage > contraction ; état de fond expansion / contraction après `confirm` clôtures de mq de l'autre côté de 1.
  Surchauffe **sans hystérésis** (décision du 26/10/2026 : mesure faite, gardée pour plus tard). **Reprise sur le ratio 5 j**
  ≥ `rep_r5` dans les `rep_window` séances après un lessivage (note du 26/10/2026 : le ratio 10 j de Stockbee n'avait jamais été
  testé ; 21 épisodes au lieu de 5 depuis 2019, reprise ≈ 9,5 % des séances au lieu de 2 %). **mq sur 20 séances = réglage
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
  figure pas (case juste en dessous). Séance
  pas encore publiée par Stockbee : phase de sa dernière séance, avec la mention. Mobile (≤ 640 px) : compact (phase et setups),
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
  ±25 % seulement le lendemain matin, par Polygon). L'**alerte d'extrême du T2108** (case orange, records 3 mois)
  n'existe que sur un chiffre Stockbee : notre T2108 a un biais de niveau (univers ≈ 5 150 titres contre ≈ 6 550 chez Worden). Contrôle
  croisé (corrélation, écart moyen, sur `config/display.toml [breadth] compare_sessions` séances) : pied de page et bulles ⓘ.
  Sur l'onglet SA, trait plein = Stockbee seul ; la variation du T2108 se calcule dans la même source (pas de faux saut).
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
  toucher de la case Rotation), **Groupes actifs**, **Breakouts 9M +4 %** (`mm.fold.bo`), **Classement** (liste et graphique). Retours UX du 27/10/2026 (règles NN/g :
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
  chaud dans les `fresh_sessions` d'avant), **pionniers** et l'information « s'essouffle » (`config/display.toml [sectors.actifs]`).
  Bloc à l'écran : une ligne d'état (phase, setups recommandés, alerte en pastille), une ligne « Sur `trend_sessions` s » qui
  montre ce qui change (phase, chauds, neufs, leaders, groupes qui s'essoufflent : biais de statu quo, « voir à temps qu'il faut
  lever le pied » ; des faits, pas de consigne), puis des cartes d'une ligne (nom, signes ⚑ s'essouffle / ◆ refuge / thème, leaders ;
  détail au survol) : tous les neufs, les `chauds_shown` chauds qui ont le plus de leaders, le reste derrière « + N autres ».
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
  (`min_price = 0.8`, sens confirmé le 27/10/2026) ; volumes TradingView ≠ TC2000 : la liste peut différer un peu. Test : `tests/node/24_secteurs_breakouts_9m.js`,
  `tests/test_tv_breadth.py`.
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
- Vue TradingView : historique limité au cache Polygon (`config/sources.toml [history] sessions`, 190 ≈ 6 mois de TI65 ; au plus `max_downloads` = 100 séances téléchargées par passage, ≈ 20 min) ; composition des
  secteurs / industries = celle du jour, appliquée à tout l'historique ; TradingView ne fournit aucun historique d'industrie
  (indices recalculés ici, ils ne reproduisent pas la variation affichée par TradingView, pondérée par capitalisation).
  Pas encore copiée dans le stockage historique (branche `data`).
