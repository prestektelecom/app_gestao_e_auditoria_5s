// Envio de e-mail por SMTP (reset de senha).
import nodemailer, { type Transporter } from "nodemailer";
import { getEnv, smtpConfigured } from "./env.server";
import { RESET_TTL_MINUTES } from "./auth.server";
import { passwordResetEmail } from "./mail-templates";

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
  const mail = passwordResetEmail({ name, link, origin: env.PUBLIC_ORIGIN, validMinutes: RESET_TTL_MINUTES });
  await getTransport().sendMail({ from: env.SMTP_FROM, to, subject: mail.subject, text: mail.text, html: mail.html });
}
