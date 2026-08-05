import React, { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle, ArrowRight, RefreshCw, CheckCircle2, ShieldAlert, Sparkles, Volume2 } from 'lucide-react';
import { getUpcomingDatabaseSwitchInfo, isAutoScheduleEnabled, UpcomingSwitchInfo, triggerGlobalDatabaseSwitch } from '../utils/databaseScheduler';
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
  const isSwitchingRef = useRef<boolean>(false);
  const lastWarnedLevel = useRef<string>('none');

  const activeConfig = getActiveFirebaseConfig();
  const activeProjectId = activeConfig?.projectId || 'banco-01-34be4';

  // Determine next target preset
  const currentIndex = FIREBASE_PRESETS.findIndex(p => p.config.projectId === activeProjectId);
  const nextPresetIndex = (currentIndex + 1) % FIREBASE_PRESETS.length;
  const simulatedNextPreset = FIREBASE_PRESETS[nextPresetIndex] || FIREBASE_PRESETS[0];

  const performSwitch = async (targetPresetConfig: any, targetName: string) => {
    if (isSwitchingRef.current) return;
    isSwitchingRef.current = true;
    setIsSyncing(true);

    try {
      console.log(`[DatabaseScheduler] Executando troca para ${targetName} (${targetPresetConfig.projectId})...`);
      
      const success = await switchActiveFirebaseConfig(targetPresetConfig);
      if (success) {
        setCompletedMessage(`Troca de Banco de Dados Concluída! Conectado ao ${targetName} (${targetPresetConfig.projectId}).`);
        if (onDatabaseSwitched) onDatabaseSwitched();

        setTimeout(() => {
          setCompletedMessage(null);
          window.location.reload();
        }, 1200);
      }
    } catch (err) {
      console.error("[DatabaseScheduler] Falha na troca de banco:", err);
    } finally {
      setIsSyncing(false);
      isSwitchingRef.current = false;
    }
  };

  const [pendingTarget, setPendingTarget] = useState<{ config: any; name: string } | null>(null);

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

    window.addEventListener('trigger_db_simulated_countdown', handleSimulateEvent);
    window.addEventListener('server_pending_switch_updated', handleServerPendingSwitch);

    return () => {
      window.removeEventListener('trigger_db_simulated_countdown', handleSimulateEvent);
      window.removeEventListener('server_pending_switch_updated', handleServerPendingSwitch);
    };
  }, []);

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
    // Poll server active config and pending switch every 1.0s as fallback
    const pollServerConfig = async () => {
      try {
        const res = await fetch('/api/firebase/config');
        if (res.ok) {
          const data = await res.json();

          if (data.pendingSwitch && data.pendingSwitch.switchAtTimestamp) {
            const remMs = data.pendingSwitch.switchAtTimestamp - Date.now();
            if (remMs > 0) {
              const remSecs = Math.max(1, Math.ceil(remMs / 1000));
              setSimulationSeconds(remSecs);
              if (data.pendingSwitch.requestedBy) {
                setSwitchRequester(data.pendingSwitch.requestedBy);
              }
              if (data.pendingSwitch.requestedType) {
                setSwitchType(data.pendingSwitch.requestedType);
              }
              if (data.pendingSwitch.targetConfig) {
                setPendingTarget({
                  config: data.pendingSwitch.targetConfig,
                  name: data.pendingSwitch.targetName || 'Novo Banco'
                });
              }
            } else if (!isSwitchingRef.current) {
              setSimulationSeconds(null);
              const targetConfig = data.pendingSwitch.targetConfig || simulatedNextPreset.config;
              const targetName = data.pendingSwitch.targetName || simulatedNextPreset.name;
              performSwitch(targetConfig, targetName);
            }
          } else {
            // No pending switch active on server
            setSimulationSeconds(null);
            setPendingTarget(null);
          }

          if (data.success && data.config && data.config.projectId) {
            const currentLocalConfig = getActiveFirebaseConfig();
            if (currentLocalConfig?.projectId !== data.config.projectId && !isSwitchingRef.current) {
              console.log(`[DatabaseScheduler] Servidor trocou para ${data.config.projectId}. Atualizando dispositivo...`);
              await switchActiveFirebaseConfig(data.config);
              window.location.reload();
            }
          }
        }
      } catch (e) {}
    };

    pollServerConfig();
    const pollTimer = setInterval(pollServerConfig, 1000);

    const checkSchedule = () => {
      const enabled = isAutoScheduleEnabled();
      setAutoEnabled(enabled);
      const info = getUpcomingDatabaseSwitchInfo(new Date());
      setSwitchInfo(info);

      // Play sound or log when warning level changes
      if (info.warningLevel !== lastWarnedLevel.current) {
        lastWarnedLevel.current = info.warningLevel;
        if (info.warningLevel !== 'none') {
          console.log(`[DatabaseScheduler] Warning Level: ${info.warningLevel} - ${info.remainingFormatted} remaining before switch to ${info.nextRule.name}`);
        }
      }

      // Check if trigger time reached
      if (info.shouldTriggerNow && !isSwitchingRef.current && enabled) {
        if (info.nextPreset && activeProjectId !== info.nextPreset.config.projectId) {
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
      clearInterval(pollTimer);
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

  // Don't render banner if no active server countdown and warning level is 'none'
  if (!hasActiveServerCountdown && warningLevel === 'none') {
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
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-slate-950 px-4 py-3 text-xs font-medium flex flex-wrap items-center justify-between gap-3 border-b-2 border-amber-400 shadow-xl">
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            <div className="bg-slate-950 text-amber-400 p-2 rounded-lg shrink-0 mt-0.5 shadow-md">
              <Clock className="h-5 w-5 animate-pulse" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold uppercase tracking-wider text-slate-950 text-xs bg-amber-400/90 px-2 py-0.5 rounded border border-amber-700/40 shadow-xs">
                  ⚠️ ATENÇÃO: TROCA AUTOMÁTICA DE BANCO DE DADOS EM INSTANTES
                </span>
                <span className="font-mono font-black text-slate-950 bg-amber-200 px-2 py-0.5 rounded text-xs border border-amber-600/50 shadow-xs">
                  Faltam {remainingFormatted} para a comutação
                </span>
              </div>
              <p className="text-slate-950 font-semibold text-xs leading-relaxed">
                Haverá a mudança do banco de dados para o <span className="font-bold underline text-slate-950">{nextRuleName}</span> às <span className="font-bold">{nextTimeLabel}</span>. 
                Se você estiver realizando alguma movimentação ou lançamento na plataforma neste intervalo, aguarde a conclusão da troca do banco de dados antes de continuar para evitar ter que refazer o procedimento.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 ml-auto">
            <button
              onClick={handleManualTriggerNow}
              disabled={isSyncing}
              className="bg-slate-950 hover:bg-slate-900 text-amber-400 border border-amber-500/40 px-3.5 py-2 rounded-lg font-mono text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{isSyncing ? 'Sincronizando...' : 'Antecipar Troca Agora'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 5 MINUTE WARNING BANNER */}
      {warningLevel === '5m' && (
        <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 text-white px-4 py-3 text-xs font-medium flex flex-wrap items-center justify-between gap-3 border-b-2 border-orange-400 shadow-xl animate-pulse">
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            <div className="bg-slate-950 text-orange-400 p-2 rounded-lg shrink-0 mt-0.5 shadow-md">
              <AlertTriangle className="h-5 w-5 text-orange-400 animate-bounce" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold uppercase tracking-wider text-amber-200 text-xs bg-slate-950/90 px-2 py-0.5 rounded border border-amber-400/40 shadow-xs">
                  ⏰ ATENÇÃO: TROCA DE BANCO DE DADOS EM 5 MINUTOS
                </span>
                <span className="font-mono font-black text-amber-200 bg-slate-950 px-2 py-0.5 rounded text-xs border border-amber-400/50 shadow-xs">
                  Faltam {remainingFormatted} para a comutação
                </span>
              </div>
              <p className="text-white font-medium text-xs leading-relaxed">
                Restam apenas 5 minutos para a transição para o <span className="font-bold underline text-amber-200">{nextRuleName}</span> (às <span className="font-bold">{nextTimeLabel}</span>). 
                Salve suas alterações ou aguarde o encerramento da troca do banco de dados para evitar retrabalhos na plataforma.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 ml-auto">
            <button
              onClick={handleManualTriggerNow}
              disabled={isSyncing}
              className="bg-slate-900 hover:bg-slate-950 text-amber-300 border border-amber-400/60 px-3.5 py-2 rounded-lg font-mono text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin text-amber-400" /> : <RefreshCw className="h-4 w-4" />}
              <span>{isSyncing ? 'Sincronizando...' : 'Trocar Banco Agora'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 1 MINUTE URGENT WARNING BANNER */}
      {warningLevel === '1m' && (
        <div className="bg-red-950 text-white px-4 py-3.5 text-xs font-bold flex flex-wrap items-center justify-between gap-3 border-b-4 border-red-500 shadow-2xl animate-pulse">
          <div className="flex items-start space-x-3 min-w-0 flex-1">
            <div className="bg-red-600 text-white p-2 rounded-lg shrink-0 shadow-lg animate-ping mt-0.5">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black uppercase tracking-wider text-red-400 text-sm block">
                  🚨 ATENÇÃO: TROCA DE BANCO DE DADOS EM 1 MINUTO
                </span>
                <span className="font-mono font-black text-amber-300 bg-red-900 px-2.5 py-0.5 rounded text-sm border border-red-500 shadow-md">
                  Faltam {remainingFormatted}
                </span>
              </div>
              <div className="text-red-100 font-medium text-xs block leading-relaxed space-y-1">
                <p>
                  A troca de banco de dados para o <span className="font-bold underline text-white">{nextRuleName}</span> ocorrerá em menos de 1 minuto!
                </p>
                {switchRequester ? (
                  <div className="pt-0.5">
                    <span className="bg-amber-400 text-slate-950 font-black px-2.5 py-1 rounded-md text-xs uppercase tracking-wide inline-flex items-center gap-1 shadow-sm border border-amber-300">
                      👤 {switchType === 'manual' ? `Troca Manual Solicitada Por: ${switchRequester}` : `Agendamento Automático: ${switchRequester}`}
                    </span>
                  </div>
                ) : (
                  <div className="pt-0.5">
                    <span className="bg-amber-400 text-slate-950 font-black px-2.5 py-1 rounded-md text-xs uppercase tracking-wide inline-flex items-center gap-1 shadow-sm border border-amber-300">
                      👤 Solicitado por: Gestor Administrador
                    </span>
                  </div>
                )}
                <p className="text-red-200 text-[11px]">
                  Por favor, suspenda qualquer cadastro ou movimentação e aguarde a troca ser finalizada.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0 ml-auto">
            <button
              onClick={handleManualTriggerNow}
              disabled={isSyncing}
              className="bg-red-600 hover:bg-red-500 text-white border border-red-300 px-4 py-2 rounded-lg font-mono text-xs font-black flex items-center space-x-2 cursor-pointer shadow-lg transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando Base...' : 'Efetuar Troca Agora'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
