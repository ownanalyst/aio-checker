import type { Config } from "@netlify/functions";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

interface SmtpValidateBody {
  host: string;
  port?: number;
  username: string;
  password: string;
  testRecipient?: string;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: SmtpValidateBody;
  try {
    body = await req.json() as SmtpValidateBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { host, port, username, password, testRecipient } = body;

  if (!host || !username || !password) {
    return Response.json(
      { error: 'host, username, and password are required' },
      { status: 400 },
    );
  }

  const actualPort = Number(port) || 587;
  const startTime = Date.now();
  let transport: Transporter | null = null;

  try {
    transport = nodemailer.createTransport({
      host,
      port: actualPort,
      secure: actualPort === 465,
      auth: { user: username, pass: password },
      connectionTimeout: 15_000,
      tls: { rejectUnauthorized: false },
    });

    await transport.verify();
    const connectionTime = Date.now() - startTime;

    let mailSent = false;
    let messageId: string | null = null;
    if (testRecipient) {
      const mailResult = await transport.sendMail({
        from: username,
        to: testRecipient,
        subject: 'SMTP Validation Test',
        text: 'This is a test email from API Credential Checker to validate your SMTP configuration.',
        html: '<p>This is a test email from <strong>API Credential Checker</strong> to validate your SMTP configuration.</p>',
      });
      mailSent = true;
      messageId = mailResult.messageId || null;
    }

    // nodemailer internals are not typed; cast is unavoidable here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const smtpConn = (transport as any).smtp;
    const cipher = smtpConn?.socket?.getCipher?.();
    const tlsVersion = cipher?.version ?? (actualPort === 465 ? 'SSL/TLS' : 'TLS 1.2');
    const authMethod = actualPort === 465 ? 'SSL/TLS' : 'STARTTLS';
    const sslEnabled = actualPort === 465 || actualPort === 587;
    const serverName: string = smtpConn?.servername ?? host;
    const serverInfo = `ESMTP ${serverName.split('.')[0].toUpperCase()}`;

    return Response.json({
      success: true,
      tlsVersion,
      sslEnabled,
      authMethod,
      connectionTime,
      serverInfo,
      mailSent,
      messageId,
    });
  } catch (err: unknown) {
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : 'SMTP connection failed' },
      { status: 400 },
    );
  } finally {
    if (transport) {
      try { transport.close(); } catch { /* ignore close errors */ }
    }
  }
};

export const config: Config = {
  path: '/api/smtp/validate',
};
