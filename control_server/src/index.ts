import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

interface PeerSession {
  code: string;
  hostPublicKey: string;
  hostEndpoint: string;
  clientPublicKey?: string;
  createdAt: number;
}

const sessions = new Map<string, PeerSession>();

// Health check
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'running', activeSessions: sessions.size });
});

// Host registers its public key and reachable endpoint
app.post('/register', (req: Request, res: Response) => {
  const { code, hostPublicKey, hostEndpoint } = req.body;

  if (!code || !hostPublicKey || !hostEndpoint) {
    res.status(400).json({ message: 'Missing code, hostPublicKey, or hostEndpoint' });
    return;
  }

  sessions.set(code, {
    code,
    hostPublicKey,
    hostEndpoint,
    createdAt: Date.now(),
  });

  console.log(`[HOST REGISTERED] Code: ${code} -> ${hostEndpoint}`);
  res.status(200).json({ message: 'Host registered successfully' });
});

// Client looks up code and supplies its public key
app.post('/pair', (req: Request, res: Response) => {
  const { code, clientPublicKey } = req.body;

  if (!code) {
    res.status(400).json({ message: 'Missing pairing code' });
    return;
  }

  const session = sessions.get(code);

  if (!session) {
    res.status(404).json({ message: 'Code not found or expired' });
    return;
  }

  if (clientPublicKey) {
    session.clientPublicKey = clientPublicKey;
    console.log(`[CLIENT PAIRED] Code: ${code} -> Client Public Key received.`);
  }

  res.status(200).json({
    hostPublicKey: session.hostPublicKey,
    hostEndpoint: session.hostEndpoint,
  });
});

// Host polls to retrieve client's key
app.get('/host/pending/:code', (req: Request, res: Response) => {
  const { code } = req.params;
  const session = sessions.get(code);

  if (!session) {
    res.status(404).json({ message: 'Code not found or expired' });
    return;
  }

  res.status(200).json({ clientPublicKey: session.clientPublicKey ?? null });
});

// Host deregisters session when handshake succeeds or code expires
app.delete('/session/:code', (req: Request, res: Response) => {
  const { code } = req.params;
  if (sessions.has(code)) {
    sessions.delete(code);
    console.log(`[SESSION REMOVED] Code: ${code}`);
    res.status(200).json({ message: 'Session deleted' });
  } else {
    res.status(404).json({ message: 'Session not found' });
  }
});

// Cleanup sessions older than 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [code, session] of sessions.entries()) {
    if (now - session.createdAt > 60 * 60 * 1000) {
      sessions.delete(code);
      console.log(`[EXPIRED SESSION REMOVED] Code: ${code}`);
    }
  }
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pairing directory running on port ${PORT}`);
});
