/**
 * IndexedDB Database Service for LogiRoute Photo Evidence
 * Stores Base64 compressed image files safely without local storage limit restrictions.
 * Falls back to highly resilient in-memory storage if IndexedDB is disabled, blocked or sandboxed in an iframe.
 */

import { isClientFirebaseActive, getClientFirestore, isQuotaError, setFirestoreQuotaExceeded, checkPermissionError, isPermissionError } from './clientFirebase';
import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';

export interface PhotoRecord {
  id: string;             // Unique ID (e.g., photo_123)
  auditId: string;        // ID of the audit session
  itemCode: string;       // SKU Code or Asset ID
  itemName: string;       // SKU Description or Asset Name
  photoUrl: string;       // Base64 compressed JPEG string or Firebase download URL
  timestamp: string;      // ISO Date when captured
  conferenteId: string;   // Who took the photo
  driverId: string;       // Accountable driver ID
  driverName: string;     // Accountable driver name
  type: 'produto' | 'ativo' | 'refugo' | 'troca_reposicao'; // Product, Asset, Refugo, or Exchange/Replacement
  syncPending?: boolean;  // Is this photo waiting to be replicated to the server?
}

const DB_NAME = 'logiroute_photos_db';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

export class ImageDB {
  private static dbPromise: Promise<IDBDatabase | null> | null = null;
  private static isInMemoryFallback = false;
  private static memoryStore: Map<string, PhotoRecord> = new Map();

  private static getDB(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      try {
        if (typeof window === 'undefined' || !window.indexedDB) {
          console.log('IndexedDB is not supported or undefined. Falling back to clean in-memory database storage.');
          ImageDB.isInMemoryFallback = true;
          resolve(null);
          return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('auditId', 'auditId', { unique: false });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };

        request.onsuccess = (event) => {
          resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
          console.log('IndexedDB is disabled or sandboxed. Falling back to clean in-memory database storage.');
          ImageDB.isInMemoryFallback = true;
          resolve(null);
        };
      } catch (err) {
        console.log('IndexedDB security restriction detected. Falling back to clean in-memory database storage.', err);
        ImageDB.isInMemoryFallback = true;
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  /**
   * Save a new photo record, performing immediate upload and confirming success.
   */
  static async savePhoto(record: Omit<PhotoRecord, 'id' | 'timestamp'>): Promise<PhotoRecord> {
    const db = await this.getDB();
    const newRecord: PhotoRecord = {
      ...record,
      id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      syncPending: true
    };

    // Save locally first (with syncPending: true so it's persisted immediately even if offline)
    if (this.isInMemoryFallback || !db) {
      this.memoryStore.set(newRecord.id, newRecord);
    } else {
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.put(newRecord);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        console.warn('Fallback to memory store due to IndexedDB transaction error:', err);
        this.memoryStore.set(newRecord.id, newRecord);
      }
    }

    // Attempt instant replication to the server with confirmation
    try {
      let isSynced = false;
      let syncedPhotoData: any = null;

      if (isClientFirebaseActive()) {
        const firestoreDb = getClientFirestore();
        if (firestoreDb) {
          try {
            const photoDocRef = doc(firestoreDb, "photos", newRecord.id);
            await setDoc(photoDocRef, newRecord);
            isSynced = true;
          } catch (fsErr) {
            console.warn('[ImageDB] Falha na gravação direta do Firestore para nova foto. Tentando fallback via API do servidor...', fsErr);
            if (isPermissionError(fsErr)) {
              checkPermissionError(fsErr);
            } else if (isQuotaError(fsErr)) {
              setFirestoreQuotaExceeded(true);
            }
          }
        }
      }

      // ALWAYS replicate to the backend server API to ensure photos are cached on disk,
      // registered in the server database cache, and available for PDF generation & non-client-firebase users.
      try {
        const res = await fetch('/api/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo: newRecord })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.photo) {
            syncedPhotoData = data.photo;
            isSynced = true;
          }
        }
      } catch (srvErr) {
        console.warn('[ImageDB] Falha na réplica para a API de fotos do servidor:', srvErr);
      }

      if (isSynced) {
        // Success! Replace the local record with the synced record (containing Storage URL and syncPending: false)
        const syncedRecord: PhotoRecord = {
          ...(syncedPhotoData || newRecord),
          syncPending: false
        };

        if (this.isInMemoryFallback || !db) {
          this.memoryStore.set(syncedRecord.id, syncedRecord);
        } else {
          try {
            await new Promise<void>((resolve) => {
              const transaction = db.transaction(STORE_NAME, 'readwrite');
              const store = transaction.objectStore(STORE_NAME);
              const request = store.put(syncedRecord);
              request.onsuccess = request.onerror = () => resolve();
            });
          } catch (err) {
            this.memoryStore.set(syncedRecord.id, syncedRecord);
          }
        }
        
        window.dispatchEvent(new CustomEvent('logiroute_photos_updated'));
        return syncedRecord;
      }
    } catch (e) {
      console.warn('Replication failed. Photo will be synchronized automatically in background.', e);
    }

    return newRecord;
  }

