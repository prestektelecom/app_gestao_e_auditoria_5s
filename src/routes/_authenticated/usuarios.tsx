import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { can, ROLES, ROLE_LABEL } from "@/lib/permissions";
import { maskCpfHidden } from "@/lib/format";
import { updateUser } from "@/lib/admin-users.functions";
import { auditorsQuery, sectorsQuery, unitsQuery, usersQuery, type Auditor, type UserRow } from "@/lib/queries";
import { ConfirmAction, EmptyState, LoadingBlock, PageHeader, Panel, Restricted, StatusBadge, YesNo } from "@/components/app/kit";
import { AuditorDialog, UserDialog } from "@/components/app/people-forms";
import { toggleActive, useInvalidateRegistry } from "@/components/app/unit-sector-forms";
import { StatusSelect, matchStatus, type StatusFilter } from "@/components/app/sectors-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários e Auditores — Prestek 5S" },
      { name: "description", content: "Cadastro de usuários do sistema e auditores do Comitê 5S." },
      { property: "og:title", content: "Usuários e Auditores — Prestek 5S" },
      { property: "og:description", content: "Cadastro de usuários do sistema e auditores do Comitê 5S." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PeoplePage,
});

const PAGE = 15;

function usePaged<T>(list: T[]) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const p = Math.min(page, pages - 1);
  return {
    rows: list.slice(p * PAGE, p * PAGE + PAGE),
    pager: pages > 1 && (
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
        <span className="text-muted-foreground">Página {p + 1} de {pages}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={p === 0} onClick={() => setPage(p - 1)}>Anterior</Button>
          <Button size="sm" variant="outline" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Próxima</Button>
        </div>
      </div>
    ),
  };
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ResponsiveTable({ head, rows, cards }: { head: string[]; rows: ReactNode; cards: ReactNode }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader><TableRow>{head.map((h, i) => (
            <TableHead key={h} className={`eyebrow ${i === 0 ? "pl-6" : ""} ${i === head.length - 1 ? "pr-6 text-right" : ""}`}>{h}</TableHead>
          ))}</TableRow></TableHeader>
          <TableBody>{rows}</TableBody>
        </Table>
      </div>
      <div className="divide-y divide-border md:hidden">{cards}</div>
    </>
  );
}

function PeoplePage() {
  const { role } = useAuth();
  const users = useQuery(usersQuery);
  const auditors = useQuery(auditorsQuery);
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const [tab, setTab] = useState("users");
  const [userDlg, setUserDlg] = useState<{ open: boolean; user?: UserRow | null }>({ open: false });
  const [audDlg, setAudDlg] = useState<{ open: boolean; auditor?: Auditor | null }>({ open: false });

  if (!can(role, "people.view")) return <Restricted />;
  const manage = can(role, "people.manage");

  return (
    <>
      <PageHeader
        title="Usuários e Auditores"
        subtitle="Pessoas e Comitê 5S"
        actions={manage && (tab === "users"
          ? <Button onClick={() => setUserDlg({ open: true, user: null })}><Plus className="size-4" /> Novo Usuário</Button>
          : <Button onClick={() => setAudDlg({ open: true, auditor: null })}><Plus className="size-4" /> Novo Auditor</Button>)}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="auditors">Auditores</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab list={users.data} loading={users.isLoading} manage={manage} onEdit={(u) => setUserDlg({ open: true, user: u })} onNew={() => setUserDlg({ open: true })} />
        </TabsContent>
        <TabsContent value="auditors" className="mt-4">
          <AuditorsTab list={auditors.data} loading={auditors.isLoading} manage={manage}
            unitName={new Map((units.data ?? []).map((u) => [u.id, u.name]))}
            sectorName={new Map((sectors.data ?? []).map((s) => [s.id, s.name]))}
            onEdit={(a) => setAudDlg({ open: true, auditor: a })} onNew={() => setAudDlg({ open: true })} />
        </TabsContent>
      </Tabs>
      <UserDialog open={userDlg.open} user={userDlg.user} onOpenChange={(o) => setUserDlg({ open: o })} />
      <AuditorDialog open={audDlg.open} auditor={audDlg.auditor} onOpenChange={(o) => setAudDlg({ open: o })}
        units={units.data ?? []} sectors={sectors.data ?? []} users={users.data ?? []} auditors={auditors.data ?? []} />
    </>
  );
}

