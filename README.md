# AIO Checker

All-in-One API Credential Checker Dashboard. Validate credentials across 7 services from a single interface with bulk operations, real-time results, and CSV export.

## Supported Services

| Service | What It Checks |
|---------|---------------|
| **AWS** | STS identity, IAM users, SES limits & verified domains |
| **Twilio** | Account balance, status, type & phone numbers |
| **Nexmo/Vonage** | Account balance, type & SMS pricing |
| **SMTP** | Server connection, TLS version, auth method — optionally sends a test email |
| **SendGrid** | Account info, plan, credits, scopes & security settings |
| **Brevo** | Account details, email/SMS credits, contacts & campaigns |
| **Mailgun** | Domains, sending limits & webhooks/routes |

## Architecture

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js server (port 3001) for SMTP validation and CORS proxying
- **Storage**: Session-based — data clears on page refresh

## Quick Start

```bash
# Install dependencies
npm install

# Run both frontend and backend together
npm run dev:all

# Or run separately
npm run dev          # Frontend only (Vite)
npm run dev:server   # Backend only (Express)
```

The dashboard opens at `http://localhost:5173`.

## Usage

### Adding Credentials

Each service accepts bulk input. Paste multiple lines and click **Add**.

**SMTP format** (supports `.env` leak format):
```
authsmtp.securemail.pro|587|noreply@domain.com|password
smtp.gmail.com|587|user@gmail.com|app-password
```

**AWS format**:
```
AKIAIOSFODNN7EXAMPLE|wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY|us-east-1
```

**Twilio format**:
```
ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|your_auth_token
```

**Nexmo format**:
```
a1b2c3d4e5f6g7h8|your_api_secret
```

**SendGrid / Brevo / Mailgun**: One API key per line.

### SMTP Test Email

Enter a recipient email in the **Test Recipient Email** field. When you check an SMTP server, the backend will send a real test email to verify the configuration works end-to-end.

### Bulk Check & Export

- **Check All** — validates all pending credentials sequentially with progress tracking
- **Export CSV** — downloads results as a CSV file
- **Clear All** — removes all entries from the session

## Project Structure

```
├── server/
│   ├── index.ts              # Express server entry point
│   └── routes/
│       ├── smtp.ts           # SMTP validation (nodemailer)
│       └── proxy.ts          # CORS proxy for Twilio, Nexmo, SendGrid, Brevo, Mailgun
├── src/
│   ├── sections/             # Service checker components
│   ├── components/ui/        # shadcn/ui components
│   └── App.tsx               # Dashboard layout
├── vite.config.ts            # Vite config with API proxy
└── tsconfig.server.json      # Server TypeScript config
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS 3, shadcn/ui
- **Backend**: Express 5, nodemailer, cors
- **AWS SDK**: @aws-sdk/client-sts, @aws-sdk/client-ses, @aws-sdk/client-iam

## License

MIT
