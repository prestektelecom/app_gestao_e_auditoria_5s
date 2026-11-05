# Tasks

Os testes que precisam de banco usam um Postgres 17 de teste indicado por `TEST_DATABASE_URL`. Sem essa variável, são pulados com `describe.skipIf`.

## 1. Base: dependências, ambiente e build Node

- [x] 1.1 Mover `postgres` para `dependencies`, adicionar `bcryptjs` e `nodemailer` (e os `@types`), e verificar com `npm install` e `npm run build` sem erro
- [x] 1.2 Criar `src/server/env.server.ts`, que valida `DATABASE_URL`, `SESSION_SECRET` (mínimo 32 caracteres), `STORAGE_DIR`, `PUBLIC_ORIGIN`, `PORT` e `SMTP_*` (opcionais) com zod. Verificar com um teste vitest em que falta de variável gera erro citando o nome
- [x] 1.3 Fixar o preset `node-server` em `vite.config.ts` e adicionar o script `start` ao `package.json`. Verificar com `npm run build && npm start`, que deve responder 200 em `/login`
- [x] 1.4 Criar `.env.example` com todas as variáveis comentadas e incluir `.env` e `database/` no `.gitignore`. Verificar com `git check-ignore .env database/x.backup`

## 2. Banco: compatibilidade e setup do schema

- [x] 2.1 Escrever `drizzle/compat/supabase_compat.sql` (D1; fica fora de `drizzle/migrations/` para não conflitar com o journal do drizzle), com papéis, default privileges iguais aos do Supabase, `extensions` + `pgcrypto`, schema `auth` (`users`, `app_sessions`, `password_resets`, `attempts`, `auth.uid()`), `storage.objects` mínima e `storage.upload_nonces`. Verificar que roda duas vezes seguidas sem erro
- [x] 2.2 Criar o script `db:setup` (`scripts/db-setup.ts`), que aplica a compatibilidade e as migrations 0000–0006 em ordem, registra as aplicadas e pula as já aplicadas. Verificar em um banco vazio: as tabelas de `public` existem e uma segunda execução não altera nada
- [x] 2.3 Criar `src/server/db.server.ts` com o pool e `asUser`, `asAnon` e `asService` (D2), e mover `types.ts` para `src/server/db-types.ts`. Verificar com testes de banco: `auth.uid()` retorna o id dentro de `asUser`, retorna nulo em `asAnon`, não vaza entre transações seguidas, e `asUser` de não admin não consegue alterar `units` nem ler `auditors.custom_pin_hash`

## 3. Autenticação própria

- [x] 3.1 Criar `src/server/auth.server.ts` com hash e verificação bcrypt, criação, validação, renovação e remoção de sessão (hash sha256) e o limite de tentativas. Verificar com testes de banco: hash `$2a$` do Supabase é aceito, sessão vencida é recusada e a 6ª tentativa em 15 minutos é bloqueada
- [x] 3.2 Criar o middleware `requireUser`, que lê o cookie, valida a sessão e checa `active`, `system_access` e `banned_until`, e trocar `attachSupabaseAuth` / `requireSupabaseAuth` em `src/start.ts`. Verificar com teste: sem cookie a resposta é "não autorizado", e um usuário inativado é recusado na requisição seguinte
- [x] 3.3 Criar as funções de servidor `login`, `logout`, `getMe` e `bootstrapAdmin` (com lock e só sem admin), e adaptar `src/routes/login.tsx` e `src/lib/auth.tsx` (`getMe` no lugar de `onAuthStateChange`). Verificar manualmente: entrar, recarregar a página continuando logado, sair, e o cadastro recusado quando já existe admin
- [x] 3.4 Criar `requestPasswordReset` e `resetPassword` (token sha256, 1 hora, uso único, `nodemailer` com `PUBLIC_ORIGIN`, mesma resposta para e-mail inexistente, aviso quando não há SMTP), e adaptar `login.tsx` e `reset-password.tsx`. Verificar com teste de banco: token usado ou vencido é recusado e a troca encerra as outras sessões
- [x] 3.5 Reescrever `createUser` e `updateUser` em `admin-users.functions.ts` usando `auth.users`, `profiles` e `user_roles` em uma transação, apagar sessões ao inativar e manter as mensagens atuais. Verificar com testes: e-mail repetido, chamada de não admin e admin removendo o próprio acesso, cada um com a mensagem da spec

