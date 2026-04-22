import type { Config, Context } from "@netlify/functions";

interface EndpointResult {
  endpoint: string;
  ok: boolean;
  status: number;
  data: unknown;
}

interface ServiceConfig {
  baseUrl: string;
  fallbackBaseUrl?: string;
  authBuilder: (body: Record<string, unknown>) => Record<string, string>;
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
      { path: '/user/account', method: 'GET' },   // returns: type, reputation
      { path: '/user/credits', method: 'GET' },   // returns: remain, total, used
      { path: '/user/profile', method: 'GET' },   // returns: username, email, first_name, last_name, company
      { path: '/scopes', method: 'GET' },         // returns: { scopes: string[] }
    ],
  },
  brevo: {
    baseUrl: 'https://api.brevo.com/v3',
    authBuilder: (body) => ({
      'api-key': String(body.apiKey),
      'Content-Type': 'application/json',
    }),
    endpoints: [
      { path: '/account', method: 'GET' },             // returns: email, firstName, lastName, companyName, plan[]
      { path: '/contacts?limit=1', method: 'GET' },    // returns: { count, contacts[] }
    ],
  },
  mailgun: {
    baseUrl: 'https://api.mailgun.net/v3',
    fallbackBaseUrl: 'https://api.eu.mailgun.net/v3',
    authBuilder: (body) => {
      const auth = Buffer.from(`api:${body.apiKey}`).toString('base64');
      return { Authorization: `Basic ${auth}` };
    },
    endpoints: [
      { path: '/domains', method: 'GET' },         // returns: { total_count, items[] }
      { path: '/routes?limit=10', method: 'GET' }, // returns: { total_count, items[] }
    ],
  },
};

async function fetchEndpoint(
  baseUrl: string,
  endpoint: { path: string; method: string },
  headers: Record<string, string>,
  body: Record<string, unknown>,
  service: string,
): Promise<EndpointResult> {
  let url = `${baseUrl}${endpoint.path}`;

  // Replace path parameters like {accountSid}
  for (const [key, value] of Object.entries(body)) {
    url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
  }

  // Nexmo authenticates via query params
  if (service === 'nexmo') {
    const params = new URLSearchParams({
      api_key: String(body.apiKey ?? ''),
      api_secret: String(body.apiSecret ?? ''),
    });
    url += `${url.includes('?') ? '&' : '?'}${params.toString()}`;
  }

  try {
    const response = await fetch(url, {
      method: endpoint.method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = { message: `Non-JSON response (HTTP ${response.status})` };
    }

    return {
      endpoint: endpoint.path.split('?')[0],
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (err: unknown) {
    return {
      endpoint: endpoint.path.split('?')[0],
      ok: false,
      status: 0,
      data: { message: err instanceof Error ? err.message : 'Network request failed' },
    };
  }
}

export default async (req: Request, context: Context): Promise<Response> => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const service = context.params.service;
  const serviceConfig = SERVICE_CONFIGS[service];

  if (!serviceConfig) {
    return Response.json({ error: `Unknown service: ${service}` }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const headers = serviceConfig.authBuilder(body);
    const results: EndpointResult[] = [];

    if (service === 'mailgun' && serviceConfig.fallbackBaseUrl) {
      // Try US endpoint first; fall back to EU on auth failure
      const firstResult = await fetchEndpoint(
        serviceConfig.baseUrl, serviceConfig.endpoints[0], headers, body, service,
      );
      let activeBaseUrl = serviceConfig.baseUrl;

      if (
        (firstResult.status === 401 || firstResult.status === 403) &&
        serviceConfig.fallbackBaseUrl
      ) {
        const euResult = await fetchEndpoint(
          serviceConfig.fallbackBaseUrl, serviceConfig.endpoints[0], headers, body, service,
        );
        if (euResult.ok) {
          activeBaseUrl = serviceConfig.fallbackBaseUrl;
          results.push(euResult);
        } else {
          results.push(firstResult); // keep original error for display
        }
      } else {
        results.push(firstResult);
      }

      // Fetch remaining endpoints on the resolved base URL
      for (const endpoint of serviceConfig.endpoints.slice(1)) {
        results.push(await fetchEndpoint(activeBaseUrl, endpoint, headers, body, service));
      }
    } else {
      for (const endpoint of serviceConfig.endpoints) {
        results.push(await fetchEndpoint(serviceConfig.baseUrl, endpoint, headers, body, service));
      }
    }

    return Response.json({ service, results });
  } catch (err: unknown) {
    return Response.json(
      { service, error: err instanceof Error ? err.message : 'Proxy request failed' },
      { status: 500 },
    );
  }
};

export const config: Config = {
  path: '/api/proxy/:service',
};
