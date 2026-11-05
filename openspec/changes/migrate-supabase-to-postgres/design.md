# Design

## Context

Motivação: ver proposal.md (Why). Requisitos: specs em `specs/`.

Situação atual, medida no código em 2026-11-05:

```
 NAVEGADOR --supabase-js--> PostgREST / GoTrue / Storage --> Postgres
   64x .from()   21x .rpc() (23 funções)   7x auth.*   6x storage.from()
```

- A segurança está no banco: cerca de 50 policies RLS e 43 funções SQL usam `auth.uid()` (107 ocorrências). As permissões são dadas aos papéis `anon`, `authenticated` e `service_role`.
- As migrations em `drizzle/migrations/` dependem de seis objetos do Supabase: o schema `auth`, `auth.users` (com FK `on delete cascade` e o trigger `on_auth_user_created`, que lê `email` e `raw_user_meta_data`), `auth.uid()`, o schema `extensions` com `pgcrypto`, as policies em `storage.objects` e os três papéis.
- `drizzle/schema.ts` está vazio. O schema verdadeiro está só nos arquivos SQL. Os tipos das tabelas estão em `src/integrations/supabase/types.ts`, gerado pelo Supabase.
- O envio de fotos usa `PUT` em uma URL assinada (`src/lib/image.ts`), e a leitura usa URLs assinadas de 1 hora.
- O fluxo público de QR chama RPCs `qr_*` / `maint_*` do navegador como `anon`. As funções de servidor em `qr.functions.ts` e `maintenance.functions.ts` usam a chave de serviço.
- O backup tem o banco inteiro do Supabase (Postgres 17.11, pg_dump 18.6, formato custom, dados compactados com **zstd**). Ele não contém os arquivos das fotos. Conferido em 2026-11-05:
  - `auth.users` tem as 7 contas de `profiles`, todas com hash bcrypt `$2a$10$`;
  - `auditors.custom_pin_hash` está vazio nos 5 auditores, ou seja, nenhum tem PIN próprio e o código sai do CPF (conferido no staging restaurado);
  - `storage.objects` lista 23 arquivos: 4 em `maintenance-images`, todos ligados a `maintenance_note_images`, e 19 em `audit-evidences` sem dono, porque `audit_evidences` está vazia. Esses 19 são restos de auditorias de teste apagadas.
- Também existem exports CSV por tabela em `database/*.csv`. Eles **não** servem como fonte da migração: não trazem `auth.users`, e um PIN definido no futuro também não sairia no export, porque as permissões de coluna escondem esse campo. As contagens de linhas batem com o backup, então os CSVs servem só para conferência.

## Goals / Non-Goals

**Goals:**
- Manter o SQL existente (policies, funções, triggers, pontuação em `recalc_audit`) praticamente sem mudança, para não reescrever regra de negócio.
- Trocar só a "borda": quem chama o banco, quem autentica e onde ficam os arquivos.
- Fazer a migração de dados repetível, para ensaiar antes de virar a chave.

**Non-Goals:**
- Mudar telas, regras de negócio ou o modelo de dados do app.
- Atualizações em tempo real: o app não usa Realtime hoje.
- Login social, MFA ou SSO. O Supabase oferecia, mas o app não usa.
- Popular `drizzle/schema.ts` ou adotar o query builder do Drizzle. Fica para depois, se valer a pena.
- Alta disponibilidade, réplicas ou backup automático do Postgres. São de operação, não desta change.

## Decisions

### D1. Compatibilidade com o Supabase dentro do Postgres, não reescrita do SQL

O arquivo `drizzle/compat/supabase_compat.sql` roda antes das migrations existentes, a cada `db:setup`, e cria:
- os papéis `anon`, `authenticated` e `service_role` (NOLOGIN). O usuário do `DATABASE_URL`, dono do banco, vira membro dos três. Entram também os mesmos *default privileges* do Supabase em `public`: tudo para os três papéis, ficando o RLS e os REVOKE das migrations responsáveis por restringir;
- o schema `extensions` com `pgcrypto`;
- o schema `auth`, com `auth.users` contendo só as colunas que usamos (`id`, `email`, `encrypted_password`, `raw_user_meta_data`, `banned_until`, `email_confirmed_at`, `created_at`, `updated_at`), mais `auth.app_sessions` e `auth.password_resets`;
- `auth.uid()`, que retorna `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`, a mesma variável que o Supabase usa;
- um schema `storage` com uma tabela `storage.objects` mínima, só para as `create policy` das migrations 0002 e 0006 rodarem. O controle de acesso às fotos passa a ser feito no servidor (D5).

