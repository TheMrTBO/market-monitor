# Mise à jour automatique gratuite (GitHub Actions + GitHub Pages)

Le dashboard se met à jour **tout seul, sur les serveurs de GitHub**, sans utiliser ton PC, et reste consultable à une
adresse web (ex. `https://TON-PSEUDO.github.io/market-monitor/`).

## Ce qui est automatisé
Chaque jour (week-ends compris, le BTC cote 7 j/7), après la clôture US, le workflow `.github/workflows/update.yml` :
1. lance `update_all.py`, qui récupère : Stockbee (Google Sheet public), VIX (CBOE), QQQ / IWM (Yahoo Finance),
   BTC (Coinbase Exchange), ETF sectoriels (Yahoo Finance) ;
2. enregistre les fichiers de données dans le dépôt (les dernières bonnes valeurs sont conservées si une source échoue) ;
3. republie le site sur GitHub Pages.

Horaires (UTC) : `22:17` et un rattrapage à `05:43` le lendemain. Les week-ends et jours fériés US, seules les données BTC changent. GitHub peut retarder une exécution
de quelques minutes à quelques dizaines de minutes ; c'est normal. Lancement manuel possible à tout moment :
onglet **Actions** > « Mise à jour des données et publication » > **Run workflow**.

## Aucune information privée
- **Aucune clé API, aucun mot de passe, aucun secret** : toutes les sources sont publiques et sans clé.
- Le fichier `.env` (ancienne clé Polygon) est **exclu** par `.gitignore` et ne doit jamais être publié.
  Polygon n'est plus utilisé : tu peux supprimer cette clé sur ton compte Massive / Polygon.
- Ne publie **que ce dossier** (`agents/market-monitor`), pas le projet `21StudentSearch` entier (il contient ton profil,
  ta mémoire projet et tes candidatures).
- Le dépôt étant public, ta **liste d'ETF** (`fetch_sectors.py`) et le dashboard seront visibles de toute personne qui
  connaît l'adresse.

## Mise en place (une seule fois, environ 10 minutes)
1. Crée un compte sur https://github.com (gratuit) et un **nouveau dépôt public** vide, par exemple `market-monitor`.
2. Dans un terminal :
   ```bash
   cd agents/market-monitor
   git init -b main
   git add .
   git status            # vérifie : .env, .venv, cache et .claude ne doivent PAS apparaître
   git commit -m "Market Monitor"
   git remote add origin https://github.com/TON-PSEUDO/market-monitor.git
   git push -u origin main
   ```
3. Sur GitHub : **Settings > Pages > Build and deployment > Source : GitHub Actions**.
4. Onglet **Actions** : si GitHub propose d'activer les workflows, accepte, puis lance une première fois
   « Mise à jour des données et publication » avec **Run workflow**.
5. L'adresse du site apparaît à la fin du job `deploy` (et dans Settings > Pages).

## Surveillance
- En bas du dashboard : « Dernière mise à jour automatique : … » avec la dernière séance de chaque source.
  Une source en échec est signalée par ⚠.
- Si une source échoue, le job est marqué en échec (GitHub t'envoie une notification) mais le site est publié avec les
  dernières données valides.

## Bouton « ↻ Actualiser »
En haut de la page : recharge les **dernières données publiées** en contournant le cache du navigateur (GitHub Pages garde
les fichiers 10 minutes). Il ne lance pas la récupération auprès des sources : celle-ci reste automatique, deux fois par
jour. Pour forcer une récupération immédiate : onglet Actions > « Run workflow ».

## Durcissement
- **Contrôle de cohérence** (`validate_data.py`) : avant d'être conservé, chaque fichier est vérifié (volume minimal,
  fraîcheur, ordre des dates, bornes de valeurs, cohérence des bougies, sauts de cours aberrants, trous). S'il est invalide,
  ou plus ancien que la version précédente, il est **annulé** et les anciennes données sont restaurées.
- **Versions épinglées** : `requests` et `yfinance` (voir `requirements.txt`) et les actions GitHub, épinglées par
  empreinte de commit. **Dependabot** propose chaque semaine les mises à jour, à relire avant de fusionner.
- **Garde-fou avant commit** dans le workflow, et avertissement dans le dashboard si les données ont plus de 30 h.
- Commande manuelle : `python validate_data.py` (code de sortie 1 si une source est invalide).

## Points d'attention (retours des forums)
- **Yahoo Finance** limite parfois les requêtes issues d'IP de serveurs (erreur 429). Le script réessaie 3 fois avec
  attente ; en cas d'échec, les anciennes données restent affichées et le rattrapage de 05:43 UTC retente.
- **Binance** refuse les IP américaines (dont celles de GitHub) : le BTC vient de **Coinbase**. Les clôtures diffèrent de
  Binance de 0,1 % en moyenne, et le volume est celui de Coinbase.
- **Désactivation après 60 jours sans activité** : le workflow commit un fichier de statut à chaque exécution, ce qui
  compte comme activité. Si tu vois « scheduled workflows disabled », réactive-les dans l'onglet Actions.
- Le dépôt grossit d'environ 1 à 2 Mo par jour (fichiers de données versionnés) : à surveiller, la limite conseillée
  d'un dépôt Pages est de 1 Go.
- Les dépendances indirectes de `yfinance` (pandas, numpy…) ne sont pas épinglées.

## Utilisation locale
```bash
pip install -r requirements.txt
python update_all.py        # met à jour les 4 sources et écrit status_data.js
```
