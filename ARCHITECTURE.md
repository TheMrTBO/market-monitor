# Architecture du Market Monitor

> **À lire en premier** (humain ou LLM) pour se repérer et reprendre le contexte. Document court et à jour : toute
> modification de structure (fichier, flux, config, workflow, stockage) le met à jour **dans la même PR**.
> Ordre de lecture : ce fichier → `CLAUDE.md` (règles de travail) → `config/` (paramètres) → `RECAP_PROJET.md` (historique
> détaillé des décisions, pièges) → `AUTOMATISATION.md` (exploitation GitHub, cron-job.org).

## 1. En une phrase
Tableau de bord statique (GitHub Pages, https://themrtbo.github.io/market-monitor/) du marché US : breadth (Stockbee + calcul
maison), QQQ / IWM / BTC, T2108, VIX, classement de 55 ETF sectoriels, scan post-market TradingView. Les données sont
récupérées par des workflows GitHub Actions déclenchés par **cron-job.org**, contrôlées, commitées, puis publiées.

## 2. Carte des fichiers
| Fichier / dossier | Rôle |
|---|---|
| `config/*.toml` | **Source unique des paramètres** (voir §4). Jamais de paramètre métier en dur ailleurs. |
| `mmconfig.py` | Lit et valide `config/` ; génère `config_data.js` pour le front (`--js`) ; contrôle la cohérence (`--check`). |
| `config_data.js` | **Généré** (`python mmconfig.py --js`) : `window.MM_CONFIG`. Ne pas éditer. |
| `update_all.py` | Orchestrateur : lance les étapes de `config/sources.toml`, contrôle chaque fichier, restaure l'ancien si invalide, écrit `status_data.js`. |
| `fetch_stockbee.py` · `breadth_own.py` · `fetch_vix.py` · `fetch_prices.py` · `fetch_sectors.py` · `fetch_postmarket.py` | Une source chacun → un fichier `*_data.js`. |
| `fetch_history.py` · `fetch_data.py` | Historique des clôtures Polygon (cache Actions, hors dépôt) pour le calcul maison ; client Polygon. |
| `mm/store/` | **Stockage historique** (phase 3) : interface `Store` (upsert idempotent, read, latest), backend `git_csv`, conversion des `*_data.js` (`importers.py`), synchronisation vers la branche `data` (`sync.py`), CLI `python -m mm.store import|sync|check|stats`. |
| `data-store/` | Branche orpheline **`data`** extraite localement (`git worktree`, ignorée sur `main`) : CSV de l'historique. |
| `validate_data.py` | Contrôles de cohérence par source (fraîcheur lue dans `config/sources.toml`, bornes de valeurs dans le code). |
| `*_data.js`, `status_data.js` | Données publiées (variables globales `window.X`), commitées par le robot sur `main`. |
| `stockbee_dashboard.html` | **Tout le front** (HTML + CSS + JS, canvas, aucune librairie) ; ~3 100 lignes, découpage prévu (phase 4). |
| `.github/workflows/update.yml` | Mise à jour complète + publication. |
| `.github/workflows/postmarket.yml` | Scan post-market seul + publication si changement. |
| `.github/workflows/ci.yml` | Tests sur chaque pull request. |
| `tests/` | `run_all.sh` (tout) : config, syntaxe YAML des workflows, 16 tests Node (dashboard en DOM simulé), 5 tests Python (dont `test_store.py`, `test_store_sync.py`). |
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
  navigateur : stockbee_dashboard.html charge config_data.js + *_data.js (?v=horodatage pour casser le cache)
