import { Router, Request, Response } from "express";

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
    baseUrl: "https://api.twilio.com/2010-04-01",
    authBuilder: (body) => {
      const auth = Buffer.from(`${body.accountSid}:${body.authToken}`).toString(
        "base64",
      );
      return { Authorization: `Basic ${auth}` };
    },
    endpoints: [
      { path: "/Accounts/{accountSid}.json", method: "GET" },
      { path: "/Accounts/{accountSid}/Balance.json", method: "GET" },
      {
        path: "/Accounts/{accountSid}/IncomingPhoneNumbers.json?PageSize=10",
        method: "GET",
      },
    ],
  },
  nexmo: {
    baseUrl: "https://rest.nexmo.com",
    authBuilder: () => ({}),
    endpoints: [
      { path: "/account/get-balance", method: "GET" },
      { path: "/account/get-pricing/outbound/sms?country=US", method: "GET" },
    ],
  },
  sendgrid: {
    baseUrl: "https://api.sendgrid.com/v3",
    authBuilder: (body) => ({
      Authorization: `Bearer ${body.apiKey}`,
      "Content-Type": "application/json",
    }),
    endpoints: [
      { path: "/user/account", method: "GET" }, // returns: type, reputation
      { path: "/user/credits", method: "GET" }, // returns: remain, total, used
      { path: "/user/profile", method: "GET" }, // returns: username, email, first_name, last_name, company
      { path: "/scopes", method: "GET" }, // returns: { scopes: string[] }
    ],
  },
  brevo: {
    baseUrl: "https://api.brevo.com/v3",
    authBuilder: (body) => ({
      "api-key": String(body.apiKey),
      "Content-Type": "application/json",
    }),
    endpoints: [
      { path: "/account", method: "GET" }, // returns: email, firstName, lastName, companyName, plan[]
      { path: "/contacts?limit=1", method: "GET" }, // returns: { count, contacts[] }
    ],
  },
  mailgun: {
    baseUrl: "https://api.mailgun.net/v3",
    fallbackBaseUrl: "https://api.eu.mailgun.net/v3",
    authBuilder: (body) => {
      const auth = Buffer.from(`api:${body.apiKey}`).toString("base64");
      return { Authorization: `Basic ${auth}` };
    },
    endpoints: [
      { path: "/domains", method: "GET" }, // returns: { total_count, items[] }
      { path: "/routes?limit=10", method: "GET" }, // returns: { total_count, items[] }
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

  // Nexmo authenticates via query params instead of headers
  if (service === "nexmo") {
    const params = new URLSearchParams({
      api_key: String(body.apiKey ?? ""),
      api_secret: String(body.apiSecret ?? ""),
    });
    url += `${url.includes("?") ? "&" : "?"}${params.toString()}`;
  }

  try {
    const response = await fetch(url, {
      method: endpoint.method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    // Parse JSON independently so a bad response body doesn't kill sibling endpoints
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = { message: `Non-JSON response (HTTP ${response.status})` };
    }

    return {
      endpoint: endpoint.path.split("?")[0],
      ok: response.ok,
      status: response.status,
      data,
    };
  } catch (err: unknown) {
    return {
      endpoint: endpoint.path.split("?")[0],
      ok: false,
      status: 0,
      data: {
        message: err instanceof Error ? err.message : "Network request failed",
      },
    };
  }
}

const router = Router();

router.post(
  "/:service",
  async (
    req: Request<{ service: string }, unknown, Record<string, unknown>>,
    res: Response,
  ) => {
    const service = req.params.service;
    const serviceConfig = SERVICE_CONFIGS[service];

    if (!serviceConfig) {
      return res.status(404).json({ error: `Unknown service: ${service}` });
    }

    const body = req.body;

    try {
      const headers = serviceConfig.authBuilder(body);
      const results: EndpointResult[] = [];

      if (service === "mailgun" && serviceConfig.fallbackBaseUrl) {
        // Try the US endpoint first; automatically fall back to EU on auth failure
        const firstResult = await fetchEndpoint(
          serviceConfig.baseUrl,
          serviceConfig.endpoints[0],
          headers,
          body,
          service,
        );
        let activeBaseUrl = serviceConfig.baseUrl;

        if (
          (firstResult.status === 401 || firstResult.status === 403) &&
          serviceConfig.fallbackBaseUrl
        ) {
          const euResult = await fetchEndpoint(
            serviceConfig.fallbackBaseUrl,
            serviceConfig.endpoints[0],
            headers,
            body,
            service,
          );
          if (euResult.ok) {
            activeBaseUrl = serviceConfig.fallbackBaseUrl;
            results.push(euResult);
          } else {
            // Keep the original US error so the frontend can display it
            results.push(firstResult);
          }
        } else {
          results.push(firstResult);
        }

        // Fetch remaining endpoints on whichever base URL succeeded
        for (const endpoint of serviceConfig.endpoints.slice(1)) {
          results.push(
            await fetchEndpoint(
              activeBaseUrl,
              endpoint,
              headers,
              body,
              service,
            ),
          );
        }
      } else {
        for (const endpoint of serviceConfig.endpoints) {
          results.push(
            await fetchEndpoint(
              serviceConfig.baseUrl,
              endpoint,
              headers,
              body,
              service,
            ),
          );
        }
      }

      res.json({ service, results });
    } catch (err: unknown) {
      res.status(500).json({
        service,
        error: err instanceof Error ? err.message : "Proxy request failed",
      });
    }
  },
);

export { router as proxyRoute };