function UsersTab({ list, loading, manage, onEdit, onNew }: { list?: UserRow[]; loading: boolean; manage: boolean; onEdit: (u: UserRow) => void; onNew: () => void }) {
  const { session } = useAuth();
  const invalidate = useInvalidateRegistry();
  const update = useServerFn(updateUser);
  const [q, setQ] = useState("");
  const [roleF, setRoleF] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const filtered = useMemo(() => (list ?? []).filter((u) =>
    matchStatus(status, u.active) && (roleF === "all" || u.role === roleF) &&
    `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())), [list, q, roleF, status]);
  const { rows, pager } = usePaged(filtered);

  if (loading) return <Panel><LoadingBlock /></Panel>;
  if (!list?.length) return <Panel><EmptyState title="Nenhum usuário cadastrado." action={manage && <Button onClick={onNew}>Novo Usuário</Button>} /></Panel>;

  const actions = (u: UserRow) => manage && (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => onEdit(u)}>Editar</Button>
      {u.id !== session?.user.id && (
        <ConfirmAction
          title={u.active ? "Inativar usuário?" : "Ativar usuário?"}
          description={u.active ? `${u.name} não conseguirá mais acessar o sistema.` : `${u.name} voltará a poder acessar o sistema.`}
          confirmLabel={u.active ? "Inativar" : "Ativar"} destructive={u.active}
          onConfirm={async () => {
            try {
              await update({ data: { id: u.id, name: u.name, email: u.email, role: u.role ?? "auditor", system_access: u.system_access, active: !u.active } });
              toast.success(u.active ? "Usuário inativado." : "Usuário ativado.");
              await invalidate();
            } catch (e) { toast.error((e as Error).message); }
          }}
          trigger={(open) => <Button variant="ghost" size="sm" onClick={open}>{u.active ? "Inativar" : "Ativar"}</Button>}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por nome ou e-mail" />
        <Select value={roleF} onValueChange={setRoleF}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os perfis</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <StatusSelect value={status} onChange={setStatus} />
      </div>
      <Panel className="p-0 sm:p-0">
        {filtered.length === 0 ? <div className="p-5"><EmptyState compact title="Nenhum usuário encontrado." /></div> : (
          <ResponsiveTable
            head={["Nome", "E-mail", "Perfil", "Acesso", "Status", "Ações"]}
            rows={rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="pl-6 font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell>{u.role ? ROLE_LABEL[u.role] : "—"}</TableCell>
                <TableCell><YesNo value={u.system_access} /></TableCell>
                <TableCell><StatusBadge active={u.active} /></TableCell>
                <TableCell className="pr-6">{actions(u)}</TableCell>
              </TableRow>
            ))}
            cards={rows.map((u) => (
              <div key={u.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="font-medium">{u.name}</p><p className="truncate text-xs text-muted-foreground">{u.email}</p></div>
                  <StatusBadge active={u.active} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{u.role ? ROLE_LABEL[u.role] : "—"} · Acesso: {u.system_access ? "Sim" : "Não"}</p>
                <div className="mt-2">{actions(u)}</div>
              </div>
            ))}
          />
        )}
        {pager}
      </Panel>
    </div>
  );
}

function AuditorsTab({ list, loading, manage, unitName, sectorName, onEdit, onNew }: {
  list?: Auditor[]; loading: boolean; manage: boolean; unitName: Map<string, string>; sectorName: Map<string, string>;
  onEdit: (a: Auditor) => void; onNew: () => void;
}) {
  const invalidate = useInvalidateRegistry();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const filtered = useMemo(() => (list ?? []).filter((a) =>
    matchStatus(status, a.active) && `${a.name} ${a.job_title ?? ""}`.toLowerCase().includes(q.toLowerCase())), [list, q, status]);
  const { rows, pager } = usePaged(filtered);

  if (loading) return <Panel><LoadingBlock /></Panel>;
  if (!list?.length) return <Panel><EmptyState title="Nenhum auditor cadastrado." description="Cadastre os membros do Comitê 5S."
    action={manage && <Button onClick={onNew}><Plus className="size-4" /> Novo Auditor</Button>} /></Panel>;

  const actions = (a: Auditor) => manage && (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => onEdit(a)}>Editar</Button>
      <ConfirmAction
        title={a.active ? "Inativar auditor?" : "Ativar auditor?"}
        description={a.active ? `${a.name} será inativado. O histórico é preservado.` : `${a.name} voltará a ficar ativo.`}
        confirmLabel={a.active ? "Inativar" : "Ativar"} destructive={a.active}
        onConfirm={async () => { await toggleActive("auditors", a.id, !a.active); await invalidate(); }}
        trigger={(open) => <Button variant="ghost" size="sm" onClick={open}>{a.active ? "Inativar" : "Ativar"}</Button>}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar por nome ou cargo" />
        <StatusSelect value={status} onChange={setStatus} />
      </div>
      <Panel className="p-0 sm:p-0">
        {filtered.length === 0 ? <div className="p-5"><EmptyState compact title="Nenhum auditor encontrado." /></div> : (
          <ResponsiveTable
            head={["Nome", "CPF", "Cargo", "Unidade", "Setor", "Acesso", "Autorizado", "Status", "Ações"]}
            rows={rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="pl-6 font-medium">{a.name}</TableCell>
                <TableCell className="font-mono text-xs">{maskCpfHidden(a.cpf)}</TableCell>
                <TableCell className="text-muted-foreground">{a.job_title || "—"}</TableCell>
                <TableCell>{unitName.get(a.unit_id) ?? "—"}</TableCell>
                <TableCell>{sectorName.get(a.sector_id) ?? "—"}</TableCell>
                <TableCell><YesNo value={!!a.user_id} /></TableCell>
                <TableCell><YesNo value={a.authorized} /></TableCell>
                <TableCell><StatusBadge active={a.active} /></TableCell>
                <TableCell className="pr-6">{actions(a)}</TableCell>
              </TableRow>
            ))}
            cards={rows.map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-medium">{a.name}</p><p className="font-mono text-xs text-muted-foreground">{maskCpfHidden(a.cpf)}</p></div>
                  <StatusBadge active={a.active} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {[a.job_title, unitName.get(a.unit_id), sectorName.get(a.sector_id)].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground">Acesso: {a.user_id ? "Sim" : "Não"} · Autorizado: {a.authorized ? "Sim" : "Não"}</p>
                <div className="mt-2">{actions(a)}</div>
              </div>
            ))}
          />
        )}
        {pager}
      </Panel>
    </div>
  );
}
