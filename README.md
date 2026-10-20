# Market Monitor — données historiques

Branche **orpheline** `data` du dépôt `market-monitor` : stockage durable, en ajout seul, écrit par les workflows
(module `mm/store/` de la branche `main`). Ne pas modifier à la main.

- un dossier par jeu de données ; un fichier CSV par mois (`AAAA/AAAA-MM.csv`) ou par jour (`AAAA/AAAA-MM-JJ.csv`) ;
- modèle de chaque jeu (clé primaire, colonnes typées, `?` = valeur absente autorisée) : `_schema/<jeu>.json` ;
- dates ISO, horodatages UTC, valeur absente = champ vide ; lignes triées par clé primaire.

Lecture rapide : `duckdb -c "select * from read_csv_auto('prices_daily/*/*.csv') where symbol = 'QQQ'"`.

| Jeu | Clé primaire | Partition | Contenu |
|---|---|---|---|
| `stockbee_daily` | session_date | month | Breadth Stockbee (Market Monitor), une ligne par séance |
| `breadth_own_daily` | session_date | month | Calcul maison du breadth (clôtures Polygon / Massive) |
| `tv_breadth_daily` | session_date | month | Breadth relevé sur le screener TradingView : T2108 et ±4 % TC2000 (aucun historique chez TradingView : un relevé par séance depuis le 19/10/2026 ; ±4 % depuis le 20/10/2026) |
| `prices_daily` | symbol, session_date | month | Bougies journalières QQQ, IWM (Yahoo) et BTC (Coinbase) |
| `sectors_daily` | symbol, session_date | month | Bougies journalières des ETF de config/sectors.toml (Yahoo) |
| `vix_daily` | session_date | month | VIX (CBOE) |
| `postmarket_scan` | session_date, taken_at, ticker | day | Chaque relevé du scan post-market (toutes les 15 min) : ce que montrait le scan à l'heure du relevé ; la liste finale d'une séance = son dernier relevé |
| `postmarket_next` | session_date, ticker | month | Séance suivante des titres de la liste finale (variation clôture à clôture, gap). Liste finale = dernier relevé (max taken_at) de postmarket_scan |
| `runs` | run_id, source | month | Journal des passages de la mise à jour complète : statut par source, durée, dernière séance obtenue (heure de 1re disponibilité = 1er passage où last_session atteint la séance) |
