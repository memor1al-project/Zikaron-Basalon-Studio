import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import { corsMiddleware } from './middleware/cors';
import { securityHeaders } from './middleware/security';
import { validateInput } from './middleware/inputValidation';
import { verifyFirebaseAuth } from './middleware/verifyFirebaseAuth';
import materialsRouter from './routes/materials';

admin.initializeApp();

const app = express();

app.use(express.json({ limit: '30mb' }));
app.use(corsMiddleware);
app.use(securityHeaders);
app.use(validateInput);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/materials', verifyFirebaseAuth, materialsRouter);

app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 300,
    concurrency: 40,
    secrets: ['GEMINI_API_KEY'],
  },
  app
);