Por quê: as 107 chamadas a `auth.uid()` e as policies continuam valendo sem tocar em uma linha. **Alternativa descartada:** reescrever as policies como checagens no código do servidor. Daria muito mais trabalho, teria mais risco de abrir uma brecha e jogaria fora uma segurança que já funciona.

### D2. Acesso ao banco com `postgres` (postgres.js) e um helper de transação com identidade

`src/server/db.server.ts` exporta um único pool (`postgres(DATABASE_URL)`) e três helpers:

```
asUser(userId, fn)  -> BEGIN; SET LOCAL ROLE authenticated;
                       SELECT set_config('request.jwt.claim.sub', userId, true); fn(sql); COMMIT
asAnon(fn)          -> BEGIN; SET LOCAL ROLE anon; fn(sql); COMMIT
asService(fn)       -> roda como app_server (dono das tabelas), sem RLS
```

`SET LOCAL` vale só dentro da transação, então uma conexão do pool nunca leva a identidade de uma requisição para outra. Os tipos das linhas vêm de `types.ts`, que é mantido e renomeado para `src/server/db-types.ts`.

O PostgREST também passava os cabeçalhos HTTP para o banco em `request.headers`, e `public.request_ip()` usa o `x-forwarded-for` desse valor para limitar as tentativas do QR por IP. Os três helpers aceitam `{ ip }` e preenchem `request.headers` na transação. Sem isso, todos os acessos cairiam juntos em "unknown".

**Alternativas:** Drizzle ORM (o schema está vazio, e gerá-lo do banco atrasaria tudo sem ganho para SQL escrito à mão) e `pg`/node-postgres (postgres.js já está no projeto e tem template tag segura contra injeção).

### D3. Toda consulta do navegador vira função de servidor, agrupada por domínio

Cada chamada `supabase.from/rpc` do navegador vira uma `createServerFn` em módulos `src/lib/<domínio>.functions.ts`: `audits`, `action-plans`, `checklist`, `units`, `people`, `meetings`, `maintenance`, `notifications`, `settings`, `analytics`, `qr`. As queries do React Query (`src/lib/queries.ts`) continuam com as mesmas chaves e só trocam a função que buscam, então o cache e as telas não mudam.

Os módulos ficam em `src/lib/`, e não em `src/server/`. O TanStack Start bloqueia no bundle do navegador qualquer arquivo de uma pasta `server/`, e o navegador precisa importar as server functions para chamá-las. `src/server/` guarda só o que é exclusivo do servidor (banco, sessão, arquivos, e-mail), carregado com `await import()` dentro dos handlers.

Um middleware `requireUser` lê o cookie de sessão, valida a sessão no banco e coloca `userId` no contexto. Funções de área logada usam `asUser`, o fluxo de QR usa `asAnon` e as operações de admin usam `asService`.

**Alternativa descartada:** uma camada "PostgREST caseira" (um endpoint genérico que recebe tabela e filtros), para manter o código do navegador quase igual. Foi descartada porque reabre exatamente o acesso genérico ao banco que a spec `data-access` proíbe, e é difícil de proteger.

### D4. Autenticação própria com sessão opaca em cookie

- **Senha:** `bcryptjs`. Os hashes `$2a$` do Supabase são compatíveis, então os usuários migrados entram com a senha atual. Novas senhas usam custo 12.
- **Sessão:** token aleatório de 32 bytes no cookie `session` (httpOnly, SameSite=Lax, Secure em HTTPS). No banco fica só o `sha256(token)` em `auth.app_sessions` (`user_id`, `expires_at`, `last_seen_at`). A validade de 30 dias é renovada se o último uso passou de 1 dia.
- **Bloqueio:** login e `requireUser` exigem `profiles.active and profiles.system_access` e `auth.users.banned_until` nulo ou no passado. Inativar um usuário apaga as sessões dele.
- **Reset:** token aleatório, gravado como `sha256` em `auth.password_resets`, com validade de 1 hora e uso único. O e-mail é enviado por `nodemailer` com `SMTP_*` e o link usa `PUBLIC_ORIGIN`.
- **Primeiro admin:** a função `bootstrapAdmin` só roda se `has_any_admin()` for falso, numa transação com `LOCK` para evitar dois cadastros ao mesmo tempo.
- **CSRF:** o `createCsrfMiddleware` de `src/start.ts` continua valendo, e o cookie SameSite=Lax completa a proteção.

