// Utility to track daily Firestore operations (Reads, Writes, Deletions)

export interface FirestoreDailyMetrics {
  date: string;
  reads: number;
  writes: number;
  deletions: number;
  lastUpdated: number;
}

const STORAGE_KEY_PREFIX = 'firestore_metrics_v1_';

function getTodayKey(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${STORAGE_KEY_PREFIX}${year}-${month}-${day}`;
}

export function getDailyMetrics(): FirestoreDailyMetrics {
  const key = getTodayKey();
  const raw = localStorage.getItem(key);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // invalid JSON, fall through
    }
  }

  // Default initial metrics
  const initial: FirestoreDailyMetrics = {
    date: new Date().toISOString().split('T')[0],
    reads: 0,
    writes: 0,
    deletions: 0,
    lastUpdated: Date.now()
  };
  localStorage.setItem(key, JSON.stringify(initial));
  return initial;
}

function saveAndNotify(metrics: FirestoreDailyMetrics) {
  const key = getTodayKey();
  metrics.lastUpdated = Date.now();
  localStorage.setItem(key, JSON.stringify(metrics));
  window.dispatchEvent(new CustomEvent('firestore_metrics_changed', { detail: metrics }));
}

export function recordReads(count: number = 1) {
  if (!count || count <= 0) return;
  const metrics = getDailyMetrics();
  metrics.reads += count;
  saveAndNotify(metrics);
}

export function recordWrites(count: number = 1) {
  if (!count || count <= 0) return;
  const metrics = getDailyMetrics();
  metrics.writes += count;
  saveAndNotify(metrics);
}

export function recordDeletions(count: number = 1) {
  if (!count || count <= 0) return;
  const metrics = getDailyMetrics();
  metrics.deletions += count;
  saveAndNotify(metrics);
}

export function setDailyMetrics(newMetrics: Partial<FirestoreDailyMetrics>) {
  const current = getDailyMetrics();
  const updated: FirestoreDailyMetrics = {
    ...current,
    ...newMetrics,
    lastUpdated: Date.now()
  };
  saveAndNotify(updated);
}

export function resetDailyMetrics() {
  const reset: FirestoreDailyMetrics = {
    date: new Date().toISOString().split('T')[0],
    reads: 0,
    writes: 0,
    deletions: 0,
    lastUpdated: Date.now()
  };
  saveAndNotify(reset);
}
