import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, ClipboardCheck, ListTodo, ListChecks, QrCode, Building2, Users, FileBarChart, Settings,
  Menu, PanelLeftClose, PanelLeftOpen, LogOut, ChevronDown, UserRound, CalendarDays, FileText, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { can, ROLE_LABEL, type Permission } from "@/lib/permissions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NotificationBell } from "./notifications";
import { Button } from "@/components/ui/button";
import logoPrestek from "@/assets/logo-prestek.png";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; perm: Permission; children?: { to: string; label: string; icon: typeof LayoutDashboard; perm?: Permission }[] };

export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { to: "/auditorias", label: "Auditorias", icon: ClipboardCheck, perm: "audits.view" },
  { to: "/plano-de-acao", label: "Plano de Ação", icon: ListTodo, perm: "actionPlans.view" },
  { to: "/checklist", label: "Checklist 5S", icon: ListChecks, perm: "checklist.view" },
  { to: "/qr-codes", label: "QR Codes", icon: QrCode, perm: "qrcodes.view" },
  { to: "/unidades", label: "Unidades e Setores", icon: Building2, perm: "units.view" },
  { to: "/usuarios", label: "Usuários e Auditores", icon: Users, perm: "people.view" },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart, perm: "reports.view" },
  {
    to: "/reunioes", label: "Reuniões", icon: CalendarDays, perm: "meetings.view",
    children: [
      { to: "/reunioes/atas", label: "Atas", icon: FileText },
      { to: "/reunioes/plano-de-acao", label: "Plano de Ação", icon: ListTodo },
    ],
  },
  {
    to: "/manutencao", label: "Manutenção", icon: Wrench, perm: "maintenance.view",
    children: [
      { to: "/manutencao/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/manutencao/notas", label: "Notas", icon: FileText },
      { to: "/manutencao/qr-codes", label: "QR Codes", icon: QrCode, perm: "maintenance.qrcodes" },
      { to: "/manutencao/gestao", label: "Gestão", icon: ClipboardCheck },
    ],
  },
  { to: "/configuracoes", label: "Configurações", icon: Settings, perm: "settings.view" },
];

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-card p-0.5">
        <img src={logoPrestek} alt="Prestek Telecom" className="size-full object-contain" />
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold leading-tight">Prestek</p>
          <p className="truncate text-[10px] leading-tight text-sidebar-foreground/60">Gestão e Auditoria 5S</p>
        </div>
      )}
    </div>
  );
}

const linkCls = (active: boolean, compact?: boolean) => cn(
  "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
  compact && "justify-center px-0",
  active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
);

function NavLinks({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { role } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter((n) => can(role, n.perm)).map((n) => {
        const active = path === n.to || path.startsWith(n.to + "/");
        const Icon = n.icon;
        if (n.children) {
          const isOpen = open[n.to] ?? active;
          if (compact) {
            return n.children.filter((c) => !c.perm || can(role, c.perm)).map((c) => {
              const CI = c.icon;
              return (
                <Link key={c.to} to={c.to} onClick={onNavigate} title={`${n.label} · ${c.label}`} className={linkCls(path.startsWith(c.to), true)}>
                  <CI className="size-4 shrink-0" />
                </Link>
              );
            });
          }
          return (
            <div key={n.to}>
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [n.to]: !isOpen }))} className={cn(linkCls(false), "w-full", active && "font-medium")}>
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate text-left">{n.label}</span>
                <ChevronDown className={cn("size-3.5 transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-sidebar-border pl-2">
                  {n.children.filter((c) => !c.perm || can(role, c.perm)).map((c) => {
                    const CI = c.icon;
                    return (
                      <Link key={c.to} to={c.to} onClick={onNavigate} className={linkCls(path === c.to || path.startsWith(c.to + "/"))}>
                        <CI className="size-4 shrink-0" /><span className="truncate">{c.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }
        return (
          <Link key={n.to} to={n.to} onClick={onNavigate} title={compact ? n.label : undefined} className={linkCls(active, compact)}>
            <Icon className="size-4 shrink-0" />
            {!compact && <span className="truncate">{n.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { profile, role, signOut, session } = useAuth();
  const navigate = useNavigate();
  const name = profile?.name || session?.user.email || "";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "U";

  return (
    <div className="management-theme min-h-screen bg-background text-foreground">
      <div className="flex">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen print:!hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 lg:flex",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <Brand compact={collapsed} />
          <div className="flex-1 overflow-y-auto p-2">
            {!collapsed && <p className="px-2 py-2 text-xs font-medium text-sidebar-foreground/60">Menu</p>}
            <NavLinks compact={collapsed} />
          </div>
          <div className="border-t border-sidebar-border p-2">
          {!collapsed && <p className="truncate px-2 py-2 text-xs text-sidebar-foreground/70" title={profile?.email}>{profile?.email}</p>}
          <Button variant="ghost" onClick={async () => { await signOut(); navigate({ to: "/login" }); }} title="Sair" className={cn("w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", collapsed && "justify-center px-0")}>
            <LogOut className="size-4" />{!collapsed && "Sair"}
          </Button>
          <Button variant="ghost"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "w-full justify-start gap-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Recolher menu</>}
          </Button>
          </div>
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="management-theme w-[272px] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Brand />
            <div className="p-2"><p className="px-2 py-2 text-xs text-sidebar-foreground/60">Menu</p><NavLinks onNavigate={() => setMobileOpen(false)} /></div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 print:hidden flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
                <Menu className="size-5" />
              </Button>
              <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => setCollapsed((c) => !c)} aria-label="Alternar menu" title="Alternar menu">
                <PanelLeftClose className="size-4" />
              </Button>
              <div className="hidden h-5 w-px bg-border sm:block" />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-medium text-muted-foreground">Prestek 5S · Painel gerencial</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-2 py-1.5 transition hover:bg-card">
                <span className="grid size-7 place-items-center rounded-md bg-primary/10 font-mono text-[11px] text-primary">{initials}</span>
                <span className="hidden text-left md:block">
                  <span className="block max-w-[160px] truncate text-sm leading-tight">{name}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{role ? ROLE_LABEL[role] : ""}</span>
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="management-theme w-56">
                <DropdownMenuLabel>
                  <p className="truncate text-sm">{name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{profile?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setProfileOpen(true)}><UserRound className="size-4" /> Meus dados</DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:p-6 print:max-w-none print:p-0">{children}</main>
        </div>
      </div>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="management-theme">
          <DialogHeader><DialogTitle>Meus dados</DialogTitle></DialogHeader>
          <dl className="grid gap-3 text-sm">
            {[["Nome", profile?.name], ["E-mail", profile?.email], ["Perfil", role ? ROLE_LABEL[role] : "—"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="eyebrow">{k}</dt><dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