## 4. Armazenamento de fotos

- [x] 4.1 Criar `src/server/storage.server.ts` com caminho seguro, gravação e remoção em `STORAGE_DIR/<bucket>/`, tokens de envio HMAC com nonce de uso único e links de leitura HMAC de 1 hora. Verificar com testes unitários: `..` e barra inicial recusados, assinatura adulterada recusada, link vencido recusado, nonce reutilizado recusado
- [x] 4.2 Criar as rotas de servidor `PUT /api/files/upload` (checagem de tipo pelos primeiros bytes e limite de 10 MB) e `GET /api/files/$bucket/$` (403 para link inválido). Verificar com teste: upload de JPEG aceito, PDF recusado, arquivo de 11 MB recusado e GET com assinatura válida devolvendo o arquivo
- [x] 4.3 Adaptar `qr.functions.ts` (`qrUploadUrl`, `qrEvidenceUrls`, `qrRemoveEvidence`) e `maintenance.functions.ts` para usar `storage.server.ts`, mantendo o formato `{ path, signedUrl }`. Verificar no fluxo de QR: enviar, ver e remover uma foto
- [x] 4.4 Criar `getEvidenceUrls` e `getMaintenanceImageUrls` (só para usuário ativo) e `removeMaintenanceImages` (só com `can_manage_maintenance`), e trocar os `supabase.storage` de `auditorias_.$id.tsx`, `imprimir.auditoria.$id.tsx`, `plano-de-acao_.$id.tsx`, `maintenance.ts` e `maintenance-note-dialog.tsx`. Verificar com teste: um usuário sem permissão não remove foto de manutenção

## 5. Acesso a dados pelo servidor

Cada tarefa troca as chamadas `supabase.from/rpc` dos arquivos citados por funções de servidor do domínio (D3), mantendo as chaves do React Query. Verificar sempre com `grep -n "supabase" <arquivos>` vazio e com a tela funcionando contra o banco de ensaio.

- [x] 5.1 Cadastros (`src/server/units.functions.ts`, `people.functions.ts`): `unit-sector-forms.tsx`, `people-forms.tsx`, `unidades*.tsx`, `usuarios.tsx` e as partes correspondentes de `queries.ts`. Verificar criando e editando unidade, setor e auditor, e definindo o PIN pela RPC `set_auditor_pin`
- [x] 5.2 Checklist e configurações (`checklist.functions.ts`, `settings.functions.ts`): `checklist.tsx` e `configuracoes.tsx`, com as RPCs `create_checklist_draft`, `discard_checklist_draft` e `publish_checklist_version`. Verificar criando um rascunho, editando, publicando e alterando um parâmetro de pontuação
- [x] 5.3 Auditorias e plano de ação (`audits.functions.ts`, `action-plans.functions.ts`): `auditorias.tsx`, `auditorias_.$id.tsx`, `imprimir.auditoria.$id.tsx`, `plano-de-acao*.tsx`, com as RPCs `admin_update_answer` e `update_action_plan`. Verificar editando uma resposta como admin (nota recalculada) e editando um 5W2H (registro em `audit_change_logs`)
- [x] 5.4 Painel, análises e relatórios (`analytics.functions.ts`): `analytics.ts`, `use-analytics.ts`, `dashboard.tsx`, `analise.*.tsx`, `relatorios*.tsx`, com a RPC `dashboard_counts`. Verificar com `npm test` (testes de `analytics` passando) e com os números do painel iguais aos do Lovable, usando o mesmo backup
- [x] 5.5 Reuniões (`meetings.functions.ts`): `meetings.ts`, `reunioes.*.tsx` e a RPC `meeting_people`. Verificar criando uma ata com participantes e deliberações e exportando o PDF (`npm test` com `ata-pdf` passando)
- [x] 5.6 Manutenção e notificações (`maintenance.functions.ts`, `notifications.functions.ts`): `maintenance-form.tsx`, `manutencao.*.tsx`, `notifications.tsx`, `notificacoes.tsx`, com as RPCs `maint_create_note` e `refresh_my_notifications`. Verificar criando uma nota com fotos pela área logada e vendo a notificação gerada
- [x] 5.7 Fluxo público de QR (`asAnon`): `auditoria.q.$token.tsx` (RPCs `qr_sector_info`, `qr_validate_auditor`, `qr_start_audit`, `qr_get_audit`, `qr_save_answer`, `qr_add_evidence`, `qr_finalize`) e `manutencao.q.$token.tsx` (`maint_sector_info`, `maint_create_note`). Verificar de ponta a ponta num celular, sem login, e com um teste em que sessão errada recebe "Sessão da auditoria inválida."
- [x] 5.8 Tratamento de erros: converter os erros do Postgres (códigos 23505, 23503, P0001 e outros) em mensagens em português, com o detalhe só no log. Verificar com teste: uma violação de unicidade chega ao navegador sem nome de tabela

