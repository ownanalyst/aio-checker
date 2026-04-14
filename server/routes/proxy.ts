import { Router, Request, Response } from 'express';

const router = Router();

interface ServiceConfig {
  baseUrl: string;
  authBuilder: (body: Record<string, any>) => Record<string, string>;
  endpoints: Array<{ path: string; method: string }>;
}

const SERVICE_CONFIGS: Record<string, ServiceConfig> = {
  twilio: {
    baseUrl: 'https://api.twilio.com/2010-04-01',
    authBuilder: (body) => {
      const auth = Buffer.from(`${body.accountSid}:${body.authToken}`).toString('base64');
      return { Authorization: `Basic ${auth}` };
    },
    endpoints: [
      { path: '/Accounts/{accountSid}.json', method: 'GET' },
      { path: '/Accounts/{accountSid}/Balance.json', method: 'GET' },
      { path: '/Accounts/{accountSid}/IncomingPhoneNumbers.json?PageSize=10', method: 'GET' },
    ],
  },
  nexmo: {
    baseUrl: 'https://rest.nexmo.com',
    authBuilder: () => ({}),
    endpoints: [
      { path: '/account/get-balance', method: 'GET' },
      { path: '/account/get-pricing/outbound/sms?country=US', method: 'GET' },
    ],
  },
  sendgrid: {
    baseUrl: 'https://api.sendgrid.com/v3',
    authBuilder: (body) => ({
      Authorization: `Bearer ${body.apiKey}`,
      'Content-Type': 'application/json',
    }),
    endpoints: [
      { path: '/user/account', method: 'GET' },
      { path: '/user/credits', method: 'GET' },
    ],
  },
  brevo: {
    baseUrl: 'https://api.brevo.com/v3',
    authBuilder: (body) => ({
      'api-key': body.apiKey,
      'Content-Type': 'application/json',
    }),
    endpoints: [
      { path: '/account', method: 'GET' },
    ],
  },
  mailgun: {
    baseUrl: 'https://api.mailgun.net/v3',
    authBuilder: (body) => {
      const auth = Buffer.from(`api:${body.apiKey}`).toString('base64');
      return { Authorization: `Basic ${auth}` };
    },
    endpoints: [
      { path: '/domains', method: 'GET' },
    ],
  },
};

router.post('/:service', async (req: Request, res: Response) => {
  const service = req.params.service as string;
  const config = SERVICE_CONFIGS[service];

  if (!config) {
    return res.status(404).json({ error: `Unknown service: ${service}` });
  }

  const { body } = req;

  try {
    const headers = config.authBuilder(body);
    const results: Array<{ endpoint: string; ok: boolean; status?: number; data: any }> = [];

    for (const endpoint of config.endpoints) {
      let url = `${config.baseUrl}${endpoint.path}`;

      // Replace path parameters (e.g., {accountSid})
      for (const [key, value] of Object.entries(body)) {
        url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
      }

      // For Nexmo, add query params
      if (service === 'nexmo') {
        const params = new URLSearchParams({
          api_key: body.apiKey,
          api_secret: body.apiSecret,
        });
        // Append to existing query string or create new one
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}${params.toString()}`;
      }

      const fetchOptions: RequestInit = {
        method: endpoint.method,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      };

      const response = await fetch(url, fetchOptions);
      const data = await response.json();

      results.push({
        endpoint: endpoint.path.split('?')[0],
        ok: response.ok,
        status: response.status,
        data,
      });
    }

    res.json({ service, results });
  } catch (error: any) {
    res.status(500).json({
      service,
      error: error.message || 'Proxy request failed',
    });
  }
});

export { router as proxyRoute };
