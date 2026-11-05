# Proposal

## Why

O app nasceu no Lovable e depende do Supabase do Lovable Cloud para tudo: banco, login, API e fotos. Para rodar no nosso próprio servidor, com os dados sob nosso controle e sem manter a stack de containers do Supabase, o app precisa usar um PostgreSQL comum e fazer login, acesso a dados e armazenamento de arquivos dentro do próprio servidor Node.

## What Changes

- **BREAKING** O navegador deixa de falar com o banco. As consultas que hoje são feitas direto do navegador (`supabase.from` / `.rpc`, cerca de 85 chamadas em ~25 arquivos) passam a ser funções de servidor (`createServerFn`).
- **BREAKING** O login passa a ser próprio, com sessão em cookie httpOnly, no lugar do Supabase Auth (JWT). Os usuários existentes mantêm a senha, porque os hashes bcrypt de `auth.users` são migrados.
- Reset de senha por e-mail via SMTP próprio, no lugar do e-mail do Supabase.
- Criação, edição e inativação de usuários pelo admin passam a gravar direto no banco. Usuário inativo ou sem acesso continua impedido de entrar.
- O Postgres continua aplicando as regras de segurança (RLS) e as funções SQL atuais. O servidor informa o usuário logado em cada transação, através de uma função `auth.uid()` compatível.
- As fotos de evidência (`audit-evidences`) e de manutenção (`maintenance-images`) passam a ficar em uma pasta no servidor, servidas por links assinados com validade.
- Script de migração que importa o backup do Supabase (`database/*.backup`) para o Postgres novo: dados do app, usuários e senhas.
- O app roda como servidor Node (`node-server`), configurado por variáveis de ambiente. A origem pública usada nos QR codes vira configuração e deixa de ser fixa em `lovable.app`.
- Remoção de `@supabase/supabase-js`, de `src/integrations/supabase/` e dos trechos de preview/autenticação específicos do Lovable.

## Capabilities

### New Capabilities

- `database-hosting`: PostgreSQL próprio. Inclui papéis e contexto de segurança (RLS com `auth.uid()`), aplicação do schema e importação dos dados do backup do Supabase.
- `user-auth`: login com e-mail e senha, sessões, logout, reset de senha por e-mail, criação do primeiro admin e gestão de usuários pelo admin, incluindo o bloqueio de inativos.
- `data-access`: todo acesso a dados passa por funções de servidor, executadas com o contexto do usuário logado ou do token público de QR code.
- `file-storage`: envio, leitura (por links assinados) e remoção das fotos de evidência e de manutenção, e importação das fotos existentes.
- `server-deployment`: build e execução como servidor Node, com configuração por variáveis de ambiente, incluindo a origem pública dos QR codes.

### Modified Capabilities

(nenhuma: ainda não há specs no projeto)

## Impact

- **Código:** `src/lib/auth.tsx`, `src/lib/admin-users.functions.ts`, `src/lib/qr.functions.ts`, `src/lib/maintenance*.ts`, `src/lib/queries.ts`, `src/lib/analytics.ts`, `src/lib/meetings.ts`, `src/routes/login.tsx`, `src/routes/reset-password.tsx`, as rotas públicas de QR, a maioria das rotas em `src/routes/_authenticated/` e os componentes em `src/components/app/` que consultam dados.
- **Banco:** as migrations em `drizzle/migrations/` continuam a base do schema. Entra uma camada de compatibilidade que substitui os objetos do Supabase usados por elas: schema `auth`, `auth.users`, `auth.uid()`, papéis `anon`/`authenticated`/`service_role` e as policies de `storage.objects`.
- **Dependências:** entram `postgres` (já no projeto, passa a dependência de produção), `bcryptjs` e `nodemailer`. Sai `@supabase/supabase-js`.
- **Operação:** passam a ser necessários Postgres 17 no servidor, uma pasta persistente para as fotos, um SMTP para os e-mails de reset e o `pg_restore` 18 para importar o backup.
- **Fotos antigas:** os arquivos não estão no backup e precisam ser baixados do Lovable Cloud, o que depende de acesso à chave de serviço. Sem ela, os registros continuam existindo, mas as fotos antigas não abrem.
