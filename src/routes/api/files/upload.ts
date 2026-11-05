import { createFileRoute } from "@tanstack/react-router";

// PUT /api/files/upload?t=<token> — recebe a foto no caminho autorizado pelo token.
// O navegador faz PUT na URL de envio recebida (src/lib/image.ts).
export const Route = createFileRoute("/api/files/upload")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const { asService } = await import("@/server/db.server");
        const { consumeUploadToken, saveFile, StorageError, MAX_UPLOAD_BYTES } = await import("@/server/storage.server");
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        try {
          const declared = Number(request.headers.get("content-length") ?? 0);
          if (declared > MAX_UPLOAD_BYTES) throw new StorageError("A foto passa de 10 MB.", 413);
          const data = new Uint8Array(await request.arrayBuffer());
          const token = new URL(request.url).searchParams.get("t");
          // Nonce e arquivo no mesmo passo: se a gravação falhar, o token continua valendo.
          const saved = await asService(async (tx) => {
            const target = await consumeUploadToken(tx, token);
            await saveFile(target.bucket, target.path, data);
            return target;
          });
          return json(200, { Key: `${saved.bucket}/${saved.path}` });
        } catch (err) {
          if (err instanceof StorageError) return json(err.status, { error: err.message });
          console.error("[upload]", err);
          return json(500, { error: "Falha ao gravar a foto." });
        }
      },
    },
  },
});
