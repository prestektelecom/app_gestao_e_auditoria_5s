# Prestek 5S — Gestão e Auditoria 5S

Aplicação web (TanStack Start + React) que roda como **servidor Node** com um **PostgreSQL** próprio.
Login, acesso a dados e fotos ficam no próprio servidor; não depende de Supabase nem de Lovable.

## Requisitos

- Node.js 22.6 ou mais novo
- PostgreSQL 16 ou 17 (testado nas duas)
- Uma pasta persistente para as fotos (`STORAGE_DIR`)
- Opcional: um servidor SMTP para o "esqueci minha senha"
- Só para importar o backup antigo: `pg_restore` **18 com suporte a zstd** (pacote oficial PGDG / EDB)

## Configuração

```sh
cp .env.example .env    # preencha os valores
npm install
```

As variáveis estão explicadas em [.env.example](.env.example). Obrigatórias: `DATABASE_URL`,
`SESSION_SECRET` (mín. 32 caracteres), `STORAGE_DIR` e `PUBLIC_ORIGIN` (endereço público, usado nos
QR codes e nos e-mails). O servidor não sobe se alguma faltar e diz qual é.

Se o app ficar atrás de um proxy (nginx, Caddy), defina `TRUST_PROXY=true` para o limite de
tentativas usar o IP real do cliente.

## Banco de dados

O usuário do `DATABASE_URL` deve ser o **dono do banco** e ter `CREATEROLE` na primeira execução
(o setup cria os papéis `anon`, `authenticated` e `service_role`, usados pelas regras de segurança).

```sh
createdb gestao5s
npm run db:setup        # cria o schema; pode rodar de novo (só aplica o que falta)
```

Num banco novo, sem dados importados, abra `/login` e use **"Primeiro acesso? Criar administrador"**
— a opção só aparece enquanto não existe nenhum admin. Para o QR de auditoria funcionar, publique um
checklist em **Checklist 5S**.

## Build e execução

```sh
npm run build
npm start               # escuta em PORT (padrão 3000)
```

Desenvolvimento: `npm run dev`.

## Testes

```sh
npm test                                                     # testes sem banco
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test   # inclui os testes de banco
```

O `TEST_DATABASE_URL` precisa de um usuário que crie bancos: cada arquivo de teste cria e apaga
um banco descartável.

## Publicação automática

```
PC (Claude Code)  --push-->  GitHub (prestektelecom)  <--cron 2 min--  servidor
 hook ao fim da tarefa        origin/<ramo>                            scripts/auto-update.sh
```

- **PC → GitHub:** quando o Claude Code termina uma tarefa neste projeto e há alterações, o hook
  `Stop` ([.claude/hooks/auto-publish.mjs](.claude/hooks/auto-publish.mjs), ligado em
  `.claude/settings.json`) faz o Claude rodar `npx tsc --noEmit` e `npm test`, commitar com uma
  mensagem descritiva e enviar ao GitHub (`git pull --rebase` antes, nunca `--force`). Se um teste
  falhar ou houver conflito, nada é enviado e o erro aparece na conversa. Edições feitas à mão no
  editor não disparam nada: faça commit e push como de costume.
- **GitHub → servidor:** só a `main` vai para a produção. O cron do servidor roda
  `scripts/auto-update.sh` a cada 2 minutos; se houver commit novo, faz `git pull` e roda
  `scripts/deploy.sh` (dependências, tipos, testes, `db:setup`, build, `pm2 restart`). Se algum
  passo falhar, o app anterior continua no ar.
- **Outro ramo:** para algo arriscado, trabalhe em outro ramo (`git switch -c meu-ramo`). O envio
  vai para `origin/meu-ramo` e a produção não muda até juntar na `main`.
- **Pausar:** crie o arquivo `.auto-publish-off` na raiz do projeto (fica fora do git). Apague-o
  para voltar; as alterações acumuladas são publicadas ao fim da próxima tarefa.
- **Quando passa a valer:** o Claude Code relê o `.claude/settings.json`, então o hook costuma
  valer já na sessão aberta. Se não disparar, abra uma sessão nova.

Conferir o servidor:

```sh
crontab -l          # deve ter a linha do scripts/auto-update.sh (veja o topo do arquivo)
tail ~/deploy.log   # últimas publicações e erros
```

## Migração a partir do Supabase (Lovable)

O backup do Supabase (`pg_dump` em formato custom, ex. `database/gestao-e-auditoria-5s_261105.backup`)
é a **única fonte** da migração: os exports CSV não trazem as contas de login com as senhas.
A importação mantém ids e senhas — cada pessoa continua entrando com a senha que já usava.

### Ensaio (repita quantas vezes quiser)

```sh
# 1. Banco novo com o schema
createdb gestao5s
DATABASE_URL=postgres://.../gestao5s npm run db:setup

# 2. Staging com o backup completo (erros sobre extensões/papéis do Supabase são esperados)
createdb supabase_dump
pg_restore --no-owner --no-privileges -d supabase_dump database/gestao-e-auditoria-5s_261105.backup

# 3. Copiar os dados (confere a contagem de cada tabela no fim)
SOURCE_DATABASE_URL=postgres://.../supabase_dump DATABASE_URL=postgres://.../gestao5s \
  npm run db:migrate-from-supabase            # use -- --replace para importar de novo por cima

# 4. Fotos (precisa da chave de serviço do projeto antigo)
SOURCE_SUPABASE_URL=https://<projeto>.supabase.co SOURCE_SUPABASE_SERVICE_KEY=... \
  npm run storage:import                       # -- --dry-run só lista; pula as que já existem
```

O passo 4 baixa só as fotos que algum registro usa e lista as que falharem. Sem a chave de
serviço, o app funciona e as fotos antigas aparecem como indisponíveis; dá para copiá-las depois
(ou baixar pela tela antiga e colocar em `STORAGE_DIR/<bucket>/<storage_path>`).

Depois do ensaio: suba o app (`npm start`), entre com usuários reais, percorra as telas e faça uma
auditoria e uma nota de manutenção pelo QR num celular.

### Virada

1. Pare o uso do app no Lovable e gere um **backup novo** do Supabase.
2. Repita os passos 2–4 no banco de produção (`--replace` se ele já tiver o ensaio).
3. Aponte o DNS de `PUBLIC_ORIGIN` para o servidor.
4. Se o domínio mudou, **reimprima os QR codes** (telas QR Codes e Manutenção › QR Codes).

Até o passo 3 o app antigo continua intacto: para voltar atrás, basta não trocar o DNS.

## Operação

- Faça backup do PostgreSQL **e** da pasta `STORAGE_DIR` (as fotos não ficam no banco).
- `.env` e `database/` estão no `.gitignore`: o backup tem hashes de senha e segredos.
