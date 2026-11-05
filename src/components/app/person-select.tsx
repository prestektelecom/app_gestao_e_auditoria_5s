import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABEL, type Role } from "@/lib/permissions";
import { personKey, type Person } from "@/lib/meetings";

export function PersonSelect({ people, value, onChange, placeholder = "Selecione", disabled }: {
  people: Person[]; value: string; onChange: (p: Person | null) => void; placeholder?: string; disabled?: boolean;
}) {
  const users = people.filter((p) => p.kind === "user");
  const auditors = people.filter((p) => p.kind === "auditor");
  return (
    <Select disabled={disabled} value={value || "none"} onValueChange={(v) => onChange(people.find((p) => personKey(p.kind, p.id) === v) ?? null)}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {users.length > 0 && (
          <SelectGroup><SelectLabel>Usuários</SelectLabel>
            {users.map((p) => <SelectItem key={personKey(p.kind, p.id)} value={personKey(p.kind, p.id)}>{p.name} <span className="text-muted-foreground">· {ROLE_LABEL[p.detail as Role] ?? "Usuário"}</span></SelectItem>)}
          </SelectGroup>
        )}
        {auditors.length > 0 && (
          <SelectGroup><SelectLabel>Auditores</SelectLabel>
            {auditors.map((p) => <SelectItem key={personKey(p.kind, p.id)} value={personKey(p.kind, p.id)}>{p.name} <span className="text-muted-foreground">· {p.detail}</span></SelectItem>)}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
