# Design

## Context

```
  PC (Claude Code)                 GitHub (prestektelecom)          Servidor
 +----------------------+        +------------------+  cron 2 min +--------------------+
 | Claude termina tarefa|        |                  | <---------- | auto-update.sh     |
 |   -> hook Stop       | -----> | origin/<ramo>    |  git fetch  |  so origin/main    |
 |   -> Claude commita, |  push  | origin/main      |             |  -> deploy.sh      |
 |      confere, envia  |        |  (tests.yml)     |             |     (ja existe)    |
 +----------------------+        +------------------+             +--------------------+
        NOVO                          ja existe                        ja existe
```

- O lado servidor já está pronto: `scripts/auto-update.sh` (cron, `flock`, `git pull --ff-only`) chama `scripts/deploy.sh` (`npm ci`, `tsc`, testes, `db:setup`, build, `pm2 restart`). Esta mudança não mexe neles.
- O projeto não tem `.claude/settings.json`, só `.claude/commands` e `.claude/skills`.
- O PC é Windows. Os hooks do Claude Code rodam pelo shell, e o caminho do projeto tem espaços (`C:\vault\20 Projetos\...`).
- O `.gitignore` já cobre `.env`, `.env.*`, `database/`, `data/`, `node_modules` e `.output`.

## Goals / Non-Goals

**Goals:**
- A verificação "tem algo a publicar?" ser local e rápida, para não atrasar respostas que são só conversa.
- O commit ter mensagem com sentido e só sair depois de `tsc` e testes passarem no PC.
- Nunca deixar o repositório no meio de um rebase e nunca usar push forçado.

**Non-Goals:**
- Publicar edições feitas à mão no VS Code (decisão do usuário).
- Acompanhar o deploy no servidor a partir do PC (não há acesso SSH no fluxo). O resultado fica em `~/deploy.log` no servidor.
- Mudar o deploy do servidor ou trocar o cron por webhook.

## Decisions

### D1. Hook `Stop` que bloqueia e devolve a tarefa ao Claude

O script do hook só detecta se há algo a publicar. Se houver, responde `{"decision": "block", "reason": "..."}`. O Claude então continua, faz o commit com mensagem descritiva, confere e envia. Se não houver nada, o script sai com código 0 sem imprimir nada.

- **Alternativa: o script faz commit e push sozinho.** Rejeitada porque um script não sabe escrever uma mensagem que descreva a mudança (a spec exige isso), não sabe avaliar se um arquivo novo é suspeito e não sabe explicar ao usuário um teste quebrado ou um conflito.
- **Alternativa: extensão de auto-commit no VS Code.** Rejeitada pelo usuário: publica código pela metade.

### D2. Proteção contra repetição com `stop_hook_active`

O Claude Code envia `stop_hook_active: true` quando a resposta atual já é continuação de um bloqueio do hook. Nesse caso o script sempre libera, mesmo que ainda haja algo pendente (teste falhou, conflito, tarefa pela metade). Assim o hook bloqueia no máximo uma vez por resposta e nunca entra em ciclo. O que ficou pendente é cobrado de novo ao fim da próxima resposta.

### D3. Detecção só com comandos locais

- Alterações pendentes: `git status --porcelain` não vazio (já respeita o `.gitignore`).
- Commits por enviar: `git rev-list --count @{u}..HEAD` > 0. Se o ramo não tem upstream e tem commits, conta como pendente (`push -u`).
- Sem `git fetch` no hook, porque rede deixaria toda resposta lenta e sujeita a falha. O `fetch` e o `pull --rebase` ficam no passo do Claude, que só acontece quando há algo a publicar.
- Se não estiver num repositório git, ou estiver no meio de um merge/rebase (existe `.git/MERGE_HEAD` ou `.git/rebase-merge`), o script libera e não pede publicação.

### D4. Procedimento no texto do bloqueio

O `reason` traz o roteiro que o Claude segue, para o comportamento não depender de memória da sessão:

1. Se a tarefa não terminou (falta resposta do usuário, trabalho pela metade), não publicar. Responder em uma linha que as alterações ficam para o fim da tarefa.
2. Ver `git status`. Não incluir arquivos que pareçam segredo ou dado (chaves, `.pem`, dumps, backups, `.env*`). Apontá-los ao usuário.
3. `npx tsc --noEmit` e `npm test`. Se falhar, não commitar nem enviar. Mostrar o erro.
4. `git add` dos arquivos certos e commit com mensagem em português descrevendo a mudança, no estilo do `git log`, com a linha de coautoria.
5. `git pull --rebase origin <ramo>`. Se der conflito, `git rebase --abort`, avisar os arquivos e parar.
6. `git push origin <ramo>` (com `-u` se não houver upstream), nunca `--force`.
7. Dizer ao usuário o que foi publicado. Na `main`, avisar que o servidor atualiza em cerca de 2 minutos.

Conferir antes do commit, e não só antes do push, evita deixar commit quebrado no histórico local.

### D5. Script em Node em `.claude/hooks/auto-publish.mjs`

Node já é requisito do projeto e funciona igual no Windows e no Linux. Bash funcionaria no Git Bash, mas quebraria quem usa o projeto sem ele. O comando no `settings.json` usa o caminho entre aspas: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/auto-publish.mjs"`.

### D6. Pausa por arquivo `.auto-publish-off`

O arquivo fica na raiz do projeto e entra no `.gitignore`. Basta criar ou apagar, sem editar configuração. Se existir, o script libera sem bloquear.

- **Alternativa: variável de ambiente.** Rejeitada porque exige reiniciar a sessão do Claude Code e é menos visível.

### D7. `.claude/settings.json` versionado

As configurações ficam no `settings.json` do projeto, e não no `settings.local.json`, para que o comportamento valha para quem clonar o repositório e use o Claude Code. Quem não quiser usa o arquivo de pausa.

## Risks / Trade-offs

- [Toda tarefa concluída na `main` vai à produção em cerca de 2 minutos] → testes no PC e no servidor. Se o deploy falhar, o app anterior continua. Para mudanças arriscadas, trabalhar em outro ramo ou pausar.
- [Resposta que é pergunta no meio da tarefa dispara o bloqueio] → passo 1 do roteiro. O custo é uma linha extra na resposta.
- [Os testes de banco são pulados sem `TEST_DATABASE_URL`, então a conferência no PC cobre menos que o ideal] → o servidor roda os mesmos testes. Aceito.
- [O deploy falha no servidor e ninguém vê] → fora do escopo. O README explica como olhar o `~/deploy.log`. Alerta fica para uma mudança futura.
- [Não há como confirmar daqui que o cron está instalado no servidor] → tarefa manual de verificação (`crontab -l`) antes de considerar pronto.
- [O hook do vault pai (`c:\vault\.claude`) também tem hook `Stop`] → são arquivos de settings diferentes. O Claude Code lê o do projeto aberto. Verificar na prática que só o deste projeto atua aqui.

## Migration Plan

1. Implementar e commitar o hook manualmente (esse commit ainda não passa pelo hook).
2. Conferir no servidor: `crontab -l` mostra a linha do `auto-update.sh` e `tail ~/deploy.log` mostra execuções recentes.
3. Testar com uma alteração pequena (por exemplo, no README) e ver o commit no GitHub e a atualização no servidor.
4. Rollback: apagar o hook do `.claude/settings.json` ou criar `.auto-publish-off`.
