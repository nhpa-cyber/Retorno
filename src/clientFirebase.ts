import { initializeApp, getApps, getApp, deleteApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, collection, onSnapshot, terminate, setLogLevel, writeBatch } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
import { DEFAULT_USERS, DEFAULT_DRIVERS, DEFAULT_VEHICLES, DEFAULT_PRODUCTS, DEFAULT_ACTIVE_ASSETS } from "./data";
import { FIREBASE_PRESETS } from "./firebasePresets";

// Silence verbose or harmless Firestore warnings/info logs in browser
try {
  setLogLevel("silent");
} catch (e) {
  // ignore
}

// Collection mapping
const COLLECTION_MAP: Record<string, string> = {
  users: "users",
  drivers: "drivers",
  vehicles: "vehicles",
  products: "products",
  activeAssets: "activeAssets",
  audits: "audits",
  vales: "vales",
  returnForecasts: "returnForecasts",
  fiscalAlerts: "fiscalAlerts",
  importedRoutes: "importedRoutes",
  audit_logs: "auditLogs",
  auditLogs: "auditLogs",
  customManual: "customManual"
};

const TRACKED_COLLECTIONS = [
  "users",
  "drivers",
  "vehicles",
  "products",
  "activeAssets",
  "audits",
  "vales",
  "returnForecasts",
  "fiscalAlerts",
  "importedRoutes",
  "auditLogs",
  "customManual",
  "photos"
];

/**
 * Requirement 1: Unique and stable document ID per collection
 * importedRoutes MUST use routeMap + routeDate combined (e.g., 03.11.49.02_2026-07-22)
 * so new and old routes with the same map number never collide.
 */
export function getDocIdForCollection(colName: string, item: any): string {
  if (!item) return `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const mappedCol = COLLECTION_MAP[colName] || colName;

  if (mappedCol === "importedRoutes") {
    const mapStr = item.routeMap ? String(item.routeMap).trim() : "";
    const dateStr = item.routeDate ? String(item.routeDate).trim() : "";
    if (mapStr && dateStr) {
      return `${mapStr}_${dateStr}`;
    }
    if (mapStr) {
      return mapStr;
    }
  }

  if (mappedCol === "users") {
    if (item.id) return String(item.id).trim();
    if (item.username) return String(item.username).trim();
  }

  if (
    mappedCol === "drivers" ||
    mappedCol === "activeAssets" ||
    mappedCol === "audits" ||
    mappedCol === "vales" ||
    mappedCol === "returnForecasts" ||
    mappedCol === "fiscalAlerts" ||
    mappedCol === "auditLogs"
  ) {
    if (item.id) return String(item.id).trim();
  }

  if (mappedCol === "vehicles") {
    if (item.id) return String(item.id).trim();
    if (item.plate) return String(item.plate).trim();
  }

  if (mappedCol === "products") {
    if (item.code) return String(item.code).trim();
    if (item.id) return String(item.id).trim();
  }

  if (item.id) return String(item.id).trim();
  if (item.code) return String(item.code).trim();
  if (item.plate) return String(item.plate).trim();
  if (item.username) return String(item.username).trim();
  if (item.routeMap) {
    const mapStr = String(item.routeMap).trim();
    const dateStr = item.routeDate ? String(item.routeDate).trim() : "";
    return dateStr ? `${mapStr}_${dateStr}` : mapStr;
  }

  return `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export function getItemDocId(item: any): string {
  return getDocIdForCollection("generic", item);
}

let firestoreInstance: any = null;
let isAuthenticating = false;
let isAuthenticated = false;
let clientAuthError: string | null = null;
let lastAuthAttemptTime = 0;
const AUTH_COOLDOWN_MS = 25000;
let lastSuccessfulSyncTime = 0;

export function getLastSuccessfulSyncTime(): number {
  return lastSuccessfulSyncTime;
}

let isFirestoreQuotaExceeded = false;
let hasClientPermissionError = false;

export function isPermissionError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.code || err).toLowerCase();
  return (
    err.code === "permission-denied" ||
    msg.includes("missing or insufficient permissions") ||
    msg.includes("permission-denied") ||
    msg.includes("insufficient permissions")
  );
}

