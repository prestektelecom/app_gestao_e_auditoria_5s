// Envio de e-mail por SMTP (reset de senha).
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv, smtpConfigured } from "./env.server";

export const MAIL_NOT_CONFIGURED = "O envio de e-mail não está configurado neste servidor. Procure o administrador.";

let transport: Transporter | undefined;

function getTransport() {
  const env = getEnv();
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? (env.SMTP_SECURE ? 465 : 587),
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
  });
  return transport;
}

export async function sendPasswordResetEmail(to: string, name: string, link: string) {
  const env = getEnv();
  if (!smtpConfigured(env)) throw new Error(MAIL_NOT_CONFIGURED);
  const first = name.split(" ")[0] || "olá";
  await getTransport().sendMail({
    from: env.SMTP_FROM,
    to,
    subject: "Redefinir senha — Prestek 5S",
    text:
      `Olá, ${first}.\n\nRecebemos um pedido para redefinir a sua senha do Prestek 5S.\n` +
      `Use o link abaixo em até 1 hora (ele só funciona uma vez):\n\n${link}\n\n` +
      `Se não foi você, ignore este e-mail: sua senha continua a mesma.`,
    html:
      `<p>Olá, ${escapeHtml(first)}.</p><p>Recebemos um pedido para redefinir a sua senha do Prestek 5S.</p>` +
      `<p><a href="${escapeHtml(link)}">Definir nova senha</a></p>` +
      `<p>O link vale por 1 hora e só funciona uma vez. Se não foi você, ignore este e-mail.</p>`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
