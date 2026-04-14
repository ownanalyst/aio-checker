import { Router, Request, Response } from 'express';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const router = Router();

interface SmtpValidateBody {
  host: string;
  port?: number;
  username: string;
  password: string;
  testRecipient?: string;
}

router.post('/validate', async (req: Request<{}, any, SmtpValidateBody>, res: Response) => {
  const { host, port, username, password, testRecipient } = req.body;

  if (!host || !username || !password) {
    return res.status(400).json({ error: 'host, username, and password are required' });
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
      connectionTimeout: 15000,
      tls: { rejectUnauthorized: false },
    });

    // Verify connection and authentication
    await transport.verify();

    const connectionTime = Date.now() - startTime;

    // Send test email if recipient provided
    let mailSent = false;
    let messageId: string | null = null;
    if (testRecipient) {
      const result = await transport.sendMail({
        from: username,
        to: testRecipient,
        subject: 'SMTP Validation Test',
        text: 'This is a test email from API Credential Checker to validate your SMTP configuration.',
        html: '<p>This is a test email from <strong>API Credential Checker</strong> to validate your SMTP configuration.</p>',
      });
      mailSent = true;
      messageId = result.messageId || null;
    }

    // Determine TLS and auth details from the connection
    const smtpConnection = (transport as any).smtp;
    const tlsInfo = smtpConnection?.socket?.getCipher?.();
    const tlsVersion = tlsInfo?.version || 'TLS 1.2';
    const authMethod = actualPort === 465 ? 'SSL/TLS' : 'STARTTLS';
    const sslEnabled = actualPort === 465 || actualPort === 587;
    const serverName = smtpConnection?.servername || host;
    const serverInfo = `ESMTP ${serverName.split('.')[0].toUpperCase()}`;

    res.json({
      success: true,
      tlsVersion,
      sslEnabled,
      authMethod,
      connectionTime,
      serverInfo,
      mailSent,
      messageId,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message || 'SMTP connection failed',
    });
  } finally {
    if (transport) {
      try {
        transport.close();
      } catch {
        // Ignore close errors
      }
    }
  }
});

export { router as smtpRoute };
