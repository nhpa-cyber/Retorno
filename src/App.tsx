import React, { useState, useEffect, useRef } from 'react';
import { User, Driver, Vehicle, Product, ActiveAsset, AuditSession, ReturnForecast, FiscalAlert, ImportedRoute, Vale } from './types';
import { DEFAULT_PRODUCTS, DEFAULT_USERS } from './data';
import { ImageDB } from './imageDb';
import { isClientFirebaseActive, fetchDirectlyFromFirestore, saveDirectlyToFirestore, subscribeToFirestore, getClientAuthError, getIsFirestoreQuotaExceeded, setFirestoreQuotaExceeded, getActiveFirebaseConfig, switchActiveFirebaseConfig } from './clientFirebase';
import Header from './components/Header';
import ConferenteView from './components/ConferenteView';
import FiscalView from './components/FiscalView';
import GestorDashboard from './components/GestorDashboard';
import LoginView from './components/LoginView';
import MonitoramentoView from './components/MonitoramentoView';
import PlatformManual from './components/PlatformManual';
import AIAgentChat from './components/AIAgentChat';
import { DatabaseScheduleBanner } from './components/DatabaseScheduleBanner';
import { ClipboardCheck, ShieldCheck, BarChart3, AlertCircle, Bell, CheckCircle2, Settings, RefreshCw } from 'lucide-react';