export function checkPermissionError(err: any) {
  if (err && isPermissionError(err)) {
    if (!hasClientPermissionError) {
      console.warn("[ClientFirebase] Permissões insuficientes no cliente Firestore.");
      hasClientPermissionError = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event('client_firestore_permission_denied'));
      }
    }
  }
}

export function getIsFirestoreQuotaExceeded(): boolean {
  return isFirestoreQuotaExceeded;
}

export function setFirestoreQuotaExceeded(val: boolean) {
  isFirestoreQuotaExceeded = val;
  if (val) {
    if (typeof window !== 'undefined') {
      if (firestoreInstance) {
        try {
          terminate(firestoreInstance).catch(() => {});
        } catch (e) {}
        firestoreInstance = null;
      }
      window.dispatchEvent(new Event('firestore_quota_exceeded'));
    }
  } else {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('firestore_quota_restored'));
    }
  }
}

export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.code || err).toLowerCase();
  return (
    err.code === "resource-exhausted" ||
    msg.includes("quota exceeded") ||
    msg.includes("quota-exceeded") ||
    msg.includes("resource-exhausted") ||
    msg.includes("quota limit exceeded")
  );
}

function checkQuotaError(err: any) {
  if (err && isQuotaError(err)) {
    setFirestoreQuotaExceeded(true);
  }
}

export function getClientAuthError(): string | null {
  return clientAuthError;
}

export function getFirebaseConnectionState(): 'connected' | 'connecting' | 'disconnected' {
  if (typeof window === "undefined" || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return 'disconnected';
  }
  if (isFirestoreQuotaExceeded || hasClientPermissionError) {
    return 'disconnected';
  }
  const db = getClientFirestore();
  if (!db) return 'disconnected';
  if (lastSuccessfulSyncTime > 0 || isAuthenticated) {
    return 'connected';
  }
  return 'connected';
}

function triggerAnonymousAuth() {
  const now = Date.now();
  if (now - lastAuthAttemptTime < AUTH_COOLDOWN_MS) return;

  try {
    const auth = getAuth();
    if (auth.currentUser) {
      isAuthenticated = true;
      return;
    }
    lastAuthAttemptTime = now;
    isAuthenticating = true;
    signInAnonymously(auth)
      .then((userCredential) => {
        console.log("[ClientFirebase] Autenticação anônima realizada com sucesso:", userCredential.user.uid);
        isAuthenticated = true;
        isAuthenticating = false;
        clientAuthError = null;
      })
      .catch((err) => {
        console.warn("[ClientFirebase] Aviso na autenticação anônima (guia anônima/restrição de cookies):", err?.message || err);
        const errCode = err?.code || err?.message || "unknown";
        clientAuthError = errCode;
        isAuthenticating = false;
        // Mark authenticated as true anyway if offline or in-memory mode so app continues read ops
        isAuthenticated = true;
      });
  } catch (e) {
    console.warn("[ClientFirebase] Exceção ao obter Auth (guia anônima):", e);
    clientAuthError = "get_auth_failed";
    isAuthenticating = false;
  }
}

// Fixed control configuration (banco-01-34be4 is our permanent static control database channel)
export const CONTROL_FIREBASE_CONFIG = FIREBASE_PRESETS[0].config;

let controlAppInstance: any = null;
let controlFirestoreInstance: any = null;

export function getControlFirestore() {
  if (!controlFirestoreInstance) {
    try {
      const apps = getApps();
      const existingApp = apps.find(a => a.name === "ControlChannelApp");
      if (existingApp) {
        controlAppInstance = existingApp;
      } else {
        controlAppInstance = initializeApp(CONTROL_FIREBASE_CONFIG, "ControlChannelApp");
      }
      controlFirestoreInstance = getFirestore(controlAppInstance);
    } catch (e) {
      console.warn("[ControlChannel] Erro ao obter Firestore de controle, usando fallback:", e);
      controlFirestoreInstance = firestoreInstance || getClientFirestore();
    }
  }
  return controlFirestoreInstance;
}

