#!/usr/bin/env bash
# Confere se há versão nova na main do GitHub e, se houver, publica.
# Feito para rodar pelo cron do servidor, a cada 2 minutos:
#
#   */2 * * * * PM2_APP=gestao5s bash /home/antonio/app_gestao-e-auditoria-5s/scripts/auto-update.sh >> /home/antonio/deploy.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

# Evita duas atualizações ao mesmo tempo (se a anterior ainda estiver rodando).
exec 9>/tmp/gestao5s-deploy.lock
flock -n 9 || exit 0

git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then exit 0; fi

echo "===== $(date '+%Y-%m-%d %H:%M:%S') nova versão encontrada"
git pull --ff-only --quiet origin main
bash scripts/deploy.sh
