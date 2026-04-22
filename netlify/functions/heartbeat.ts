import type { Config } from "@netlify/functions";

export default async (req: Request): Promise<Response> => {
  if (req.method === 'POST') {
    let id = `user-${Date.now()}`;
    try {
      const body = await req.json() as { id?: string };
      if (body.id) id = body.id;
    } catch { /* ignore parse failures */ }
    return Response.json({ id, online: 1 });
  }
  // GET /api/online
  return Response.json({ online: 1 });
};

export const config: Config = {
  path: ['/api/heartbeat', '/api/online'],
};
