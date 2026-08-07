import React, { useState, useEffect } from 'react';
import { Database, CheckCircle2, RefreshCw, Server, AlertCircle, ArrowRight, Sparkles, CopyCheck, ArrowLeftRight, Download, FileJson, Clock, Calendar, Bell, Edit3, Save, RotateCcw, X, Sliders } from 'lucide-react';
import { FIREBASE_PRESETS, getActivePresetId, FirebasePreset } from '../firebasePresets';
import { getActiveFirebaseConfig, switchActiveFirebaseConfig, syncFirebaseData } from '../clientFirebase';
import { DEFAULT_SCHEDULE_RULES, getScheduleRules, saveScheduleRules, resetScheduleRulesToDefault, ScheduleRule, getUpcomingDatabaseSwitchInfo, isAutoScheduleEnabled, setAutoScheduleEnabled, triggerGlobalDatabaseSwitch, getCurrentScheduledPresetId } from '../utils/databaseScheduler';

interface DatabaseSwitcherProps {
  onSwitchComplete?: () => void;
  compact?: boolean;
  currentUser?: {
    name?: string;
    username?: string;
    role?: string;
  } | null;
}

export const DatabaseSwitcher: React.FC<DatabaseSwitcherProps> = ({ onSwitchComplete, compact = false, currentUser }) => {
  const [currentConfig, setCurrentConfig] = useState<any>(null);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [customProjectId, setCustomProjectId] = useState('');
  const [customAuthDomain, setCustomAuthDomain] = useState('');
  const [customAppId, setCustomAppId] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncBeforeSwitch, setSyncBeforeSwitch] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoScheduleActive, setAutoScheduleActive] = useState<boolean>(isAutoScheduleEnabled());
  const [scheduleInfo, setScheduleInfo] = useState(() => getUpcomingDatabaseSwitchInfo());
  const [rulesList, setRulesList] = useState<ScheduleRule[]>(() => getScheduleRules());
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [scheduleTimes, setScheduleTimes] = useState<{ [id: string]: string }>(() => {
    const initialRules = getScheduleRules();
    const timesMap: { [id: string]: string } = {};
    initialRules.forEach(r => {
      const h = r.triggerHour.toString().padStart(2, '0');
      const m = r.triggerMinute.toString().padStart(2, '0');
      timesMap[r.id] = `${h}:${m}`;
    });
    return timesMap;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setScheduleInfo(getUpcomingDatabaseSwitchInfo());
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleRulesChanged = () => {
      const freshRules = getScheduleRules();
      setRulesList(freshRules);
      setScheduleInfo(getUpcomingDatabaseSwitchInfo());
      const timesMap: { [id: string]: string } = {};
      freshRules.forEach(r => {
        const h = r.triggerHour.toString().padStart(2, '0');
        const m = r.triggerMinute.toString().padStart(2, '0');
        timesMap[r.id] = `${h}:${m}`;
      });
      setScheduleTimes(timesMap);
    };

    window.addEventListener('db_schedule_rules_changed', handleRulesChanged);
    return () => window.removeEventListener('db_schedule_rules_changed', handleRulesChanged);
  }, []);

  const handleSaveCustomTimes = async (andSwitchNow = false) => {
    const currentRules = [...rulesList];
    const updatedRules = currentRules.map(rule => {
      const timeVal = scheduleTimes[rule.id] || `${rule.triggerHour.toString().padStart(2, '0')}:${rule.triggerMinute.toString().padStart(2, '0')}`;
      const [hStr, mStr] = timeVal.split(':');
      const triggerHour = parseInt(hStr, 10) || 0;
      const triggerMinute = parseInt(mStr, 10) || 0;
      return {
        ...rule,
        triggerHour,
        triggerMinute,
        timeLabel: `${hStr.padStart(2, '0')}:${mStr.padStart(2, '0')}`
      };
    });

    await saveScheduleRules(updatedRules);
    setRulesList(getScheduleRules());
    setScheduleInfo(getUpcomingDatabaseSwitchInfo());
    setIsEditingSchedule(false);

    if (andSwitchNow) {
      const requesterText = currentUser 
        ? `${currentUser.name || 'Gestor'} (${currentUser.username || 'g1009'})` 
        : 'Gestor Administrador G1009 (g1009)';
      const targetScheduledPresetId = getCurrentScheduledPresetId();
      const targetPreset = FIREBASE_PRESETS.find(p => p.id === targetScheduledPresetId || p.config.projectId === targetScheduledPresetId) || FIREBASE_PRESETS[0];

      setStatusMessage({
        type: 'success',
        text: `Horários salvos com sucesso! Alternando imediatamente para o banco do turno atual (${targetPreset.name})...`
      });
      await triggerGlobalDatabaseSwitch(5, targetPreset.id, requesterText, 'manual');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setStatusMessage({
        type: 'success',
        text: 'Horários dos turnos atualizados e salvos com sucesso!'
      });
    }
  };

  const handleResetScheduleTimes = async () => {
    await resetScheduleRulesToDefault();
    const freshRules = getScheduleRules();
    setRulesList(freshRules);
    setScheduleInfo(getUpcomingDatabaseSwitchInfo());
    const timesMap: { [id: string]: string } = {};
    freshRules.forEach(r => {
      const h = r.triggerHour.toString().padStart(2, '0');
      const m = r.triggerMinute.toString().padStart(2, '0');
      timesMap[r.id] = `${h}:${m}`;
    });
    setScheduleTimes(timesMap);
    setIsEditingSchedule(false);
    setStatusMessage({
      type: 'success',
      text: 'Horários restaurados para o padrão da plataforma (05:00, 17:00, 20:00).'
    });
  };

  const handleToggleAutoSchedule = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setAutoScheduleActive(val);
    setAutoScheduleEnabled(val);
  };

  const loadConfig = () => {
    const cfg = getActiveFirebaseConfig();
    setCurrentConfig(cfg);
  };

  useEffect(() => {
    loadConfig();

    const handleConfigChange = () => {
      loadConfig();
    };

    window.addEventListener('firebase_config_changed', handleConfigChange);
    return () => {
      window.removeEventListener('firebase_config_changed', handleConfigChange);
    };
  }, []);

  const activeProjectId = currentConfig?.projectId || '';
  const activePresetId = getActivePresetId(activeProjectId);

  const handleManualSyncAll = async () => {
    if (!currentConfig || !currentConfig.projectId) return;

    // Find all other target presets
    const targetPresets = FIREBASE_PRESETS.filter(p => p.config.projectId !== activeProjectId);
    if (targetPresets.length === 0) return;

    setIsSyncing(true);
    setStatusMessage({
      type: 'success',
      text: `Iniciando sincronização de '${activeProjectId}' para todos os outros bancos (${targetPresets.map(p => p.name).join(', ')})...`
    });

    try {
      let totalCount = 0;
      for (const targetPreset of targetPresets) {
        const res = await syncFirebaseData(currentConfig, targetPreset.config);
        totalCount += res.count;
      }
      setStatusMessage({
        type: 'success',
        text: `Sincronização concluída com sucesso! Todos os dados de '${activeProjectId}' foram sincronizados para os 3 bancos (${targetPresets.map(p => p.name).join(', ')}).`
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Erro ao sincronizar dados entre bancos: ${err?.message || 'Falha de conexão'}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSelectPreset = async (preset: FirebasePreset) => {
    if (activeProjectId === preset.config.projectId) {
      setStatusMessage({
        type: 'success',
        text: `O banco '${preset.name}' (${preset.config.projectId}) já está ativo.`
      });
      return;
    }

    setLoadingProjectId(preset.config.projectId);
    setStatusMessage(null);

    try {
      if (syncBeforeSwitch && currentConfig && currentConfig.projectId) {
        setStatusMessage({
          type: 'success',
          text: `Sincronizando todas as informações e rotas de '${currentConfig.projectId}' para '${preset.config.projectId}'...`
        });
        setIsSyncing(true);
        try {
          const res = await syncFirebaseData(currentConfig, preset.config);
          console.log(`[DatabaseSwitcher] Sincronizados ${res.count} documentos.`);
        } catch (syncErr) {
          console.warn("[DatabaseSwitcher] Falha na pré-sincronização:", syncErr);
        } finally {
          setIsSyncing(false);
        }
      }

      const success = await switchActiveFirebaseConfig(preset.config, true, true, !syncBeforeSwitch);
      if (success) {
        setStatusMessage({
          type: 'success',
          text: `Conexão e dados transferidos com sucesso para o banco: ${preset.name} (${preset.config.projectId})`
        });
        if (onSwitchComplete) {
          onSwitchComplete();
        }
        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        setStatusMessage({
          type: 'error',
          text: 'Falha ao alternar banco de dados. Tente novamente.'
        });
      }
    } catch (e: any) {
      setStatusMessage({
        type: 'error',
        text: e?.message || 'Erro ao alternar banco de dados.'
      });
    } finally {
      setLoadingProjectId(null);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customProjectId.trim() || !customApiKey.trim()) {
      setStatusMessage({ type: 'error', text: 'Project ID e API Key são obrigatórios!' });
      return;
    }

    const customCfg = {
      projectId: customProjectId.trim(),
      apiKey: customApiKey.trim(),
      authDomain: customAuthDomain.trim() || `${customProjectId.trim()}.firebaseapp.com`,
      storageBucket: `${customProjectId.trim()}.firebasestorage.app`,
      messagingSenderId: '',
      appId: customAppId.trim(),
      firestoreDatabaseId: '(default)'
    };

    setLoadingProjectId('custom');
    try {
      const success = await switchActiveFirebaseConfig(customCfg);
      if (success) {
        setStatusMessage({
          type: 'success',
          text: `Banco personalizado '${customProjectId.trim()}' ativado!`
        });
        if (onSwitchComplete) onSwitchComplete();
        setTimeout(() => {
          window.location.reload();
        }, 600);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Erro ao aplicar configuração personalizada.' });
    } finally {
      setLoadingProjectId(null);
    }
  };

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-semibold text-slate-700 gap-1">
          <span className="flex items-center gap-1.5">
            <Database className="h-4 w-4 text-blue-600 shrink-0" />
            Alternar Banco de Dados Ativo:
          </span>
          <span className="text-[10px] sm:text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border self-start sm:self-auto">
            ID: {activeProjectId || 'Nenhum'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FIREBASE_PRESETS.map((preset) => {
            const isActive = activeProjectId === preset.config.projectId;
            const isLoading = loadingProjectId === preset.config.projectId;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                disabled={isLoading}
                className={`relative p-2.5 sm:p-3 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                  isActive
                    ? 'bg-blue-50 border-blue-500 shadow-sm ring-2 ring-blue-500/20'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between w-full mb-1.5 gap-1">
                  <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border ${preset.badgeColor} shrink-0`}>
                    {preset.badge}
                  </span>
                  {isActive && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />}
                </div>

                <div className="min-w-0">
                  <h4 className="font-bold text-xs text-slate-900 leading-tight break-words">{preset.name}</h4>
                  <p className="font-mono text-[10px] text-slate-500 truncate mt-0.5">{preset.config.projectId}</p>
                </div>

                {isLoading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center rounded-xl">
                    <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {statusMessage && (
          <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
            statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />}
            <span className="text-[11px] leading-tight">{statusMessage.text}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600/10 text-blue-600 rounded-xl border border-blue-600/20">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
              Alternador Rápido & Agendador de Banco de Dados
              <span className="text-[10px] bg-amber-100 text-amber-800 font-mono px-2 py-0.5 rounded-full border border-amber-300">
                Auto / Manual
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Alterne e simule a troca entre os bancos ativos. As trocas ocorrem automaticamente nos horários ou via simulação.
            </p>
          </div>
        </div>

        <div className="text-right font-mono text-xs">
          <span className="text-[10px] uppercase font-sans text-slate-400 block font-bold">Banco Conectado Atual</span>
          <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg inline-block">
            {activeProjectId || 'Carregando...'}
          </span>
        </div>
      </div>

      {/* QUICK GLOBAL SWITCH BANNER */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white rounded-xl p-4 shadow-md border border-indigo-500/30 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-amber-400 animate-pulse" />
              <span className="font-extrabold text-xs uppercase tracking-wider text-amber-300">
                🚨 TROCA GLOBAL DE BANCO DE DADOS (TODOS OS USUÁRIOS)
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const requesterText = currentUser 
                  ? `${currentUser.name || 'Gestor'} (${currentUser.username || 'g1009'})` 
                  : 'Gestor Administrador G1009 (g1009)';
                const currentIndex = FIREBASE_PRESETS.findIndex(p => p.config.projectId === activeProjectId);
                const nextIndex = (currentIndex + 1) % FIREBASE_PRESETS.length;
                const nextPreset = FIREBASE_PRESETS[nextIndex] || FIREBASE_PRESETS[0];
                await triggerGlobalDatabaseSwitch(5, nextPreset.id, requesterText, 'manual');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              disabled={isSyncing || !!loadingProjectId}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold px-3.5 py-2 rounded-lg text-xs flex items-center space-x-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer shrink-0 active:scale-95 disabled:opacity-50"
            >
              {isSyncing ? <RefreshCw className="h-4 w-4 animate-spin text-slate-950" /> : <ArrowLeftRight className="h-4 w-4" />}
              <span>Troca Instantânea</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const requesterText = currentUser 
                  ? `${currentUser.name || 'Gestor'} (${currentUser.username || 'g1009'})` 
                  : 'Gestor Administrador G1009 (g1009)';
                await triggerGlobalDatabaseSwitch(10, undefined, requesterText, 'manual');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="bg-red-600 hover:bg-red-500 text-white font-extrabold px-4 py-2 rounded-lg text-xs flex items-center space-x-2 shadow-lg hover:shadow-red-500/30 transition-all cursor-pointer shrink-0 active:scale-95 border border-red-400"
            >
              <Clock className="h-4 w-4 animate-spin text-amber-300" />
              <span>🚨 Trocar Banco de Dados (10 Segundos com Regressão)</span>
            </button>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-3 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in duration-200 ${
          statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-red-50 text-red-800 border border-red-300'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />}
          <span className="font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Preset Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIREBASE_PRESETS.map((preset) => {
          const isActive = activeProjectId === preset.config.projectId;
          const isLoading = loadingProjectId === preset.config.projectId;

          return (
            <div
              key={preset.id}
              className={`relative p-4 rounded-xl border transition-all flex flex-col justify-between ${
                isActive
                  ? 'bg-white border-blue-500 shadow-md ring-2 ring-blue-500/20'
                  : 'bg-white hover:border-slate-300 border-slate-200 shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase border ${preset.badgeColor}`}>
                    {preset.badge}
                  </span>
                  {isActive ? (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> ATIVO
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-mono">Disponível</span>
                  )}
                </div>

                <h4 className="font-bold text-sm text-slate-900">{preset.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{preset.description}</p>

                <div className="mt-3 pt-2.5 border-t border-slate-100 font-mono text-[11px] space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-sans">Project ID:</span>
                    <span className="font-semibold text-slate-800">{preset.config.projectId}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  disabled={isActive || isLoading || isSyncing}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-default'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs active:scale-98'
                  }`}
                >
                  {isLoading || isSyncing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>{isSyncing ? 'Sincronizando Dados...' : 'Alternando Banco...'}</span>
                    </>
                  ) : isActive ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span>Banco Atualmente Conectado</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-3.5 w-3.5" />
                      <span>Conectar a Este Banco</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Programação Automática de Troca de Banco */}
      <div className="bg-slate-950 text-white border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 border border-amber-500/50 rounded-xl text-amber-400 shrink-0 shadow-inner">
              <Clock className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <h4 className="font-extrabold text-base text-white flex items-center gap-2 flex-wrap">
                Programação Automática de Troca de Banco
                <span className="text-xs bg-amber-400 text-slate-950 font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider shadow-sm">
                  {isEditingSchedule ? 'Modo Edição' : 'Horários Editáveis'}
                </span>
              </h4>
              <p className="text-xs text-slate-300 mt-1 font-medium">
                Defina e altere os horários dos turnos manualmente. O sistema alterna o banco automaticamente no horário salvo.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsEditingSchedule(!isEditingSchedule)}
              className="flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 px-4 py-2 rounded-xl border border-amber-300 text-xs font-black shadow-md transition cursor-pointer active:scale-95"
            >
              <Edit3 className="h-4 w-4" />
              <span>{isEditingSchedule ? 'Fechar Edição' : '✏️ Alterar Horários'}</span>
            </button>

            <label className="flex items-center gap-2.5 bg-slate-900 hover:bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-700 text-xs text-white cursor-pointer shrink-0 transition shadow-sm">
              <input
                type="checkbox"
                checked={autoScheduleActive}
                onChange={handleToggleAutoSchedule}
                className="rounded border-slate-600 text-amber-500 focus:ring-amber-500 h-4 w-4 cursor-pointer"
              />
              <span className="font-bold">Troca Programada Ativa</span>
            </label>
          </div>
        </div>

        {/* Schedule Rules Table / Editor */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {rulesList.map((rule) => {
            const isTargetNext = scheduleInfo.nextRule.id === rule.id;
            const isCurrentlyActiveSchedule = scheduleInfo.currentPresetId === rule.presetId;

            return (
              <div
                key={rule.id}
                className={`p-4 rounded-xl border transition-all ${
                  isCurrentlyActiveSchedule
                    ? 'bg-amber-500/15 border-amber-400 text-white ring-2 ring-amber-400/40 shadow-md'
                    : 'bg-slate-900 border-slate-800 text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-bold text-sm text-white">{rule.name}</h5>
                  {isCurrentlyActiveSchedule ? (
                    <span className="text-[10px] font-black bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md uppercase tracking-wide">
                      TURNO ATUAL
                    </span>
                  ) : isTargetNext ? (
                    <span className="text-[10px] font-bold bg-blue-500/30 text-blue-300 border border-blue-400/50 px-2 py-0.5 rounded-md uppercase tracking-wide">
                      PRÓXIMO
                    </span>
                  ) : null}
                </div>

                {isEditingSchedule ? (
                  <div className="space-y-2 mt-3 pt-3 border-t border-slate-800">
                    <label className="block text-xs font-extrabold text-amber-400 uppercase tracking-wider">
                      Horário do Turno (HH:MM)
                    </label>
                    <input
                      type="time"
                      value={scheduleTimes[rule.id] || `${rule.triggerHour.toString().padStart(2, '0')}:${rule.triggerMinute.toString().padStart(2, '0')}`}
                      onChange={(e) => setScheduleTimes(prev => ({ ...prev, [rule.id]: e.target.value }))}
                      className="w-full bg-slate-950 border-2 border-amber-400 text-amber-300 font-mono font-black text-base rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-inner"
                    />
                    <p className="text-[11px] text-slate-400 font-medium">Troca automática para <strong className="text-white">{rule.presetId}</strong></p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 text-amber-400 font-mono text-base font-black my-1.5">
                      <Clock className="h-4 w-4 text-amber-400" />
                      <span>{rule.timeLabel}</span>
                    </div>
                    <p className="text-xs text-slate-400 font-mono leading-relaxed">{rule.description}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Edit Action Buttons */}
        {isEditingSchedule && (
          <div className="bg-slate-900 p-4 rounded-xl border border-amber-400/50 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleSaveCustomTimes(false)}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer active:scale-95"
              >
                <Save className="h-4 w-4" />
                <span>Salvar Novos Horários</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveCustomTimes(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-md transition cursor-pointer active:scale-95"
              >
                <Sparkles className="h-4 w-4" />
                <span>Salvar e Alternar Banco Agora</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetScheduleTimes}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                <span>Restaurar Padrão (05h, 17h, 20h)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingSchedule(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Countdown to Next Switch */}
        {autoScheduleActive && (
          <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-inner">
            <div className="flex items-center space-x-2 text-white font-medium">
              <Bell className="h-4 w-4 text-amber-400 shrink-0 animate-pulse" />
              <span>
                Próxima troca automática: <strong className="text-amber-300 font-extrabold">{scheduleInfo.nextRule.name}</strong> às <strong className="text-amber-400 font-mono font-black">{scheduleInfo.nextRule.timeLabel}</strong>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-slate-300 text-xs font-semibold">Tempo restante:</span>
              <span className="font-mono font-black text-amber-300 bg-slate-950 px-3 py-1 rounded-lg border border-amber-500/40 shadow-sm text-xs">
                {scheduleInfo.remainingFormatted}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sync Control Banner */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-blue-900 font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={syncBeforeSwitch}
            onChange={(e) => setSyncBeforeSwitch(e.target.checked)}
            className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
          />
          <span>Transferir e sincronizar automaticamente todas as rotas/dados ao trocar de banco</span>
        </label>

        <button
          type="button"
          onClick={handleManualSyncAll}
          disabled={isSyncing}
          className="text-xs font-bold bg-blue-600 hover:bg-blue-700 active:scale-98 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
        >
          {isSyncing ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowLeftRight className="h-3.5 w-3.5" />
          )}
          <span>Clonar Dados do Banco Ativo para o Outro Banco</span>
        </button>
      </div>

      {/* Export 100% Full JSON Database Banner */}
      <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-emerald-700 shrink-0" />
          <div>
            <span className="block text-xs font-bold text-emerald-950">Exportar Base de Dados Completa (100% JSON)</span>
            <span className="block text-[11px] text-emerald-700">Baixe um arquivo .json estruturado com todas as coleções, rotas, usuários, auditorias e produtos.</span>
          </div>
        </div>
        <a
          href="/api/export-database"
          download="backup_completo_plataforma.json"
          className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Baixar JSON (100%)</span>
        </a>
      </div>

      {/* Custom Database Option */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowCustomForm(!showCustomForm)}
          className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <Server className="h-3.5 w-3.5" />
          {showCustomForm ? 'Ocultar formulário de banco personalizado' : '+ Inserir outro banco de dados Firebase personalizado...'}
        </button>

        {showCustomForm && (
          <form onSubmit={handleCustomSubmit} className="mt-3 p-4 bg-white rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Configurar Banco Personalizado</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Project ID *</label>
                <input
                  type="text"
                  value={customProjectId}
                  onChange={(e) => setCustomProjectId(e.target.value)}
                  placeholder="ex: meu-projeto-123"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">API Key *</label>
                <input
                  type="text"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Auth Domain (Opcional)</label>
                <input
                  type="text"
                  value={customAuthDomain}
                  onChange={(e) => setCustomAuthDomain(e.target.value)}
                  placeholder="meu-projeto.firebaseapp.com"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">App ID (Opcional)</label>
                <input
                  type="text"
                  value={customAppId}
                  onChange={(e) => setCustomAppId(e.target.value)}
                  placeholder="1:123456789:web:abcdef"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={loadingProjectId === 'custom'}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition flex items-center gap-2 cursor-pointer"
              >
                {loadingProjectId === 'custom' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-400" />}
                <span>Salvar & Conectar Banco Personalizado</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
