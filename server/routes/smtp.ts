import { Router, Request, Response } from "express";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

const router = Router();

interface SmtpValidateBody {
  host: string;
  port?: number;
  username: string;
  password: string;
  testRecipient?: string;
}

// Represents the undocumented internal SMTP connection object exposed by nodemailer
interface NodemailerSmtpInternal {
  socket?: { getCipher?: () => { version?: string } | null } | null;
  servername?: string;
}

router.post(
  "/validate",
  async (
    req: Request<Record<string, never>, unknown, SmtpValidateBody>,
    res: Response,
  ) => {
    const { host, port, username, password, testRecipient } = req.body;

    if (!host || !username || !password) {
      return res
        .status(400)
        .json({ error: "host, username, and password are required" });
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
          subject: "SMTP Validation Test",
          text: "This is a test email from API Credential Checker to validate your SMTP configuration.",
          html: "<p>This is a test email from <strong>API Credential Checker</strong> to validate your SMTP configuration.</p>",
        });
        mailSent = true;
        messageId = mailResult.messageId || null;
      }

      // nodemailer does not expose internal connection details via its public API;
      // casting through unknown is the only way to read them without a monkey-patch.
      const smtpConn =
        (transport as unknown as { smtp: NodemailerSmtpInternal }).smtp ?? null;
      const cipher = smtpConn?.socket?.getCipher?.();
      const tlsVersion =
        cipher?.version ?? (actualPort === 465 ? "SSL/TLS" : "TLS 1.2");
      const authMethod = actualPort === 465 ? "SSL/TLS" : "STARTTLS";
      const sslEnabled = actualPort === 465 || actualPort === 587;
      const serverName: string = smtpConn?.servername ?? host;
      const serverInfo = `ESMTP ${serverName.split(".")[0].toUpperCase()}`;

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
    } catch (err: unknown) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : "SMTP connection failed",
      });
    } finally {
      if (transport) {
        try {
          transport.close();
        } catch {
          // Ignore close errors — the connection may already be gone
        }
      }
    }
  },
);

export { router as smtpRoute };