```
Concurrence : les deux workflows partagent le groupe `market-monitor` (jamais deux écritures simultanées).

## 4. Configuration (`config/`)
| Fichier | Contenu | Lu par |
|---|---|---|
| `market.toml` | fuseau, heures de clôture / fin du post-market / début du pre-market | robot, front |
| `schedule.toml` | expressions cron (cron-job.org) et créneaux GitHub de secours, par workflow | front (prochaine mise à jour), `--check` (compare aux workflows) |
| `sources.toml` | étapes du robot : script, fichier, essais, attentes, libellés, **fraîcheur** | `update_all.py`, `validate_data.py`, front |
| `postmarket.toml` | filtres du scan (prix, volume, variation), limites, séances gardées, liens de la fiche (TradingView, News Benzinga, Dépôts SEC), étiquettes de suivi (`[[tags]]`) | `fetch_postmarket.py`, front |
| `sectors.toml` | univers des ETF : symbole, nom, groupe, origine, libellé court, description | `fetch_sectors.py`, front |
| `display.toml` | seuils du breadth, T2108, repères VIX, couleurs, filtres Secteurs, traductions | front |
| `datasets.toml` | **modèle logique** : jeux de données (= futures tables SQL), clé primaire, colonnes typées, partition | `mm/store/` |
| `storage.toml` | `serving` (ce que lit le site : `js_files`) et `[store]` (historique : backend `git_csv`, dossier, branche) | `mm/store/` |
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

### Données personnelles du navigateur (jamais dans le dépôt)
Clés `perso.*` du stockage local, hors `mm.*` : le bouton « Réinitialiser » des Réglages ne les efface pas.
- `perso.recap` : lien de la page privée du récap news (Réglages).
- `perso.suivis` : titres suivis de l'onglet Post-market, un par couple titre + séance. Format prêt pour une synchronisation
  (dépôt GitHub privé prévu après la phase 3c) : `{ v: 1, up, items: { "LQDA|2026-10-13": { s, d, tag, note, at, up, n, c, pc, pch } } }` ;
  un retrait garde une trace `{ s, d, del: true, up }` pour que la fusion entre appareils ne le fasse pas réapparaître.
  Limite : graphique et « Depuis » seulement pour les titres du dernier scan (`hist` du robot).

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
- **Changer un seuil, un filtre, une heure** : le fichier de `config/` concerné → `--js --check` → tests.
- **Changer un horaire** : `config/schedule.toml` + workflow (`github_fallback`) + cron-job.org (à la main) + `AUTOMATISATION.md`.
- **Ajouter une source** (ex. Benzinga) : script `fetch_x.py` → fichier `x_data.js` ; étape `[[step]]` dans `config/sources.toml`
  (avec `freshness`) ; contrôle `check_x` dans `validate_data.py` ; chargement dans le front ; copie dans `_site` des deux
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
Gel des nouvelles fonctions (Benzinga, pre-market) jusqu'à la phase 3. Détail : proposition privée de l'utilisateur
(hors dépôt) ; résumé ici.

## 8. Paramètres encore en dur (connus, à migrer)
- Bornes de valeurs des contrôles (`validate_data.py` : ex. 0-5 000 titres, VIX 5-150) → déclarées par source en phase 2.
- Liste des fichiers copiés dans `_site` (deux workflows) et chargés par le front → générée par `build.py` en phase 3.
- Constantes d'interface du graphique (marges, préréglages 3M…5A, longueur de pente) dans le front → phase 4.
- Constantes d'interface des onglets Secteurs / Post-market : seuil « liste et détail empilés » (`isStacked`, ≤ 1000 px),
  seuils du balayage entre titres (60 px, horizontal ≥ 2 × vertical, < 700 ms) → phase 4.
- `fetch_data.py` (univers Polygon, âge max du cache), `breadth_own.py` (formules TC2000 : ne pas modifier sans accord).

## 9. Pièges principaux (détail : `RECAP_PROJET.md` §9)
- Planification GitHub non fiable (créneaux sautés, jusqu'à 3-5 h de retard) → cron-job.org.
- Yahoo renvoie le soir la bougie du jour sans clôture → étape « en retard », version précédente gardée (pas un échec).
- TradingView vide les champs post-market pendant la séance régulière ; données différées de 15 min.
- `?v=` doit être numérique pour que le chargeur casse le cache des fichiers de données (cache Pages 10 min).
- Ne pas utiliser « Re-run » d'une ancienne exécution (rejoue l'ancien workflow) : « Run workflow ».
