import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, ArrowRight, RefreshCw, CheckCircle2, ShieldAlert, Sparkles, Volume2, Database, ShieldCheck } from 'lucide-react';
import { getUpcomingDatabaseSwitchInfo, isAutoScheduleEnabled, UpcomingSwitchInfo, triggerGlobalDatabaseSwitch, getCurrentScheduledPresetId } from '../utils/databaseScheduler';
import { getActiveFirebaseConfig, switchActiveFirebaseConfig, syncFirebaseData } from '../clientFirebase';
import { FIREBASE_PRESETS } from '../firebasePresets';

interface DatabaseScheduleBannerProps {
  onDatabaseSwitched?: () => void;
  currentUser?: {
    name?: string;
    username?: string;
    role?: string;
  } | null;
}

export const DatabaseScheduleBanner: React.FC<DatabaseScheduleBannerProps> = ({ onDatabaseSwitched, currentUser }) => {
  const [switchInfo, setSwitchInfo] = useState<UpcomingSwitchInfo | null>(null);
  const [autoEnabled, setAutoEnabled] = useState<boolean>(isAutoScheduleEnabled());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [completedMessage, setCompletedMessage] = useState<string | null>(null);
  const [simulationSeconds, setSimulationSeconds] = useState<number | null>(null);
  const [switchRequester, setSwitchRequester] = useState<string | null>(null);
  const [switchType, setSwitchType] = useState<'manual' | 'auto'>('manual');
  
  // Modal Popup state shown to ALL users when switch completes
  const [switchedModalData, setSwitchedModalData] = useState<{
    name: string;
    projectId: string;
    requestedBy: string;
    targetConfig: any;
    countdown: number;
  } | null>(null);

  const isSwitchingRef = useRef<boolean>(false);
  const lastWarnedLevel = useRef<string>('none');
  const lastHandledProjectIdRef = useRef<string | null>(null);

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return getActiveFirebaseConfig()?.projectId || 'banco-01-34be4';
  });

  useEffect(() => {
    const syncActiveId = () => {
      const cfg = getActiveFirebaseConfig();
      if (cfg?.projectId && cfg.projectId !== activeProjectId) {
        setActiveProjectId(cfg.projectId);
      }
    };

    window.addEventListener('firebase_config_changed', syncActiveId);
    window.addEventListener('server_config_updated', syncActiveId);
    return () => {
      window.removeEventListener('firebase_config_changed', syncActiveId);
      window.removeEventListener('server_config_updated', syncActiveId);
    };
  }, [activeProjectId]);

  // Determine next target preset
  const currentIndex = FIREBASE_PRESETS.findIndex(p => p.config.projectId === activeProjectId);
  const nextPresetIndex = (currentIndex + 1) % FIREBASE_PRESETS.length;
  const simulatedNextPreset = FIREBASE_PRESETS[nextPresetIndex] || FIREBASE_PRESETS[0];

  const performSwitch = async (targetPresetConfig: any, targetName: string) => {
    if (isSwitchingRef.current) return;
    isSwitchingRef.current = true;
    lastHandledProjectIdRef.current = targetPresetConfig.projectId;
    setIsSyncing(true);

    try {
      console.log(`[DatabaseScheduler] Executando troca para ${targetName} (${targetPresetConfig.projectId})...`);
      
      const success = await switchActiveFirebaseConfig(targetPresetConfig);
      if (success) {
        if (onDatabaseSwitched) onDatabaseSwitched();

        const reqText = switchRequester || (currentUser ? `${currentUser.name || 'Gestor'} (${currentUser.username || 'g1009'})` : 'Gestor Administrador G1009 (g1009)');

        // Open Modal Popup overlay for all connected users
        setSwitchedModalData({
          name: targetName,
          projectId: targetPresetConfig.projectId,
          requestedBy: reqText,
          targetConfig: targetPresetConfig,
          countdown: 4
        });
      }
    } catch (err) {
      console.error("[DatabaseScheduler] Falha na troca de banco:", err);
      isSwitchingRef.current = false;
    } finally {
      setIsSyncing(false);
    }
  };

  const [pendingTarget, setPendingTarget] = useState<{ config: any; name: string } | null>(null);

  // Auto-countdown timer for popup modal
  useEffect(() => {
    if (!switchedModalData) return;

    if (switchedModalData.countdown <= 0) {
      setSwitchedModalData(null);
      isSwitchingRef.current = false;
      return;
    }

    const modalInterval = setInterval(() => {
      setSwitchedModalData(prev => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          clearInterval(modalInterval);
          isSwitchingRef.current = false;
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);

    return () => clearInterval(modalInterval);
  }, [switchedModalData !== null]);

  // SSE & Custom Event listeners for instant switch updates across all devices
  useEffect(() => {
    const handleSimulateEvent = (e: any) => {
      const seconds = e.detail?.seconds || 60;
      setSimulationSeconds(seconds);
      if (e.detail?.requestedBy) {
        setSwitchRequester(e.detail.requestedBy);
      }
      if (e.detail?.requestedType) {
        setSwitchType(e.detail.requestedType);
      }
      if (e.detail?.targetPreset) {
        setPendingTarget({ config: e.detail.targetPreset.config, name: e.detail.targetPreset.name });
      }
    };

    const handleServerPendingSwitch = (e: any) => {
      const pending = e.detail;
      if (pending && pending.switchAtTimestamp) {
        const remMs = pending.switchAtTimestamp - Date.now();
        if (remMs > 0) {
          const remSecs = Math.max(1, Math.ceil(remMs / 1000));
          setSimulationSeconds(remSecs);
          if (pending.requestedBy) setSwitchRequester(pending.requestedBy);
          if (pending.requestedType) setSwitchType(pending.requestedType);
          if (pending.targetConfig) {
            setPendingTarget({
              config: pending.targetConfig,
              name: pending.targetName || 'Novo Banco'
            });
          }
        } else {
          setSimulationSeconds(null);
        }
      } else {
        setSimulationSeconds(null);
        setPendingTarget(null);
      }
    };

    const handleServerConfigUpdated = (e: any) => {
      const newConfig = e.detail;
      if (newConfig && newConfig.projectId) {
        const currentLocalConfig = getActiveFirebaseConfig();
        if (currentLocalConfig?.projectId !== newConfig.projectId && lastHandledProjectIdRef.current !== newConfig.projectId && !isSwitchingRef.current) {
          lastHandledProjectIdRef.current = newConfig.projectId;
          isSwitchingRef.current = true;
          const matchedPreset = FIREBASE_PRESETS.find(p => p.config.projectId === newConfig.projectId);
          const targetName = matchedPreset?.name || newConfig.projectId;
          const reqText = switchRequester || 'Gestor Administrador G1009 (g1009)';

          switchActiveFirebaseConfig(newConfig, false).then(() => {
            setSwitchedModalData({
              name: targetName,
              projectId: newConfig.projectId,
              requestedBy: reqText,
              targetConfig: newConfig,
              countdown: 4
            });
          });
        }
      }
    };

    window.addEventListener('trigger_db_simulated_countdown', handleSimulateEvent);
    window.addEventListener('server_pending_switch_updated', handleServerPendingSwitch);
    window.addEventListener('server_config_updated', handleServerConfigUpdated);

    return () => {
      window.removeEventListener('trigger_db_simulated_countdown', handleSimulateEvent);
      window.removeEventListener('server_pending_switch_updated', handleServerPendingSwitch);
      window.removeEventListener('server_config_updated', handleServerConfigUpdated);
    };
  }, [switchRequester]);

  // Countdown timer for switch
  useEffect(() => {
    if (simulationSeconds === null) return;

    if (simulationSeconds <= 0) {
      setSimulationSeconds(null);
      const targetConfig = pendingTarget?.config || simulatedNextPreset.config;
      const targetName = pendingTarget?.name || simulatedNextPreset.name;
      performSwitch(targetConfig, targetName);
      return;
    }

    const simTimer = setInterval(() => {
      setSimulationSeconds(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(simTimer);
  }, [simulationSeconds, pendingTarget, simulatedNextPreset]);

  useEffect(() => {
    const checkSchedule = () => {
      const enabled = isAutoScheduleEnabled();
      setAutoEnabled(enabled);
      const now = new Date();
      const info = getUpcomingDatabaseSwitchInfo(now);
      setSwitchInfo(info);

      // Play sound or log when warning level changes
      if (info.warningLevel !== lastWarnedLevel.current) {
        lastWarnedLevel.current = info.warningLevel;
        if (info.warningLevel !== 'none') {
          console.log(`[DatabaseScheduler] Warning Level: ${info.warningLevel} - ${info.remainingFormatted} remaining before switch to ${info.nextRule.name}`);
        }
      }

      // Enforce scheduled database for the current time slot
      if (enabled && !isSwitchingRef.current && simulationSeconds === null) {
        const scheduledPresetId = getCurrentScheduledPresetId(now);
        const scheduledPreset = FIREBASE_PRESETS.find(p => p.id === scheduledPresetId || p.config.projectId === scheduledPresetId);

        if (scheduledPreset && activeProjectId !== scheduledPreset.config.projectId && lastHandledProjectIdRef.current !== scheduledPreset.config.projectId) {
          console.log(`[DatabaseScheduler] Horário atual (${now.toLocaleTimeString()}) pertence ao turno de ${scheduledPreset.name} (${scheduledPreset.config.projectId}), mas o banco ativo é ${activeProjectId}. Trocando automaticamente...`);
          performSwitch(scheduledPreset.config, scheduledPreset.name);
          return;
        }

        // Check if exact trigger time reached
        if (info.shouldTriggerNow && info.nextPreset && activeProjectId !== info.nextPreset.config.projectId && lastHandledProjectIdRef.current !== info.nextPreset.config.projectId) {
          performSwitch(info.nextPreset.config, info.nextRule.name);
        }
      }
    };

    checkSchedule();
    const timer = setInterval(checkSchedule, 1000);

    const handleSettingChange = (e: any) => {
      setAutoEnabled(e.detail);
      checkSchedule();
    };

    const handleRulesChange = () => {
      checkSchedule();
    };

    window.addEventListener('db_schedule_setting_changed', handleSettingChange);
    window.addEventListener('db_schedule_rules_changed', handleRulesChange);
    window.addEventListener('server_schedule_rules_updated', handleRulesChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener('db_schedule_setting_changed', handleSettingChange);
      window.removeEventListener('db_schedule_rules_changed', handleRulesChange);
      window.removeEventListener('server_schedule_rules_updated', handleRulesChange);
    };
  }, [activeProjectId]);

  if (completedMessage) {
    return (
      <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold font-mono flex items-center justify-between shadow-md animate-fade-in">
        <div className="flex items-center space-x-2 mx-auto">
          <CheckCircle2 className="h-4 w-4 text-emerald-200 animate-bounce" />
          <span>{completedMessage}</span>
        </div>
      </div>
    );
  }

  const hasActiveServerCountdown = simulationSeconds !== null && simulationSeconds > 0;

  let warningLevel = switchInfo?.warningLevel || 'none';
  let remainingFormatted = switchInfo?.remainingFormatted || '00m 00s';
  let nextRuleName = pendingTarget?.name || switchInfo?.nextRule.name || simulatedNextPreset.name;
  let nextTimeLabel = switchInfo?.nextRule.timeLabel || 'Instantes';
  let nextPresetConfig = pendingTarget?.config || switchInfo?.nextPreset?.config || simulatedNextPreset.config;

  if (hasActiveServerCountdown) {
    if (simulationSeconds! <= 60) {
      warningLevel = '1m';
    } else if (simulationSeconds! <= 300) {
      warningLevel = '5m';
    } else {
      warningLevel = '10m';
    }
    const mins = Math.floor(simulationSeconds! / 60);
    const secs = simulationSeconds! % 60;
    remainingFormatted = `${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    nextTimeLabel = 'Agendamento em Andamento';
  }

  // Don't render banner if no active server countdown and warning level is 'none' and no modal popup active
  if (!hasActiveServerCountdown && warningLevel === 'none' && !switchedModalData) {
    return null;
  }

  const handleManualTriggerNow = async () => {
    const requesterText = currentUser 
      ? `${currentUser.name || 'Usuário'} (${currentUser.username || 'g1009'})` 
      : 'Gestor Administrador';
    const targetPreset = pendingTarget?.config || nextPresetConfig;
    const targetPresetId = targetPreset?.projectId || 'banco-02';
    await triggerGlobalDatabaseSwitch(2, targetPresetId, requesterText, 'manual');
  };

  return (
    <div className="sticky top-0 z-50 font-sans shadow-lg animate-fade-in">
      {/* 10 MINUTE WARNING BANNER */}
      {warningLevel === '10m' && (
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-slate-950 px-3 sm:px-4 py-3 text-xs font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-amber-400 shadow-xl w-full">
          <div className="flex items-start space-x-2.5 sm:space-x-3 min-w-0 flex-1 w-full">
            <div className="bg-slate-950 text-amber-400 p-1.5 sm:p-2 rounded-lg shrink-0 mt-0.5 shadow-md">
              <Clock className="h-4 sm:h-5 w-4 sm:w-5 animate-pulse" />
            </div>
            <div className="min-w-0 space-y-1.5 flex-1 w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold uppercase tracking-wider text-slate-950 text-[10px] sm:text-xs bg-amber-400/90 px-2 py-0.5 rounded border border-amber-700/40 shadow-xs leading-snug">
                  ⚠️ ATENÇÃO: TROCA AUTOMÁTICA EM INSTANTES
                </span>
                <span className="font-mono font-black text-slate-950 bg-amber-200 px-2 py-0.5 rounded text-[10px] sm:text-xs border border-amber-600/50 shadow-xs">
                  Faltam {remainingFormatted}
                </span>
              </div>
              <p className="text-slate-950 font-semibold text-[11px] sm:text-xs leading-relaxed break-words">
                Haverá a mudança do banco de dados para o <span className="font-bold underline text-slate-950">{nextRuleName}</span> às <span className="font-bold">{nextTimeLabel}</span>. 
                Se você estiver realizando alguma movimentação na plataforma, aguarde a conclusão da troca.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end pt-1 sm:pt-0">
            <button
              onClick={handleManualTriggerNow}
              disabled={isSyncing}
              className="bg-slate-950 hover:bg-slate-900 text-amber-400 border border-amber-500/40 px-3.5 py-2 rounded-lg font-mono text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
            >
              {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{isSyncing ? 'Sincronizando...' : 'Antecipar Troca Agora'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 5 MINUTE WARNING BANNER */}
      {warningLevel === '5m' && (
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 text-white px-3 sm:px-4 py-3 text-xs font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-orange-400 shadow-xl animate-pulse w-full">
          <div className="flex items-start space-x-2.5 sm:space-x-3 min-w-0 flex-1 w-full">
            <div className="bg-slate-950 text-orange-400 p-1.5 sm:p-2 rounded-lg shrink-0 mt-0.5 shadow-md">
              <AlertTriangle className="h-4 sm:h-5 w-4 sm:w-5 text-orange-400 animate-bounce" />
            </div>
            <div className="min-w-0 space-y-1.5 flex-1 w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold uppercase tracking-wider text-amber-200 text-[10px] sm:text-xs bg-slate-950/90 px-2 py-0.5 rounded border border-amber-400/40 shadow-xs leading-snug">
                  ⏰ ATENÇÃO: TROCA DE BANCO EM 5 MINUTOS
                </span>
                <span className="font-mono font-black text-amber-200 bg-slate-950 px-2 py-0.5 rounded text-[10px] sm:text-xs border border-amber-400/50 shadow-xs">
                  Faltam {remainingFormatted}
                </span>
              </div>
              <p className="text-white font-medium text-[11px] sm:text-xs leading-relaxed break-words">
                Restam apenas 5 minutos para a transição para o <span className="font-bold underline text-amber-200">{nextRuleName}</span> (às <span className="font-bold">{nextTimeLabel}</span>). Salve suas alterações.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end pt-1 sm:pt-0">
            <button
              onClick={handleManualTriggerNow}
              disabled={isSyncing}
              className="bg-slate-900 hover:bg-slate-950 text-amber-300 border border-amber-400/60 px-3.5 py-2 rounded-lg font-mono text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
            >
              {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin text-amber-400" /> : <RefreshCw className="h-4 w-4" />}
              <span>{isSyncing ? 'Sincronizando...' : 'Trocar Banco Agora'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 1 MINUTE URGENT WARNING BANNER */}
      {warningLevel === '1m' && (
        <div className="bg-red-950 text-white px-3 sm:px-4 py-3 sm:py-3.5 text-xs font-bold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-4 border-red-500 shadow-2xl animate-pulse w-full">
          <div className="flex items-start space-x-2.5 sm:space-x-3 min-w-0 flex-1 w-full">
            <div className="bg-red-600 text-white p-1.5 sm:p-2 rounded-lg shrink-0 shadow-lg animate-ping mt-0.5">
              <ShieldAlert className="h-4 sm:h-5 w-4 sm:w-5" />
            </div>
            <div className="min-w-0 space-y-1.5 flex-1 w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="font-black uppercase tracking-wider text-red-400 text-xs sm:text-sm block leading-snug break-words">
                  🚨 ATENÇÃO: TROCA DE BANCO DE DADOS EM 1 MINUTO
                </span>
                <span className="font-mono font-black text-amber-300 bg-red-900 px-2 py-0.5 rounded text-xs sm:text-sm border border-red-500 shadow-md">
                  Faltam {remainingFormatted}
                </span>
              </div>
              <div className="text-red-100 font-medium text-[11px] sm:text-xs block leading-relaxed space-y-1.5 break-words">
                <p>
                  A troca de banco de dados para o <span className="font-bold underline text-white">{nextRuleName}</span> ocorrerá em menos de 1 minuto!
                </p>
                {switchRequester ? (
                  <div>
                    <span className="bg-amber-400 text-slate-950 font-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs uppercase tracking-wide inline-flex items-center gap-1 shadow-sm border border-amber-300 break-words max-w-full">
                      👤 {switchType === 'manual' ? `Troca Manual Solicitada Por: ${switchRequester}` : `Agendamento Automático: ${switchRequester}`}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="bg-amber-400 text-slate-950 font-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-xs uppercase tracking-wide inline-flex items-center gap-1 shadow-sm border border-amber-300 break-words max-w-full">
                      👤 Solicitado por: Gestor Administrador
                    </span>
                  </div>
                )}
                <p className="text-red-200 text-[10px] sm:text-[11px]">
                  Por favor, suspenda qualquer cadastro ou movimentação e aguarde a troca ser finalizada.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end pt-1 sm:pt-0">
            <button
              onClick={handleManualTriggerNow}
              disabled={isSyncing}
              className="bg-red-600 hover:bg-red-500 text-white border border-red-300 px-3.5 sm:px-4 py-2 rounded-lg font-mono text-xs font-black flex items-center justify-center space-x-2 cursor-pointer shadow-lg transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando Base...' : 'Efetuar Troca Agora'}</span>
            </button>
          </div>
        </div>
      )}

      {/* POPUP MODAL: Conectado ao Próximo Banco de Dados */}
      {switchedModalData && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in" id="db_switched_popup_modal">
          <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500 rounded-2xl shadow-2xl max-w-lg w-full p-4 sm:p-6 text-slate-900 dark:text-white space-y-4 sm:space-y-5 relative overflow-hidden max-h-[92vh] overflow-y-auto">
            {/* Top Glow Bar */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 animate-pulse" />

            {/* Modal Header */}
            <div className="flex items-start space-x-3 sm:space-x-4 pt-1">
              <div className="bg-emerald-500/15 border-2 border-emerald-500/40 p-2.5 sm:p-3 rounded-2xl text-emerald-600 dark:text-emerald-400 shrink-0 shadow-lg animate-bounce">
                <Database className="h-6 w-6 sm:h-8 sm:w-8" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2 sm:px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700/60 inline-block break-words">
                  🚨 TROCA GLOBAL DE BANCO CONCLUÍDA
                </span>
                <h2 className="text-base sm:text-lg font-black text-slate-950 dark:text-white uppercase leading-snug break-words">
                  Alterando Para o Próximo Banco de Dados
                </h2>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 space-y-2.5 sm:space-y-3 shadow-inner font-sans">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Novo Banco Ativo:</span>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 self-start sm:self-auto break-words">
                  {switchedModalData.name}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium font-sans">Project ID (Firebase):</span>
                <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-200 break-all">
                  {switchedModalData.projectId}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2 gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium font-sans">Solicitado Por:</span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-sans break-words">
                  {switchedModalData.requestedBy}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium font-sans">Sincronização:</span>
                <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-sans">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Replicado em Tempo Real
                </span>
              </div>
            </div>

            {/* Notice Message */}
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              As credenciais do novo banco de dados foram alteradas com sucesso no servidor e replicadas em tempo real para <strong>todos os usuários da plataforma</strong>. A página será atualizada para carregar a nova conexão.
            </p>

            {/* Countdown Progress & Action Button */}
            <div className="space-y-2.5 sm:space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 font-sans text-[11px] sm:text-xs">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-500 shrink-0" />
                  Recarregando aplicação em instantes...
                </span>
                <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-emerald-600 dark:text-emerald-400 font-black shrink-0">
                  {switchedModalData.countdown}s
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(switchedModalData.countdown / 4) * 100}%` }}
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setSwitchedModalData(null);
                  isSwitchingRef.current = false;
                }}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-lg transition-all transform active:scale-98 cursor-pointer flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>ENTENDIDO / CONTINUAR</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
