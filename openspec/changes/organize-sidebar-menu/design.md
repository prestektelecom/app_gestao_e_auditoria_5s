# Design

## Context

O menu fica todo em `src/components/app/shell.tsx`. A lista `NAV` é plana e tem dois tipos de item: link simples ou pasta com `children`. `NavLinks` filtra por `can(role, perm)`, controla quais pastas estão abertas com um estado local e, no modo recolhido, achata as pastas em ícones soltos. O mesmo `NavLinks` é usado no `aside` do desktop e no `Sheet` do celular. `NAV` é exportado, mas nenhum outro arquivo o importa. Motivação e escopo: ver `proposal.md`. Comportamento esperado: ver `specs/app-navigation/spec.md`.

## Goals / Non-Goals

**Goals:**
- Uma estrutura de dados única que descreve seções e itens, para que o desktop aberto, o recolhido e o celular não possam divergir.
- Tirar o estado de abrir e fechar pastas, que deixa de ser necessário.

**Non-Goals:**
- Mudar o visual dos itens em si (altura, cores, destaque). O `linkCls` atual continua.
- Mexer em `permissions.ts`.

## Decisions

### 1. `NAV` vira uma lista de seções

```ts
type NavLeaf = { to: string; label: string; icon: LucideIcon; perm: Permission };
type NavSection = { title?: string; items: NavLeaf[] };
export const NAV: NavSection[] = [
  { items: [dashboard] },               // sem título
  { title: "Auditoria 5S", items: [...] },
  ...
];
```

Cada item carrega a sua própria `perm`. Os filhos de Reuniões e Manutenção, que hoje herdam a permissão da pasta (`meetings.view`, `maintenance.view`), passam a declarar essa permissão de forma explícita. O QR Codes de equipamentos continua com `maintenance.qrcodes`. Assim as regras de visibilidade continuam as mesmas, item por item.

*Alternativa considerada:* manter `children` e só acrescentar um campo `section`. Foi descartada porque deixaria duas formas de agrupar coisas e manteria o código de pasta, que não é mais usado.

### 2. Filtragem numa função pura

Uma função `visibleSections(role)` devolve as seções já filtradas, sem as que ficaram vazias. Ela fica fácil de testar sem renderizar nada e cobre direto os cenários de visibilidade por perfil.

### 3. Item ativo: o prefixo mais longo vence

A regra atual (`path === to || path.startsWith(to + "/")`) já serve para todos os itens, porque nenhum endereço de item é prefixo de outro. `/plano-de-acao` e `/reunioes/plano-de-acao` não colidem. Ela continua igual, e um teste fixa o caso do Plano de Ação.

### 4. Recolhido: separador no lugar do título

No modo `compact`, cada seção com título começa com uma linha (`border-t border-sidebar-border`, com margem vertical pequena) no lugar do título. O `title` do link vira `"<Seção> · <Item>"`, ou só o nome do item quando a seção não tem título. Também entra um `aria-label` com o mesmo texto, para leitores de tela.

### 5. Títulos de seção

Os títulos usam um `<p>` pequeno, no estilo do rótulo "Menu" de hoje (`px-2 pt-3 pb-1 text-xs font-medium text-sidebar-foreground/60`). Cada seção fica dentro de um `<div role="group" aria-label={title}>`, e os testes encontram as seções por esse papel.

## Risks / Trade-offs

- [O menu do admin fica mais comprido, porque as pastas deixam de esconder itens] → São 15 itens mais os títulos, e o painel já rola (`overflow-y-auto`). Se ficar alto demais, é possível voltar a abrir e fechar por seção sem mudar o agrupamento.
- [A premissa de seções sempre abertas pode não servir se cada módulo for de uma equipe] → Fica registrada no proposal. A estrutura `NavSection` aceita depois um campo `collapsible` sem refazer nada.
- [Usuários acostumados a procurar "Relatórios" mais abaixo] → É uma mudança pequena, e as seções com título ajudam a reencontrar o item.
