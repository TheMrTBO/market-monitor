# Market Monitor — consignes de travail

Lis d'abord **`RECAP_PROJET.md`** (état, architecture, décisions, pièges, plan des prochains travaux), puis
`AUTOMATISATION.md` pour le pipeline GitHub.

## Règles
- Langue : **français**. Réponses concises ; après toute modification, un récapitulatif : fichier · ce qui change · pourquoi.
- **Dépôt public** : ne jamais committer de secret, de clé API, de `.env`, de chemin local, d'e-mail personnel ou de donnée
  du dossier parent `21StudentSearch`. Identité Git de ce dépôt : `TheMrTBO <37185398+TheMrTBO@users.noreply.github.com>`
  (config locale ; la config globale du Mac contient l'e-mail personnel). Vérifier `git status` et `git log -1` avant un push.
- **Gratuit** : n'introduire aucune dépendance ni source payante sans demander. Pas de changement de source de données
  sans accord de l'utilisateur. Ne pas modifier les formules TC2000 sans accord.
- Toujours `git pull --rebase origin main` avant de modifier (le robot GitHub commit les données sur `main`).
- Avant de publier : `bash tests/run_all.sh` et `python3 validate_data.py` doivent passer.
- Le site est en https (https://themrtbo.github.io/market-monitor/) : **vérifier visuellement** (captures, émulation mobile)
  les changements d'interface ; le rendu n'a jamais été contrôlé à l'écran jusqu'ici.
- Sandbox de Claude : `pip` et l'écriture dans `.git/config` y sont bloqués ; yfinance se lance avec
  `../tradingview-bot/venv/bin/python`. Les actions publiques (push, création de dépôt, changement de visibilité) se font
  seulement sur demande explicite.

## Structure
Front : un seul fichier `stockbee_dashboard.html` (canvas, aucune librairie). Données : `*_data.js` écrits par
`update_all.py`. Tests : `tests/`. Workflow : `.github/workflows/update.yml`.
Calcul maison du breadth : `fetch_history.py` (clôtures brutes + splits, cache hors dépôt) → `breadth_own.py` →
`breadth_data.js`. Clé `POLYGON_API_KEY` : GitHub Secret ou `.env` local, jamais dans un fichier versionné.
