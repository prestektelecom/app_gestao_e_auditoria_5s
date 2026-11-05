import { createFileRoute } from "@tanstack/react-router";

// GET /api/files/<bucket>/<caminho>?exp=..&sig=.. — entrega a foto se o link assinado for válido.
export const Route = createFileRoute("/api/files/$bucket/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { verifyReadUrl, filePath, contentTypeFor } = await import("@/server/storage.server");
        const { readFile } = await import("node:fs/promises");
        const url = new URL(request.url);
        const bucket = params.bucket;
        const p = (params._splat ?? "").split("/").map(decodeURIComponent).join("/");
        if (!verifyReadUrl(bucket, p, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
          return new Response("Link inválido ou expirado.", { status: 403 });
        }
        try {
          const data = await readFile(filePath(bucket as "audit-evidences", p));
          return new Response(data, {
            status: 200,
            headers: {
              "content-type": contentTypeFor(p),
              "cache-control": "private, max-age=3600",
              "x-content-type-options": "nosniff",
            },
          });
        } catch {
          return new Response("Arquivo não encontrado.", { status: 404 });
        }
      },
    },
  },
});