export interface SystemControlData {
  activeProjectId?: string;
  changedBy?: string;
  changedAt?: string;
  pendingSwitch?: {
    targetProjectId: string;
    switchAtTimestamp: number;
    requestedBy?: string;
    targetConfig?: any;
    targetName?: string;
    countdownSeconds?: number;
    requestedType?: 'manual' | 'auto';
  } | null;
  activePresetId?: string;
  activeConfig?: any;
  pendingDbSwitch?: any;
  scheduleRules?: any[];
  updatedAt?: number;
  updatedBy?: string;
}

export async function publishSystemControlUpdate(updateData: Partial<SystemControlData>): Promise<boolean> {
  try {
    const db = getControlFirestore();
    if (db) {
      const ref = doc(db, "app_control", "active_database");
      
      const payload: any = {};

      if (updateData.activeProjectId || updateData.activeConfig || updateData.activePresetId) {
        const projId = updateData.activeProjectId || updateData.activePresetId || updateData.activeConfig?.projectId;
        const matchedPreset = FIREBASE_PRESETS.find(p => p.config.projectId === projId || p.id === projId);
        payload.activeProjectId = matchedPreset ? matchedPreset.config.projectId : projId;
        payload.changedBy = updateData.changedBy || updateData.updatedBy || "Gestor Administrador (g1009)";
        payload.changedAt = updateData.changedAt || new Date().toISOString();
        if (matchedPreset) {
          payload.activeConfig = matchedPreset.config;
          payload.activePresetId = matchedPreset.id;
        } else if (updateData.activeConfig) {
          payload.activeConfig = updateData.activeConfig;
        }
      }

      if (updateData.pendingSwitch !== undefined || updateData.pendingDbSwitch !== undefined) {
        const ps = updateData.pendingSwitch !== undefined ? updateData.pendingSwitch : updateData.pendingDbSwitch;
        if (!ps) {
          payload.pendingSwitch = null;
          payload.pendingDbSwitch = null;
        } else {
          const targetProjId = ps.targetProjectId || ps.targetPresetId || ps.targetConfig?.projectId;
          const matchedTarget = FIREBASE_PRESETS.find(p => p.config.projectId === targetProjId || p.id === targetProjId);
          const fullPending = {
            targetProjectId: matchedTarget ? matchedTarget.config.projectId : targetProjId,
            switchAtTimestamp: ps.switchAtTimestamp,
            requestedBy: ps.requestedBy || "Gestor Administrador (g1009)",
            targetConfig: ps.targetConfig || (matchedTarget ? matchedTarget.config : null),
            targetName: ps.targetName || (matchedTarget ? matchedTarget.name : targetProjId)
          };
          payload.pendingSwitch = fullPending;
          payload.pendingDbSwitch = fullPending;
        }
      }

      if (updateData.scheduleRules !== undefined) {
        payload.scheduleRules = updateData.scheduleRules;
      }

      await setDoc(ref, payload, { merge: true });
      console.log("[ControlChannel] app_control/active_database atualizado com sucesso no Firestore!");
    }
  } catch (err) {
    console.warn("[ControlChannel] Erro ao publicar no Firestore app_control/active_database:", err);
  }

  if (updateData.activeConfig) {
    try {
      await fetch('/api/firebase/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData.activeConfig)
      });
    } catch (e) {}
  }

  return true;
}

