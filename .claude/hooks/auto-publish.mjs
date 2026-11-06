// Hook "Stop" do Claude Code: publicação automática ao fim de cada tarefa.
//
// Só detecta se há algo a publicar (alterações não commitadas ou commits ainda
// não enviados). Se houver, devolve a tarefa ao Claude com o roteiro de
// publicação; quem faz commit, testes e push é o Claude (openspec: auto-publish).
//
// Usa apenas comandos git locais, para não atrasar respostas que são só conversa.
// Pausa: crie o arquivo .auto-publish-off na raiz do projeto.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PAUSE_FILE = ".auto-publish-off";

function git(dir, args) {
  try {
    return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/**
 * Diz se há algo a publicar no repositório em `dir`.
 * @returns {{ pending: boolean, branch?: string, why?: string }}
 */
export function checkPending(dir) {
  if (existsSync(path.join(dir, PAUSE_FILE))) return { pending: false, why: "pausado" };
  if (git(dir, ["rev-parse", "--is-inside-work-tree"]) !== "true") return { pending: false, why: "fora de um repositório git" };

  // Merge, rebase ou cherry-pick em andamento: não mexe.
  for (const p of ["MERGE_HEAD", "rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
    const gp = git(dir, ["rev-parse", "--git-path", p]);
    if (gp && existsSync(path.resolve(dir, gp))) return { pending: false, why: "operação git em andamento" };
  }

  const branch = git(dir, ["symbolic-ref", "--short", "-q", "HEAD"]);
  if (!branch) return { pending: false, why: "HEAD destacado" };

  const status = git(dir, ["status", "--porcelain"]);
  if (status) return { pending: true, branch, why: "alterações não commitadas" };

  const hasCommit = git(dir, ["rev-parse", "--verify", "-q", "HEAD"]) !== null;
  if (!hasCommit) return { pending: false, branch, why: "repositório sem commits" };

  const upstream =
    git(dir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) ??
    (git(dir, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`]) ? `origin/${branch}` : null);
  if (!upstream) return { pending: true, branch, why: "ramo ainda não enviado ao GitHub" };

  const ahead = Number(git(dir, ["rev-list", "--count", `${upstream}..HEAD`]) ?? "0");
  if (ahead > 0) return { pending: true, branch, why: `${ahead} commit(s) não enviado(s)` };

  return { pending: false, branch, why: "nada a publicar" };
}

export function buildReason(branch, why) {
  const prod =
    branch === "main"
      ? "Este é o ramo main: o servidor publica a nova versão em cerca de 2 minutos. Avise o usuário disso."
      : `O ramo é "${branch}", não main: o envio NÃO muda a produção. Avise o usuário disso.`;
  return [
    `Publicação automática: há algo a publicar no ramo "${branch}" (${why}). Antes de encerrar, siga este roteiro:`,
    "1. Se a tarefa NÃO terminou (falta resposta do usuário ou o trabalho está pela metade), não publique: diga em uma linha que as alterações serão publicadas ao fim da tarefa e encerre.",
    "2. Veja `git status`. Não inclua arquivos que pareçam segredo ou dado (chaves, .pem, .key, dumps, .sql de dados, backups, .env*). Aponte-os ao usuário.",
    "3. Rode `npx tsc --noEmit` e `npm test`. Se algo falhar, NÃO commite nem envie: mostre o erro ao usuário e encerre.",
    "4. Faça `git add` só dos arquivos certos e commit com mensagem em português descrevendo o que mudou, no estilo do `git log` (título + itens), com a linha de coautoria.",
    `5. Rode \`git pull --rebase origin ${branch}\` (pule se o ramo ainda não existe no GitHub). Se der conflito: \`git rebase --abort\`, avise os arquivos em conflito e encerre sem enviar.`,
    `6. Rode \`git push -u origin ${branch}\`. Nunca use --force. Se o push for recusado, avise o usuário.`,
    `7. Diga ao usuário o que foi publicado. ${prod}`,
    `Para pausar a publicação automática, o usuário pode criar o arquivo ${PAUSE_FILE} na raiz do projeto.`,
  ].join("\n");
}

/** Decide a resposta do hook. Retorna o objeto a imprimir, ou null para liberar. */
export function decide(input, dir) {
  if (input?.stop_hook_active) return null; // já é a continuação de um bloqueio: nunca bloqueia duas vezes
  const r = checkPending(dir);
  if (!r.pending) return null;
  return { decision: "block", reason: buildReason(r.branch, r.why) };
}

function readStdin() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const input = readStdin();
  const dir = process.env.CLAUDE_PROJECT_DIR || input.cwd || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  try {
    const out = decide(input, dir);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    // Falha no hook nunca deve travar o Claude.
  }
  process.exit(0);
}
