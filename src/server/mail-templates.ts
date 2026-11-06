// Modelos de e-mail. HTML feito para clientes de e-mail (Gmail, Outlook, celular):
// tabelas, estilos inline e largura máxima de 560px. Sempre acompanha versão em texto.

const C = {
  brand: "#007dc9", // --primary do app
  orange: "#ec6f00", // --brand-orange
  text: "#0e1624",
  muted: "#57647b",
  bg: "#f4f7fb",
  border: "#e3e8ef",
};

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type ResetEmail = { name: string; link: string; origin: string; validMinutes: number };

export function passwordResetEmail({ name, link, origin, validMinutes }: ResetEmail) {
  const first = name.trim().split(/\s+/)[0] || "";
  const hello = first ? `Olá, ${first}!` : "Olá!";
  const validity = validMinutes >= 60 && validMinutes % 60 === 0 ? `${validMinutes / 60} hora${validMinutes > 60 ? "s" : ""}` : `${validMinutes} minutos`;
  const subject = "Redefina sua senha do Prestek 5S";
  const preheader = `Use o botão para criar uma nova senha. O link vale por ${validity}.`;
  const e = escapeHtml;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

      <!-- marca -->
      <tr><td style="padding:0 4px 20px 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:12px;"><img src="${e(origin)}/email-logo.png" width="40" height="40" alt="Prestek" style="display:block;border:0;border-radius:8px;"></td>
          <td style="font-family:Segoe UI,Arial,sans-serif;font-size:18px;font-weight:700;color:${C.text};">Prestek <span style="color:${C.orange};">5S</span></td>
        </tr></table>
      </td></tr>

      <!-- cartão -->
      <tr><td style="background:#ffffff;border:1px solid ${C.border};border-radius:16px;overflow:hidden;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="height:4px;background:${C.brand};font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:36px 36px 8px 36px;font-family:Segoe UI,Arial,sans-serif;">
            <div style="width:48px;height:48px;border-radius:12px;background:#e6f2fa;text-align:center;line-height:48px;font-size:24px;">&#128274;</div>
            <h1 style="margin:20px 0 8px 0;font-size:22px;line-height:1.3;color:${C.text};font-weight:700;">Redefinir sua senha</h1>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${C.text};">${e(hello)}</p>
            <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:${C.text};">
              Recebemos um pedido para redefinir a senha da sua conta no <strong>Sistema de Gestão e Auditoria 5S</strong>.
              Clique no botão abaixo para criar uma nova senha.
            </p>
          </td></tr>

          <!-- botão -->
          <tr><td align="center" style="padding:0 36px 24px 36px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td align="center" bgcolor="${C.brand}" style="border-radius:10px;">
                <a href="${e(link)}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:Segoe UI,Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Definir nova senha</a>
              </td>
            </tr></table>
          </td></tr>

          <!-- validade -->
          <tr><td style="padding:0 36px 24px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff6ee;border:1px solid #ffe0c2;border-radius:10px;">
              <tr><td style="padding:12px 16px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#7a3a00;">
                &#9201;&nbsp; Este link vale por <strong>${e(validity)}</strong> e só pode ser usado <strong>uma vez</strong>.
              </td></tr>
            </table>
          </td></tr>

          <!-- não foi você -->
          <tr><td style="padding:0 36px 28px 36px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.6;color:${C.muted};">
            <strong style="color:${C.text};">Não pediu a troca?</strong> Pode ignorar este e-mail com segurança: sua senha atual continua valendo e ninguém consegue alterá-la sem este link.
          </td></tr>

          <!-- link alternativo -->
          <tr><td style="padding:20px 36px 32px 36px;border-top:1px solid ${C.border};font-family:Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.muted};">
            O botão não funcionou? Copie e cole este endereço no navegador:<br>
            <a href="${e(link)}" target="_blank" style="color:${C.brand};word-break:break-all;">${e(link)}</a>
          </td></tr>
        </table>
      </td></tr>

      <!-- rodapé -->
      <tr><td align="center" style="padding:24px 16px 0 16px;font-family:Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.6;color:${C.muted};">
        Prestek Telecom · Sistema de Gestão e Auditoria 5S<br>
        Mensagem automática — por favor, não responda a este e-mail.
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    hello,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta no Sistema de Gestão e Auditoria 5S (Prestek).",
    "",
    "Para criar uma nova senha, abra o link abaixo:",
    link,
    "",
    `O link vale por ${validity} e só pode ser usado uma vez.`,
    "",
    "Não pediu a troca? Ignore este e-mail: sua senha atual continua valendo.",
    "",
    "— Prestek 5S (mensagem automática, não responda)",
  ].join("\n");

  return { subject, html, text };
}
