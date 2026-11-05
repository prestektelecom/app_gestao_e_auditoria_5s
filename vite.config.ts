// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Código de src/server/ nunca pode ir para o navegador. Os helpers que só rodam
    // dentro de server functions (ex.: userTx em src/lib/server-fn.ts) ficam em
    // arquivos compartilhados; a build remove esse código do bundle do cliente, mas o
    // modo dev não faz essa limpeza. Por isso: no dev o import vira um mock que dá erro
    // se for usado no navegador; na build continua sendo erro (garantia real).
    importProtection: { behavior: { dev: "mock", build: "error" }, mockAccess: "error" },
  },
  // Roda no nosso servidor como processo Node (npm start), não na Cloudflare.
  // O plugin valida a configuração e a pasta de fotos na inicialização.
  // (plugins é repassado ao Nitro, mas não está no tipo do pacote do Lovable)
  nitro: { preset: "node-server", plugins: ["./src/nitro-startup.ts"] } as { preset: string },
});
