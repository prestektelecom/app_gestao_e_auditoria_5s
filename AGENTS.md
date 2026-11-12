<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Data access: the browser never talks to the database. Every read/write is a `createServerFn` in `src/lib/*.functions.ts` (session via `requireUser` in `src/lib/middleware.ts`), running SQL through `asUser` / `asAnon` / `asService` (`src/server/db.server.ts`) — `asUser` sets role `authenticated` + `request.jwt.claim.sub` per transaction so the existing RLS policies and `auth.uid()` keep working. Use `asService` (bypasses RLS) only for server-only checks that the old code did with the service key.
- Files under `src/server/` are server-only (import protection blocks them in the client bundle); import them with `await import()` inside handlers, never at the top of `*.functions.ts` or routes.
- Login is our own: bcrypt hashes in `auth.users`, opaque session token in the httpOnly `session` cookie with only its sha256 in `auth.app_sessions` (30 days, renewed on use); login/reset are rate-limited (5 per 15 min per e-mail/IP) — see `src/server/auth.server.ts`.
- Postgres errors are turned into Portuguese user messages in `src/server/errors.server.ts`; never send SQL/constraint text to the browser.
- Photos live on disk in `STORAGE_DIR/<bucket>/<storage_path>`, served only by `GET /api/files/...` with an HMAC-signed, 1-hour link; uploads via `PUT /api/files/upload?t=` (JPEG/PNG/WebP, ≤10 MB).
- Schema = `drizzle/compat/supabase_compat.sql` (roles, `auth.uid()`, `auth.users`, sessions; replaces what Supabase provided) + `drizzle/migrations/*` in journal order, applied by `npm run db:setup`.
- Permissions live only in `src/lib/permissions.ts` (`can(role, perm)`); components never compare role names — keeps rules centralized.
- Roles are stored in `public.user_roles` (one per user); RLS uses `is_admin()` / `is_active_user()` security-definer helpers — avoids privilege escalation and recursive RLS.
- User create/update/inactivate goes through admin server functions in `src/lib/admin-users.functions.ts`; inactivating sets `auth.users.banned_until` and deletes the user's sessions — inactive users cannot sign in or keep a session.
- Units, sectors and auditors are never hard-deleted; use `active` flags — future audits reference them.
- Audits are the exception, and only an admin can delete one (`audits.delete`, history screen): `admin_delete_audit` (security definer, checks `is_admin`) removes the audit and its answers, evidences, 5W2H plans, change logs and the plan notifications in FK order (all `on delete restrict`), leaves a row in `audit_deletion_logs`, and returns the photo paths; `deleteAuditCore` removes those files only after the transaction commits.
- Auditor `custom_pin_hash` is not client-readable (column grants); PINs are set via `set_auditor_pin` RPC (bcrypt) — protects auth codes.
- CPF stored as 11-digit text with DB validation; listings show `maskCpfHidden` (first 6 digits hidden) — future audit code derives from them.
- Sector `qr_token` is random and immutable (trigger) — QR codes survive renames.
- Program parameters live in `public.settings` (key/jsonb) and are read via `settingsQuery` — never hardcode periodicity/scoring/medals.
- Sector belongs to unit is enforced by composite FK `(sector_id, unit_id)` on auditors.
- Authenticated pages live under `src/routes/_authenticated/` (client-only, session gate in layout).
- tsconfig has exactOptionalPropertyTypes / noPropertyAccessFromIndexSignature / noImplicitReturns off — too noisy for form code.
- Public QR audit flow (`/auditoria/q/$token`) uses security-definer `qr_*` functions called as role `anon` from `src/lib/qr.functions.ts`, authorized by a per-audit session token (sha256 in `audits.session_hash`); the client IP is passed to the DB (`request.headers`) so `request_ip()` rate-limits attempts. Photo uploads use one-time signed upload URLs (`src/server/storage.server.ts`) — no login on the field device.
- Scores/classification are computed only in the database (`recalc_audit`) from `settings`; the client preview in `src/lib/checklist.ts` is informational.
- Checklist questions are editable only while their version is DRAFT (trigger); audits snapshot question/unit/sector/auditor text.
- Dashboard/ranking indicators are derived client-side in `src/lib/analytics.ts` (`analyze`) from completed audits only, using the latest completed audit per sector in the period — single source for dashboard, detail pages and reports.
- Analysis filters live in URL search params (`validateFilters`) so period/unit context survives navigation between dashboard and detail pages.
- 5W2H edits go only through the `update_action_plan` RPC (admin/manager), which writes every field change to `audit_change_logs`.
- Internal notifications are generated on demand by `refresh_my_notifications()` (role-based, deduped by key) — no cron or external channels.
- PDFs are print-styled routes (A4 `@page`) using audit snapshots; the browser's "Salvar como PDF" produces the file. Meeting minutes export instead goes through `src/lib/ata-pdf.ts` (pdf-lib) with a `download` attribute, because the print dialog names the file after the browser tab, which the Lovable preview controls.
- QR codes encode `PUBLIC_ORIGIN` (server env, read via `usePublicOrigin()` in `src/lib/config.functions.ts`), never window.location.origin or a hardcoded domain — changing domain needs no rebuild.
- Reference visual tokens are scoped by `management-theme` to login and the authenticated shell — keeps public field audits and print behavior independent of management restyling.
- Committee meeting minutes (atas) live in meetings/meeting_participants/meeting_actions; each ata deliberation is a meeting_actions row (the meetings action plan, separate from audit action_plans); participant pickers use the security-definer meeting_people() RPC because auditors/profiles are admin-only readable.
- Maintenance notes (maintenance_notes/_images) are created only via `maint_create_note` RPC (public QR token or signed-in user) which returns a one-time upload token; photos go to `STORAGE_DIR/maintenance-images` via signed URLs from `src/lib/maintenance.functions.ts`. Maintenance QR reuses sector `qr_token` at `/manutencao/q/$token`.
