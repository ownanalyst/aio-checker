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

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});
