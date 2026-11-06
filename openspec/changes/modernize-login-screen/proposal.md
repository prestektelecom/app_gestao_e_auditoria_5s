# Proposal

## Why

A tela de login é a primeira coisa que todo usuário vê, e hoje ela parece um template padrão. O painel da esquerda é um gradiente liso com dois textos. O formulário fica solto no fundo branco, sem hierarquia e sem os detalhes de acabamento que a tela de redefinição de senha já tem, como o botão de mostrar senha e a animação de entrada. A ideia é modernizar o visual sem mexer no fluxo de autenticação, mantendo a identidade Prestek: azul-marinho, laranja da marca e a fita de demarcação 5S.

## What Changes

- Painel da marca (desktop) ganha conteúdo e textura. Ele passa a ter uma grade sutil com brilho sobre o gradiente azul-marinho, a fita 5S (`tape-line`) sob o título e a lista dos cinco sensos (Seiri, Seiton, Seiso, Seiketsu, Shitsuke).
- O formulário ganha hierarquia, com rótulo pequeno (`eyebrow`), título de boas-vindas, fita 5S e um subtítulo que muda conforme o modo (entrar, recuperar acesso, primeiro administrador).
- Os campos ganham ícone (e-mail, senha, nome). O campo de senha ganha botão de mostrar e ocultar, igual ao da tela de reset.
- Erro de login aparece também dentro do formulário, em um aviso visível perto do botão, e não só no toast. O aviso some quando o usuário volta a digitar.
- O botão principal ganha ícone de seta e estado de carregamento com texto ("Entrando…").
- Entrada animada em sequência (`rise`) e transição suave ao trocar de modo. As duas respeitam `prefers-reduced-motion`.
- No celular, o cabeçalho fica mais caprichado: logo, nome e fita 5S no topo, com o formulário em um cartão.
- Nenhuma mudança em regras de login, sessão, reset ou criação do primeiro administrador.

**Fora do escopo:** a tela de redefinição de senha (`src/routes/reset-password.tsx`) não muda nesta mudança. Alinhar o visual dela pode ser uma mudança separada depois.

## Capabilities

### New Capabilities

- `login-page`: apresentação e interação da tela de login. Cobre o painel da marca, o formulário nos três modos, mostrar e ocultar senha, erro no formulário, estados de carregamento, animação acessível e layout responsivo.

### Modified Capabilities

Nenhuma. As regras de autenticação (capability `user-auth`, em definição na mudança `migrate-supabase-to-postgres`) continuam iguais.

## Impact

- Código: `src/routes/login.tsx` (reescrita do JSX e pequenos estados de UI) e `src/styles.css` (utilitários para a grade e o brilho do painel da marca, escopados à tela de login).
- Sem dependências novas. Usa `lucide-react`, os componentes `ui/` e os utilitários (`tape-line`, `eyebrow`, `rise`) que já existem.
- Sem impacto em API, banco ou servidor.
