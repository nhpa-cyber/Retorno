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
        const errCode = err.code || err.message || "unknown";
        clientAuthError = errCode;
        isAuthenticating = false;
      });
  } catch (e) {
    clientAuthError = "get_auth_failed";
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

export function getActiveFirebaseConfig(): any {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("active_firebase_config") || localStorage.getItem("logiroute_firebase_client_config");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.projectId) {
          if (parsed.projectId === 'abastecimento-78ae9') {
            localStorage.removeItem("active_firebase_config");
            localStorage.removeItem("logiroute_firebase_client_config");
            return firebaseConfig;
          }
          if (parsed.projectId === 'banco-02') {
            const b2 = FIREBASE_PRESETS.find(p => p.id === 'banco-02');
            if (b2) return b2.config;
          }
          if (parsed.projectId === 'banco-03') {
            const b3 = FIREBASE_PRESETS.find(p => p.id === 'banco-03');
            if (b3) return b3.config;
          }
          return parsed;
        }
      }
    } catch (e) {}
  }
  return firebaseConfig;
}

export async function switchActiveFirebaseConfig(newConfig: any): Promise<boolean> {
  try {
    hasClientPermissionError = false;
    isFirestoreQuotaExceeded = false;
    clientAuthError = null;
    if (typeof window !== "undefined") {
      localStorage.setItem("active_firebase_config", JSON.stringify(newConfig));
      localStorage.setItem("logiroute_firebase_client_config", JSON.stringify(newConfig));
    }
    try {
      await fetch('/api/firebase/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
    } catch (e) {}

    if (firestoreInstance) {
      try {
        await terminate(firestoreInstance);
      } catch (e) {}
      firestoreInstance = null;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("firebase_config_changed", { detail: newConfig }));
    }
    return true;
  } catch (err) {
    console.error("[ClientFirebase] Erro ao alternar banco de dados:", err);
    return false;
  }
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