export function subscribeToSystemControl(callback: (data: SystemControlData) => void): () => void {
  try {
    const db = getControlFirestore();
    if (!db) return () => {};

    const ref = doc(db, "app_control", "active_database");
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      if (snapshot.exists()) {
        const raw = snapshot.data();
        
        const activeProj = raw.activeProjectId || raw.activePresetId || raw.activeConfig?.projectId;
        const matchedPreset = FIREBASE_PRESETS.find(p => p.config.projectId === activeProj || p.id === activeProj);
        const resolvedConfig = matchedPreset ? matchedPreset.config : raw.activeConfig;

        const ps = raw.pendingSwitch !== undefined ? raw.pendingSwitch : raw.pendingDbSwitch;
        let resolvedPending = null;
        if (ps) {
          const targetProj = ps.targetProjectId || ps.targetPresetId || ps.targetConfig?.projectId;
          const matchedTarget = FIREBASE_PRESETS.find(p => p.config.projectId === targetProj || p.id === targetProj);
          resolvedPending = {
            targetProjectId: matchedTarget ? matchedTarget.config.projectId : targetProj,
            switchAtTimestamp: ps.switchAtTimestamp,
            requestedBy: ps.requestedBy || 'Gestor Administrador',
            targetConfig: ps.targetConfig || (matchedTarget ? matchedTarget.config : null),
            targetName: ps.targetName || (matchedTarget ? matchedTarget.name : targetProj)
          };
        }

        const normalizedData: SystemControlData = {
          activeProjectId: activeProj,
          changedBy: raw.changedBy || raw.updatedBy,
          changedAt: raw.changedAt,
          pendingSwitch: resolvedPending,
          activePresetId: matchedPreset?.id || activeProj,
          activeConfig: resolvedConfig,
          pendingDbSwitch: resolvedPending,
          scheduleRules: raw.scheduleRules
        };

        console.log("[ControlChannel] Estado app_control/active_database recebido em tempo real:", normalizedData);
        callback(normalizedData);
      }
    }, (err) => {
      console.warn("[ControlChannel] Erro no listener em tempo real:", err);
    });
    return unsubscribe;
  } catch (e) {
    console.warn("[ControlChannel] Falha ao assinar canal de controle:", e);
    return () => {};
  }
}

export function isClientFirebaseActive(): boolean {
  if (typeof window === "undefined" || hasClientPermissionError) return false;
  try {
    const db = getClientFirestore();
    if (db) return true;
  } catch (e) {}
  return false;
}

let memoryActiveConfig: any = null;

export function getActiveFirebaseConfig(): any {
  if (memoryActiveConfig && memoryActiveConfig.projectId) {
    return memoryActiveConfig;
  }

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("active_firebase_config") || localStorage.getItem("logiroute_firebase_client_config");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.projectId) {
          if (parsed.projectId === 'abastecimento-78ae9') {
            try {
              localStorage.removeItem("active_firebase_config");
              localStorage.removeItem("logiroute_firebase_client_config");
            } catch (e) {}
            return firebaseConfig;
          }
          const presetMatch = FIREBASE_PRESETS.find(p => p.id === parsed.projectId || p.config.projectId === parsed.projectId);
          if (presetMatch) {
            return presetMatch.config;
          }
          return parsed;
        }
      }
    } catch (e) {}
  }
  return firebaseConfig;
}

export async function switchActiveFirebaseConfig(
  newConfig: any,
  updateServer: boolean = true,
  publishToControlChannel: boolean = true
): Promise<boolean> {
  try {
    hasClientPermissionError = false;
    isFirestoreQuotaExceeded = false;
    clientAuthError = null;

    let normalizedConfig = newConfig;
    if (typeof newConfig === 'string') {
      const p = FIREBASE_PRESETS.find(pr => pr.id === newConfig || pr.config.projectId === newConfig);
      if (p) normalizedConfig = p.config;
    } else if (newConfig && newConfig.projectId) {
      const p = FIREBASE_PRESETS.find(pr => pr.id === newConfig.projectId || pr.config.projectId === newConfig.projectId);
      if (p) normalizedConfig = p.config;
    }

    memoryActiveConfig = normalizedConfig;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("active_firebase_config", JSON.stringify(normalizedConfig));
        localStorage.setItem("logiroute_firebase_client_config", JSON.stringify(normalizedConfig));
      } catch (e) {
        console.warn("[ClientFirebase] localStorage restrito. Usando memória.", e);
      }
    }

    if (publishToControlChannel && normalizedConfig && normalizedConfig.projectId) {
      const presetMatch = FIREBASE_PRESETS.find(p => p.config.projectId === normalizedConfig.projectId || p.id === normalizedConfig.projectId);
      publishSystemControlUpdate({
        activePresetId: presetMatch ? presetMatch.id : normalizedConfig.projectId,
        activeConfig: normalizedConfig,
        pendingDbSwitch: null
      });
    }

    if (updateServer) {
      try {
        await fetch('/api/firebase/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalizedConfig),
        });
      } catch (e) {}
    }

    if (firestoreInstance) {
      try {
        await terminate(firestoreInstance);
      } catch (e) {}
      firestoreInstance = null;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("firebase_config_changed", { detail: normalizedConfig }));
    }
    return true;
  } catch (err) {
    console.error("[ClientFirebase] Erro ao alternar banco de dados:", err);
    return false;
  }
}

