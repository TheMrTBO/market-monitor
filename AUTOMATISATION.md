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

**Scan post-market** : un second workflow, `.github/workflows/postmarket.yml` (« Scan post-market »), relève seulement le scan
TradingView toutes les 15 min (minutes 7, 22, 37, 52) de 20:07 à 01:22 UTC en semaine (le post-market dure 16 h → 20 h à New York, soit 20:00-00:00 UTC
l'été et 21:00-01:00 UTC l'hiver). Hors fenêtre, `fetch_postmarket.py` ne fait rien : pas de commit, pas de déploiement. Le
relevé final (post-market terminé) est fait par le passage de `05:43`. Aucune clé ; données TradingView différées de 15 min.

Horaires (UTC) : `22:17`, puis `01:17` et `03:17` (le breadth du jour est publié après la clôture à une heure variable ; d'ici là le tableau de bord affiche « en attente »), et un rattrapage à `05:43` le lendemain. Les week-ends et jours fériés US, seules les données BTC changent. GitHub peut retarder une exécution
de quelques minutes à quelques dizaines de minutes ; c'est normal. Lancement manuel possible à tout moment :
onglet **Actions** > « Mise à jour des données et publication » > **Run workflow**.

## Déclencheur externe : cron-job.org (depuis le 14/10/2026)
La planification de GitHub (`schedule`) n'est pas fiable sur ce dépôt : le premier soir (13/10), presque tous les créneaux ont
été sautés, un passage de 22:17 UTC est parti à 01:13 UTC et des créneaux de 00:xx UTC sont partis à 04:31 et 06:01 UTC. Les
workflows sont donc **déclenchés par cron-job.org** (gratuit), qui appelle l'API GitHub `workflow_dispatch` à l'heure exacte.
Les créneaux `schedule` des workflows restent en place comme **secours** : si les deux partent pour le même passage, le second
attend la fin du premier (groupe `concurrency: market-monitor`) ou apparaît « annulé » ; ce n'est pas une erreur.

| Tâche cron-job.org | URL (POST) | Horaire (UTC) |
|---|---|---|
| Scan post-market | `https://api.github.com/repos/TheMrTBO/market-monitor/actions/workflows/postmarket.yml/dispatches` | `7,22,37,52 0,1,20,21,22,23 * * 1-6` |
| Mise à jour des données | `https://api.github.com/repos/TheMrTBO/market-monitor/actions/workflows/update.yml/dispatches` | `17 1,3,5-8,22 * * *` : 00:17, 03:17, 05:17, 08:17, 09:17, 10:17 (heure d'été de Paris ; Polygon et Stockbee publient la séance précédente pendant la nuit, à une heure variable), tous les jours |

Réglages communs : en-têtes `Authorization: Bearer <jeton>`, `Accept: application/vnd.github+json`,
`X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json` ; corps `{"ref":"main"}` ; réponse attendue **204** ; notification en cas d'échec activée.
Hors fenêtre (ex. samedi soir), `fetch_postmarket.py` ne fait rien : pas de commit.
Mis en service le 14/10/2026 : « Test run » des deux tâches = réponse 204, exécutions `workflow_dispatch` réussies sur GitHub.
Piège : coller la commande `curl` dans *Request body* donne une erreur 400 ; le corps doit être exactement `{"ref":"main"}`
(guillemets droits), avec l'en-tête `Content-Type: application/json`.

**Jeton** : jeton GitHub *fine-grained*, limité au seul dépôt `market-monitor`, permissions **Actions : Read and write** et
**Metadata : Read-only**, **sans date d'expiration** (choix de l'utilisateur, 14/10/2026 : pas de coupure surprise ; en
contrepartie, le révoquer et en recréer un en cas de doute ou à chaque changement d'outil de déclenchement). Il ne permet ni de lire
ou modifier le code, ni de lire les Secrets. Il n'est stocké que chez cron-job.org, jamais dans le dépôt.
Un jeton volé permettrait seulement de lancer, annuler ou désactiver les workflows et d'effacer journaux et cache : en cas de
doute, **révoquer** (GitHub > Settings > Developer settings > Fine-grained tokens) puis en recréer un.
Les branches fusionnées sont supprimées (réglage « Automatically delete head branches ») : le jeton ne peut lancer que les
workflows de `main`.

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
- `fetch_history.py` télécharge, une fois par jour, la clôture, le volume, l'ouverture, le plus haut et le plus bas de tous les titres US (un appel `grouped daily` ; profondeur : `config/sources.toml [history]`)
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
