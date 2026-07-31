import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, getDocs, setDoc, deleteDoc, collection, onSnapshot, terminate, setLogLevel, writeBatch } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
import { DEFAULT_USERS, DEFAULT_DRIVERS, DEFAULT_VEHICLES, DEFAULT_PRODUCTS, DEFAULT_ACTIVE_ASSETS } from "./data";

// Silence verbose or harmless Firestore warnings/info logs in browser
try {
  setLogLevel("silent");
} catch (e) {
  // ignore
}

export const BANCO_01_CONFIG = {
  apiKey: "AIzaSyAxVFlljdf_QXhVgqoYbTjPJXnzLIhHCTw",
  authDomain: "banco-01-34be4.firebaseapp.com",
  projectId: "banco-01-34be4",
  storageBucket: "banco-01-34be4.firebasestorage.app",
  messagingSenderId: "769319279792",
  appId: "1:769319279792:web:0b1f64349b2a2b482aaf75",
  firestoreDatabaseId: "(default)"
};

export const BANCO_02_CONFIG = {
  apiKey: "AIzaSyAd9ouXvKudfi4fOXQ34FZ9hWNkfOW8BvI",
  authDomain: "banco-02-2fb6b.firebaseapp.com",
  projectId: "banco-02-2fb6b",
  storageBucket: "banco-02-2fb6b.firebasestorage.app",
  messagingSenderId: "364866790920",
  appId: "1:364866790920:web:6f43aa475321a4a3f853bd",
  firestoreDatabaseId: "(default)"
};

export type DatabaseKey = 'banco-01' | 'banco-02';

let activeDatabaseKey: DatabaseKey = (function() {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('sstr_active_database');
    if (saved === 'banco-02' || saved === 'banco-01') return saved;
  }
  return 'banco-01';
})();

export function getActiveDatabaseKey(): DatabaseKey {
  return activeDatabaseKey;
}

export function setActiveDatabaseKey(key: DatabaseKey) {
  activeDatabaseKey = key;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('sstr_active_database', key);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('database_switched', { detail: { activeDb: key } }));
  }
}

export function getActiveDatabaseLabel(): string {
  return activeDatabaseKey === 'banco-02' ? 'Banco 02 (banco-02-2fb6b)' : 'Banco 01 (banco-01-34be4)';
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
  "customManual"
];

export function canonicalMapCode(mapCode: any): string {
  if (mapCode === undefined || mapCode === null) return '';
  const str = String(mapCode).trim().toUpperCase();
  const clean = str.replace(/[\.\-\/\s]/g, '');
  const noZeros = clean.replace(/^0+/, '');
  return noZeros || clean || str;
}

/**
  * Unique and stable document ID per collection
  */
