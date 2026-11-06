// Sobe o app em desenvolvimento e, se preciso, abre antes o túnel SSH até o banco.
//
//   npm run dev
//
// Com DEV_SSH_HOST no .env (ex.: usuario@servidor) e o DATABASE_URL apontando
// para 127.0.0.1, abre `ssh -N -L <porta>:127.0.0.1:<DEV_SSH_REMOTE_PORT> <host>`,
// espera a porta responder e só então inicia o vite. O túnel fecha junto com o
// dev. Se a porta já responde (túnel aberto à mão), não abre outro. Sem
// DEV_SSH_HOST, é só o `vite dev` de sempre.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));

function portOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    s.setTimeout(1000);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("timeout", () => { s.destroy(); resolve(false); });
    s.once("error", () => resolve(false));
  });
}

async function openTunnel(): Promise<ChildProcess | null> {
  const sshHost = process.env.DEV_SSH_HOST;
  const dbUrl = process.env.DATABASE_URL;
  if (!sshHost || !dbUrl) return null;
  const url = new URL(dbUrl);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return null;
  const localPort = Number(url.port || 5432);
  const remotePort = Number(process.env.DEV_SSH_REMOTE_PORT || 5432);

  if (await portOpen(localPort)) {
    console.log(`[dev] porta ${localPort} já responde; usando o túnel existente`);
    return null;
  }

  console.log(`[dev] abrindo túnel ${localPort} -> ${sshHost}:${remotePort}`);
  const ssh = spawn("ssh", [
    "-N",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-L", `${localPort}:127.0.0.1:${remotePort}`,
    sshHost,
  ], { stdio: "inherit" }); // inherit: se o ssh pedir senha, ela aparece aqui

  let exited = false;
  ssh.once("exit", () => { exited = true; });
  for (let i = 0; i < 60 && !exited; i++) { // até ~30 s (tempo para digitar senha, se pedir)
    if (await portOpen(localPort)) {
      console.log("[dev] túnel aberto");
      return ssh;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  ssh.kill();
  console.error("[dev] não consegui abrir o túnel SSH. Confira a conexão e o acesso ao servidor.");
  process.exit(1);
}

const tunnel = await openTunnel();
const vite = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: root,
});

const stop = () => { tunnel?.kill(); vite.kill(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", (code) => { tunnel?.kill(); process.exit(code ?? 0); });
tunnel?.on("exit", (code) => {
  if (code !== null && code !== 0) console.error(`[dev] o túnel SSH caiu (código ${code}); reinicie o npm run dev`);
});
