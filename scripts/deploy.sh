#!/usr/bin/env bash
# Publica a versão que está na pasta (chamado pelo scripts/auto-update.sh depois do git pull).
# Também pode ser rodado à mão:
#
#   PM2_APP=gestao5s bash scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# O cron e as sessões não interativas não carregam o nvm nem o PATH do npm global.
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
if command -v npm >/dev/null; then export PATH="$(npm prefix -g)/bin:$PATH"; fi

: "${PM2_APP:?Defina PM2_APP com o nome do app no pm2 (veja: pm2 list)}"

echo "==> Versão: $(git log --oneline -1)"
echo "==> Instalando dependências"
npm ci --no-audit --no-fund
echo "==> Conferindo o código e rodando os testes"
npx tsc --noEmit
npm test
echo "==> Atualizando o banco (só aplica o que falta)"
npm run db:setup
echo "==> Gerando a nova versão"
npm run build
echo "==> Reiniciando o app"
pm2 restart "$PM2_APP" --update-env
pm2 save >/dev/null
echo "==> Pronto"
