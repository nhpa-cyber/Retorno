import { FIREBASE_PRESETS, FirebasePreset } from '../firebasePresets';

export interface ScheduleRule {
  id: string;
  presetId: string;
  name: string;
  badge: string;
  badgeColor: string;
  triggerHour: number;   // 0 - 23
  triggerMinute: number; // 0 - 59
  timeLabel: string;     // e.g. "07:00"
  description: string;   // e.g. "Turno Diurno (07:00 às 17:00)"
}

export const DEFAULT_SCHEDULE_RULES: ScheduleRule[] = [
  {
    id: "diurno_banco_01",
    presetId: "banco-01",
    name: "Banco 01 (Diurno)",
    badge: "07:00 - Banco 01",
    badgeColor: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    triggerHour: 7,
    triggerMinute: 0,
    timeLabel: "07:00",
    description: "Turno Diurno (07:00 às 17:00) ➔ Banco 01"
  },
  {
    id: "vespertino_banco_02",
    presetId: "banco-02",
    name: "Banco 02 (Vespertino)",
    badge: "17:00 - Banco 02",
    badgeColor: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    triggerHour: 17,
    triggerMinute: 0,
    timeLabel: "17:00",
    description: "Turno Vespertino (17:00 às 20:00) ➔ Banco 02"
  },
  {
    id: "noturno_banco_03",
    presetId: "banco-03",
    name: "Banco 03 (Noturno)",
    badge: "20:00 - Banco 03",
    badgeColor: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
    triggerHour: 20,
    triggerMinute: 0,
    timeLabel: "20:00",
    description: "Turno Noturno (20:00 às 07:00) ➔ Banco 03"
  }
];

export function isAutoScheduleEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('db_schedule_auto_enabled');
  return stored === null ? true : stored === 'true';
}

export function setAutoScheduleEnabled(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('db_schedule_auto_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('db_schedule_setting_changed', { detail: enabled }));
  }
}

export function getScheduleRules(): ScheduleRule[] {
  if (typeof window === 'undefined') return DEFAULT_SCHEDULE_RULES;
  try {
    const stored = localStorage.getItem('db_custom_schedule_rules');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  return DEFAULT_SCHEDULE_RULES;
}

export async function saveScheduleRules(rules: ScheduleRule[]): Promise<void> {
  const formattedRules = rules.map((r, idx) => {
    const nextIdx = (idx + 1) % rules.length;
    const nextRule = rules[nextIdx];
    const hourStr = r.triggerHour.toString().padStart(2, '0');
    const minStr = r.triggerMinute.toString().padStart(2, '0');
    const timeLabel = `${hourStr}:${minStr}`;
    const nextTimeLabel = `${nextRule.triggerHour.toString().padStart(2, '0')}:${nextRule.triggerMinute.toString().padStart(2, '0')}`;
    
    return {
      ...r,
      timeLabel,
      badge: `${timeLabel} - ${r.presetId.toUpperCase()}`,
      description: `${r.name} (${timeLabel} às ${nextTimeLabel}) ➔ ${r.presetId}`
    };
  });

  if (typeof window !== 'undefined') {
    localStorage.setItem('db_custom_schedule_rules', JSON.stringify(formattedRules));
    window.dispatchEvent(new CustomEvent('db_schedule_rules_changed', { detail: formattedRules }));
  }

  try {
    await fetch('/api/firebase/schedule-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: formattedRules })
    });
  } catch (e) {}
}

export async function syncScheduleRulesWithServer(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/firebase/schedule-rules');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.rules) && data.rules.length > 0) {
        localStorage.setItem('db_custom_schedule_rules', JSON.stringify(data.rules));
        window.dispatchEvent(new CustomEvent('db_schedule_rules_changed', { detail: data.rules }));
      }
    }
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  syncScheduleRulesWithServer();
  window.addEventListener('server_schedule_rules_updated', (e: any) => {
    if (e.detail && Array.isArray(e.detail)) {
      localStorage.setItem('db_custom_schedule_rules', JSON.stringify(e.detail));
      window.dispatchEvent(new CustomEvent('db_schedule_rules_changed', { detail: e.detail }));
    }
  });
}

export async function resetScheduleRulesToDefault(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('db_custom_schedule_rules');
    window.dispatchEvent(new CustomEvent('db_schedule_rules_changed', { detail: DEFAULT_SCHEDULE_RULES }));
  }
  try {
    await fetch('/api/firebase/schedule-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: DEFAULT_SCHEDULE_RULES })
    });
  } catch (e) {}
}

/**
 * Returns which preset SHOULD be active right now according to schedule
 */
