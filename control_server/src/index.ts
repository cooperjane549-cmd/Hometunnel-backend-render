import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

interface HostNode {
  code: string;
  nodePublicKey: string;
  nodeEndpoint: string;
  createdAt: number;
}

// In-memory store for active pairing sessions
const activeNodes = new Map<string, HostNode>();

// Health check endpoint (for Render warm-up)
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({ status: 'running', activeSessions: activeNodes.size });
});

// Host registers its session code and WireGuard metadata
app.post('/register', (req: Request, res: Response) => {
  const { code, nodePublicKey, nodeEndpoint } = req.body;

  if (!code || !nodePublicKey || !nodeEndpoint) {
    return res.status(400).json({ message: 'Missing required parameters: code, nodePublicKey, nodeEndpoint' });
  }

  activeNodes.set(code, {
    code,
    nodePublicKey,
    nodeEndpoint,
    createdAt: Date.now(),
  });

  console.log(`[REGISTER] Host registered code: ${code}`);
  return res.status(200).json({ message: 'Host registered successfully', code });
});

// Client pairs using the 6-digit session code
app.post('/pair', (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ message: 'Missing session code' });
  }

  const hostSession = activeNodes.get(code);

  if (!hostSession) {
    console.log(`[PAIR FAILED] Code not found or expired: ${code}`);
    return res.status(404).json({ message: 'Pairing failed. Code invalid or expired.' });
  }

  console.log(`[PAIR SUCCESS] Client paired with code: ${code}`);
  return res.status(200).json({
    message: 'Pairing successful',
    nodePublicKey: hostSession.nodePublicKey,
    nodeEndpoint: hostSession.nodeEndpoint,
  });
});

// Clean up stale sessions older than 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, session] of activeNodes.entries()) {
    if (now - session.createdAt > 15 * 60 * 1000) {
      activeNodes.delete(code);
      console.log(`[CLEANUP] Expired code removed: ${code}`);
    }
  }
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HomeTunnel signaling server running on port ${PORT}`);
});
