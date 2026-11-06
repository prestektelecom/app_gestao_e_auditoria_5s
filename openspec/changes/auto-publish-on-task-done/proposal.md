# Proposal

## Why

O servidor já publica sozinho o que chega na `main` do GitHub (`scripts/auto-update.sh` no cron, a cada 2 minutos), mas o caminho do PC até o GitHub ainda é manual: depois de cada alteração alguém precisa lembrar de fazer commit e push. Quando isso é esquecido, o servidor fica desatualizado e o trabalho fica só no PC.

## What Changes

- Hook `Stop` do Claude Code neste projeto: quando o Claude termina uma tarefa e há alterações não publicadas, o hook impede o encerramento e pede que o Claude faça commit com mensagem descritiva, confira o código (`tsc` e testes) e envie para o GitHub.
- Se não há nada a publicar (resposta só de conversa), o hook não faz nada.
- Commits locais que ainda não foram enviados também são publicados.
- Se o GitHub estiver à frente (outra pessoa publicou), o Claude integra com `git pull --rebase` antes do push. Se houver conflito, para e avisa em vez de forçar.
- Se a conferência local falhar, nada é enviado e o erro é mostrado.
- Interruptor para pausar: um arquivo local (fora do git) desliga a publicação automática enquanto existir.
- Só a `main` vai para a produção. Em outro ramo, o push vai para o ramo de mesmo nome no GitHub e o servidor não muda.
- Documentação no README de como funciona, como pausar e como conferir se o cron do servidor está instalado.
- Edições feitas à mão no editor não disparam nada (fora do escopo, decisão do usuário).

## Capabilities

### New Capabilities
- `auto-publish`: publicação automática das alterações do PC para o GitHub ao fim de cada tarefa do Claude e, a partir da `main`, para o servidor.

### Modified Capabilities

(nenhuma)

## Impact

- Novo `.claude/settings.json` (versionado) com o hook `Stop`.
- Novo script do hook em `.claude/hooks/` (Node, para funcionar no Windows e em outros sistemas).
- `.gitignore`: o arquivo de pausa.
- `README.md`: seção sobre a publicação automática.
- Sem mudança no código do app, no banco ou em `scripts/deploy.sh` / `scripts/auto-update.sh`.
- Toda tarefa concluída pelo Claude na `main` chega à produção em cerca de 2 minutos, depois de passar pelos testes no servidor.
