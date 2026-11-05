# Spec Delta

## Purpose

Define que o navegador nunca acessa o banco diretamente: toda leitura e escrita passa pelo servidor, que executa a consulta com a identidade correta para o banco aplicar as regras de segurança.

## ADDED Requirements

### Requirement: Navegador não acessa o banco
O navegador SHALL obter e alterar dados somente por funções do servidor do app. Nenhuma credencial ou endereço do banco SHALL ser enviado ao navegador.

#### Scenario: Código enviado ao navegador
- **WHEN** se inspeciona o JavaScript e as variáveis de ambiente entregues ao navegador
- **THEN** não há `DATABASE_URL`, senha do banco nem chave de API de banco

#### Scenario: Telas funcionam pelo servidor
- **WHEN** um usuário usa painel, auditorias, plano de ação, checklist, relatórios, reuniões, manutenção, unidades, usuários, notificações e configurações
- **THEN** todas as leituras e gravações acontecem por requisições ao servidor do app e mostram os mesmos dados de antes da migração

### Requirement: Consultas com a identidade do usuário logado
O servidor SHALL executar as consultas de usuários logados com a identidade desse usuário, de modo que as regras RLS e as permissões do banco valham como valiam no Supabase.

#### Scenario: Leitura limitada pelas regras
- **WHEN** um usuário logado consulta dados que as regras RLS limitam
- **THEN** recebe só as linhas que as regras permitem para ele

#### Scenario: Requisição sem sessão
- **WHEN** uma função de servidor de área logada é chamada sem sessão válida
- **THEN** o servidor responde "não autorizado" e não consulta o banco

### Requirement: Fluxo público de QR sem login
O servidor SHALL atender as telas públicas `/auditoria/q/$token` e `/manutencao/q/$token` sem login, executando só as funções SQL públicas do fluxo de QR e autorizando cada chamada pelo token do setor e pelo token da sessão de auditoria, como hoje.

#### Scenario: Auditoria pelo QR
- **WHEN** um auditor abre o QR de um setor no celular, valida seu código, responde o checklist e finaliza
- **THEN** a auditoria é gravada e pontuada pelo banco, sem pedir login

#### Scenario: Sessão de auditoria inválida
- **WHEN** uma chamada do fluxo de QR chega com um token de sessão errado ou de outra auditoria
- **THEN** o servidor recusa com "Sessão da auditoria inválida."

### Requirement: Mensagens de erro em português
O servidor SHALL devolver ao navegador mensagens de erro em português, sem expor SQL, nomes de tabelas ou detalhes internos.

#### Scenario: Erro do banco
- **WHEN** uma gravação falha por uma regra do banco, como violação de chave ou exceção de função SQL
- **THEN** o usuário vê uma mensagem em português e o detalhe técnico fica só no log do servidor