`AuthProvider` (`src/lib/auth.tsx`) passa a perguntar ao servidor `getMe()`, que devolve perfil e papel, no lugar de `onAuthStateChange`. Componentes que usam `session` passam a usar `profile`.

**Alternativas:** JWT sem estado (não dá para derrubar um usuário inativado na hora, que é uma regra do app) e bibliotecas como Better Auth ou Lucia (trazem tabelas e conceitos próprios para um caso simples de e-mail e senha, e a migração das senhas e dos ids ficaria mais trabalhosa).

### D5. Fotos em disco, com URLs assinadas por HMAC servidas por uma rota do app

- **Arquivos:** `STORAGE_DIR/<bucket>/<storage_path>`.
- **Envio:** `PUT /api/files/upload?t=<token>`. O token é `base64url(payload).hmac`, com `payload = {bucket, path, exp, nonce}`. O nonce é guardado em `upload_nonces` para garantir uso único. Como `uploadWithProgress` já faz `PUT` na URL recebida, o código do navegador não muda.
- **Leitura:** `GET /api/files/<bucket>/<path>?exp=..&sig=..`, com HMAC de `bucket|path|exp` usando `SESSION_SECRET`, validade de 1 hora e cabeçalho `Cache-Control: private`.
- **Segurança:** o caminho é normalizado e recusado se tiver `..`, barra inicial ou caracteres de controle. O tipo é checado pelos primeiros bytes do arquivo (JPEG, PNG ou WebP), com limite de 10 MB.
- **Permissões:** a regra das policies de `storage.objects` (ler: usuário ativo; apagar manutenção: `can_manage_maintenance`) é repetida no servidor antes de emitir links ou apagar, chamando as mesmas funções SQL (`is_active_user`, `can_manage_maintenance`).

**Alternativa:** MinIO (compatível com S3). Seria mais um serviço para manter, sem ganho num servidor único. Se um dia for preciso, troca-se só o módulo `storage.server.ts`.

### D6. Migração de dados em duas etapas, com banco de staging

```
 backup.custom --pg_restore--> [staging: banco "supabase_dump"]
                                   |  (restauração completa, erros de
                                   |   extensões do Supabase ignorados)
                                   v
              scripts/migrate-from-supabase.ts (Node: abre as duas
              conexões e copia tabela a tabela via JSON + json_populate_recordset)
                                   v
                     [banco final, schema já aplicado]
```

- **Fonte única: o `.backup`.** Ele é o único que tem as senhas, e também os PINs de auditores, se algum for definido antes da virada. Os CSVs só conferem as contagens (ver Context).
- O staging recebe o backup inteiro, com `pg_restore --no-owner --no-privileges`. Assim o backup não precisa caber no schema reduzido do banco final. O `pg_restore` precisa ser **18.x com suporte a zstd**, como o do pacote oficial do PostgreSQL (PGDG). Versões mais antigas, ou compiladas sem zstd, não leem os dados.
- O script copia `auth.users` (só as colunas de D1) e depois cada tabela de `public`, na ordem das FKs, com os triggers de usuário desligados durante a cópia (`session_replication_role = replica`). Isso evita que `handle_new_user` ou os triggers de imutabilidade e de versão do checklist reprocessem os dados. Na implementação, os triggers são desligados com `ALTER TABLE ... DISABLE TRIGGER USER`, que o dono das tabelas pode executar. O `session_replication_role` exigiria superusuário. A cópia usa JSON em vez de `COPY` em streaming, porque o streaming do driver travou de forma intermitente nos testes. As tabelas são pequenas, e o `json_populate_recordset` mantém os tipos exatos.
- No fim, o script confere a quantidade de linhas tabela por tabela, comparando staging e final, e ajusta as sequences.
- Fotos: o script `scripts/import-storage.ts` lê os `storage_path` de `audit_evidences` e `maintenance_note_images`, ou seja, só os arquivos que algum registro usa. Hoje são as 4 fotos de manutenção, cerca de 4,8 MB. Os 19 arquivos sem dono de `audit-evidences` não são copiados. O script baixa cada arquivo do Supabase de origem com a chave de serviço (`SOURCE_SUPABASE_URL` e `SOURCE_SUPABASE_SERVICE_KEY`). Ele é o único lugar que ainda usa `@supabase/supabase-js`, como dependência de desenvolvimento.

**Alternativa descartada:** restaurar só `public` direto no banco final. Falharia por causa das FKs para `auth.users` e das diferenças de dono e grants, e não daria um passo de conferência.

### D7. Build Node e configuração

