# Mise à jour automatique gratuite (GitHub Actions + GitHub Pages)

Le dashboard se met à jour **tout seul, sur les serveurs de GitHub**, sans utiliser ton PC, et reste consultable à une
adresse web (ex. `https://TON-PSEUDO.github.io/market-monitor/`).

## Ce qui est automatisé
Chaque jour (week-ends compris, le BTC cote 7 j/7), après la clôture US, le workflow `.github/workflows/update.yml` :
1. complète l'historique des clôtures US (`fetch_history.py`, Polygon / Massive, clé gratuite en GitHub Secret) ;
2. lance `update_all.py`, qui récupère : Stockbee (Google Sheet public), VIX (CBOE), QQQ / IWM (Yahoo Finance),
   BTC (Coinbase Exchange), ETF sectoriels (Yahoo Finance), et calcule le **breadth +4 % / −4 % et les ratios 5 / 10 j
   maison** (`breadth_own.py` → `breadth_data.js`) ;
3. enregistre les fichiers de données dans le dépôt (les dernières bonnes valeurs sont conservées si une source échoue) ;
4. republie le site sur GitHub Pages.

Horaires (UTC) : `22:17` et un rattrapage à `05:43` le lendemain. Les week-ends et jours fériés US, seules les données BTC changent. GitHub peut retarder une exécution
de quelques minutes à quelques dizaines de minutes ; c'est normal. Lancement manuel possible à tout moment :
onglet **Actions** > « Mise à jour des données et publication » > **Run workflow**.

## Aucune information privée
- **Une seule clé : `POLYGON_API_KEY`** (plan gratuit Polygon / Massive), stockée **uniquement** dans les GitHub Secrets
  (Settings > Secrets and variables > Actions > New repository secret). Elle n'est jamais écrite dans un fichier du dépôt.
  Toutes les autres sources sont publiques et sans clé.
- Le fichier `.env` local (même clé, pour les essais sur ton Mac) est **exclu** par `.gitignore` et ne doit jamais être publié.
  Une clé qui a été exposée doit être révoquée sur ton compte Massive / Polygon puis recréée.
- **Aucune donnée brute** n'est publiée : l'historique des clôtures reste dans le cache GitHub Actions (hors dépôt) ;
  seuls des comptes agrégés (`breadth_data.js`) sont committés.
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

**Relancer une mise à jour :** toujours par **Actions > « Mise à jour des données et publication » > Run workflow**, jamais
par « Re-run » d'une ancienne exécution (elle rejoue l'ancien commit et l'ancienne version du workflow). Depuis le 13/10/2026,
le workflow part de la dernière version de `main`, rejoue son commit de données par-dessus ce qui a pu arriver pendant
l'exécution (`git pull --rebase -X theirs`, 3 essais) et enregistre le cache sous une clé par tentative
(`historique-<run_id>-<run_attempt>`), la restauration prenant le plus récent.

## Calcul maison du breadth (+4 % / −4 %, ratios 5 / 10 j)
- `fetch_history.py` télécharge, une fois par jour, la clôture et le volume de tous les titres US (un appel `grouped daily`)
  et conserve les splits à part ; l'historique (~130 séances) vit dans le cache Actions `cache/`, jamais dans le dépôt.
  **Le tout premier passage dure ~27 min** (~130 appels à 5/min, limite du plan gratuit) ; ensuite 1 à 2 appels par jour.
- `breadth_own.py` applique les formules TC2000 (identiques à celles de Stockbee) et écrit `breadth_data.js`.
- **Période de transition** : Stockbee reste la référence affichée ; notre calcul est tracé en **pointillé** sur
  l'histogramme +4 % / −4 %, et complète automatiquement une séance que Stockbee n'a pas (encore) publiée. Le pied de page
  indique l'écart moyen entre les deux sur les 20 dernières séances (~3 titres attendus).
- `validate_data.py` refuse un calcul dont l'écart avec Stockbee est anormal (ex. séance Polygon partielle) : les dernières
  données valides sont alors conservées.
- Sans la clé (ou si Polygon est en panne), le site reste publié avec le dernier calcul valide ; l'étape est signalée ⚠.

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