  /**
   * Synchronize any pending offline photos to the server
   */
  static async syncPendingPhotos(): Promise<void> {
    try {
      const pending = await this.getPendingPhotos();
      if (pending.length === 0) return;
      
      console.log(`[ImageDB] Sincronizando ${pending.length} fotos pendentes tiradas em modo offline...`);
      const db = await this.getDB();
      const isClientFB = isClientFirebaseActive();
      const firestoreDb = isClientFB ? getClientFirestore() : null;
      
      for (const p of pending) {
        try {
          let isSynced = false;
          let syncedPhotoData: any = null;

          if (isClientFB && firestoreDb) {
            try {
              const photoDocRef = doc(firestoreDb, "photos", p.id);
              await setDoc(photoDocRef, p);
              isSynced = true;
            } catch (fsErr) {
              console.warn(`[ImageDB] Falha na gravação direta do Firestore para foto pendente ${p.id}. Tentando fallback via API do servidor...`, fsErr);
              if (isPermissionError(fsErr)) {
                checkPermissionError(fsErr);
              } else if (isQuotaError(fsErr)) {
                setFirestoreQuotaExceeded(true);
              }
            }
          }

          if (!isSynced) {
            const res = await fetch('/api/photos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photo: p })
            });
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.photo) {
                syncedPhotoData = data.photo;
                isSynced = true;
              }
            }
          }

          if (isSynced) {
            const syncedRecord: PhotoRecord = {
              ...(syncedPhotoData || p),
              syncPending: false
            };
            
            if (this.isInMemoryFallback || !db) {
              this.memoryStore.set(syncedRecord.id, syncedRecord);
            } else {
              await new Promise<void>((resolve) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(syncedRecord);
                request.onsuccess = request.onerror = () => resolve();
              });
            }
          }
        } catch (err) {
          console.warn(`[ImageDB] Falha temporária ao sincronizar foto offline ${p.id}:`, err);
        }
      }
      
      window.dispatchEvent(new CustomEvent('logiroute_photos_updated'));
    } catch (err) {
      console.error('[ImageDB] Erro ao sincronizar fotos pendentes:', err);
    }
  }

  /**
   * Internal helper to find all local photos with syncPending === true
   */
  private static async getPendingPhotos(): Promise<PhotoRecord[]> {
    try {
      const all = await this.getLocalAllPhotos();
      return all.filter(p => p.syncPending === true);
    } catch (e) {
      return [];
    }
  }

  /**
   * Sync array of photos from server into local IndexedDB and dispatch update event
   */
  static async syncPhotos(photos: PhotoRecord[]): Promise<void> {
    if (!photos) return;
    const db = await this.getDB();
    
    // 1. Get all local photos
    const localPhotos = await this.getLocalAllPhotos();
    
    // 2. Identify photos that exist locally but are missing from the server list,
    // and are not newly created (e.g., older than 5 minutes)
    const serverPhotoIds = new Set(photos.map(p => p.id));
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;
    
    const idsToDelete = localPhotos
      .filter(p => !serverPhotoIds.has(p.id) && (now - new Date(p.timestamp).getTime() > fiveMinutesMs))
      .map(p => p.id);

    if (this.isInMemoryFallback || !db) {
      photos.forEach(photo => {
        this.memoryStore.set(photo.id, photo);
      });
      idsToDelete.forEach(id => {
        this.memoryStore.delete(id);
      });
    } else {
      try {
        await new Promise<void>((resolve) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          
          // Perform put operations
          photos.forEach(photo => {
            store.put(photo);
          });
          
          // Perform delete operations
          idsToDelete.forEach(id => {
            store.delete(id);
          });
          
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => resolve();
        });
      } catch (err) {
        photos.forEach(photo => {
          this.memoryStore.set(photo.id, photo);
        });
        idsToDelete.forEach(id => {
          this.memoryStore.delete(id);
        });
      }
    }
    
    // Dispatch instant update notification for any listening components
    window.dispatchEvent(new CustomEvent('logiroute_photos_updated'));
  }

  /**
   * Delete all photos for a specific audit session (wipe from local and server cache)
   */
  static async clearPhotosByAudit(auditId: string): Promise<void> {
    const db = await this.getDB();
    const photos = await this.getLocalPhotosByAudit(auditId);
    
    // 1. Delete locally
    if (this.isInMemoryFallback || !db) {
      photos.forEach(p => {
        this.memoryStore.delete(p.id);
      });
    } else {
      try {
        await new Promise<void>((resolve) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          let count = 0;
          if (photos.length === 0) {
            resolve();
            return;
          }
          photos.forEach(p => {
            const req = store.delete(p.id);
            req.onsuccess = req.onerror = () => {
              count++;
              if (count === photos.length) resolve();
            };
          });
        });
      } catch (err) {
        photos.forEach(p => {
          this.memoryStore.delete(p.id);
        });
      }
    }

    // 2. Delete on the server
    for (const p of photos) {
      try {
        await fetch(`/api/photos/${p.id}`, { method: 'DELETE' });
      } catch (e) {
        console.log('Server file deletion bypassed in background.');
      }
    }
  }

  /**
   * Retrieve all photos for a specific audit, querying the server first
   * for absolute real-time simultaneity and falling back instantly to local IndexedDB.
   */
  static async getPhotosByAudit(auditId: string): Promise<PhotoRecord[]> {
    const localPromise = this.getLocalPhotosByAudit(auditId);

    const serverFetchWithTimeout = new Promise<PhotoRecord[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server photo fetch timed out'));
      }, 1000);

      this.fetchPhotosFromServer(auditId)
        .then((serverPhotos) => {
          clearTimeout(timeout);
          resolve(serverPhotos);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });

    try {
      const serverPhotos = await serverFetchWithTimeout;
      const localPhotos = await localPromise;
      const localMap = new Map(localPhotos.map(p => [p.id, p]));

      if (serverPhotos.length > 0) {
        // Merge server photos with local photos to preserve base64 strings!
        const mergedPhotos = serverPhotos.map(sp => {
          const lp = localMap.get(sp.id);
          if (lp && lp.photoUrl && lp.photoUrl.startsWith('data:') && (!sp.photoUrl || !sp.photoUrl.startsWith('data:'))) {
            // Keep the local base64 photoUrl!
            return { ...sp, photoUrl: lp.photoUrl };
          }
          return sp;
        });

        // Sync them into local IndexedDB/Memory
        const db = await this.getDB();
        if (this.isInMemoryFallback || !db) {
          mergedPhotos.forEach((photo: PhotoRecord) => {
            this.memoryStore.set(photo.id, photo);
          });
        } else {
          try {
            await new Promise<void>((resolve) => {
              const transaction = db.transaction(STORE_NAME, 'readwrite');
              const store = transaction.objectStore(STORE_NAME);
              let count = 0;
              mergedPhotos.forEach((photo: PhotoRecord) => {
                const req = store.put(photo);
                req.onsuccess = req.onerror = () => {
                  count++;
                  if (count === mergedPhotos.length) resolve();
                };
              });
            });
          } catch (err) {
            mergedPhotos.forEach((photo: PhotoRecord) => {
              this.memoryStore.set(photo.id, photo);
            });
          }
        }
        return mergedPhotos;
      }
    } catch (e) {
      console.log('Failing over to local storage photos gracefully:', e);
    }

    return localPromise;
  }

  /**
   * Internal helper to query local photos by audit ID
   */
  private static async getLocalPhotosByAudit(auditId: string): Promise<PhotoRecord[]> {
    const db = await this.getDB();
    if (this.isInMemoryFallback || !db) {
      const results: PhotoRecord[] = [];
      this.memoryStore.forEach(p => {
        if (p.auditId === auditId) results.push(p);
      });
      return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('auditId');
        const request = index.getAll(auditId);

        request.onsuccess = () => {
          const results = (request.result as PhotoRecord[]).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          resolve(results);
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Internal helper to fetch photos directly from the server
   */
  private static async fetchPhotosFromServer(auditId: string): Promise<PhotoRecord[]> {
    try {
      if (isClientFirebaseActive()) {
        const firestoreDb = getClientFirestore();
        if (!firestoreDb) return [];
        const photosCol = collection(firestoreDb, "photos");
        const q = query(photosCol, where("auditId", "==", auditId));
        const querySnapshot = await getDocs(q);
        const photos: PhotoRecord[] = [];
        querySnapshot.forEach((doc) => {
          photos.push(doc.data() as PhotoRecord);
        });
        return photos;
      } else {
        const res = await fetch(`/api/photos?auditId=${encodeURIComponent(auditId)}`);
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.success && Array.isArray(data.photos)) {
              return data.photos;
            }
          }
        }
      }
    } catch (e) {
      console.log("Error querying server photos.", e);
      if (isPermissionError(e)) {
        checkPermissionError(e);
      } else if (isQuotaError(e)) {
        setFirestoreQuotaExceeded(true);
      }
    }
    return [];
  }

  /**
   * Get all photo records in the system, querying the server first and falling back to IndexedDB.
   */
  static async getAllPhotos(): Promise<PhotoRecord[]> {
    const localPromise = this.getLocalAllPhotos();

    const serverFetchWithTimeout = new Promise<PhotoRecord[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server all photos fetch timed out'));
      }, 1500);

      this.fetchAllPhotosFromServer()
        .then((serverPhotos) => {
          clearTimeout(timeout);
          resolve(serverPhotos);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });

    try {
      const serverPhotos = await serverFetchWithTimeout;
      const localPhotos = await localPromise;
      const localMap = new Map(localPhotos.map(p => [p.id, p]));

      if (serverPhotos.length > 0) {
        const mergedPhotos = serverPhotos.map(sp => {
          const lp = localMap.get(sp.id);
          if (lp && lp.photoUrl && lp.photoUrl.startsWith('data:') && (!sp.photoUrl || !sp.photoUrl.startsWith('data:'))) {
            return { ...sp, photoUrl: lp.photoUrl };
          }
          return sp;
        });

        const db = await this.getDB();
        if (this.isInMemoryFallback || !db) {
          mergedPhotos.forEach((photo: PhotoRecord) => {
            this.memoryStore.set(photo.id, photo);
          });
        } else {
          try {
            await new Promise<void>((resolve) => {
              const transaction = db.transaction(STORE_NAME, 'readwrite');
              const store = transaction.objectStore(STORE_NAME);
              let count = 0;
              mergedPhotos.forEach((photo: PhotoRecord) => {
                const req = store.put(photo);
                req.onsuccess = req.onerror = () => {
                  count++;
                  if (count === mergedPhotos.length) resolve();
                };
              });
            });
          } catch (err) {
            mergedPhotos.forEach((photo: PhotoRecord) => {
              this.memoryStore.set(photo.id, photo);
            });
          }
        }
        return mergedPhotos;
      }
    } catch (e) {
      console.log('Failing over to local storage for all photos gracefully:', e);
    }

    return localPromise;
  }

  /**
   * Internal helper to query all local photos
   */
  private static async getLocalAllPhotos(): Promise<PhotoRecord[]> {
    const db = await this.getDB();
    if (this.isInMemoryFallback || !db) {
      return Array.from(this.memoryStore.values());
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result as PhotoRecord[]);
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Internal helper to fetch all photos from the server
   */
  private static async fetchAllPhotosFromServer(): Promise<PhotoRecord[]> {
    try {
      if (isClientFirebaseActive()) {
        const firestoreDb = getClientFirestore();
        if (!firestoreDb) return [];
        const photosCol = collection(firestoreDb, "photos");
        const querySnapshot = await getDocs(photosCol);
        const photos: PhotoRecord[] = [];
        querySnapshot.forEach((doc) => {
          photos.push(doc.data() as PhotoRecord);
        });
        return photos;
      } else {
        const res = await fetch('/api/photos');
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const data = await res.json();
            if (data.success && Array.isArray(data.photos)) {
              return data.photos;
            }
          }
        }
      }
    } catch (e) {
      console.log("Error querying all server photos.", e);
      if (isPermissionError(e)) {
        checkPermissionError(e);
      } else if (isQuotaError(e)) {
        setFirestoreQuotaExceeded(true);
      }
    }
    return [];
  }

  /**
   * Delete a photo by ID
   */
  static async deletePhoto(id: string): Promise<void> {
    const db = await this.getDB();
    
    // Delete locally
    if (this.isInMemoryFallback || !db) {
      this.memoryStore.delete(id);
    } else {
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.delete(id);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        this.memoryStore.delete(id);
      }
    }

    // Delete on server
    try {
      if (isClientFirebaseActive()) {
        const firestoreDb = getClientFirestore();
        if (firestoreDb) {
          const photoDocRef = doc(firestoreDb, "photos", id);
          await deleteDoc(photoDocRef);
        }
      } else {
        await fetch(`/api/photos/${id}`, { method: 'DELETE' });
      }
    } catch (e) {
      console.log('Server file deletion bypassed in background.', e);
      if (isPermissionError(e)) {
        checkPermissionError(e);
      } else if (isQuotaError(e)) {
        setFirestoreQuotaExceeded(true);
      }
    }
  }

  /**
   * Delete all photo records in the system (Wipe/Reset database)
   */
  static async clearAllPhotos(): Promise<void> {
    const db = await this.getDB();
    
    // Clear locally
    if (this.isInMemoryFallback || !db) {
      this.memoryStore.clear();
    } else {
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE_NAME, 'readwrite');
          const store = transaction.objectStore(STORE_NAME);
          const request = store.clear();
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      } catch (err) {
        this.memoryStore.clear();
      }
    }

    // Clear on server
    try {
      await fetch('/api/photos/clear', { method: 'POST' });
    } catch (e) {
      console.log('Server photo wipe bypassed in background.');
    }
  }

  /**
   * Prune old records older than X days (e.g., 30 days or 365 days / 12 months)
   */
  static async prunePhotos(daysRetention: number): Promise<{ prunedCount: number }> {
    const db = await this.getDB();
    const photos = await this.getAllPhotos();
    const cutoffMs = Date.now() - (daysRetention * 24 * 60 * 60 * 1000);
    
    let prunedCount = 0;

    if (this.isInMemoryFallback || !db) {
      for (const photo of photos) {
        const photoTime = new Date(photo.timestamp).getTime();
        if (photoTime < cutoffMs) {
          this.memoryStore.delete(photo.id);
          prunedCount++;
        }
      }
    } else {
      try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        for (const photo of photos) {
          const photoTime = new Date(photo.timestamp).getTime();
          if (photoTime < cutoffMs) {
            store.delete(photo.id);
            prunedCount++;
          }
        }

        await new Promise<void>((resolve) => {
          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onerror = () => {
            resolve();
          };
        });
      } catch (err) {
        for (const photo of photos) {
          const photoTime = new Date(photo.timestamp).getTime();
          if (photoTime < cutoffMs) {
            this.memoryStore.delete(photo.id);
            prunedCount++;
          }
        }
      }
    }

    // Prune on server
    try {
      const res = await fetch('/api/photos/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysRetention })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.prunedCount !== undefined) {
          prunedCount = data.prunedCount;
        }
      }
    } catch (e) {
      console.log('Server photos pruning completed.');
    }

    return { prunedCount };
  }

  /**
   * Calculate database stats (count and estimated space in MB)
   */
  static async getDatabaseStats(): Promise<{ count: number; sizeMb: number }> {
    try {
      const photos = await this.getAllPhotos();
      let totalChars = 0;
      photos.forEach(p => {
        totalChars += (p.photoUrl || '').length;
      });
      
      // Estimated size in bytes (1 character in JS is approx 2 bytes, but let's base it on Base64 byte length)
      const estimatedBytes = totalChars * 0.75; 
      const sizeMb = Number((estimatedBytes / (1024 * 1024)).toFixed(2));
      
      return {
        count: photos.length,
        sizeMb
      };
    } catch (e) {
      return { count: 0, sizeMb: 0 };
    }
  }
}

// Automatically start the offline syncer in background when window is defined
if (typeof window !== 'undefined') {
  // Run on startup after short delay
  setTimeout(() => {
    ImageDB.syncPendingPhotos().catch(() => {});
  }, 3000);

  // Check periodically every 30 seconds
  setInterval(() => {
    ImageDB.syncPendingPhotos().catch(() => {});
  }, 30000);

  // Also run immediately when browser goes online
  window.addEventListener('online', () => {
    console.log('[ImageDB] Conexão reestabelecida. Sincronizando fotos pendentes...');
    ImageDB.syncPendingPhotos().catch(() => {});
  });
}