export async function checkAndSyncServerConfig(): Promise<{ changed: boolean; config: any }> {
  try {
    const res = await fetch('/api/firebase/config');
    const data = await res.json();
    if (data && data.success && data.config && data.config.projectId) {
      const serverConfig = data.config;
      const currentLocal = getActiveFirebaseConfig();
      const isDifferent = !currentLocal || currentLocal.projectId !== serverConfig.projectId;
      
      if (isDifferent) {
        console.log(`[ClientFirebase] Servidor possui banco ativo diferente (${serverConfig.projectId} vs local ${currentLocal?.projectId}). Atualizando localmente...`);
        await switchActiveFirebaseConfig(serverConfig, false);
        return { changed: true, config: serverConfig };
      }
      return { changed: false, config: currentLocal };
    }
  } catch (e) {
    console.warn("[ClientFirebase] Não foi possível verificar config do servidor:", e);
  }
  return { changed: false, config: getActiveFirebaseConfig() };
}

export async function syncFirebaseData(sourceConfig: any, targetConfig: any): Promise<{ success: boolean; count: number }> {
  let totalDocs = 0;
  const appNameSource = `syncSrc_${Date.now()}`;
  const appNameTarget = `syncTgt_${Date.now()}`;

  let sourceApp: any = null;
  let targetApp: any = null;

  const syncWorker = async () => {
    try {
      console.log(`[syncFirebaseData] Iniciando sincronização completa de '${sourceConfig.projectId}' para '${targetConfig.projectId}'...`);
      sourceApp = initializeApp(sourceConfig, appNameSource);
      targetApp = initializeApp(targetConfig, appNameTarget);

      try {
        await Promise.all([
          signInAnonymously(getAuth(sourceApp)).catch(() => null),
          signInAnonymously(getAuth(targetApp)).catch(() => null)
        ]);
      } catch (e) {
        // ignore auth error
      }

      const sourceDb = getFirestore(sourceApp);
      const targetDb = getFirestore(targetApp);

      for (const colName of TRACKED_COLLECTIONS) {
        try {
          const sourceSnap = await getDocs(collection(sourceDb, colName));
          const sourceDocs = sourceSnap.docs;
          const sourceDocIds = new Set(sourceDocs.map(d => d.id));

          // Obtain target docs to identify stale items to purge
          let idsToDelete: string[] = [];
          try {
            const targetSnap = await getDocs(collection(targetDb, colName));
            for (const tDoc of targetSnap.docs) {
              if (!sourceDocIds.has(tDoc.id)) {
                idsToDelete.push(tDoc.id);
              }
            }
          } catch (e) {
            console.warn(`[syncFirebaseData] Não foi possível listar target para ${colName}:`, e);
          }

          if (sourceDocs.length === 0 && idsToDelete.length === 0) continue;

          // Prepare operations: delete stale target docs first, then set current source docs
          const ops: Array<{ type: 'set' | 'delete'; id: string; data?: any }> = [
            ...idsToDelete.map(id => ({ type: 'delete' as const, id })),
            ...sourceDocs.map(d => ({ type: 'set' as const, id: d.id, data: d.data() }))
          ];

          const batchSize = 300;
          for (let i = 0; i < ops.length; i += batchSize) {
            const chunk = ops.slice(i, i + batchSize);
            const batch = writeBatch(targetDb);
            chunk.forEach(op => {
              const docRef = doc(targetDb, colName, op.id);
              if (op.type === 'delete') {
                batch.delete(docRef);
              } else {
                batch.set(docRef, op.data, { merge: true });
              }
            });
            await batch.commit();
          }

          console.log(`[syncFirebaseData] Coleção '${colName}': ${sourceDocs.length} atualizados, ${idsToDelete.length} obsoletos removidos.`);
          totalDocs += sourceDocs.length;
        } catch (e) {
          console.warn(`[syncFirebaseData] Aviso ao sincronizar coleção '${colName}':`, e);
        }
      }
      console.log(`[syncFirebaseData] Sincronização concluída! Total de ${totalDocs} documentos transferidos.`);
      return { success: true, count: totalDocs };
    } catch (err) {
      console.error("[syncFirebaseData] Erro de sincronização entre bancos:", err);
      return { success: false, count: 0 };
    } finally {
      if (sourceApp) { try { await deleteApp(sourceApp); } catch (e) {} }
      if (targetApp) { try { await deleteApp(targetApp); } catch (e) {} }
    }
  };

  const timeoutPromise = new Promise<{ success: boolean; count: number }>((resolve) => {
    setTimeout(() => {
      console.warn("[syncFirebaseData] Timeout de 25s atingido. Prosseguindo com troca de banco...");
      resolve({ success: false, count: totalDocs });
    }, 25000);
  });

  return Promise.race([syncWorker(), timeoutPromise]);
}