export function getDocIdForCollection(colName: string, item: any): string {
  if (!item) return `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const mappedCol = COLLECTION_MAP[colName] || colName;

  if (mappedCol === "importedRoutes") {
    const mapKey = canonicalMapCode(item.routeMap);
    const dateStr = item.routeDate ? String(item.routeDate).trim() : "";
    if (mapKey && dateStr) {
      return `${mapKey}_${dateStr}`;
    }
    if (mapKey) {
      return mapKey;
    }
    if (item.id) return String(item.id).trim();
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

let db1Instance: any = null;
let db2Instance: any = null;
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
  return 'connected';
}

function triggerAnonymousAuth(app: any) {
  const now = Date.now();
  if (now - lastAuthAttemptTime < AUTH_COOLDOWN_MS) return;

  try {
    const auth = getAuth(app);
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

function initDbForConfig(config: any) {
  if (!config || !config.projectId) return null;
  const apps = getApps();
  const appName = `app_${config.projectId}`;
  let app = apps.find(a => a.name === appName || (a.name === '[DEFAULT]' && config.projectId === BANCO_01_CONFIG.projectId));
  if (!app) {
    if (apps.length === 0) {
      app = initializeApp(config);
    } else {
      app = initializeApp(config, appName);
    }
  }

  const dbId = (config.firestoreDatabaseId && config.firestoreDatabaseId !== "(default)") ? config.firestoreDatabaseId : undefined;
  const db = dbId ? getFirestore(app, dbId) : getFirestore(app);
  triggerAnonymousAuth(app);
  return db;
}

export function getClientFirestoreFor(key: DatabaseKey) {
  if (isFirestoreQuotaExceeded || hasClientPermissionError) return null;
  try {
    if (key === 'banco-01') {
      if (!db1Instance) {
        db1Instance = initDbForConfig(BANCO_01_CONFIG);
      }
      return db1Instance;
    } else {
      if (!db2Instance) {
        db2Instance = initDbForConfig(BANCO_02_CONFIG);
      }
      return db2Instance;
    }
  } catch (err) {
    console.warn(`[ClientFirebase] Erro ao inicializar Firestore para ${key}:`, err);
    return null;
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

export function getClientFirestore() {
  return getClientFirestoreFor(activeDatabaseKey) || getClientFirestoreFor('banco-01');
}

export function getAllFirestoreInstances(): Array<{ key: DatabaseKey; db: any; isPrimary: boolean }> {
  const list: Array<{ key: DatabaseKey; db: any; isPrimary: boolean }> = [];
  const primary = getClientFirestoreFor(activeDatabaseKey);
  const secondaryKey: DatabaseKey = activeDatabaseKey === 'banco-01' ? 'banco-02' : 'banco-01';
  const secondary = getClientFirestoreFor(secondaryKey);

  if (primary) list.push({ key: activeDatabaseKey, db: primary, isPrimary: true });
  if (secondary) list.push({ key: secondaryKey, db: secondary, isPrimary: false });
  return list;
}

/**
  * Direct writes (create, edit, import) go straight to document in active Firestore collection.
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
  if (!docId) return false;
  const instances = getAllFirestoreInstances();
  if (instances.length === 0) return false;
  let success = false;

  for (const { db } of instances) {
    try {
      const targetCol = COLLECTION_MAP[colName] || colName;
      const docRef = doc(db, targetCol, docId);
      await deleteDoc(docRef);
      success = true;
    } catch (err) {
      console.warn(`[ClientFirebase] Erro ao deletar documento '${docId}' da coleção '${colName}':`, err);
    }
  }
  return success;
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
        await saveDocsToFirestore(colName, rawData, false);
      }
    }
    return true;
  } catch (err) {
    console.warn("[ClientFirebase] Erro ao persistir no Firestore:", err);
    return false;
  }
}

export async function seedAllPlatformDataToFirestore(): Promise<boolean> {
  const db = getClientFirestore();
  if (!db) return false;

  try {
    const res = await fetch('/api/db');
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.success || !data.db) return false;

    const platformDb = data.db;
    console.log("[ClientFirebase] Sincronizando dados cadastrados na plataforma com o Firestore ativo...");

    for (const key of Object.keys(platformDb)) {
      const val = platformDb[key];
      const colName = COLLECTION_MAP[key] || key;

      if (key === "customManual") {
        if (val) {
          const docRef = doc(db, "customManual", "main");
          const htmlContent = typeof val === "string" ? val : val?.html || val?.content || "";
          await setDoc(docRef, { html: htmlContent, updatedAt: new Date().toISOString() }, { merge: true });
        }
        continue;
      }

      if (Array.isArray(val) && val.length > 0) {
        await saveDocsToFirestore(colName, val, false);
      }
    }
    console.log("[ClientFirebase] Sincronização de dados da plataforma no Firestore concluída!");
    return true;
  } catch (err) {
    console.warn("[ClientFirebase] Erro ao sincronizar dados da plataforma no Firestore:", err);
    return false;
  }
}

/**
  * Real-time queries straight from ALL active Firestore instances.
  * Merges data from Banco 01 and Banco 02 so no historical records are lost!
  */
export function subscribeToFirestore(onUpdate: (db: any) => void): () => void {
  const instances = getAllFirestoreInstances();
  if (instances.length === 0 || hasClientPermissionError) return () => {};

  console.log("[ClientFirebase] Inscrevendo para atualizações em tempo real nos bancos de dados...");

  const dbStateMap: Record<string, Record<string, any>> = {};

  const unsubscribes: (() => void)[] = [];

  const emitMergedData = () => {
    lastSuccessfulSyncTime = Date.now();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent('firestore_synced', { detail: { time: lastSuccessfulSyncTime } }));
    }

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

    TRACKED_COLLECTIONS.forEach((colName) => {
      if (colName === "customManual") {
        let manual = "";
        for (const inst of instances) {
          const st = dbStateMap[inst.key];
          if (st && st.customManual) {
            manual = st.customManual;
            if (inst.isPrimary) break;
          }
        }
        combinedDb.customManual = manual;
      } else {
        const mergedMap = new Map<string, any>();
        // Order instances so primary overwrites duplicates
        const orderedInstances = [...instances].sort((a, b) => (a.isPrimary ? 1 : -1));

        for (const inst of orderedInstances) {
          const st = dbStateMap[inst.key];
          if (st && Array.isArray(st[colName])) {
            st[colName].forEach((item: any) => {
              if (item && item.id) {
                mergedMap.set(item.id, item);
              }
            });
          }
        }

        const items = Array.from(mergedMap.values());
        if (colName === "auditLogs") {
          combinedDb.auditLogs = items;
          combinedDb.audit_logs = items;
        } else {
          combinedDb[colName] = items;
        }
      }
    });

    onUpdate({ ...combinedDb });
  };

  instances.forEach(({ key, db }) => {
    dbStateMap[key] = {
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
      auditLogs: [],
      customManual: ""
    };

    TRACKED_COLLECTIONS.forEach((colName) => {
      try {
        if (colName === "customManual") {
          const docRef = doc(db, "customManual", "main");
          const unsub = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              dbStateMap[key].customManual = data.html || data.content || "";
            } else {
              dbStateMap[key].customManual = "";
            }
            emitMergedData();
          }, (error) => handleSubscriptionError(error));
          unsubscribes.push(unsub);
        } else {
          const collRef = collection(db, colName);
          const unsub = onSnapshot(collRef, (snapshot) => {
            if (snapshot.empty && key === activeDatabaseKey) {
              fetch('/api/db')
                .then(res => res.json())
                .then(data => {
                  if (data?.success && data?.db) {
                    const dbKey = Object.keys(COLLECTION_MAP).find(k => COLLECTION_MAP[k] === colName) || colName;
                    const items = data.db[dbKey] || data.db[colName];
                    if (Array.isArray(items) && items.length > 0) {
                      saveDocsToFirestore(colName, items);
                      return;
                    }
                  }
                  if (colName === "users" && DEFAULT_USERS.length > 0) saveDocsToFirestore("users", DEFAULT_USERS);
                  else if (colName === "drivers" && DEFAULT_DRIVERS.length > 0) saveDocsToFirestore("drivers", DEFAULT_DRIVERS);
                  else if (colName === "vehicles" && DEFAULT_VEHICLES.length > 0) saveDocsToFirestore("vehicles", DEFAULT_VEHICLES);
                  else if (colName === "products" && DEFAULT_PRODUCTS.length > 0) saveDocsToFirestore("products", DEFAULT_PRODUCTS);
                  else if (colName === "activeAssets" && DEFAULT_ACTIVE_ASSETS.length > 0) saveDocsToFirestore("activeAssets", DEFAULT_ACTIVE_ASSETS);
                })
                .catch(() => {});
            }

            const items = snapshot.docs.map((d) => ({
              ...d.data(),
              id: d.id
            }));

            dbStateMap[key][colName] = items;
            emitMergedData();
          }, (error) => handleSubscriptionError(error));
          unsubscribes.push(unsub);
        }
      } catch (err) {
        handleSubscriptionError(err);
      }
    });
  });

  const handleSwitch = () => {
    emitMergedData();
  };

  if (typeof window !== "undefined") {
    window.addEventListener('database_switched', handleSwitch);
  }

  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener('database_switched', handleSwitch);
    }
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
  const instances = getAllFirestoreInstances();
  if (instances.length === 0) return null;

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
    const promises = instances.map(async ({ db, isPrimary }) => {
      const subDb: Record<string, any> = {};
      for (const colName of TRACKED_COLLECTIONS) {
        try {
          if (colName === "customManual") {
            const docRef = doc(db, "customManual", "main");
            const snap = await getDoc(docRef);
            if (snap.exists()) {
              subDb.customManual = snap.data()?.html || snap.data()?.content || "";
            }
          } else {
            const collRef = collection(db, colName);
            const snap = await getDocs(collRef);
            subDb[colName] = snap.docs.map((d) => ({
              ...d.data(),
              id: d.id
            }));
          }
        } catch (err) {
          if (isPermissionError(err)) {
            checkPermissionError(err);
          } else {
            checkQuotaError(err);
          }
        }
      }
      return { subDb, isPrimary };
    });

    const results = await Promise.all(promises);
    // Sort so primary comes last and overrides duplicates
    results.sort((a, b) => (a.isPrimary ? 1 : -1));

    TRACKED_COLLECTIONS.forEach((colName) => {
      if (colName === "customManual") {
        for (const r of results) {
          if (r.subDb.customManual) {
            combinedDb.customManual = r.subDb.customManual;
          }
        }
      } else {
        const mergedMap = new Map<string, any>();
        for (const r of results) {
          if (Array.isArray(r.subDb[colName])) {
            r.subDb[colName].forEach((item: any) => {
              if (item && item.id) mergedMap.set(item.id, item);
            });
          }
        }
        const items = Array.from(mergedMap.values());
        if (colName === "auditLogs") {
          combinedDb.auditLogs = items;
          combinedDb.audit_logs = items;
        } else {
          combinedDb[colName] = items;
        }
      }
    });

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

