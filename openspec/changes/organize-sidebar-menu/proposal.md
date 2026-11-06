# Proposal

## Why

Hoje o menu lateral é uma lista única com onze itens no topo e nenhuma divisão entre eles. O trabalho do 5S fica espalhado: Relatórios aparece abaixo dos cadastros, e Checklist e QR Codes ficam no meio do dia a dia. Reuniões e Manutenção são módulos à parte, mas aparecem como pastas soltas no meio da lista. Há três nomes repetidos ("Dashboard", "Plano de Ação" e "QR Codes"), que ficam iguais quando o menu está recolhido e só mostra ícones. O admin, que vê todos os itens, é quem mais sofre com isso.

## What Changes

- O menu passa a ser dividido em seções com título, nesta ordem:
  - **Dashboard**: fica sozinho no topo, sem título.
  - **Auditoria 5S**: Auditorias, Plano de Ação e Relatórios.
  - **Reuniões**: Atas e Plano de Ação da reunião.
  - **Manutenção**: Painel, Notas, QR Codes de equipamentos e Gestão.
  - **Cadastros**: Unidades e Setores, Checklist 5S e QR Codes dos setores.
  - **Administração**: Usuários e Auditores e Configurações.
- As seções ficam sempre abertas. As pastas que abrem e fecham (Reuniões e Manutenção) deixam de existir, e os itens delas passam a ser visíveis direto, dentro da seção.
- Uma seção só aparece se o perfil tiver pelo menos um item visível nela. As permissões de cada item não mudam.
- Os nomes repetidos ganham um complemento no menu: "Plano de Ação da reunião", "Painel" (Dashboard da manutenção), "QR Codes de equipamentos" e "QR Codes dos setores". Os títulos das páginas e os endereços (URLs) não mudam.
- O rótulo genérico "Menu" do topo da lista sai, porque agora cada seção tem seu próprio título.
- Com o menu recolhido, os títulos das seções viram uma linha fina de separação, e cada ícone mostra, ao passar o mouse, o nome completo com a seção (por exemplo, "Manutenção · Painel").
- O menu do celular (gaveta lateral) usa a mesma organização.

**Premissa:** a pergunta sobre se Reuniões e Manutenção são usadas pelas mesmas pessoas do 5S ficou sem resposta. Por isso, este plano segue com seções sempre abertas. Se cada módulo for de uma equipe diferente, dá para trocar depois por blocos que abrem e fecham, sem mexer no agrupamento.

**Fora do escopo:**
- Trocar o ícone pequeno com "Prestek" pelo logo horizontal no topo do menu. Pode virar uma mudança separada.
- Criar um painel geral que junte 5S, Reuniões e Manutenção.
- Mudar permissões, rotas ou títulos de páginas.

## Capabilities

### New Capabilities

- `app-navigation`: como o menu lateral do sistema se organiza e se apresenta, em desktop (aberto e recolhido) e no celular. Cobre as seções, a ordem e os nomes dos itens, a visibilidade por perfil, o destaque do item ativo e os nomes completos mostrados com o menu recolhido.

### Modified Capabilities

Nenhuma.

## Impact

- `src/components/app/shell.tsx`: a lista `NAV` vira uma lista de seções, e `NavLinks` passa a mostrar títulos e separadores. O controle de abrir e fechar pastas sai.
- Nenhuma mudança em `src/lib/permissions.ts`, nas rotas ou no servidor.
- Novo teste de componente para o menu, no padrão de `src/test/login-page.test.tsx`.