export function getClientFirestore() {
  if (isFirestoreQuotaExceeded || hasClientPermissionError) return null;
  if (firestoreInstance) {
    if (!isAuthenticated && !isAuthenticating) {
      triggerAnonymousAuth();
    }
    return firestoreInstance;
  }

  try {
    const config = getActiveFirebaseConfig();
    if (
      !config ||
      !config.projectId ||
      config.projectId === "remixed-project-id" ||
      config.projectId.includes("placeholder")
    ) {
      return null;
    }

    const app = getApps().length === 0 ? initializeApp(config) : getApp();
    const dbId = (config.firestoreDatabaseId && config.firestoreDatabaseId !== "(default)") ? config.firestoreDatabaseId : undefined;
    firestoreInstance = dbId ? getFirestore(app, dbId) : getFirestore(app);
    triggerAnonymousAuth();
    return firestoreInstance;
  } catch (err) {
    console.warn("[ClientFirebase] Erro ao inicializar Firestore:", err);
    return null;
  }
}

/**
 * Requirement 2: Direct writes (create, edit, import) go straight to document in Firestore collection.
 */
export async function saveDocToFirestore(colName: string, item: any): Promise<boolean> {
  const db = getClientFirestore();
  if (!db || !item) return false;
  try {
    const targetCol = COLLECTION_MAP[colName] || colName;
    const docId = getDocIdForCollection(targetCol, item);
    const cleanItem = JSON.parse(JSON.stringify(item));
    cleanItem.id = docId;
    const docRef = doc(db, targetCol, docId);
    await setDoc(docRef, cleanItem, { merge: true });
    return true;
  } catch (err) {
    console.warn(`[ClientFirebase] Erro ao salvar documento na coleção '${colName}':`, err);
    return false;
  }
}

