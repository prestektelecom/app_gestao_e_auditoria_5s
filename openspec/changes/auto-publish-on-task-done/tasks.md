# Tasks

## 1. Script do hook

- [x] 1.1 Criar `.claude/hooks/auto-publish.mjs` que lê o JSON do hook na entrada padrão e exporta uma função de detecção (D3): pendente se `git status --porcelain` não é vazio ou se há commits à frente do upstream (ou ramo sem upstream com commits); libera se `stop_hook_active` é verdadeiro (D2), se existe `.auto-publish-off` (D6), se não é repositório git ou se há merge/rebase em andamento. Verificar com `echo '{"stop_hook_active":false}' | node .claude/hooks/auto-publish.mjs` no repositório limpo: não imprime nada e sai com 0
- [x] 1.2 Quando há pendência, o script imprime `{"decision":"block","reason":...}` com o roteiro de D4 (tarefa pela metade, arquivos suspeitos, `tsc` e testes, commit descritivo em português com coautoria, `pull --rebase` com `--abort` em conflito, push sem `--force`, aviso de ~2 min na `main`) e o nome do ramo atual. Verificar alterando um arquivo e rodando o comando do 1.1: o JSON sai válido (`node -e "JSON.parse(...)"`) e o motivo cita o ramo
- [x] 1.3 Escrever `src/test/auto-publish-hook.test.ts` (ambiente `node`) com repositórios git temporários e um remoto `--bare`, cobrindo: repositório limpo e sincronizado não bloqueia; arquivo alterado bloqueia; commit não enviado bloqueia; ramo novo sem upstream com commit bloqueia; `.auto-publish-off` libera; `stop_hook_active: true` libera; arquivo só ignorado pelo `.gitignore` não bloqueia; rebase em andamento libera. Verificar com `npm test`

## 2. Ligação no Claude Code

- [x] 2.1 Criar `.claude/settings.json` com o hook `Stop` rodando `node "$CLAUDE_PROJECT_DIR/.claude/hooks/auto-publish.mjs"` (D5, D7). Verificar com `/hooks` numa sessão do Claude Code aberta neste projeto que o hook aparece, e que uma resposta só de conversa termina sem bloqueio
- [x] 2.2 Adicionar `.auto-publish-off` ao `.gitignore`. Verificar com `git check-ignore .auto-publish-off`
- [x] 2.3 Adicionar ao `README.md` uma seção "Publicação automática" que explique o fluxo PC → GitHub → servidor, que só a `main` vai para a produção, como pausar (`.auto-publish-off`), como trabalhar em outro ramo e como conferir o servidor (`crontab -l`, `tail ~/deploy.log`). Verificar que os comandos citados existem nos scripts e no `.gitignore`
- [x] 2.4 Commitar e enviar esta mudança manualmente (o hook ainda não está ativo na sessão em que foi criado). Verificar que `git status -sb` mostra `main...origin/main` sem diferença

## 3. Verificação ponta a ponta

- [ ] 3.1 Conferir no servidor (feito pelo usuário, sem acesso daqui): `crontab -l` tem a linha do `scripts/auto-update.sh` com `PM2_APP` e `tail ~/deploy.log` mostra a publicação do commit da 2.4. Verificar com a saída dos dois comandos enviada pelo usuário
- [x] 3.2 Numa sessão nova, pedir uma alteração pequena e ver o hook bloquear uma vez, o Claude rodar `tsc` e testes, commitar com mensagem descritiva e enviar. Verificar o commit em `github.com/prestektelecom/app_gestao_e_auditoria_5s` e a versão nova no servidor em até ~2 minutos
- [ ] 3.3 Com `.auto-publish-off` criado, pedir outra alteração e ver que nada é commitado. Apagar o arquivo e ver a alteração acumulada ser publicada ao fim da próxima tarefa
- [ ] 3.4 Conferir que o hook `Stop` do vault pai (`c:\vault\.claude`) não roda junto nas sessões abertas neste projeto, ou, se rodar, que os dois não conflitam. Verificar pela saída de `/hooks`

## Workflow follow-up

- Arquivar a mudança com `/opsx:archive` depois da verificação ponta a ponta.
