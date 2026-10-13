#!/usr/bin/env bash
# Lance tous les tests de non-regression du dashboard (Node, DOM simule : aucune dependance a installer).
# Usage : depuis agents/market-monitor :  bash tests/run_all.sh
# Un test echoue si Node retourne une erreur ou si sa sortie contient "Error".
cd "$(dirname "$0")/.." || exit 1
fail=0
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
exit $fail