export default function App() {
  const lastWriteTime = useRef<number>(0);
  const pendingUpdatesRef = useRef<any>({});
  const pushTimeoutRef = useRef<any>(null);
  const lastSyncAlertTime = useRef<number>(0);
  // Database states loaded from AppStore
  const [users, setUsers] = useState<User[]>(DEFAULT_USERS);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeAssets, setActiveAssets] = useState<ActiveAsset[]>([]);
  const [audits, setAudits] = useState<AuditSession[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [customManualHTML, setCustomManualHTML] = useState<string>('');

  // Forecasts and Notifications
  const [returnForecasts, setReturnForecasts] = useState<ReturnForecast[]>([]);
  const [fiscalAlerts, setFiscalAlerts] = useState<FiscalAlert[]>([]);
  const [importedRoutes, setImportedRoutes] = useState<ImportedRoute[]>([]);

  // Session & UI Navigation states
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedUserId = localStorage.getItem('logiroute_authenticated_user_id');
    return DEFAULT_USERS.find(u => u.id === savedUserId) || DEFAULT_USERS.find(u => u.role === 'gestor') || DEFAULT_USERS[0] || null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('logiroute_is_authenticated') === 'true';
  });
  const [activeTab, setActiveTab] = useState<string>('conferencias');

  // Quota & Permission status state
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(getIsFirestoreQuotaExceeded());
  const [clientPermissionDenied, setClientPermissionDenied] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setIsQuotaExceeded(true);
    const handleQuotaRestored = () => setIsQuotaExceeded(false);
    const handlePermissionDenied = () => setClientPermissionDenied(true);

    window.addEventListener('firestore_quota_exceeded', handleQuotaExceeded);
    window.addEventListener('firestore_quota_restored', handleQuotaRestored);
    window.addEventListener('client_firestore_permission_denied', handlePermissionDenied);
    
    return () => {
      window.removeEventListener('firestore_quota_exceeded', handleQuotaExceeded);
      window.removeEventListener('firestore_quota_restored', handleQuotaRestored);
      window.removeEventListener('client_firestore_permission_denied', handlePermissionDenied);
    };
  }, []);

  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('logiroute_theme');
    return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('logiroute_theme', theme);
  }, [theme]);

  // Warning & Reset States
  const [hasShownDeadlinePopup, setHasShownDeadlinePopup] = useState<boolean>(false);
  const [acknowledgedSent, setAcknowledgedSent] = useState<string[]>(() => {
    const saved = localStorage.getItem('logiroute_acknowledged_sent_audits');
    return saved ? JSON.parse(saved) : [];
  });

  const handleResetPlatformData = async (skipConfirmation: boolean = false) => {
    if (!currentUser || currentUser.role !== 'gestor') {
      alert("Acesso Negado: Apenas usuários com perfil Gestor possuem permissão para redefinir a base de dados da plataforma.");
      return;
    }

    if (!skipConfirmation) {
      const firstConfirm = window.confirm(
        "⚠️ ATENÇÃO: ZERAR BASE DE DADOS DA PLATAFORMA ⚠️\n\n" +
        "Esta ação irá apagar permanentemente todas as rotas importadas, conferências, previsões, alertas e vales de TODOS os dispositivos conectados ao mesmo Firestore.\n\n" +
        "Deseja realmente prosseguir com o reset?"
      );
      if (!firstConfirm) return;

      const secondConfirm = window.confirm(
        "❗ CONFIRMAÇÃO FINAL DE SEGURANÇA ❗\n\n" +
        "Confirma novamente a exclusão completa e irreversível dos dados da plataforma?"
      );
      if (!secondConfirm) return;
    }

    // Clear major functional arrays in state
    setImportedRoutes([]);
    setAudits([]);
    setReturnForecasts([]);
    setFiscalAlerts([]);
    setVales([]);

    // Clear IndexedDB photos
    try {
      await ImageDB.clearAllPhotos();
    } catch (e) {
      console.warn("Error clearing photos during platform reset:", e);
    }

    // Cancel pending throttled writes
    pendingUpdatesRef.current = {};
    if (pushTimeoutRef.current) {
      clearTimeout(pushTimeoutRef.current);
      pushTimeoutRef.current = null;
    }
    lastWriteTime.current = Date.now();

    const emptyPayload = {
      importedRoutes: [],
      audits: [],
      returnForecasts: [],
      fiscalAlerts: [],
      vales: [],
    };

    if (isClientFirebaseActive()) {
      await saveDirectlyToFirestore(emptyPayload);
    }

    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db: emptyPayload })
      });
    } catch (e) {
      console.warn("Reset server push error:", e);
    }

    // Broadcast reset event across browser tabs
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('logiroute_sync');
        channel.postMessage({ type: 'RESET_PLATFORM' });
        channel.close();
      } catch (e) {}
    }

    if (!skipConfirmation) {
      alert("Base de dados da plataforma redefinida com sucesso.");
    }
  };

  const handleSaveCustomManual = (html: string) => {
    setCustomManualHTML(html);
    pushDatabaseToServer({ customManual: html });
  };

  // Push changes to server database with batching/throttling to prevent concurrency race conditions
  const pushDatabaseToServer = (updates: {
    users?: User[];
    drivers?: Driver[];
    vehicles?: Vehicle[];
    products?: Product[];
    activeAssets?: ActiveAsset[];
    audits?: AuditSession[];
    returnForecasts?: ReturnForecast[];
    fiscalAlerts?: FiscalAlert[];
    importedRoutes?: ImportedRoute[];
    vales?: Vale[];
    customManual?: string;
  }) => {
    lastWriteTime.current = Date.now();
    
    // Accumulate the updates atomically
    pendingUpdatesRef.current = {
      ...pendingUpdatesRef.current,
      ...updates
    };

    // Clear previous timeout to debounce the server call
    if (pushTimeoutRef.current) {
      clearTimeout(pushTimeoutRef.current);
    }

    // Schedule single POST request after a short quiet period (300ms) to ensure fast persistence while bundling rapid keypresses
    pushTimeoutRef.current = setTimeout(async () => {
      const payload = { ...pendingUpdatesRef.current };
      pendingUpdatesRef.current = {}; // Clear accumulator
      pushTimeoutRef.current = null;

      // Extract only keys that have non-empty or updated content
      const payloadKeys = Object.keys(payload);
      if (payloadKeys.length > 0) {
        let success = false;
        
        const saveToServer = async (pld: any) => {
          let attempts = 3;
          let delay = 300;
          let srvSuccess = false;
          
          for (let i = 0; i < attempts; i++) {
            try {
              const res = await fetch('/api/db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  db: pld,
                  user: currentUser ? { id: currentUser.id, name: currentUser.name, role: currentUser.role } : null
                }),
              });
              if (res.ok) {
                srvSuccess = true;
                break;
              }
            } catch (err) {
              console.warn(`Tentativa ${i + 1} de salvar banco de dados falhou:`, err);
            }
            if (i < attempts - 1) {
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2;
            }
          }
          return srvSuccess;
        };

        if (isClientFirebaseActive()) {
          let fsSuccess = false;
          try {
            fsSuccess = await saveDirectlyToFirestore(payload);
          } catch (err) {
            console.warn('[ClientFirebase] Erro ao sincronizar diretamente com o Firestore:', err);
          }

          let srvSuccess = false;
          try {
            srvSuccess = await saveToServer(payload);
          } catch (err) {
            // Expected fallback on static hosts like GitHub Pages
          }

          success = fsSuccess || srvSuccess;
        } else {
          success = await saveToServer(payload);
        }

        if (!success) {
          console.error('Failed to push batched database updates to server after all attempts.');
          // Return payload to the pendingUpdatesRef so they are retried or merged in the next write
          pendingUpdatesRef.current = {
            ...payload,
            ...pendingUpdatesRef.current
          };
          
          // Throttle the intrusive sync warning to maximum once per 60 seconds to avoid spamming the user during flaky network
          if (Date.now() - lastSyncAlertTime.current > 60000) {
            lastSyncAlertTime.current = Date.now();
            console.warn("[AppSync] Falha ao sincronizar alterações com o servidor. Re-agendando no background...");
          }
        }
      }
    }, 300);
  };

  // Helper to repair missing or broken product descriptions
  const repairProductsList = (list: Product[]) => {
    if (!list) return [];
    return list.map(p => {
      if (p.description === p.code || !p.description || p.description.trim() === '') {
        const original = DEFAULT_PRODUCTS.find(dp => dp.code === p.code);
        if (original) {
          return { ...p, description: original.description };
        }
      }
      return p;
    });
  };

  // Normalization helper for Map Codes (strips leading zeros)
  const normalizeMapCode = (mapCode: any): string => {
    if (mapCode === undefined || mapCode === null) return '';
    return String(mapCode).trim().replace(/^0+/, '');
  };

  const cleanAudits = (list: AuditSession[]): AuditSession[] => {
    if (!list) return [];
    return list.filter(Boolean).map(a => ({
      ...a,
      routeMap: normalizeMapCode(a.routeMap),
      unifiedMaps: a.unifiedMaps ? a.unifiedMaps.map(normalizeMapCode) : undefined,
    }));
  };

  const cleanImportedRoutes = (list: ImportedRoute[]): ImportedRoute[] => {
    if (!list) return [];
    const now = new Date().toISOString();
    return list.filter(Boolean).map(r => ({
      ...r,
      routeMap: normalizeMapCode(r.routeMap),
      importedAt: r.importedAt || now,
      updatedAt: r.updatedAt || r.importedAt || now
    }));
  };

  const cleanVales = (list: Vale[]): Vale[] => {
    if (!list) return [];
    return list.map(v => ({
      ...v,
      routeMap: v.routeMap ? normalizeMapCode(v.routeMap) : undefined
    }));
  };

  const cleanReturnForecasts = (list: ReturnForecast[]): ReturnForecast[] => {
    if (!list) return [];
    return list.map(f => ({
      ...f,
      routeMap: normalizeMapCode(f.routeMap)
    }));
  };

  const getRouteStatusRank = (status?: string): number => {
    switch (status) {
      case 'fechado': return 4;
      case 'em_analise':
      case 'reconferir': return 3;
      case 'conferindo': return 2;
      case 'pendente':
      default: return 1;
    }
  };

  const getAuditStatusRank = (status?: string): number => {
    switch (status) {
      case 'finalizado_ok':
      case 'finalizado_divergente': return 4;
      case 'recontagem_finalizada':
      case 'sobra_alinhada':
      case 'conferido_fisico': return 3;
      case 'conferindo':
      case 'recontagem_solicitada': return 2;
      case 'pendente':
      default: return 1;
    }
  };

  const applyDirectDb = (db: any) => {
    if (!db) return;

    // Protection: If a local write was performed in the last 1.5 seconds, defer remote override to protect local user inputs/imports
    if (Date.now() - lastWriteTime.current < 1500) {
      console.log("[AppSync] Ignorando atualização remota temporariamente para proteger escrita local recente.");
      return;
    }

    if (db.users !== undefined && Array.isArray(db.users)) {
      const activeUsers = db.users.length > 0 ? db.users : DEFAULT_USERS;
      setUsers(activeUsers);
      const savedUserId = localStorage.getItem('logiroute_authenticated_user_id');
      let matchedUser = activeUsers.find((u: User) => u.id === savedUserId);
      if (!matchedUser) {
        matchedUser = activeUsers.find((u: User) => u.role === 'gestor') || activeUsers[0];
      }
      if (matchedUser) {
        setCurrentUser(matchedUser);
        localStorage.setItem('logiroute_authenticated_user_id', matchedUser.id);
      }
    }

    if (db.drivers !== undefined && Array.isArray(db.drivers)) {
      setDrivers(db.drivers);
    }

    if (db.vehicles !== undefined && Array.isArray(db.vehicles)) {
      setVehicles(db.vehicles);
    }

    if (db.products !== undefined && Array.isArray(db.products)) {
      const repaired = repairProductsList(db.products);
      setProducts(repaired);
    }

    if (db.activeAssets !== undefined && Array.isArray(db.activeAssets)) {
      setActiveAssets(db.activeAssets);
    }

    if (db.audits !== undefined && Array.isArray(db.audits)) {
      const cleaned = cleanAudits(db.audits);
      setAudits(cleaned);
    }

    if (db.vales !== undefined && Array.isArray(db.vales)) {
      const cleaned = cleanVales(db.vales);
      setVales(cleaned);
    }

    if (db.returnForecasts !== undefined && Array.isArray(db.returnForecasts)) {
      const cleaned = cleanReturnForecasts(db.returnForecasts);
      setReturnForecasts(cleaned);
    }

    if (db.fiscalAlerts !== undefined && Array.isArray(db.fiscalAlerts)) {
      setFiscalAlerts(db.fiscalAlerts);
    }

    // Smart Merge Imported Routes
    if (db.importedRoutes !== undefined) {
      const remoteCleaned = cleanImportedRoutes(db.importedRoutes);
      setImportedRoutes(remoteCleaned);
    }

    if (db.audit_logs || db.auditLogs) {
      const logs = db.audit_logs || db.auditLogs;
      setAuditLogs(logs);
    }

    if (db.customManual !== undefined) {
      const manualContent = typeof db.customManual === 'string' ? db.customManual : db.customManual?.html || '';
      setCustomManualHTML(manualContent);
    }
  };

  // Immediate flush of pending database updates on page reload / unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pushTimeoutRef.current) {
        clearTimeout(pushTimeoutRef.current);
        pushTimeoutRef.current = null;
      }
      const payload = { ...pendingUpdatesRef.current };
      if (Object.keys(payload).length > 0) {
        pendingUpdatesRef.current = {};
        if (isClientFirebaseActive()) {
          saveDirectlyToFirestore(payload);
        } else {
          try {
            fetch('/api/db', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ db: payload }),
              keepalive: true
            }).catch(() => {});
          } catch (e) {
            // ignore unload fetch error
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Establish direct Firestore / server synchronization on mount
  useEffect(() => {
    // 1. Check persistent user ID if authenticated
    const savedUserId = localStorage.getItem('logiroute_authenticated_user_id');
    const defaultUser = users.find(u => u.id === savedUserId) || users.find(u => u.id === 'usr_1') || users[0];
    if (defaultUser) {
      setCurrentUser(defaultUser);
    }

    // 2. Fetch latest online database from server (fallback when Firestore is not active)
    const fetchLatestServerData = async () => {
      if (isClientFirebaseActive()) {
        // Quando o Firestore está ativo, o listener em tempo real (subscribeToFirestore)
        // já entrega o primeiro snapshot como carga inicial, evitando leituras duplicadas.
        return;
      }
      try {
        const res = await fetch('/api/db');
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
            console.warn("Expected JSON response from server, but received:", contentType);
            return;
          }
          const data = await res.json();
          if (data.success && data.db) {
            applyDirectDb(data.db);
          } else {
            console.log("Banco de dados do servidor está em branco ou indisponível. Ignorando auto-sobreposição para segurança.");
          }
        }
      } catch (err) {
        console.warn('Error fetching server database:', err);
      }
    };

    fetchLatestServerData();
  }, []);

     // 4a. Setup real-time database updates via Firestore Live Sync if active
  useEffect(() => {
    if (!clientPermissionDenied && isClientFirebaseActive()) {
      console.log("[ClientFirebase] Inicializando sincronização em tempo real nativa com Firestore...");
      const unsubscribe = subscribeToFirestore((db) => {
        // Skip applying updates if there was a recent local write on this client to avoid race conditions
        if (Date.now() - lastWriteTime.current < 1500) {
          return;
        }
        applyDirectDb(db);
      });
      return () => {
        console.log("[ClientFirebase] Cancelando inscrição em tempo real com Firestore...");
        unsubscribe();
      };
    }
  }, [clientPermissionDenied]);

  // 4b. Setup global server events (DB switch countdowns, config changes, schedule rules) via SSE
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectSSE = () => {
      console.log("Conectando ao canal de sincronização de eventos do servidor (SSE)...");
      eventSource = new EventSource('/api/db/events');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data) {
            // Handle pending DB switch broadcast
            if (data.pendingDbSwitch !== undefined) {
              window.dispatchEvent(new CustomEvent('server_pending_switch_updated', { detail: data.pendingDbSwitch }));
            }

            // Handle config update broadcast across all connected devices
            if (data.config && data.config.projectId) {
              window.dispatchEvent(new CustomEvent('server_config_updated', { detail: data.config }));
              const currentLocalConfig = getActiveFirebaseConfig();
              if (currentLocalConfig?.projectId !== data.config.projectId) {
                console.log(`[SSE] Servidor informou troca de banco para ${data.config.projectId}. Atualizando localmente...`);
                switchActiveFirebaseConfig(data.config).then(() => {
                  window.location.reload();
                });
              }
            }

            // Handle custom schedule rules broadcast
            if (data.scheduleRules) {
              window.dispatchEvent(new CustomEvent('server_schedule_rules_updated', { detail: data.scheduleRules }));
            }

            // Only apply direct JSON DB updates from SSE if client Firebase is NOT active
            if (data.db && (!isClientFirebaseActive() || clientPermissionDenied)) {
              const db = data.db;
              
              if (db.photos) {
                ImageDB.syncPhotos(db.photos).catch(e => console.error("Error syncing photos from SSE:", e));
              }

              // Skip applying updates if there was a recent local write on this client to avoid race conditions
              if (Date.now() - lastWriteTime.current < 1500) {
                return;
              }

              applyDirectDb(db);
            }
          }
        } catch (err) {
          console.error("Error parsing real-time database event:", err);
        }
      };

      eventSource.onerror = (err) => {
        console.log("Canal de sincronização SSE em modo de espera ou reconectando. Tentando reconexão automática em 3s...");
        if (eventSource) {
          eventSource.close();
        }
        reconnectTimeout = setTimeout(() => {
          connectSSE();
        }, 3000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [clientPermissionDenied]);

  // Real-time synchronization across tabs of the SAME browser
  useEffect(() => {
    const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
      ? new BroadcastChannel('logiroute_realtime_sync')
      : null;

    const reloadServerState = async () => {
      if (isClientFirebaseActive()) {
        const directDb = await fetchDirectlyFromFirestore();
        if (directDb) applyDirectDb(directDb);
      } else {
        try {
          const res = await fetch('/api/db');
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.db) applyDirectDb(data.db);
          }
        } catch (e) {}
      }
    };

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'RESET_PLATFORM') {
          reloadServerState();
        }
      };
    }

    return () => {
      if (channel) channel.close();
    };
  }, []);

  // Disabled auto-generation of delay alerts to keep database alerts pristine
  /*
  useEffect(() => {
    ...
  }, [importedRoutes, fiscalAlerts]);
  */

  // Sync state changes back to AppStore (localStorage) and Server
  const handleSaveUsers = (newUsers: User[]) => {
    setUsers(newUsers);
    pushDatabaseToServer({ users: newUsers });
  };

  const handleSaveDrivers = (newDrivers: Driver[]) => {
    setDrivers(newDrivers);
    pushDatabaseToServer({ drivers: newDrivers });
  };

  const handleSaveVehicles = (newVehicles: Vehicle[]) => {
    setVehicles(newVehicles);
    pushDatabaseToServer({ vehicles: newVehicles });
  };

  const handleSaveProducts = (newProducts: Product[]) => {
    setProducts(newProducts);
    pushDatabaseToServer({ products: newProducts });
  };

  const handleSaveAudits = (newAudits: AuditSession[]) => {
    const timestamp = new Date().toISOString();
    const updatedAudits = newAudits.map(newAudit => {
      const oldAudit = audits.find(a => a.id === newAudit.id);
      const oldFunctional = oldAudit ? { ...oldAudit, updatedAt: undefined, lastUpdatedBy: undefined } : null;
      const newFunctional = { ...newAudit, updatedAt: undefined, lastUpdatedBy: undefined };
      if (!oldFunctional || JSON.stringify(oldFunctional) !== JSON.stringify(newFunctional)) {
        return {
          ...newAudit,
          updatedAt: timestamp,
          lastUpdatedBy: currentUser?.name || 'Sistema'
        };
      }
      return newAudit;
    });

    const cleaned = cleanAudits(updatedAudits);
    setAudits(cleaned);
    pushDatabaseToServer({ audits: cleaned });
  };

  const handleSaveForecasts = (newForecasts: ReturnForecast[]) => {
    const cleaned = cleanReturnForecasts(newForecasts);
    setReturnForecasts(cleaned);
    pushDatabaseToServer({ returnForecasts: cleaned });
  };

  const handleSaveAlerts = (newAlerts: FiscalAlert[]) => {
    setFiscalAlerts(newAlerts);
    pushDatabaseToServer({ fiscalAlerts: newAlerts });
  };

  const handleSaveImportedRoutes = (newRoutes: ImportedRoute[]) => {
    const timestamp = new Date().toISOString();
    const updatedRoutes = newRoutes.map(newRoute => {
      const newMapKey = normalizeMapCode(newRoute.routeMap).toUpperCase();
      const newDate = newRoute.routeDate || '';
      const oldRoute = importedRoutes.find(r => 
        normalizeMapCode(r.routeMap).toUpperCase() === newMapKey &&
        (r.routeDate || '') === newDate
      );
      const oldFunctional = oldRoute ? { ...oldRoute, updatedAt: undefined } : null;
      const newFunctional = { ...newRoute, updatedAt: undefined };
      if (!oldFunctional || JSON.stringify(oldFunctional) !== JSON.stringify(newFunctional)) {
        return {
          ...newRoute,
          updatedAt: timestamp
        };
      }
      return newRoute;
    });

    const cleaned = cleanImportedRoutes(updatedRoutes);
    setImportedRoutes(cleaned);
    pushDatabaseToServer({ importedRoutes: cleaned });
  };

  const handleSaveVales = (newVales: Vale[]) => {
    const cleaned = cleanVales(newVales);
    setVales(cleaned);
    pushDatabaseToServer({ vales: cleaned });
  };

  // Switch tabs when current user role changes
  const handleUserChange = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('logiroute_authenticated_user_id', user.id);
    if (user.role === 'conferente') {
      setActiveTab('conferencias');
    } else if (user.role === 'auxiliar_logistica' || user.role === 'financeiro') {
      setActiveTab('reconciliacao');
    } else if (user.role === 'gestor') {
      setActiveTab('dashboard');
    } else if (user.role === 'monitoramento') {
      setActiveTab('monitoramento_view');
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('logiroute_is_authenticated', 'true');
    localStorage.setItem('logiroute_authenticated_user_id', user.id);

    // Route active tabs based on permission roles
    if (user.role === 'conferente') {
      setActiveTab('conferencias');
    } else if (user.role === 'auxiliar_logistica' || user.role === 'financeiro') {
      setActiveTab('reconciliacao');
    } else if (user.role === 'gestor') {
      setActiveTab('dashboard');
    } else if (user.role === 'monitoramento') {
      setActiveTab('monitoramento_view');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('logiroute_is_authenticated');
    localStorage.removeItem('logiroute_authenticated_user_id');
  };

  // Render branded Login View if not authenticated
  if (!isAuthenticated) {
    return <LoginView users={users} onLoginSuccess={handleLoginSuccess} />;
  }

  if (!currentUser) {
    const availableUsers = users.length > 0 ? users : DEFAULT_USERS;
    const savedUserId = localStorage.getItem('logiroute_authenticated_user_id');
    const fallbackUser = availableUsers.find(u => u.id === savedUserId) 
      || availableUsers.find(u => u.role === 'gestor') 
      || availableUsers[0];

    if (fallbackUser) {
      setTimeout(() => setCurrentUser(fallbackUser), 0);
    }

    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-white text-center">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-semibold text-lg">Carregando plataforma de retornos...</p>
        </div>
      </div>
    );
  }

  // Tomorrow's date string
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  })();

  // Filter audits for deadlines
  const pendingDeadlines = audits.filter(audit => {
    if (audit.surplusFlowStatus === 'ENVIADO') return false;
    if (!audit.deliveryDate || audit.deliveryDate !== tomorrowStr) return false;
    
    const hasSurplus = audit.items.some(i => {
      const phys = i.rePhysicalQty !== undefined ? i.rePhysicalQty : i.physicalQty;
      return phys > (i.fiscalQty ?? 0);
    }) || audit.assets.some(a => {
      const phys = a.rePhysicalQty !== undefined ? a.rePhysicalQty : a.physicalQty;
      return phys > (a.fiscalQty ?? 0);
    });
    
    return hasSurplus;
  });

  const showDeadlineModal = currentUser && (currentUser.role === 'gestor' || currentUser.role === 'auxiliar_logistica') && pendingDeadlines.length > 0 && !hasShownDeadlinePopup;

  // Sent audits to notify monitoramento
  const sentAuditsToNotify = currentUser && currentUser.role === 'monitoramento'
    ? audits.filter(audit => {
        if (audit.surplusFlowStatus !== 'ENVIADO') return false;
        
        const hasSurplus = audit.items.some(i => {
          const phys = i.rePhysicalQty !== undefined ? i.rePhysicalQty : i.physicalQty;
          return phys > (i.fiscalQty ?? 0);
        }) || audit.assets.some(a => {
          const phys = a.rePhysicalQty !== undefined ? a.rePhysicalQty : a.physicalQty;
          return phys > (a.fiscalQty ?? 0);
        });
        
        return hasSurplus && !acknowledgedSent.includes(audit.id);
      })
    : [];

  const downloadSobrasCSV = (auditsToDownload: AuditSession[]) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Mapa;Placa;Motorista;Codigo NB;Data de Entrega;Produto/Ativo;Quantidade Sobra\n";
    
    auditsToDownload.forEach(audit => {
      const driver = drivers.find(d => d.id === audit.driverId)?.name || 'Desconhecido';
      
      const surpluses = [
        ...audit.items.filter(i => (i.rePhysicalQty !== undefined ? i.rePhysicalQty : i.physicalQty) > (i.fiscalQty ?? 0)).map(i => ({
          description: i.productDescription,
          qty: (i.rePhysicalQty !== undefined ? i.rePhysicalQty : i.physicalQty) - (i.fiscalQty ?? 0)
        })),
        ...audit.assets.filter(a => (a.rePhysicalQty !== undefined ? a.rePhysicalQty : a.physicalQty) > (a.fiscalQty ?? 0)).map(a => ({
          description: a.assetName,
          qty: (a.rePhysicalQty !== undefined ? a.rePhysicalQty : a.physicalQty) - (a.fiscalQty ?? 0)
        }))
      ];
      
      surpluses.forEach(s => {
        csvContent += `"${audit.routeMap}";"${audit.plate}";"${driver}";"${audit.clientCodeNB || ''}";"${audit.deliveryDate || ''}";"${s.description}";"${s.qty}"\n`;
      });
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sobras_prazo_amanha_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800" id="main_app_wrapper">
      
      {/* Shared Navigation Header with Profile Switcher */}
      <Header
        currentUser={currentUser}
        users={users}
        onUserChange={handleUserChange}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={handleLogout}
        fiscalAlerts={fiscalAlerts}
        onSaveAlerts={handleSaveAlerts}
        theme={theme}
        onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      />

      {/* Database Schedule Countdown Warning Banner */}
      <DatabaseScheduleBanner currentUser={currentUser} />

      {/* Quota Exceeded Warning Banner */}
      {isQuotaExceeded && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-800 dark:text-amber-200 py-3.5 px-4" id="firestore_quota_warning_banner">
          <div className="w-full px-2 sm:px-6 lg:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-sm">Cota Diária Gratuita do Firebase Excedida</span>
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  O limite diário gratuito do Firestore foi atingido. Ativamos o <strong>Modo de Sincronização Segura via Servidor Local</strong> para garantir que você continue trabalhando normalmente sem perder nenhum dado. As atualizações e fotos estão sendo salvas localmente no servidor e serão sincronizadas quando a cota reiniciar (amanhã).
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                onClick={() => {
                  console.log("[App] Forçando re-tentativa de conexão direta com o Firebase...");
                  setFirestoreQuotaExceeded(false);
                  // Refreshing window triggers reconnection instantly
                  window.location.reload();
                }}
                className="bg-white/10 hover:bg-white/20 dark:bg-white/5 dark:hover:bg-white/10 text-amber-900 dark:text-amber-100 text-xs font-semibold py-1.5 px-3 rounded-md border border-amber-500/20 transition-all flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Tentar Sincronizar
              </button>
              <a 
                href="https://console.firebase.google.com/project/scenic-year-l5xj8/firestore/databases/ai-studio-remixremixremixr-d6b6b17f-3b26-4b81-839e-531e01666411/data?openUpgradeDialog=true"
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold py-1.5 px-3 rounded-md shadow-xs transition-colors whitespace-nowrap inline-flex items-center gap-1 cursor-pointer"
              >
                <Settings className="h-3.5 w-3.5" />
                Upgrade no Firebase Console
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Workspace Routing based on Profile & Tab */}
      <main className="flex-grow">
        
        {/* VIEW 1: CONFERENTE (PHYSICAL AUDITOR) */}
        {(currentUser.role === 'conferente' || currentUser.role === 'gestor') && activeTab === 'conferencias' && (
          <ConferenteView
            currentUser={currentUser}
            drivers={drivers}
            vehicles={vehicles}
            products={products}
            activeAssets={activeAssets}
            audits={audits}
            onSaveAudits={handleSaveAudits}
            onSaveDrivers={handleSaveDrivers}
            onSaveVehicles={handleSaveVehicles}
            returnForecasts={returnForecasts}
            onSaveForecasts={handleSaveForecasts}
            fiscalAlerts={fiscalAlerts}
            onSaveAlerts={handleSaveAlerts}
            importedRoutes={importedRoutes}
            onSaveImportedRoutes={handleSaveImportedRoutes}
          />
        )}

        {/* VIEW 2: AUXILIAR DE LOGÍSTICA & FINANCEIRO (FISCAL WORKSPACE & HISTORY) */}
        {(currentUser.role === 'auxiliar_logistica' || currentUser.role === 'financeiro' || currentUser.role === 'gestor') && (activeTab === 'reconciliacao' || activeTab === 'historico' || activeTab === 'divergencias' || activeTab === 'mapas_importados' || activeTab === 'sincronizador' || activeTab === 'vales_view') && (
          <FiscalView
            currentUser={currentUser}
            drivers={drivers}
            onSaveDrivers={handleSaveDrivers}
            vehicles={vehicles}
            products={products}
            onSaveProducts={handleSaveProducts}
            activeAssets={activeAssets}
            audits={audits}
            onSaveAudits={handleSaveAudits}
            fiscalAlerts={fiscalAlerts}
            onSaveAlerts={handleSaveAlerts}
            importedRoutes={importedRoutes}
            onSaveImportedRoutes={handleSaveImportedRoutes}
            vales={vales}
            onSaveVales={handleSaveVales}
            activeTab={activeTab}
            onResetPlatformData={handleResetPlatformData}
            returnForecasts={returnForecasts}
            onSaveForecasts={handleSaveForecasts}
          />
        )}

        {/* VIEW 4: MONITORAMENTO SPECIFIC ROUTING */}
        {(currentUser.role === 'monitoramento' || currentUser.role === 'gestor' || currentUser.role === 'financeiro' || currentUser.role === 'auxiliar_logistica') && activeTab === 'monitoramento_view' && (
          <MonitoramentoView
            currentUser={currentUser}
            importedRoutes={importedRoutes}
            onSaveImportedRoutes={handleSaveImportedRoutes}
            returnForecasts={returnForecasts}
            onSaveForecasts={handleSaveForecasts}
            drivers={drivers}
            onSaveDrivers={handleSaveDrivers}
            vehicles={vehicles}
            audits={audits}
            onSaveAudits={handleSaveAudits}
          />
        )}
        {currentUser.role === 'monitoramento' && (activeTab === 'historico' || activeTab === 'divergencias') && (
          <FiscalView
            currentUser={currentUser}
            drivers={drivers}
            onSaveDrivers={handleSaveDrivers}
            vehicles={vehicles}
            products={products}
            onSaveProducts={handleSaveProducts}
            activeAssets={activeAssets}
            audits={audits}
            onSaveAudits={handleSaveAudits}
            fiscalAlerts={fiscalAlerts}
            onSaveAlerts={handleSaveAlerts}
            importedRoutes={importedRoutes}
            onSaveImportedRoutes={handleSaveImportedRoutes}
            vales={vales}
            onSaveVales={handleSaveVales}
            activeTab={activeTab}
            onResetPlatformData={handleResetPlatformData}
            returnForecasts={returnForecasts}
            onSaveForecasts={handleSaveForecasts}
          />
        )}

        {/* VIEW 3: GESTOR & AUXILIAR DE LOGÍSTICA & FINANCEIRO (CADASTROS ACCESS) */}
        {(currentUser.role === 'gestor' || currentUser.role === 'auxiliar_logistica' || currentUser.role === 'financeiro') && (
          <>
            {currentUser.role === 'gestor' && activeTab === 'dashboard' && (
              <GestorDashboard
                currentUser={currentUser}
                drivers={drivers}
                vehicles={vehicles}
                products={products}
                activeAssets={activeAssets}
                audits={audits}
                users={users}
                onSaveUsers={handleSaveUsers}
                onSaveDrivers={handleSaveDrivers}
                onSaveVehicles={handleSaveVehicles}
                onSaveProducts={handleSaveProducts}
                onSaveAudits={handleSaveAudits}
                importedRoutes={importedRoutes}
                onSaveImportedRoutes={handleSaveImportedRoutes}
                vales={vales}
                onSaveVales={handleSaveVales}
                forceTab="dashboard"
                auditLogs={auditLogs}
                customManualHTML={customManualHTML}
                onSaveCustomManual={handleSaveCustomManual}
                onResetPlatformData={handleResetPlatformData}
              />
            )}

            {activeTab === 'cadastros' && (
              <GestorDashboard
                currentUser={currentUser}
                drivers={drivers}
                vehicles={vehicles}
                products={products}
                activeAssets={activeAssets}
                audits={audits}
                users={users}
                onSaveUsers={handleSaveUsers}
                onSaveDrivers={handleSaveDrivers}
                onSaveVehicles={handleSaveVehicles}
                onSaveProducts={handleSaveProducts}
                onSaveAudits={handleSaveAudits}
                importedRoutes={importedRoutes}
                onSaveImportedRoutes={handleSaveImportedRoutes}
                vales={vales}
                onSaveVales={handleSaveVales}
                forceTab="cadastros"
                auditLogs={auditLogs}
                customManualHTML={customManualHTML}
                onSaveCustomManual={handleSaveCustomManual}
                onResetPlatformData={handleResetPlatformData}
              />
            )}
          </>
        )}
      </main>

      {/* Manual de uso da plataforma com exportação para PDF */}
      {isAuthenticated && currentUser && <PlatformManual customManualHTML={customManualHTML} />}

      {/* Sticky footer indicating production-ready definitive system */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xxs text-slate-400 font-medium font-sans">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>RETORNO DE ROTA PAU BRASIL GUARABIRA © 2026 • Sistema de Monitoramento e Máxima Eficiência de Retornos de Rota</span>
          <div className="flex items-center space-x-2">
            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 uppercase font-extrabold font-mono flex items-center gap-1">
              <span className="h-1.5 w-1.5 bg-emerald-600 rounded-full animate-ping"></span>
              Modelo Definitivo Ativo
            </span>
            <span className="text-slate-500 font-medium">Ambiente Operacional Homologado Pau Brasil Distribuidora</span>
          </div>
        </div>
      </footer>

      {/* Agente de I.A flutuante para tirar dúvidas dos usuários */}
      {isAuthenticated && currentUser && (
        <AIAgentChat 
          importedRoutes={importedRoutes}
          audits={audits}
          vales={vales}
          drivers={drivers}
        />
      )}

      {/* MODAL 1: Sobra Deadline Warning for Gestor / Auxiliar Logística */}
      {showDeadlineModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3 text-amber-500">
              <div className="bg-amber-100 p-2.5 rounded-full">
                <AlertCircle className="h-6 w-6 text-amber-600 animate-pulse" />
              </div>
              <div>
                <h3 className="font-sans font-black text-slate-900 uppercase text-sm">Prazo de Entrega Amanhã!</h3>
                <span className="text-[10px] text-slate-400 font-semibold font-mono">Alerta de Sobra de Rota</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Identificamos <strong>{pendingDeadlines.length}</strong> mapa(s) de sobras cujas datas de entrega se encerram amanhã (<strong>{new Date(tomorrowStr + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>). Por favor, realize a baixa no sistema para evitar desvios fora do prazo.
            </p>

            <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 border border-slate-100 max-h-36 overflow-y-auto">
              {pendingDeadlines.map(d => (
                <div key={d.id} className="flex justify-between items-center text-xxs font-mono text-slate-500 border-b border-slate-100 pb-1 last:border-none last:pb-0">
                  <span>Mapa: <strong>{d.routeMap}</strong> ({d.plate})</span>
                  <span>NB: {d.clientCodeNB || 'Não informado'}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  downloadSobrasCSV(pendingDeadlines);
                  setHasShownDeadlinePopup(true);
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xxs py-2.5 px-3 rounded-lg transition uppercase text-center cursor-pointer shadow-sm flex items-center justify-center space-x-1"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Baixar do Sistema</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('divergencias');
                  setHasShownDeadlinePopup(true);
                }}
                className="flex-1 bg-slate-900 hover:bg-slate-850 text-white font-bold text-xxs py-2.5 px-3 rounded-lg transition uppercase text-center cursor-pointer shadow-sm"
              >
                Ver no Painel
              </button>
              <button
                type="button"
                onClick={() => setHasShownDeadlinePopup(true)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xxs py-2.5 px-3 rounded-lg transition uppercase text-center cursor-pointer"
              >
                Ignorar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Sobra Sent Notice for Monitoramento */}
      {sentAuditsToNotify.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center space-x-3 text-emerald-500">
              <div className="bg-emerald-100 p-2.5 rounded-full">
                <Bell className="h-6 w-6 text-emerald-600 animate-bounce" />
              </div>
              <div>
                <h3 className="font-sans font-black text-slate-900 uppercase text-sm">Item de Sobra Enviado!</h3>
                <span className="text-[10px] text-slate-400 font-semibold font-mono">Notificação de Monitoramento</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              O item de sobra referente ao mapa <strong>{sentAuditsToNotify[0].routeMap}</strong> (Placa: <strong>{sentAuditsToNotify[0].plate}</strong>) foi enviado com sucesso para o cliente! O status do fluxo de sobras agora é oficialmente <strong>ENVIADO (Baixado)</strong>.
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  const currentId = sentAuditsToNotify[0].id;
                  const updated = [...acknowledgedSent, currentId];
                  setAcknowledgedSent(updated);
                  localStorage.setItem('logiroute_acknowledged_sent_audits', JSON.stringify(updated));
                }}
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xxs py-2.5 px-6 rounded-lg transition uppercase cursor-pointer shadow-sm"
              >
                Confirmar Ciente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
