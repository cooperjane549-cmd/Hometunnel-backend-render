import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// In-Memory Store (Replace with Supabase PostgreSQL in production)
interface NodeSession {
  nodeId: string;
  pairingCode: string;
  nodePublicKey: string;
  ipAddress: string;
  port: number;
  isPaired: boolean;
  clientPublicKey?: string;
}

const nodeRegistry = new Map<string, NodeSession>();

// Root ping endpoint for Render cold-start checks
app.get('/', (_req: Request, res: Response) => {
  res.send({ status: 'HomeTunnel Control Plane Server Running' });
});

// 1. Home Node (Kisumu) Registers and Requests a 6-Digit Pairing Code
app.post('/api/node/register', (req: Request, res: Response) => {
  const { nodePublicKey, ipAddress, port } = req.body;

  // Provide fallback values if client app sends lightweight payloads
  const effectivePublicKey = nodePublicKey || 'host_generated_key';
  const effectiveIp = ipAddress || req.ip || '127.0.0.1';

  const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
  const nodeId = `node_${Date.now()}`;

  const session: NodeSession = {
    nodeId,
    pairingCode,
    nodePublicKey: effectivePublicKey,
    ipAddress: effectiveIp,
    port: port || 51820,
    isPaired: false,
  };

  nodeRegistry.set(pairingCode, session);

  console.log(`[Home Node Registered] ID: ${nodeId} | Code: ${pairingCode}`);

  return res.json({
    message: 'Node registered successfully',
    nodeId,
    pairingCode,
  });
});

// Helper function to process pairing logic across both legacy and API endpoints
const handlePairing = (req: Request, res: Response) => {
  const pairingCode = req.body.pairingCode || req.body.code;
  const clientPublicKey = req.body.clientPublicKey || 'client_generated_key';

  console.log(`[Pair Request Received] Code attempted: ${pairingCode}`);

  if (!pairingCode) {
    return res.status(400).json({ error: 'Missing pairing code' });
  }

  const session = nodeRegistry.get(pairingCode);

  if (!session) {
    console.log(`[Pairing Failed] Code ${pairingCode} not found in registry.`);
    return res.status(404).json({ error: 'Invalid or expired pairing code' });
  }

  session.isPaired = true;
  session.clientPublicKey = clientPublicKey;

  console.log(`[Client Paired Successfully] Linked to Node: ${session.nodeId}`);

  return res.json({
    message: 'Successfully paired to Home Node',
    nodeEndpoint: `${session.ipAddress}:${session.port}`,
    nodePublicKey: session.nodePublicKey,
    assignedVirtualIp: '10.200.0.2',
  });
};

// 2. Mobile App (Nairobi) Enters Pairing Code to Connect
app.post('/api/client/pair', handlePairing);
app.post('/pair', handlePairing); // Direct fallback route for Flutter Client app

// 3. Heartbeat Endpoint for Home Node to Update Dynamic ISP IPs
app.post('/api/node/heartbeat', (req: Request, res: Response) => {
  const pairingCode = req.body.pairingCode || req.body.code;
  const { currentIp, currentPort } = req.body;

  const session = nodeRegistry.get(pairingCode);
  if (!session) {
    return res.status(404).json({ error: 'Node session not found' });
  }

  if (currentIp) session.ipAddress = currentIp;
  if (currentPort) session.port = currentPort;

  return res.json({ status: 'ack', isPaired: session.isPaired, clientPublicKey: session.clientPublicKey });
});

app.get('/health', (_req: Request, res: Response) => {
  res.send('HomeTunnel Control Plane Server Running');
});

app.listen(PORT, () => {
  console.log(`Control plane server active on port ${PORT}`);
});
