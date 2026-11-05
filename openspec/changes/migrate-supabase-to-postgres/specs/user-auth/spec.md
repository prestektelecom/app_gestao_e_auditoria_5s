# Spec Delta

## Purpose

Define como as pessoas entram no sistema, mantêm a sessão, recuperam a senha e como o admin gerencia contas, tudo sem um provedor externo de autenticação.

## ADDED Requirements

### Requirement: Login com e-mail e senha
O sistema SHALL autenticar usuários por e-mail e senha conferidos contra o hash guardado no banco. Ao entrar, o sistema SHALL criar uma sessão guardada em cookie httpOnly, Secure (em HTTPS) e SameSite=Lax.

#### Scenario: Credenciais corretas
- **WHEN** um usuário ativo, com acesso ao sistema, envia e-mail e senha corretos
- **THEN** o sistema cria a sessão e leva o usuário para o painel

#### Scenario: Credenciais erradas
- **WHEN** o e-mail não existe ou a senha está errada
- **THEN** o sistema mostra a mesma mensagem genérica de credenciais inválidas nos dois casos e não cria sessão

#### Scenario: E-mail com maiúsculas
- **WHEN** o usuário digita o e-mail com letras maiúsculas ou espaços nas pontas
- **THEN** o sistema compara o e-mail sem espaços e em minúsculas

### Requirement: Limite de tentativas
O sistema SHALL bloquear por 15 minutos novas tentativas de login ou de pedido de reset depois de 5 tentativas falhas, ou 5 pedidos, no mesmo e-mail ou no mesmo IP em 15 minutos.

#### Scenario: Muitas tentativas erradas
- **WHEN** alguém erra a senha de um e-mail 5 vezes em 15 minutos
- **THEN** a 6ª tentativa é recusada com "Muitas tentativas. Aguarde alguns minutos.", mesmo com a senha certa

#### Scenario: Depois do bloqueio
- **WHEN** passam 15 minutos sem novas tentativas
- **THEN** o login volta a ser aceito com a senha correta

### Requirement: Usuário inativo não entra
O sistema SHALL recusar login e encerrar sessões de usuários marcados como inativos ou sem acesso ao sistema.

#### Scenario: Login de inativo
- **WHEN** um usuário com `active = false` ou `system_access = false` tenta entrar com a senha correta
- **THEN** o login é recusado

#### Scenario: Inativado com sessão aberta
- **WHEN** o admin inativa um usuário que está com uma sessão aberta
- **THEN** a próxima requisição desse usuário é recusada e ele volta para a tela de login

### Requirement: Sessão com validade
O sistema SHALL manter a sessão válida por 30 dias, renovando a validade quando o usuário usa o sistema, e SHALL guardar no banco apenas o hash do token da sessão.

#### Scenario: Sessão expirada
- **WHEN** um usuário faz uma requisição com uma sessão vencida
- **THEN** a requisição é tratada como não logada e o usuário volta para a tela de login

#### Scenario: Recarregar a página
- **WHEN** um usuário logado recarrega a página ou abre uma nova aba
- **THEN** continua logado, sem digitar a senha de novo

### Requirement: Logout
O sistema SHALL encerrar a sessão no servidor quando o usuário sair.

#### Scenario: Sair
- **WHEN** o usuário clica em sair
- **THEN** a sessão é apagada no banco, o cookie é removido e o token antigo deixa de funcionar

### Requirement: Reset de senha por e-mail
O sistema SHALL permitir pedir a redefinição de senha pelo e-mail. O link SHALL ser de uso único e valer por 1 hora.

#### Scenario: Pedido de reset
- **WHEN** alguém pede reset informando um e-mail cadastrado
- **THEN** o sistema envia para esse e-mail um link para `/reset-password`, montado com a origem pública configurada

#### Scenario: E-mail não cadastrado
- **WHEN** alguém pede reset de um e-mail que não existe
- **THEN** o sistema mostra a mesma confirmação de envio, sem revelar que o e-mail não existe, e não envia nada

#### Scenario: Nova senha
- **WHEN** o usuário abre um link válido e define uma senha de 8 a 72 caracteres
- **THEN** a senha é trocada, o link deixa de valer e as outras sessões desse usuário são encerradas

#### Scenario: Link vencido ou usado
- **WHEN** o usuário abre um link já usado ou com mais de 1 hora
- **THEN** o sistema mostra "Link inválido ou expirado. Solicite um novo." e não troca a senha

### Requirement: Criação do primeiro admin
O sistema SHALL permitir o cadastro pela tela de login somente enquanto não existir nenhum admin. A conta criada dessa forma SHALL ser admin.

#### Scenario: Sistema sem admin
- **WHEN** não existe nenhum admin e alguém se cadastra na tela de login
- **THEN** a conta é criada como admin ativo e já entra no sistema

#### Scenario: Admin já existe
- **WHEN** já existe um admin e alguém tenta se cadastrar, inclusive chamando o servidor direto
- **THEN** o cadastro é recusado

### Requirement: Gestão de usuários pelo admin
O sistema SHALL permitir que só admins criem e editem usuários: nome, e-mail, papel, acesso, situação e senha. E-mails SHALL ser únicos.

#### Scenario: Admin cria usuário
- **WHEN** um admin cria um usuário com e-mail novo e senha de ao menos 8 caracteres
- **THEN** o usuário, o perfil e o papel são criados e o usuário consegue entrar com essa senha, se estiver ativo e com acesso

#### Scenario: E-mail repetido
- **WHEN** um admin cria ou edita um usuário com um e-mail já usado por outra conta
- **THEN** o sistema recusa com a mensagem "Este e-mail já está em uso."

#### Scenario: Não admin
- **WHEN** um usuário que não é admin chama a criação ou edição de usuários
- **THEN** o sistema recusa com "Somente administradores podem gerenciar usuários."

#### Scenario: Admin remove o próprio acesso
- **WHEN** um admin tenta se inativar, tirar o próprio acesso ou deixar de ser admin
- **THEN** o sistema recusa com "Você não pode remover seu próprio acesso de administrador."
