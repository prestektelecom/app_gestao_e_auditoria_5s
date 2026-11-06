# Tasks

## 1. Estilos do painel da marca

- [x] 1.1 Em `src/styles.css`, estender `.reference-login-brand` com as camadas de grade fina (máscara radial) e brilho laranja e azul sobre `--gradient-primary` (design D5), sem imagem. Verificar com `npm run build` sem erro e, no navegador em 1280 px, que a grade aparece sutil e some nas bordas

## 2. Estrutura e painel da marca

- [x] 2.1 Em `src/routes/login.tsx`, criar o mapa `COPY` por modo (rótulo, título, subtítulo, texto do botão, texto de progresso) e o componente local `BrandPanel` com logo, "Prestek Telecom", título "Prestek 5S", `tape-line`, descrição, lista numerada dos cinco sensos com tradução e copyright (D2, D5). Verificar no navegador em 1280 px que o painel mostra todos esses itens e, em 375 px, que fica oculto
- [x] 2.2 Montar a coluna do formulário com `app-backdrop` e o formulário dentro de um `panel` com sombra. No celular, colocar o cabeçalho de logo, "Prestek 5S" e `tape-line` acima do cartão (D6). Verificar no navegador em 375 px e em 1280 px
- [x] 2.3 Criar `src/test/login-page.test.tsx` com o render de `Route.options.component` e `vi.mock` de `@/lib/auth.functions`, `@/lib/auth` e `useNavigate` (D7), cobrindo os cenários "Modo entrar", "Modo recuperar acesso", "Modo primeiro administrador", "Admin já existe" e "Já logado" da spec. Verificar com `npm test`

## 3. Campos, senha e erro

- [x] 3.1 Criar os componentes locais `IconField` (ícone `Mail`/`User` absoluto, `aria-hidden`, `Input` com `pl-9 h-10`) e `PasswordField` (ícone `Lock` e botão `Eye`/`EyeOff` com `aria-label` "Mostrar senha"/"Ocultar senha") (D1), e trocar os três campos por eles mantendo `id`, `autoComplete` e rótulos. Adicionar ao `login-page.test.tsx` os cenários "Ícones visíveis", "Mostrar senha" e "Ocultar senha". Verificar com `npm test`
- [x] 3.2 Adicionar o estado `formError`, preenchido no `catch` do login e limpo no `onChange` de e-mail e senha e na troca de modo, renderizado com `role="alert"` acima do botão. O toast continua (D3). Adicionar os cenários "Senha errada" e "Usuário corrige". Verificar com `npm test`

## 4. Botão, animação e acabamento

- [x] 4.1 Botão principal com `ArrowRight` em repouso e `Loader2` mais o texto de progresso de `COPY` durante o envio, desativado enquanto `busy`. Adicionar os cenários "Enviando login" e "Envio duplicado" (login com promessa pendente, segundo clique sem nova chamada). Verificar com `npm test`
- [x] 4.2 Aplicar `key={mode}` e `rise` com `animationDelay` em passos de cerca de 60 ms no bloco de cabeçalho e campos, e `rise` na entrada do painel da marca (D4). Verificar no navegador que a troca de modo anima e mantém os valores digitados e o foco no primeiro campo e que, com movimento reduzido ativo (DevTools > Rendering > `prefers-reduced-motion: reduce`), nada anima

## 5. Verificação final

- [x] 5.1 Rodar `npx tsc --noEmit`, `npm run lint` e `npm test` sem erros
- [ ] 5.2 Fazer o fluxo completo no navegador (`npm run dev`): login com senha errada (erro aparece e some ao digitar), login certo (vai para o painel), "Esqueci minha senha" (envia e volta) e conferir o contraste do título e dos sensos sobre o painel. Verificar em 375 px e em 1280 px

## Workflow follow-up

- Arquivar a mudança com `/opsx:archive` depois da revisão visual.
- Considerar uma mudança separada para alinhar `src/routes/reset-password.tsx` ao novo visual e extrair um `PasswordField` compartilhado.
