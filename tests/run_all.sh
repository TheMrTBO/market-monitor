#!/usr/bin/env bash
# Lance tous les tests de non-regression du dashboard (Node, DOM simule : aucune dependance a installer).
# Usage : depuis agents/market-monitor :  bash tests/run_all.sh
# Un test echoue si Node retourne une erreur ou si sa sortie contient "Error".
cd "$(dirname "$0")/.." || exit 1
fail=0
echo "--- configuration (config/*.toml, config_data.js à jour, créneaux des workflows)"
python3 mmconfig.py --check || fail=1
echo "--- syntaxe des workflows GitHub (YAML)"
if command -v ruby >/dev/null; then
  ruby -ryaml -e 'ARGV.each { |f| YAML.safe_load(File.read(f), aliases: true) }; puts "workflows : YAML valide (#{ARGV.size})"' .github/workflows/*.yml || fail=1
else echo "ruby absent : contrôle YAML sauté"; fi
for f in tests/node/*.js; do
  out=$(node "$f" 2>&1); code=$?
  n=$(printf '%s' "$out" | grep -ci "error")
  if [ $code -ne 0 ] || [ "$n" -ne 0 ]; then echo "ECHEC  $f"; printf '%s\n' "$out" | grep -i -m3 "error"; fail=1
  else echo "ok     $f"; fi
done
echo "--- test Python : annulation des donnees invalides"
python3 tests/test_update_rollback.py || fail=1
echo "--- test Python : calcul maison du breadth, historique et controle croise"
python3 tests/test_breadth_own.py || fail=1
echo "--- test Python : calcul maison du soir (cache Polygon + clotures TradingView, ligne provisoire)"
python3 tests/test_breadth_soir.py || fail=1
echo "--- test Python : T2108 TradingView (seance de la bougie, differe, filtre, controle)"
python3 tests/test_tv_breadth.py || fail=1
echo "--- test Python : scan post-market (seance, resultats, lendemain, controle)"
python3 tests/test_postmarket.py || fail=1
echo "--- test Python : vue TradingView de l'onglet Secteurs (indices, filtres, fichiers, controle)"
python3 tests/test_industries.py || fail=1
echo "--- test Python : short interest de l'onglet Tickers (lots, erreurs, controle)"
python3 tests/test_short.py || fail=1
echo "--- test Python : fichiers générés non versionnés (cache, secours du site publié, annulation, workflows)"
python3 tests/test_generated.py || fail=1
echo "--- test Python : stockage historique (mm/store)"
python3 tests/test_store.py || fail=1
echo "--- test Python : synchronisation vers la branche data (dépôts Git temporaires)"
python3 tests/test_store_sync.py || fail=1
exit $fail
