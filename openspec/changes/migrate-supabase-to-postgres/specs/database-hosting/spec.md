# Spec Delta

## Purpose

Garante que o app funcione com um PostgreSQL comum no nosso servidor, mantendo as regras de segurança do banco e todos os dados que hoje estão no Supabase.

## ADDED Requirements

### Requirement: Banco PostgreSQL próprio
O sistema SHALL guardar todos os dados em um PostgreSQL 17 informado por `DATABASE_URL`, sem depender de serviços do Supabase (API REST, Auth, Storage, Realtime) para funcionar.

#### Scenario: App sobe só com Postgres
- **WHEN** o servidor inicia com `DATABASE_URL` apontando para um Postgres comum, sem nenhum serviço do Supabase acessível
- **THEN** o login, as telas de gestão e o fluxo público de QR funcionam normalmente

#### Scenario: DATABASE_URL ausente
- **WHEN** o servidor inicia sem `DATABASE_URL`
- **THEN** o servidor falha na inicialização com uma mensagem que cita a variável ausente

### Requirement: Schema aplicado do zero
O sistema SHALL ter um comando que cria em um banco vazio todo o schema do app: tabelas, funções, triggers, regras RLS e os objetos de compatibilidade que substituem os do Supabase.

#### Scenario: Banco vazio
- **WHEN** o comando de setup do schema roda em um banco PostgreSQL vazio
- **THEN** todas as tabelas de `public`, as funções SQL e as regras RLS existem e o app consegue criar o primeiro admin

#### Scenario: Rodar de novo
- **WHEN** o comando de setup roda em um banco que já tem o schema aplicado
- **THEN** nada é duplicado nem apagado e o comando termina sem erro

### Requirement: Regras de segurança aplicadas pelo banco
O banco SHALL continuar aplicando as regras RLS e as permissões existentes conforme o usuário da requisição: logado (`authenticated`), visitante do fluxo de QR (`anon`) ou operação interna do servidor.

#### Scenario: Usuário sem permissão de admin
- **WHEN** um usuário logado que não é admin tenta alterar uma unidade
- **THEN** o banco recusa a alteração, assim como acontece hoje

#### Scenario: auth.uid() identifica o usuário
- **WHEN** uma função SQL que usa `auth.uid()` roda em uma requisição de um usuário logado
- **THEN** `auth.uid()` retorna o id desse usuário

#### Scenario: Requisição sem login
- **WHEN** uma consulta roda como visitante, sem usuário logado
- **THEN** `auth.uid()` retorna nulo e só as funções liberadas para `anon` podem ser usadas

### Requirement: Importação do backup do Supabase
O sistema SHALL ter um procedimento que importa o backup do Supabase (`pg_dump` em formato custom) para o banco novo: todos os dados de `public`, mais os usuários com e-mail, hash de senha, nome, data de criação e situação de bloqueio.

#### Scenario: Importação completa
- **WHEN** o procedimento de importação roda com o arquivo `database/gestao-e-auditoria-5s_261105.backup` sobre um banco com o schema aplicado
- **THEN** a quantidade de linhas de cada tabela de `public` é igual à do backup e cada usuário de `auth.users` existe no banco novo com o mesmo id

#### Scenario: Usuário mantém a senha
- **WHEN** um usuário importado entra com a mesma senha que usava no Supabase
- **THEN** o login é aceito

#### Scenario: Schemas internos do Supabase
- **WHEN** a importação roda
- **THEN** os schemas internos do Supabase (`realtime`, `vault`, `graphql`, `pgbouncer`, `supabase_*`) não são criados no banco novo
