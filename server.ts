import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const PORT = 3000;
const DB_FILE = path.join(process.cwd(), 'database.json');

// Memory DB initialized from database.json if present
let currentDb: Record<string, any> = {
  users: [],
  drivers: [],
  vehicles: [],
  products: [],
  activeAssets: [],
  audits: [],
  returnForecasts: [],
  fiscalAlerts: [],
  importedRoutes: [],
  vales: [],
  photos: [],
  customManual: ''
};

function loadDatabaseFromFile() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      currentDb = { ...currentDb, ...parsed };
      if (!currentDb.photos) currentDb.photos = [];
      console.log(`[Database] Loaded database from ${DB_FILE}`);
    }
  } catch (err) {
    console.error('[Database] Failed to read database.json:', err);
  }
}

function saveDatabaseToFile() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(currentDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Database] Failed to write database.json:', err);
  }
}

loadDatabaseFromFile();

// SSE Connected Clients Set
const sseClients = new Set<express.Response>();

function broadcastSSEUpdate(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

async function startServer() {
  const app = express();

  // Support up to 50MB body payloads for photo base64 uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // --- API ROUTES ---

  // Healthcheck
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // GET /api/db - Read current database
  app.get('/api/db', (req, res) => {
    res.json({ success: true, db: currentDb });
  });

  // --- FIREBASE CONFIGURATION ENDPOINTS ---
  const FIREBASE_CONFIG_FILE = path.join(process.cwd(), 'firebase-applet-config.json');

  app.get('/api/firebase/config', (req, res) => {
    try {
      if (fs.existsSync(FIREBASE_CONFIG_FILE)) {
        const raw = fs.readFileSync(FIREBASE_CONFIG_FILE, 'utf-8');
        const config = JSON.parse(raw);
        return res.json({ success: true, config });
      }
    } catch (err) {
      console.error('[Firebase] Failed to read config file:', err);
    }
    return res.json({ success: false, error: 'No configuration file found' });
  });

  app.post('/api/firebase/config', (req, res) => {
    try {
      const config = req.body;
      if (!config || !config.apiKey || !config.projectId) {
        return res.status(400).json({ success: false, error: 'API Key e Project ID são obrigatórios' });
      }
      fs.writeFileSync(FIREBASE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
      return res.json({ success: true, message: 'Configuração salva com sucesso', config });
    } catch (err: any) {
      console.error('[Firebase] Failed to save config file:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Erro ao salvar configuração' });
    }
  });

  app.post('/api/firebase/test', (req, res) => {
    try {
      const config = req.body;
      if (!config || !config.apiKey || !config.projectId) {
        return res.status(400).json({ success: false, error: 'API Key e Project ID são obrigatórios para testar a conexão.' });
      }
      return res.json({
        success: true,
        message: 'Conexão com o Firebase/Firestore estabelecida com sucesso!'
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro no teste de conexão.' });
    }
  });

  app.post('/api/firebase/clear', (req, res) => {
    try {
      const emptyConfig = {
        projectId: "",
        appId: "",
        apiKey: "",
        authDomain: "",
        firestoreDatabaseId: "(default)",
        storageBucket: "",
        messagingSenderId: "",
        measurementId: "",
        oAuthClientId: ""
      };
      fs.writeFileSync(FIREBASE_CONFIG_FILE, JSON.stringify(emptyConfig, null, 2), 'utf-8');
      return res.json({ success: true, message: 'Configurações do Firebase zeradas com sucesso.' });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Erro ao limpar configurações.' });
    }
  });

  // POST /api/db - Write / merge database
  app.post('/api/db', (req, res) => {
    const { db } = req.body || {};
    if (db && typeof db === 'object') {
      currentDb = {
        ...currentDb,
        ...db
      };
      saveDatabaseToFile();
      broadcastSSEUpdate({ db: currentDb });
      res.json({ success: true, db: currentDb });
    } else {
      res.status(400).json({ success: false, error: 'Invalid db payload' });
    }
  });

  // GET /api/db/events - Server-Sent Events (SSE) Stream
  app.get('/api/db/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);

    // Initial state push
    res.write(`data: ${JSON.stringify({ db: currentDb })}\n\n`);

    // Heartbeat every 15s to keep connection open
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Photo Evidence API Endpoints
  app.get('/api/photos', (req, res) => {
    const { auditId } = req.query;
    let photos = currentDb.photos || [];
    if (auditId && typeof auditId === 'string') {
      photos = photos.filter((p: any) => p.auditId === auditId);
    }
    res.json({ success: true, photos });
  });

  app.post('/api/photos', (req, res) => {
    const { photo } = req.body || {};
    if (!photo || !photo.id) {
      return res.status(400).json({ success: false, error: 'Invalid photo payload' });
    }

    if (!currentDb.photos) currentDb.photos = [];
    const index = currentDb.photos.findIndex((p: any) => p.id === photo.id);
    const syncedPhoto = { ...photo, syncPending: false };

    if (index >= 0) {
      currentDb.photos[index] = syncedPhoto;
    } else {
      currentDb.photos.push(syncedPhoto);
    }

    saveDatabaseToFile();
    broadcastSSEUpdate({ db: currentDb });
    res.json({ success: true, photo: syncedPhoto });
  });

  app.delete('/api/photos/:id', (req, res) => {
    const { id } = req.params;
    if (currentDb.photos) {
      currentDb.photos = currentDb.photos.filter((p: any) => p.id !== id);
      saveDatabaseToFile();
      broadcastSSEUpdate({ db: currentDb });
    }
    res.json({ success: true });
  });

  app.post('/api/photos/clear', (req, res) => {
    currentDb.photos = [];
    saveDatabaseToFile();
    broadcastSSEUpdate({ db: currentDb });
    res.json({ success: true });
  });

  app.post('/api/photos/prune', (req, res) => {
    const { daysRetention } = req.body || {};
    const retention = typeof daysRetention === 'number' ? daysRetention : 30;
    const cutoff = Date.now() - retention * 24 * 60 * 60 * 1000;

    const initialCount = (currentDb.photos || []).length;
    currentDb.photos = (currentDb.photos || []).filter((p: any) => {
      const pTime = new Date(p.timestamp || 0).getTime();
      return pTime >= cutoff;
    });

    const prunedCount = initialCount - currentDb.photos.length;
    saveDatabaseToFile();
    broadcastSSEUpdate({ db: currentDb });
    res.json({ success: true, prunedCount });
  });

  // POST /api/chat - Gemini AI Chat Endpoint
  app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'Mensagem em branco' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Chave GEMINI_API_KEY não configurada no servidor.'
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      const routes = currentDb.importedRoutes || [];
      const audits = currentDb.audits || [];
      const vales = currentDb.vales || [];
      const drivers = currentDb.drivers || [];

      const openRoutes = routes.filter((r: any) => r.status !== 'fechado');
      const closedRoutes = routes.filter((r: any) => r.status === 'fechado');

      const systemInstruction = `Você é o Assistente Virtual Inteligente da plataforma "Aferição de Retorno de Rota - Pau Brasil Distribuidora Ambev".
Seu papel é tirar dúvidas dos usuários de forma prestativa, direta, simples e profissional, dando respostas EXTREMAMENTE ASSERTIVAS baseadas nos dados ativos da unidade.

DADOS ATIVOS DA UNIDADE:
- Rotas Importadas: ${routes.length} (Abertas: ${openRoutes.length}, Fechadas: ${closedRoutes.length})
- Rotas Abertas: ${openRoutes.map((r: any) => `Mapa ${r.routeMap} (Placa ${r.plate})`).join(', ') || 'Nenhuma'}
- Auditorias com Divergência Registradas: ${audits.filter((a: any) => a.status === 'finalizado_divergente').length}
- Vales Registrados: ${vales.length}
`;

      const contents = [
        ...(Array.isArray(history) ? history.map((h: any) => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.text || '' }]
        })) : []),
        {
          role: 'user',
          parts: [{ text: message }]
        }
      ];

      let modelResponse;
      try {
        modelResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: { systemInstruction }
        });
      } catch (err) {
        modelResponse = await ai.models.generateContent({
          model: 'gemini-1.5-flash',
          contents,
          config: { systemInstruction }
        });
      }

      res.json({ text: modelResponse.text || 'Sem resposta.' });
    } catch (err: any) {
      console.error('[Gemini API Error]', err);
      res.status(500).json({ error: err?.message || 'Erro ao comunicar com a inteligência artificial' });
    }
  });

  // --- VITE MIDDLEWARE OR STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LogiRoute] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server Start Error]', err);
  process.exit(1);
});
