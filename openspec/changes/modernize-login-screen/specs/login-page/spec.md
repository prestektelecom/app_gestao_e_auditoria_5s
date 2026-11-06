# Spec Delta

## Purpose

Define como a tela de login se apresenta e responde ao usuário nos modos entrar, recuperar acesso e criar o primeiro administrador, mantendo a identidade visual Prestek 5S em desktop e celular.

## ADDED Requirements

### Requirement: Painel da marca no desktop
Em telas largas, a tela de login SHALL mostrar ao lado do formulário um painel da marca com o logo e o nome Prestek Telecom, o título "Prestek 5S", a fita de demarcação 5S, a descrição do sistema, os cinco sensos (Seiri, Seiton, Seiso, Seiketsu, Shitsuke) e o rodapé de copyright.

#### Scenario: Desktop
- **WHEN** a tela de login é aberta em uma janela com 1024 px de largura ou mais
- **THEN** o painel da marca aparece ao lado do formulário com logo, título, fita 5S, os cinco sensos e o copyright

#### Scenario: Celular
- **WHEN** a tela de login é aberta em uma janela com menos de 1024 px de largura
- **THEN** o painel da marca fica oculto e o topo do formulário mostra o logo, o nome "Prestek 5S" e a fita 5S

### Requirement: Cabeçalho do formulário por modo
O formulário SHALL mostrar um rótulo curto, um título e um subtítulo próprios do modo atual. Os modos são entrar, recuperar acesso e criar o primeiro administrador.

#### Scenario: Modo entrar
- **WHEN** a tela abre no modo entrar
- **THEN** o título é "Bem-vindo de volta" e o subtítulo convida a entrar com e-mail e senha

#### Scenario: Modo recuperar acesso
- **WHEN** o usuário clica em "Esqueci minha senha"
- **THEN** o título passa a ser "Recuperar acesso", o subtítulo explica que um link será enviado por e-mail e o campo de senha some

#### Scenario: Modo primeiro administrador
- **WHEN** não existe admin e o usuário clica em "Primeiro acesso? Criar administrador do sistema"
- **THEN** o título passa a ser "Criar primeiro administrador" e o campo "Nome completo" aparece antes do e-mail

### Requirement: Campos com ícone
Cada campo do formulário SHALL mostrar um ícone que indica o seu conteúdo (nome, e-mail, senha) e manter o rótulo de texto associado ao campo.

#### Scenario: Ícones visíveis
- **WHEN** o formulário é exibido
- **THEN** cada campo visível tem um ícone à esquerda e um rótulo que o leitor de tela anuncia

### Requirement: Mostrar e ocultar senha
O campo de senha SHALL ter um botão que alterna entre mostrar e ocultar o texto digitado. O botão SHALL ter um nome acessível que descreve a ação atual.

#### Scenario: Mostrar senha
- **WHEN** o usuário clica no botão de mostrar senha
- **THEN** a senha fica visível e o botão passa a se chamar "Ocultar senha"

#### Scenario: Ocultar senha
- **WHEN** a senha está visível e o usuário clica no botão de novo
- **THEN** a senha volta a ficar oculta e o botão passa a se chamar "Mostrar senha"

### Requirement: Erro de login no formulário
Quando o login falha, a tela SHALL mostrar a mensagem de erro dentro do formulário, anunciada a leitores de tela, além do aviso flutuante. A mensagem SHALL sumir quando o usuário editar o e-mail ou a senha, ou trocar de modo.

#### Scenario: Senha errada
- **WHEN** o usuário envia credenciais inválidas
- **THEN** a mensagem de erro aparece dentro do formulário, perto do botão, com papel de alerta

#### Scenario: Usuário corrige
- **WHEN** há uma mensagem de erro e o usuário digita no e-mail ou na senha
- **THEN** a mensagem de erro some

### Requirement: Estado de envio
Durante o envio, o botão principal SHALL ficar desativado, mostrar um indicador de carregamento e um texto de progresso próprio do modo. Fora do envio, o botão SHALL mostrar o texto da ação e um ícone de seta.

#### Scenario: Enviando login
- **WHEN** o usuário envia o formulário no modo entrar
- **THEN** o botão fica desativado e mostra "Entrando…" com indicador de carregamento até a resposta chegar

#### Scenario: Envio duplicado
- **WHEN** o botão está no estado de envio e o usuário clica de novo
- **THEN** nenhum novo envio é feito

### Requirement: Animação acessível
A tela SHALL animar a entrada dos elementos e a troca de modo. Quando o sistema operacional pede movimento reduzido, a tela SHALL aparecer sem animação.

#### Scenario: Movimento normal
- **WHEN** a tela é aberta sem preferência de movimento reduzido
- **THEN** os elementos entram com animação curta em sequência

#### Scenario: Movimento reduzido
- **WHEN** a tela é aberta com a preferência de movimento reduzido ativa
- **THEN** os elementos aparecem direto, sem animação

### Requirement: Comportamento de autenticação preservado
O novo visual SHALL manter o comportamento atual da tela: redirecionar quem já tem sessão para o painel, focar o primeiro campo ao trocar de modo, exigir senha de 8 caracteres ou mais no primeiro administrador e mostrar a opção de primeiro administrador só quando não existe admin.

#### Scenario: Já logado
- **WHEN** um usuário com sessão ativa abre a tela de login
- **THEN** ele é levado para o painel

#### Scenario: Admin já existe
- **WHEN** já existe um admin no sistema
- **THEN** a opção "Primeiro acesso? Criar administrador do sistema" não aparece