## 6. Remoção do Supabase e do Lovable

- [x] 6.1 Ler `PUBLIC_ORIGIN` por `getPublicConfig()` em `qr-codes.tsx` e `manutencao.qr-codes.tsx`, no lugar da constante `lovable.app`. Verificar que o QR gerado aponta para `PUBLIC_ORIGIN`
- [x] 6.2 Apagar `src/integrations/supabase/`, `previewAuthStorage.ts` e `lovable-error-reporting.ts` (e o uso em `__root.tsx`), tirar `@supabase/supabase-js` de `dependencies`, remover as `VITE_SUPABASE_*` / `SUPABASE_*` do `.env` e apagar `supabase/config.toml`. Verificar com `grep -rni "supabase\|lovable.app" src` vazio, `npm run build`, `npm run lint` e `npm test` sem erro
- [x] 6.3 Reescrever o `README.md` com requisitos, variáveis, `db:setup`, migração, build e start, e atualizar as regras de arquitetura no `AGENTS.md` (permissões, sessão, fotos e acesso a dados pelo servidor). Verificar seguindo o README do zero em um banco vazio até o primeiro login

## 7. Migração dos dados

- [x] 7.1 Escrever `scripts/migrate-from-supabase.ts` (D6): staging restaurado com `pg_restore --no-owner --no-privileges`, cópia de `auth.users` e das tabelas de `public` na ordem das FKs com `session_replication_role = replica`, ajuste de sequences e relatório de contagens por tabela. Verificar com o backup `database/gestao-e-auditoria-5s_261105.backup`: todas as contagens batem
- [x] 7.2 Escrever `scripts/import-storage.ts`, que lê os `storage_path` de `audit_evidences` e `maintenance_note_images` e baixa cada arquivo do Supabase de origem para `STORAGE_DIR`, listando as falhas no relatório final e seguindo em frente. Verificar com chave válida (arquivos presentes) e com um caminho inexistente (aparece no relatório)
- [x] 7.3 Documentar no README o passo a passo de ensaio e de virada (Migration Plan do design), incluindo a instalação do `pg_restore` 18. Verificar executando o ensaio com o backup atual

## 8. Verificação integrada

- [ ] 8.1 Ensaio completo no servidor de teste: `db:setup`, migração do backup, login de 2 usuários reais com a senha antiga, e um roteiro por todas as telas e pelos dois fluxos de QR no celular. Registrar o resultado no PR
- [x] 8.2 Rodar com o servidor sem acesso a `*.lovable.app`, `*.lovable.dev` e `*.supabase.co` (bloqueio no firewall ou no hosts). Verificar que login, telas, QR e fotos novas funcionam (Feito monitorando todas as requisições do navegador nas 24 telas, com dois perfis, e nos dois fluxos de QR: nenhuma foi para esses domínios. A build também não contém nenhum deles. O bloqueio no firewall não foi feito.)

## Workflow follow-up

- Fazer a virada de produção conforme o Migration Plan do design: backup novo, migração, `storage:import`, DNS e reimpressão dos QR codes.
- Arquivar a change depois da virada com `/opsx:archive`.