export async function deleteDocFromFirestore(colName: string, docId: string): Promise<boolean> {
  const db = getClientFirestore();
  if (!db || !docId) return false;
  try {
    const targetCol = COLLECTION_MAP[colName] || colName;
    const docRef = doc(db, targetCol, docId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.warn(`[ClientFirebase] Erro ao deletar documento '${docId}' da coleção '${colName}':`, err);
    return false;
  }
}

export async function saveDocsToFirestore(colName: string, items: any[], syncDeletions: boolean = false): Promise<boolean> {
  const db = getClientFirestore();
  if (!db || !items) return false;
  try {
    const targetCol = COLLECTION_MAP[colName] || colName;
    const cleanItems = JSON.parse(JSON.stringify(items));

    let idsToDelete: string[] = [];
    if (syncDeletions) {
      try {
        const collRef = collection(db, targetCol);
        const existingSnap = await getDocs(collRef);
        const currentDocIds = new Set(cleanItems.map((item: any) => getDocIdForCollection(targetCol, item)));
        idsToDelete = existingSnap.docs.map(d => d.id).filter(id => !currentDocIds.has(id));
      } catch (e) {}
    }

    const batchSize = 400;
    const allOps: Array<{ type: 'set' | 'delete'; id: string; data?: any }> = [
      ...cleanItems.map((item: any) => {
        const docId = getDocIdForCollection(targetCol, item);
        item.id = docId;
        return { type: 'set' as const, id: docId, data: item };
      }),
      ...idsToDelete.map(id => ({ type: 'delete' as const, id }))
    ];

    for (let i = 0; i < allOps.length; i += batchSize) {
      const chunk = allOps.slice(i, i + batchSize);
      const batch = writeBatch(db);
      chunk.forEach(op => {
        const docRef = doc(db, targetCol, op.id);
        if (op.type === 'set') {
          batch.set(docRef, op.data, { merge: true });
        } else {
          batch.delete(docRef);
        }
      });
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.warn(`[ClientFirebase] Erro ao salvar documentos na coleção '${colName}':`, err);
    return false;
  }
}

export async function saveDirectlyToFirestore(payload: any): Promise<boolean> {
  const db = getClientFirestore();
  if (!db || !payload) return false;
  try {
    const keys = Object.keys(payload);
    for (const key of keys) {
      const colName = COLLECTION_MAP[key] || key;
      const rawData = payload[key];
      if (rawData === undefined) continue;

      if (colName === "customManual") {
        const docRef = doc(db, "customManual", "main");
        const htmlContent = typeof rawData === "string" ? rawData : rawData?.html || rawData?.content || "";
        await setDoc(docRef, { html: htmlContent, updatedAt: new Date().toISOString() });
        continue;
      }

      if (Array.isArray(rawData)) {
        await saveDocsToFirestore(colName, rawData, true);
      }
    }
    return true;
  } catch (err) {
    console.warn("[ClientFirebase] Erro ao persistir no Firestore:", err);
    return false;
  }
}

/**
 * Requirement 3: Real-time queries straight from Firestore collections.
 * Seed default initial values directly to Firestore if collections are empty.
 */
export function subscribeToFirestore(onUpdate: (db: any) => void): () => void {
  const db = getClientFirestore();
  if (!db || hasClientPermissionError) return () => {};

  console.log("[ClientFirebase] Inscrevendo para atualizações em tempo real nas coleções do Firestore...");

  const combinedDb: Record<string, any> = {
    users: [],
    drivers: [],
    vehicles: [],
    products: [],
    activeAssets: [],
    audits: [],
    vales: [],
    returnForecasts: [],
    fiscalAlerts: [],
    importedRoutes: [],
    audit_logs: [],
    auditLogs: [],
    customManual: ""
  };

  const unsubscribes: (() => void)[] = [];

  TRACKED_COLLECTIONS.forEach((colName) => {
    try {
      if (colName === "customManual") {
        const docRef = doc(db, "customManual", "main");
        const unsub = onSnapshot(docRef, (docSnap) => {
          lastSuccessfulSyncTime = Date.now();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('firestore_synced', { detail: { time: lastSuccessfulSyncTime } }));
          }
          if (docSnap.exists()) {
            const data = docSnap.data();
            combinedDb.customManual = data.html || data.content || "";
          } else {
            combinedDb.customManual = "";
          }
          onUpdate({ ...combinedDb });
        }, (error) => handleSubscriptionError(error));
        unsubscribes.push(unsub);
      } else {
        const collRef = collection(db, colName);
        const unsub = onSnapshot(collRef, (snapshot) => {
          lastSuccessfulSyncTime = Date.now();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('firestore_synced', { detail: { time: lastSuccessfulSyncTime } }));
          }

          // Seed defaults directly to Firestore if empty
          if (snapshot.empty) {
            if (colName === "users" && DEFAULT_USERS.length > 0) {
              saveDocsToFirestore("users", DEFAULT_USERS);
            } else if (colName === "drivers" && DEFAULT_DRIVERS.length > 0) {
              saveDocsToFirestore("drivers", DEFAULT_DRIVERS);
            } else if (colName === "vehicles" && DEFAULT_VEHICLES.length > 0) {
              saveDocsToFirestore("vehicles", DEFAULT_VEHICLES);
            } else if (colName === "products" && DEFAULT_PRODUCTS.length > 0) {
              saveDocsToFirestore("products", DEFAULT_PRODUCTS);
            } else if (colName === "activeAssets" && DEFAULT_ACTIVE_ASSETS.length > 0) {
              saveDocsToFirestore("activeAssets", DEFAULT_ACTIVE_ASSETS);
            }
          }

          const items = snapshot.docs.map((d) => ({
            ...d.data(),
            id: d.id
          }));

          if (colName === "auditLogs") {
            combinedDb.auditLogs = items;
            combinedDb.audit_logs = items;
          } else {
            combinedDb[colName] = items;
          }

          onUpdate({ ...combinedDb });
        }, (error) => handleSubscriptionError(error));
        unsubscribes.push(unsub);
      }
    } catch (err) {
      handleSubscriptionError(err);
    }
  });

  return () => {
    unsubscribes.forEach((unsub) => {
      try {
        unsub();
      } catch (e) {}
    });
  };
}

