// Plugin do Nitro: roda quando o processo do servidor inicia (antes da 1ª requisição).
// Falha na inicialização se faltar configuração ou se a pasta de fotos não aceitar escrita.
import { definePlugin } from "nitro";
import { getEnv } from "./server/env.server";
import { assertStorageWritable } from "./server/storage.server";

export default definePlugin(() => {
  try {
    getEnv();
  } catch (err) {
    console.error(`[inicialização] ${(err as Error).message}`);
    process.exit(1);
  }
  assertStorageWritable().catch((err: Error) => {
    console.error(`[inicialização] ${err.message}`);
    process.exit(1);
  });
});
