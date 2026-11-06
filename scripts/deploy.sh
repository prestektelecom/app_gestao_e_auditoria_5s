#!/usr/bin/env bash
# Atualiza o app no servidor. Chamado pelo GitHub Actions (.github/workflows/deploy.yml)
# logo depois do `git pull`, mas também pode ser rodado à mão:
#
#   PM2_APP=<nome-no-pm2> bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Sessões SSH não interativas não carregam o nvm sozinhas.
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi

: "${PM2_APP:?Defina PM2_APP com o nome do app no pm2 (veja: pm2 list)}"

echo "==> Versão: $(git log --oneline -1)"
echo "==> Instalando dependências"
npm ci --no-audit --no-fund
echo "==> Atualizando o banco (só aplica o que falta)"
npm run db:setup
echo "==> Gerando a nova versão"
npm run build
echo "==> Reiniciando o app"
pm2 restart "$PM2_APP" --update-env
pm2 save >/dev/null
echo "==> Pronto"
