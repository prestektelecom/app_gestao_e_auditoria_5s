// Configuração pública do servidor que o navegador precisa conhecer.
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

/** PUBLIC_ORIGIN vem do servidor: trocar de domínio não exige nova build. */
export const getPublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { getEnv } = await import("@/server/env.server");
  return { publicOrigin: getEnv().PUBLIC_ORIGIN };
});

/** Endereço público usado nos QR codes (undefined enquanto carrega). */
export function usePublicOrigin() {
  const q = useQuery({ queryKey: ["public-config"], queryFn: () => getPublicConfig(), staleTime: Infinity });
  return q.data?.publicOrigin;
}
