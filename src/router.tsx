import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { notifyAuthChanged } from "./lib/auth";
import { UNAUTHORIZED } from "./lib/middleware";

// Sessão expirou ou o usuário foi inativado: relê a sessão, e o layout da área
// logada leva para o login.
function onError(error: unknown) {
  if (error instanceof Error && error.message.includes(UNAUTHORIZED)) notifyAuthChanged();
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
