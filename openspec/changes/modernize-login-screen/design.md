# Design

## Context

A tela vive em `src/routes/login.tsx`, um componente só, com `ssr: false` e três modos (`login`, `forgot`, `bootstrap`) em um único `useState`. Ela usa o tema escopado `.management-theme` e a classe `.reference-login-brand` (gradiente `--gradient-primary`) de `src/styles.css`. O CSS já tem utilitários que encaixam no visual 5S (`tape-line`, `eyebrow`, `rise`) e um bloco `prefers-reduced-motion` que desliga essas animações. A tela de reset (`src/routes/reset-password.tsx`) já implementa mostrar e ocultar senha com `Eye`/`EyeOff` do `lucide-react`.

O teste de UI atual (`src/test/app-routing.test.tsx`) só confere o roteamento. O vitest roda em jsdom com Testing Library disponível.

## Goals / Non-Goals

**Goals:**
- Atender a spec `login-page` mexendo só em `login.tsx` e `styles.css`.
- Manter intacta a lógica de `submit`, os efeitos e as chamadas a `auth.functions`.

**Non-Goals:**
- Extrair um componente `PasswordInput` compartilhado com a tela de reset. Isso fica para a mudança que alinhar o reset.
- Tema escuro na tela de login.
- Mudar `components/ui/input.tsx` ou `button.tsx`, que são usados no app inteiro.

## Decisions

**1. Ícones dentro do campo por posicionamento, sem mexer no `Input`.**
Cada campo fica em um wrapper `relative`, com o ícone `absolute` à esquerda (`pointer-events-none`, `aria-hidden`) e o `Input` com `pl-9`. O de senha leva também `pr-10` e um `<button type="button">` à direita, no mesmo padrão do reset. Os campos e o botão ficam com altura `h-10` (40 px), e o cartão com `max-w-sm`, para a tela não ficar grande demais em notebook.
*Alternativa:* adicionar slots de ícone ao `Input` compartilhado. Isso foi descartado porque espalha a mudança pelo app todo por causa de uma tela.

**2. Componentes locais pequenos no próprio arquivo.**
`BrandPanel`, `IconField` e `PasswordField` ficam como funções no mesmo arquivo `login.tsx`, e um mapa `COPY` por modo guarda rótulo, título, subtítulo, texto do botão e texto de progresso. Isso tira os ternários repetidos do JSX.
*Alternativa:* arquivos em `components/app/`. Foi descartado porque nada disso é reutilizado hoje.

**3. Erro no formulário por estado local.**
Um `formError: string | null` é preenchido no `catch` do login (com a mesma mensagem do toast) e limpo no `onChange` do e-mail e da senha e ao trocar de modo. Ele é renderizado em um bloco com `role="alert"` acima do botão. O toast continua.

**4. Troca de modo animada via `key`.**
O bloco do cabeçalho e dos campos recebe `key={mode}` e as classes `rise`. A troca remonta o bloco e reexecuta a animação. O atraso em sequência usa `style={{ animationDelay }}` em passos de cerca de 60 ms. Como `rise` já é desligado em `prefers-reduced-motion`, a acessibilidade vem pronta.
*Alternativa:* uma biblioteca de animação (framer-motion). Foi descartada porque seria uma dependência nova para um efeito que o CSS já resolve.
*Cuidado:* remontar perde o foco, mas o efeito atual que foca o primeiro campo ao trocar de modo já cobre isso. Os valores dos campos ficam no estado do componente pai, então não se perdem.

**5. Textura do painel da marca em CSS escopado.**
Um utilitário novo em `styles.css`, aplicado só a `.reference-login-brand`, cria camadas de `background` com uma grade fina (`linear-gradient` de 1 px repetido, com opacidade baixa e máscara radial para sumir nas bordas) e um brilho radial laranja e azul sobre o `--gradient-primary`. Não usa imagem e não pesa no carregamento.
Os cinco sensos ficam numa lista estática com numeração em `font-mono` e o nome japonês com a tradução em português (Utilização, Organização, Limpeza, Padronização, Disciplina).

**6. Formulário em cartão.**
A coluna do formulário ganha `app-backdrop` (o brilho sutil que já existe) e o formulário vai dentro de um `panel` com sombra (`--shadow-card`). No celular, o cartão ocupa a largura com margem e o cabeçalho de logo e fita fica acima dele.

**7. Testes por render direto do componente.**
O teste renderiza `Route.options.component` com `vi.mock` de `@/lib/auth.functions`, de `@/lib/auth` (`useAuth`) e de `useNavigate`. Assim valida o que a spec pede (alternar senha, erro inline que aparece e some, textos por modo, botão desativado durante o envio, opção de primeiro admin) sem subir o router nem o servidor.

## Risks / Trade-offs

- [Grade e brilho podem ficar carregados ou baixar o contraste do texto] → opacidade baixa (cerca de 6%) e máscara radial. Conferir o contraste do título e dos sensos sobre o gradiente na revisão visual.
- [Remontar com `key` em toda troca de modo pode piscar] → animação curta (a `rise` tem 0,55 s) e só no bloco do formulário, não na página toda.
- [O visual da tela de reset fica diferente do login até a próxima mudança] → aceito. Está registrado como fora do escopo na proposta.
- [Texto "Entrando…" e o de outros modos podem mudar a largura do botão] → o botão é `w-full`, então a largura não muda.