- A validação das variáveis e da pasta de fotos roda num plugin do Nitro (`src/nitro-startup.ts`), porque o Nitro só carrega `src/server.ts` na primeira requisição.
- A variável opcional `TRUST_PROXY` (padrão `false`) diz se o IP do cliente deve vir do `X-Forwarded-For`. Ela só deve ser ligada atrás de um proxy confiável, senão o limite de tentativas pode ser burlado.

- `vite.config.ts` fixa o preset `node-server` do Nitro, no lugar de depender de `NITRO_PRESET`.
- `package.json` ganha `start` (`node .output/server/index.mjs`) e `db:setup`, `db:migrate-from-supabase` e `storage:import`.
- Um módulo `src/server/env.server.ts` valida as variáveis com zod na inicialização.
- `PUBLIC_ORIGIN` chega ao navegador por uma função de servidor `getPublicConfig()`, para não precisar rebuildar ao trocar de domínio. As duas constantes `PUBLIC_ORIGIN` das telas de QR passam a usá-la.
- O pacote `@lovable.dev/vite-tanstack-config` continua só como configuração de build. `previewAuthStorage.ts` e `lovable-error-reporting.ts` são removidos.

## Risks / Trade-offs

- [Alguma consulta do navegador esquecida, que quebra só em produção] → A busca por `supabase` em `src/` precisa terminar vazia, com `@supabase/supabase-js` fora das dependências do app; o build quebra se sobrar import. Um roteiro de teste manual cobre cada tela.
- [Diferença de comportamento entre o PostgREST e o SQL escrito à mão: filtros, `maybeSingle`, ordenação, `count`] → Cada função de servidor é revisada contra a chamada original. Os testes de `src/lib/analytics.ts` continuam passando, e um ensaio com o backup real compara as telas antes e depois.
- [Restauração do backup no staging com erros por extensões do Supabase, como `supabase_vault` e `pg_graphql`] → Os erros desses objetos são esperados e ignorados (`--exit-on-error` desligado). A conferência de contagem final é que decide se deu certo.
- [`SET LOCAL ROLE` exige que `app_server` seja membro dos papéis] → Isso é garantido em D1. Um teste de setup confirma que um `authenticated` não consegue ler `auditors.custom_pin_hash`.
- [Fotos antigas inacessíveis sem a chave de serviço do Lovable Cloud] → O app funciona sem elas e as telas mostram a foto como indisponível. A importação pode rodar depois, a qualquer momento, sem parar o app. Como são só 4 fotos, o plano B é baixá-las pela tela de manutenção do app do Lovable e colocá-las à mão em `STORAGE_DIR/maintenance-images/<storage_path>`.
- [Importar dos CSVs por engano] → Isso perderia as senhas, e também os PINs que existirem na virada. O script de migração lê apenas do staging restaurado do `.backup`.
- [O app vira responsável pela segurança do login, sem rate limit, que o Supabase fazia] → Um limite simples por IP e por e-mail no login e no reset (5 tentativas a cada 15 minutos, guardado em tabela) entra nesta change.
- [Perda de dados entre o backup e a virada] → O backup é de 2026-11-05. Na virada, gera-se um backup novo e repete-se a importação (D6 é repetível), com o app do Lovable em manutenção.

## Migration Plan

1. Instalar no servidor Postgres 17, `pg_restore` 18 com zstd (pacote PGDG) e Node 22 ou mais novo, e criar a pasta de fotos.
2. Ensaio: `db:setup` em banco vazio, depois restaurar o backup no staging e rodar `db:migrate-from-supabase`. Conferir as contagens e testar o login com usuários reais.
3. Testar todas as telas e o fluxo de QR num celular apontando para o servidor de ensaio.
4. Virada: congelar o uso no Lovable, gerar um backup novo, repetir o passo 2 no banco de produção e rodar `storage:import`.
5. Trocar o DNS para o servidor e imprimir de novo os QR codes, se o domínio mudou.
6. **Rollback:** até o passo 5, o app do Lovable continua intacto. Para voltar, basta não trocar o DNS. Depois da virada, os dados novos ficam só no servidor próprio.

## Open Questions

- Qual será o domínio público (`PUBLIC_ORIGIN`)? Ele muda o conteúdo dos QR codes impressos. Basta configurar, não muda o desenho.
- Qual SMTP usar para os e-mails de reset? Só configuração.
- Vai dar para obter a chave de serviço do Lovable Cloud para copiar as fotos? Se não der, o script de importação simplesmente não roda.
