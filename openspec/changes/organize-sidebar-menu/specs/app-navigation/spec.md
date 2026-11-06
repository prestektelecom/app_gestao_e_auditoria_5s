# Spec Delta

## Purpose

Define como o menu lateral do sistema organiza e apresenta os módulos (Auditoria 5S, Reuniões, Manutenção, cadastros e administração), para que cada perfil encontre suas telas com rapidez no desktop, aberto ou recolhido, e no celular.

## ADDED Requirements

### Requirement: Seções do menu
O menu lateral SHALL mostrar o item "Dashboard" sozinho no topo, sem título. Abaixo dele vêm as seções com título, nesta ordem: "Auditoria 5S", "Reuniões", "Manutenção", "Cadastros" e "Administração".

#### Scenario: Admin vê todas as seções na ordem
- **WHEN** um usuário com perfil Administrador abre o sistema no desktop com o menu aberto
- **THEN** o menu mostra "Dashboard" no topo e, em seguida, os títulos "Auditoria 5S", "Reuniões", "Manutenção", "Cadastros" e "Administração", nessa ordem

#### Scenario: Sem rótulo genérico
- **WHEN** o menu é exibido
- **THEN** o rótulo "Menu" não aparece acima da lista de itens

### Requirement: Itens de cada seção
Cada seção SHALL conter estes itens, nesta ordem e com estes nomes. Auditoria 5S: "Auditorias", "Plano de Ação", "Relatórios". Reuniões: "Atas", "Plano de Ação da reunião". Manutenção: "Painel", "Notas", "QR Codes de equipamentos", "Gestão". Cadastros: "Unidades e Setores", "Checklist 5S", "QR Codes dos setores". Administração: "Usuários e Auditores", "Configurações".

#### Scenario: Endereços mantidos
- **WHEN** o usuário clica em um item do menu
- **THEN** o sistema abre o mesmo endereço de antes da mudança (por exemplo, "Painel" abre `/manutencao/dashboard` e "QR Codes dos setores" abre `/qr-codes`)

#### Scenario: Sem nomes repetidos
- **WHEN** um Administrador vê o menu aberto
- **THEN** nenhum nome de item aparece mais de uma vez

### Requirement: Seções sempre abertas
Os itens de todas as seções SHALL estar visíveis direto no menu, sem precisar abrir ou fechar pastas.

#### Scenario: Itens de Reuniões visíveis sem clique
- **WHEN** o usuário abre qualquer tela fora de Reuniões
- **THEN** "Atas" e "Plano de Ação da reunião" já aparecem no menu, sem clique adicional

### Requirement: Visibilidade por perfil
Cada item SHALL aparecer só para os perfis que já tinham permissão para vê-lo antes desta mudança. Uma seção sem nenhum item visível para o perfil MUST ficar oculta, inclusive o título.

#### Scenario: Gestor não vê Administração
- **WHEN** um usuário com perfil Gestor da Área abre o sistema
- **THEN** a seção "Administração" não aparece, e a seção "Cadastros" mostra só "Unidades e Setores"

#### Scenario: Auditor vê o Checklist
- **WHEN** um usuário com perfil Auditor abre o sistema
- **THEN** "Checklist 5S" aparece em "Cadastros", "QR Codes dos setores" não aparece, e "QR Codes de equipamentos" não aparece em "Manutenção"

### Requirement: Item ativo
O item da tela atual SHALL aparecer destacado. Telas internas de um item, como o detalhe de uma auditoria, MUST destacar o item ao qual pertencem.

#### Scenario: Detalhe de auditoria
- **WHEN** o usuário está em uma página dentro de `/auditorias/`
- **THEN** o item "Auditorias" aparece destacado e nenhum outro item aparece destacado

#### Scenario: Plano de Ação de reunião não confunde com o do 5S
- **WHEN** o usuário está em `/reunioes/plano-de-acao`
- **THEN** só "Plano de Ação da reunião" aparece destacado, e "Plano de Ação" da Auditoria 5S não

### Requirement: Menu recolhido
Com o menu recolhido no desktop, o menu SHALL mostrar só os ícones, separando as seções por uma linha fina, sem os títulos. Cada ícone MUST mostrar, ao passar o mouse, o nome do item com a seção (por exemplo, "Manutenção · Painel"). O Dashboard do topo mostra só "Dashboard".

#### Scenario: Recolher o menu
- **WHEN** o usuário clica em "Recolher menu"
- **THEN** os títulos das seções somem, aparecem linhas de separação entre os grupos de ícones, e o ícone de "Painel" mostra "Manutenção · Painel" ao passar o mouse

### Requirement: Menu no celular
No celular, a gaveta do menu SHALL ter as mesmas seções, itens, nomes e regras de visibilidade do menu aberto no desktop. Tocar em um item MUST fechar a gaveta.

#### Scenario: Navegar pelo celular
- **WHEN** o usuário abre a gaveta do menu no celular e toca em "Notas"
- **THEN** o sistema abre `/manutencao/notas` e a gaveta fecha
