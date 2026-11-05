import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prestek 5S — Sistema de Gestão e Auditoria 5S" },
      { name: "description", content: "Acesse o sistema de gestão do Programa 5S da Prestek." },
      { property: "og:title", content: "Prestek 5S — Sistema de Gestão e Auditoria 5S" },
      { property: "og:description", content: "Acesse o sistema de gestão do Programa 5S da Prestek." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
