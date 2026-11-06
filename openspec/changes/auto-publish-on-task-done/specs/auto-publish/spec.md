# Spec Delta

## Purpose

Leva as alterações feitas pelo Claude neste projeto do PC para o GitHub da prestektelecom ao fim de cada tarefa e, a partir da `main`, para o servidor de produção, sem passos manuais de commit, push ou deploy.

## ADDED Requirements

### Requirement: Publicação ao fim da tarefa
Quando o Claude termina uma resposta neste projeto e o repositório tem alterações não commitadas ou commits ainda não enviados ao GitHub, o fluxo SHALL fazer commit dessas alterações e enviá-las ao ramo atual no GitHub antes de a tarefa ser dada como encerrada.

#### Scenario: Tarefa com alterações
- **WHEN** o Claude termina uma tarefa que alterou arquivos do projeto
- **THEN** as alterações ficam num commit e esse commit aparece no ramo de mesmo nome em `github.com/prestektelecom/app_gestao_e_auditoria_5s`

#### Scenario: Commit local não enviado
- **WHEN** o Claude termina uma resposta, não há alterações pendentes, mas a `main` local está à frente da `origin/main`
- **THEN** os commits que faltam são enviados ao GitHub

### Requirement: Sem efeito quando não há o que publicar
Quando não há alterações pendentes nem commits por enviar, o fluxo SHALL deixar a resposta terminar normalmente, sem criar commit, sem push e sem mensagem extra.

#### Scenario: Resposta só de conversa
- **WHEN** o Claude responde a uma pergunta sem alterar arquivos e o ramo está igual ao do GitHub
- **THEN** nada é commitado nem enviado e a resposta termina sem atraso perceptível

### Requirement: Mensagem de commit descritiva
Cada commit criado pelo fluxo SHALL ter uma mensagem em português que descreve o que mudou, no mesmo estilo dos commits existentes, e nunca uma mensagem genérica como "auto-save" ou "update".

#### Scenario: Mensagem do commit
- **WHEN** o fluxo cria um commit para uma tarefa que ajustou a tela de login
- **THEN** a mensagem do commit diz o que mudou na tela de login

### Requirement: Conferência antes do envio
Antes de enviar ao GitHub, o fluxo SHALL conferir os tipos e rodar os testes do projeto. Se a conferência falhar, o fluxo SHALL não enviar nada e SHALL mostrar o erro ao usuário.

#### Scenario: Teste quebrado
- **WHEN** há alterações a publicar e um teste falha
- **THEN** nada é enviado ao GitHub, o servidor continua na versão anterior e o usuário vê qual teste falhou

### Requirement: Integração com alterações remotas
Se o GitHub tiver commits que o PC ainda não tem, o fluxo SHALL integrá-los antes do envio, sem reescrever o que já está no GitHub. Se a integração gerar conflito, o fluxo SHALL parar, não enviar nada e avisar o usuário.

#### Scenario: Outra pessoa publicou antes
- **WHEN** a `origin/main` tem um commit que a `main` local não tem e não há conflito
- **THEN** o commit remoto é integrado, os locais vão por cima e o push é feito sem forçar

#### Scenario: Conflito
- **WHEN** a integração com a `origin/main` gera conflito
- **THEN** nada é enviado, o repositório não fica no meio de uma integração e o usuário é avisado dos arquivos em conflito

#### Scenario: Nunca forçar
- **WHEN** o envio é recusado pelo GitHub
- **THEN** o fluxo não usa push forçado e avisa o usuário

### Requirement: Segredos e arquivos locais não são publicados
O fluxo SHALL respeitar o `.gitignore` e SHALL não publicar arquivos com segredos ou dados locais, como `.env` e `database/`. Arquivos novos que pareçam segredos ou dados (chaves, backups, dumps) SHALL ser apontados ao usuário em vez de commitados.

#### Scenario: .env alterado
- **WHEN** a tarefa alterou o `.env`
- **THEN** o `.env` não entra no commit

#### Scenario: Arquivo suspeito novo
- **WHEN** a tarefa deixou um arquivo novo `chave.pem` ou `dump.sql` fora do `.gitignore`
- **THEN** o arquivo não é commitado e o usuário é avisado

### Requirement: Pausa da publicação automática
O usuário SHALL poder pausar a publicação automática criando um arquivo de pausa na raiz do projeto, que não vai para o git. Enquanto ele existir, o fluxo SHALL não commitar nem enviar nada.

#### Scenario: Publicação pausada
- **WHEN** o arquivo de pausa existe e o Claude termina uma tarefa com alterações
- **THEN** nada é commitado nem enviado e as alterações continuam no PC

#### Scenario: Retomada
- **WHEN** o arquivo de pausa é apagado e o Claude termina a próxima tarefa
- **THEN** as alterações acumuladas são publicadas

### Requirement: Só a main vai para a produção
O servidor SHALL publicar apenas o que está na `main` do GitHub. Commits enviados a outros ramos SHALL não alterar a produção.

#### Scenario: Tarefa em outro ramo
- **WHEN** o Claude termina uma tarefa no ramo `teste-relatorio`
- **THEN** o commit vai para `origin/teste-relatorio` e o app no servidor não muda

#### Scenario: Tarefa na main
- **WHEN** um commit chega à `origin/main`
- **THEN** em até cerca de 2 minutos o servidor baixa a versão, roda tipos, testes, migrations e build e reinicia o app; se algum passo falhar, o app anterior continua no ar e o erro fica em `~/deploy.log`
