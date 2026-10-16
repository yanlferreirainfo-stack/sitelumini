export interface AccessMessageData {
  customerName: string;
  username: string;
  password: string;
  expiresAt: string | null;
  productName: string | null;
  serverUrl: string | null;
}

export function formatDateBR(iso: string | null): string {
  if (!iso) return 'sem data definida';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Parâmetros do template do WhatsApp, na ordem {{1}}..{{4}}.
 * O template precisa ser aprovado pela Meta com exatamente estas variáveis:
 *   Olá {{1}}! Seu acesso TV PlayPix está pronto.
 *   Usuário: {{2}}
 *   Senha: {{3}}
 *   Válido até: {{4}}
 */
export function whatsappTemplateParams(d: AccessMessageData): string[] {
  return [firstName(d.customerName), d.username, d.password, formatDateBR(d.expiresAt)];
}

export function accessEmail(d: AccessMessageData): { subject: string; text: string; html: string } {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const rows: [string, string][] = [
    ['Usuário', d.username],
    ['Senha', d.password],
    ['Válido até', formatDateBR(d.expiresAt)],
  ];
  if (d.productName) rows.unshift(['Plano', d.productName]);
  if (d.serverUrl) rows.push(['Servidor', d.serverUrl]);

  const text = [
    `Olá, ${firstName(d.customerName)}!`,
    '',
    'Seu acesso TV PlayPix está pronto:',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Guarde estes dados. Em caso de dúvida, responda este e-mail.',
  ].join('\n');

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#4c1d95;padding:20px 28px;color:#ffffff;font-size:20px;font-weight:bold">TV PlayPix</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:16px">Olá, ${esc(firstName(d.customerName))}!</p>
<p style="margin:0 0 20px;font-size:15px;color:#374151">Seu acesso está pronto. Seguem os dados:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;width:40%">${esc(k)}</td><td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-family:Consolas,monospace;font-size:15px;font-weight:bold">${esc(v)}</td></tr>`,
  )
  .join('')}
</table>
<p style="margin:20px 0 0;font-size:13px;color:#6b7280">Guarde estes dados. Em caso de dúvida, responda este e-mail.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject: 'Seu acesso TV PlayPix está pronto', text, html };
}

/** Mascara a senha em logs: "Ab3dEf9h" → "Ab******" */
export function maskSecret(s: string): string {
  return s.length <= 2 ? '**' : s.slice(0, 2) + '*'.repeat(Math.max(4, s.length - 2));
}
