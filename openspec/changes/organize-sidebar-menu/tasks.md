# Tasks

## 1. Estrutura das seções

- [x] 1.1 Em `src/components/app/shell.tsx`, trocar o tipo `NavItem` por `NavLeaf`/`NavSection` e reescrever `NAV` com as seis seções, os itens, a ordem e os nomes da spec ("Seções do menu" e "Itens de cada seção"). Cada filho de Reuniões e Manutenção declara a própria `perm` (design D1). Verificar com `npx tsc --noEmit` sem erro
- [x] 1.2 Criar a função pura `visibleSections(role)`, que filtra os itens por `can` e remove seções vazias (D2). Criar `src/test/app-navigation.test.ts` cobrindo "Admin vê todas as seções na ordem", "Sem nomes repetidos", "Gestor não vê Administração" e "Auditor vê o Checklist", e conferir que todos os `to` são os endereços de antes. Verificar com `npm test`

## 2. Renderização do menu aberto e no celular

- [x] 2.1 Reescrever `NavLinks` para percorrer `visibleSections`, com título por seção (`<div role="group" aria-label>` + `<p>` pequeno), sem pastas e sem o estado `open`. Remover o rótulo "Menu" no `aside` e no `Sheet` (D5). Verificar no navegador em 1280 px com o perfil admin que as seções aparecem na ordem e nenhuma abre ou fecha
- [x] 2.2 Criar `src/test/sidebar-menu.test.tsx`, que renderiza `NavLinks` com `vi.mock` de `@tanstack/react-router` (`Link` como `<a>`, `useRouterState` com caminho controlado) e de `@/lib/auth`. Cobrir os cenários "Sem rótulo genérico", "Itens de Reuniões visíveis sem clique", "Detalhe de auditoria" e "Plano de Ação de reunião não confunde com o do 5S" (D3). Verificar com `npm test`
- [x] 2.3 Adicionar ao `sidebar-menu.test.tsx` o cenário "Navegar pelo celular": clicar em "Notas" chama o `onNavigate`. Verificar com `npm test` e, no navegador em 375 px, que a gaveta mostra as mesmas seções e fecha ao tocar num item

## 3. Menu recolhido

- [x] 3.1 No modo `compact`, trocar o título da seção por um separador fino e colocar `title`/`aria-label` como `"<Seção> · <Item>"` (só o nome do item no Dashboard) (D4). Adicionar ao `sidebar-menu.test.tsx` o cenário "Recolher o menu": sem títulos, com `aria-label` "Manutenção · Painel". Verificar com `npm test` e, no navegador, clicando em "Recolher menu"

## 4. Verificação final

- [ ] 4.1 Rodar `npx tsc --noEmit` e `npm test` sem falhas. Conferir no navegador, com os perfis admin, auditor e gestor, que cada um vê as seções e os itens previstos na spec e que todos os links abrem as telas certas