function handleSubscriptionError(error: any) {
  if (isPermissionError(error)) {
    checkPermissionError(error);
  } else {
    checkQuotaError(error);
  }
}

export async function fetchDirectlyFromFirestore(): Promise<any> {
  const db = getClientFirestore();
  if (!db) return null;

  const combinedDb: Record<string, any> = {
    users: [],
    drivers: [],
    vehicles: [],
    products: [],
    activeAssets: [],
    audits: [],
    vales: [],
    returnForecasts: [],
    fiscalAlerts: [],
    importedRoutes: [],
    audit_logs: [],
    auditLogs: [],
    customManual: ""
  };

  try {
    const promises = TRACKED_COLLECTIONS.map(async (colName) => {
      try {
        if (colName === "customManual") {
          const docRef = doc(db, "customManual", "main");
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            combinedDb.customManual = data.html || data.content || "";
          }
        } else {
          const collRef = collection(db, colName);
          const snap = await getDocs(collRef);
          const items = snap.docs.map((d) => ({
            ...d.data(),
            id: d.id
          }));
          if (colName === "auditLogs") {
            combinedDb.auditLogs = items;
            combinedDb.audit_logs = items;
          } else {
            combinedDb[colName] = items;
          }
        }
      } catch (err) {
        if (isPermissionError(err)) {
          checkPermissionError(err);
        } else {
          checkQuotaError(err);
        }
      }
    });

    await Promise.all(promises);
    lastSuccessfulSyncTime = Date.now();
    return combinedDb;
  } catch (e) {
    return null;
  }
}

export async function getGeminiKeyFromFirestore(): Promise<string | null> {
  const db = getClientFirestore();
  if (!db) return null;
  try {
    const docRef = doc(db, "app_state", "gemini_config");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data()?.apiKey || null;
    }
  } catch (e) {}
  return null;
}

export async function saveGeminiKeyToFirestore(apiKey: string): Promise<boolean> {
  const db = getClientFirestore();
  if (!db) return false;
  try {
    const docRef = doc(db, "app_state", "gemini_config");
    await setDoc(docRef, { apiKey: apiKey });
    return true;
  } catch (e) {}
  return false;
}
