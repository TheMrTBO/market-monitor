# Market Monitor — consignes de travail

Lis d'abord **`ARCHITECTURE.md`** (carte des fichiers, flux, configuration, invariants, recettes, refonte en cours) ;
puis, si besoin d'historique, `RECAP_PROJET.md` (décisions, pièges) et `AUTOMATISATION.md` (GitHub, cron-job.org).

## Règles
- Langue : **français**. Réponses concises ; après toute modification, un récapitulatif : fichier · ce qui change · pourquoi.
- **Dépôt public** : ne jamais committer de secret, de clé API, de `.env`, de chemin local, d'e-mail personnel ou de donnée
  du dossier parent `21StudentSearch`. Identité Git de ce dépôt : `TheMrTBO <37185398+TheMrTBO@users.noreply.github.com>`
  (config locale ; la config globale du Mac contient l'e-mail personnel). Vérifier `git status` et `git log -1` avant un push.
- **Gratuit** : n'introduire aucune dépendance ni source payante sans demander. Pas de changement de source de données
  sans accord de l'utilisateur. Ne pas modifier les formules TC2000 sans accord.
- Toujours `git pull --rebase origin main` avant de modifier (le robot GitHub commit les données sur `main`).
- Avant de publier : `bash tests/run_all.sh` et `python3 validate_data.py` doivent passer (la CI relance les tests sur chaque PR).
- **Aucun paramètre métier en dur** : seuils, filtres, horaires, listes, libellés vont dans `config/*.toml` ; puis
  `python3 mmconfig.py --js --check`. `config_data.js` est généré : ne jamais l'éditer.
- **Toute modification de structure met à jour `ARCHITECTURE.md` dans la même PR** (c'est le point d'entrée des sessions).
- Refonte en cours (décision du 14/10/2026) : pas de nouvelle fonction avant la fin de la phase 3 (voir `ARCHITECTURE.md` §7).
- Le site est en https (https://themrtbo.github.io/market-monitor/) : **vérifier visuellement** (captures, émulation mobile)
  les changements d'interface ; le rendu n'a jamais été contrôlé à l'écran jusqu'ici.
- Sandbox de Claude : `pip` et l'écriture dans `.git/config` y sont bloqués ; yfinance se lance avec
  `../tradingview-bot/venv/bin/python`. Les actions publiques (push, création de dépôt, changement de visibilité) se font
  seulement sur demande explicite.

## Structure
Voir `ARCHITECTURE.md`. En bref : front = `stockbee_dashboard.html` (canvas, aucune librairie) ; paramètres = `config/` lus
par `mmconfig.py` ; données = `*_data.js` écrits par `update_all.py` ; tests = `tests/` ; workflows = `update.yml`,
`postmarket.yml`, `ci.yml` ; déclenchement = cron-job.org (secours : `schedule` GitHub).
Scan post-market : `fetch_postmarket.py` → `postmarket_data.js` (aussi lancé seul par `.github/workflows/postmarket.yml`).
Calcul maison du breadth : `fetch_history.py` (clôtures brutes + splits, cache hors dépôt) → `breadth_own.py` →
`breadth_data.js`. Clé `POLYGON_API_KEY` : GitHub Secret ou `.env` local, jamais dans un fichier versionné.