export function getCurrentScheduledPresetId(now = new Date()): string {
  const rules = getScheduleRules();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const ruleMinutes = rules.map(r => ({
    presetId: r.presetId,
    mins: r.triggerHour * 60 + r.triggerMinute
  })).sort((a, b) => a.mins - b.mins);

  if (ruleMinutes.length === 0) return "banco-01";

  let activePreset = ruleMinutes[ruleMinutes.length - 1].presetId;
  for (let i = 0; i < ruleMinutes.length; i++) {
    if (currentMinutes >= ruleMinutes[i].mins) {
      activePreset = ruleMinutes[i].presetId;
    } else {
      break;
    }
  }

  return activePreset;
}

export interface UpcomingSwitchInfo {
  currentPresetId: string;
  nextRule: ScheduleRule;
  nextPreset: FirebasePreset | undefined;
  nextSwitchDate: Date;
  remainingSeconds: number;
  remainingFormatted: string;
  warningLevel: '10m' | '5m' | '1m' | 'none';
  shouldTriggerNow: boolean;
}

export function getUpcomingDatabaseSwitchInfo(now = new Date()): UpcomingSwitchInfo {
  const rules = getScheduleRules();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  const sortedRules = [...rules].map(r => ({
    rule: r,
    mins: r.triggerHour * 60 + r.triggerMinute
  })).sort((a, b) => a.mins - b.mins);

  let nextItem = sortedRules.find(item => item.mins > currentMinutes);
  let nextSwitchDate = new Date(now);

  if (nextItem) {
    nextSwitchDate.setHours(nextItem.rule.triggerHour, nextItem.rule.triggerMinute, 0, 0);
  } else {
    nextItem = sortedRules[0] || { rule: DEFAULT_SCHEDULE_RULES[0], mins: 420 };
    nextSwitchDate.setDate(nextSwitchDate.getDate() + 1);
    nextSwitchDate.setHours(nextItem.rule.triggerHour, nextItem.rule.triggerMinute, 0, 0);
  }

  const nextRule = nextItem.rule;
  const nextPreset = FIREBASE_PRESETS.find(p => p.id === nextRule.presetId || p.config.projectId === nextRule.presetId) || FIREBASE_PRESETS[0];

  const diffMs = nextSwitchDate.getTime() - now.getTime();
  const remainingSeconds = Math.max(0, Math.floor(diffMs / 1000));

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  
  let remainingFormatted = `${mins}m ${secs.toString().padStart(2, '0')}s`;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    remainingFormatted = `${hrs}h ${remMins}m`;
  }

  let warningLevel: '10m' | '5m' | '1m' | 'none' = 'none';
  if (remainingSeconds <= 60 && remainingSeconds > 0) {
    warningLevel = '1m';
  } else if (remainingSeconds <= 300 && remainingSeconds > 60) {
    warningLevel = '5m';
  } else if (remainingSeconds <= 600 && remainingSeconds > 300) {
    warningLevel = '10m';
  }

  const currentPresetId = getCurrentScheduledPresetId(now);
  const shouldTriggerNow = remainingSeconds === 0;

  return {
    currentPresetId,
    nextRule,
    nextPreset,
    nextSwitchDate,
    remainingSeconds,
    remainingFormatted,
    warningLevel,
    shouldTriggerNow: remainingSeconds <= 0
  };
}

export async function triggerGlobalDatabaseSwitch(
  seconds = 60,
  targetPresetId?: string,
  requestedBy?: string,
  requestedType: 'manual' | 'auto' = 'manual'
) {
  try {
    const activeConfig = localStorage.getItem('active_firebase_config');
    let activeProjectId = 'banco-01-34be4';
    if (activeConfig) {
      try {
        const parsed = JSON.parse(activeConfig);
        if (parsed.projectId) activeProjectId = parsed.projectId;
      } catch (e) {}
    }

    const currentIndex = FIREBASE_PRESETS.findIndex(p => p.config.projectId === activeProjectId);
    const nextIndex = (currentIndex + 1) % FIREBASE_PRESETS.length;
    const nextPreset = FIREBASE_PRESETS.find(p => p.id === targetPresetId || p.config.projectId === targetPresetId) || FIREBASE_PRESETS[nextIndex] || FIREBASE_PRESETS[0];

    const requesterText = requestedBy || 'Gestor Administrador';

    // Trigger on server so all PCs and Mobiles receive it via SSE/polling
    await fetch('/api/firebase/trigger-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPresetId: nextPreset.id,
        targetConfig: nextPreset.config,
        targetName: nextPreset.name,
        countdownSeconds: seconds,
        requestedBy: requesterText,
        requestedType
      })
    });

    // Also dispatch local event for instant UI reaction
    window.dispatchEvent(new CustomEvent('trigger_db_simulated_countdown', {
      detail: {
        seconds,
        targetPreset: nextPreset,
        requestedBy: requesterText,
        requestedType
      }
    }));
  } catch (err) {
    console.error('Error triggering global db switch:', err);
  }
}
