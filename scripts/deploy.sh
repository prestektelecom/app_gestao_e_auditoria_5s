#!/usr/bin/env bash
# Publica a versão que está na pasta (chamado pelo scripts/auto-update.sh depois do git pull).
# Também pode ser rodado à mão. Com o app no systemd (o caso da produção):
#
#   SYSTEMD_UNIT=gestao5s bash scripts/deploy.sh
#
# Ou com o app no pm2:
#
#   PM2_APP=gestao5s bash scripts/deploy.sh
#
# No systemd, o reinício usa `sudo -n systemctl restart`, então o usuário precisa de uma regra
# no sudoers que permita só esse comando sem senha, num arquivo lido por último
# (/etc/sudoers.d/zz-gestao5s-deploy; veja o README, "Publicação automática").
set -euo pipefail
cd "$(dirname "$0")/.."

# O cron e as sessões não interativas não carregam o nvm nem o PATH do npm global.
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
if command -v npm >/dev/null; then export PATH="$(npm prefix -g)/bin:$PATH"; fi

SYSTEMD_UNIT="${SYSTEMD_UNIT:-}"
PM2_APP="${PM2_APP:-}"
if [ -z "$SYSTEMD_UNIT" ] && [ -z "$PM2_APP" ]; then
  echo "Defina SYSTEMD_UNIT (serviço do systemd) ou PM2_APP (app do pm2)." >&2
  exit 1
fi
# Arquivo de configuração do serviço (o mesmo do EnvironmentFile do systemd).
ENV_FILE="${ENV_FILE:-/etc/${SYSTEMD_UNIT:-gestao5s}.env}"

# Lê o arquivo no formato do systemd (CHAVE=valor, aspas opcionais) só para o comando dado.
# Não vale para o script todo: o NODE_ENV=production faria o `npm ci` pular as ferramentas de
# build, e o DATABASE_URL da produção não deve chegar aos testes.
with_service_env() {
  (
    if [ -r "$ENV_FILE" ]; then
      while IFS= read -r line || [ -n "$line" ]; do
        line="${line#"${line%%[![:space:]]*}"}"
        case "$line" in "" | "#"* | ";"*) continue ;; esac
        key="${line%%=*}"
        value="${line#*=}"
        case "$value" in \"*\") value="${value:1:${#value}-2}" ;; \'*\') value="${value:1:${#value}-2}" ;; esac
        export "$key=$value"
      done < "$ENV_FILE"
    elif [ -n "$SYSTEMD_UNIT" ]; then
      echo "Não consigo ler $ENV_FILE (veja o README, \"Publicação automática\")." >&2
      exit 1
    fi
    "$@"
  )
}

echo "==> Versão: $(git log --oneline -1)"
echo "==> Instalando dependências"
npm ci --no-audit --no-fund
echo "==> Conferindo o código e rodando os testes"
npx tsc --noEmit
npm test
echo "==> Atualizando o banco (só aplica o que falta)"
with_service_env npm run db:setup
echo "==> Gerando a nova versão"
npm run build
echo "==> Reiniciando o app"
if [ -n "$SYSTEMD_UNIT" ]; then
  sudo -n systemctl restart "$SYSTEMD_UNIT"
  sleep 3
  systemctl is-active --quiet "$SYSTEMD_UNIT" || { echo "O serviço $SYSTEMD_UNIT não voltou." >&2; exit 1; }
else
  pm2 restart "$PM2_APP" --update-env
  pm2 save >/dev/null
fi
echo "==> Pronto"
