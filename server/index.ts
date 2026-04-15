import express from 'express';
import cors from 'cors';
import { smtpRoute } from './routes/smtp.js';
import { proxyRoute } from './routes/proxy.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/smtp', smtpRoute);
app.use('/api/proxy', proxyRoute);

// --- Real-time visitor tracking ---
const activeUsers = new Map<string, number>();
const HEARTBEAT_TIMEOUT = 30_000; // expire after 30s of no heartbeat

app.post('/api/heartbeat', (req, res) => {
  const id = (req.body.id as string) || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  activeUsers.set(id, Date.now());
  res.json({ id, online: activeUsers.size });
});

app.get('/api/online', (req, res) => {
  // Clean up stale entries
  const now = Date.now();
  for (const [uid, lastSeen] of activeUsers.entries()) {
    if (now - lastSeen > HEARTBEAT_TIMEOUT) {
      activeUsers.delete(uid);
    }
  }
  res.json({ online: activeUsers.size });
});

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});
