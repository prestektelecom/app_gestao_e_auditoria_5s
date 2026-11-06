// @vitest-environment node
// Hook "Stop" de publicação automática (openspec: auto-publish).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error -- script .mjs do hook, sem tipos
import { checkPending, decide, PAUSE_FILE } from "../../.claude/hooks/auto-publish.mjs";

const dirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Remoto --bare + clone com um commit já enviado na main. */
function setup() {
  const base = mkdtempSync(path.join(tmpdir(), "auto-publish-"));
  dirs.push(base);
  const remote = path.join(base, "remote.git");
  const work = path.join(base, "work");
  mkdirSync(remote);
  // Sem `init -b`: o git do servidor (anterior ao 2.28) não tem essa opção.
  git(remote, "init", "--bare", "-q");
  git(remote, "symbolic-ref", "HEAD", "refs/heads/main");
  git(base, "clone", "-q", remote, work);
  git(work, "config", "user.name", "Teste");
  git(work, "config", "user.email", "teste@example.com");
  git(work, "config", "commit.gpgsign", "false");
  git(work, "checkout", "-q", "-b", "main");
  writeFileSync(path.join(work, ".gitignore"), ".env\n" + PAUSE_FILE + "\n");
  writeFileSync(path.join(work, "a.txt"), "1\n");
  git(work, "add", ".");
  git(work, "commit", "-q", "-m", "inicial");
  git(work, "push", "-q", "-u", "origin", "main");
  return work;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// Cada teste cria repositórios git de verdade; no Windows isso passa de 5 s com a suíte toda rodando.
describe("hook de publicação automática", { timeout: 30_000 }, () => {
  it("repositório limpo e sincronizado não bloqueia", () => {
    const work = setup();
    expect(checkPending(work).pending).toBe(false);
    expect(decide({ stop_hook_active: false }, work)).toBeNull();
  });

  it("arquivo alterado bloqueia com o roteiro citando o ramo", () => {
    const work = setup();
    writeFileSync(path.join(work, "a.txt"), "2\n");
    const out = decide({ stop_hook_active: false }, work);
    expect(out?.decision).toBe("block");
    expect(out?.reason).toContain('ramo "main"');
    expect(out?.reason).toContain("npm test");
    expect(out?.reason).toContain("Nunca use --force");
  });

  it("commit não enviado bloqueia", () => {
    const work = setup();
    writeFileSync(path.join(work, "b.txt"), "x\n");
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", "local");
    const r = checkPending(work);
    expect(r.pending).toBe(true);
    expect(r.why).toContain("1 commit");
  });

  it("ramo novo sem upstream com commit bloqueia e não cita produção", () => {
    const work = setup();
    git(work, "checkout", "-q", "-b", "teste-relatorio");
    writeFileSync(path.join(work, "c.txt"), "x\n");
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", "no ramo");
    const out = decide({}, work);
    expect(out?.decision).toBe("block");
    expect(out?.reason).toContain("NÃO muda a produção");
    expect(out?.reason).toContain("git push -u origin teste-relatorio");
  });

  it("arquivo de pausa libera mesmo com alterações", () => {
    const work = setup();
    writeFileSync(path.join(work, "a.txt"), "2\n");
    writeFileSync(path.join(work, PAUSE_FILE), "");
    expect(decide({}, work)).toBeNull();
  });

  it("stop_hook_active libera mesmo com alterações", () => {
    const work = setup();
    writeFileSync(path.join(work, "a.txt"), "2\n");
    expect(decide({ stop_hook_active: true }, work)).toBeNull();
  });

  it("arquivo ignorado pelo .gitignore não bloqueia", () => {
    const work = setup();
    writeFileSync(path.join(work, ".env"), "SEGREDO=1\n");
    expect(checkPending(work).pending).toBe(false);
  });

  it("rebase em andamento libera", () => {
    const work = setup();
    // Dois commits que conflitam: um no remoto (via outro clone), outro local.
    const other = path.join(path.dirname(work), "other");
    git(path.dirname(work), "clone", "-q", path.join(path.dirname(work), "remote.git"), other);
    git(other, "config", "user.name", "Outro");
    git(other, "config", "user.email", "outro@example.com");
    writeFileSync(path.join(other, "a.txt"), "remoto\n");
    git(other, "commit", "-q", "-am", "remoto");
    git(other, "push", "-q", "origin", "main");
    writeFileSync(path.join(work, "a.txt"), "local\n");
    git(work, "commit", "-q", "-am", "local");
    git(work, "fetch", "-q", "origin");
    expect(() => git(work, "rebase", "origin/main")).toThrow();
    expect(checkPending(work)).toMatchObject({ pending: false, why: "operação git em andamento" });
  });

  it("fora de um repositório git libera", () => {
    const base = mkdtempSync(path.join(tmpdir(), "auto-publish-nogit-"));
    dirs.push(base);
    expect(checkPending(base).pending).toBe(false);
  });
});
