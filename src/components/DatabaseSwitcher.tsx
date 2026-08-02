import React, { useState, useEffect } from 'react';
import { Database, CheckCircle2, RefreshCw, Server, AlertCircle, ArrowRight, Sparkles, CopyCheck, ArrowLeftRight, Download, FileJson, Layers, ShieldCheck } from 'lucide-react';
import { FIREBASE_PRESETS, getActivePresetId, FirebasePreset } from '../firebasePresets';
import { getActiveFirebaseConfig, switchActiveFirebaseConfig, syncFirebaseData, consolidateAllDataToTargetDatabase } from '../clientFirebase';

interface DatabaseSwitcherProps {
  onSwitchComplete?: () => void;
  compact?: boolean;
}

export const DatabaseSwitcher: React.FC<DatabaseSwitcherProps> = ({ onSwitchComplete, compact = false }) => {
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

  const handleConsolidateAll = async () => {
    const targetPreset = FIREBASE_PRESETS.find(p => p.config.projectId === activeProjectId) || FIREBASE_PRESETS.find(p => p.config.projectId === "banco-01-34be4") || FIREBASE_PRESETS[0];
    if (!targetPreset) return;

    setIsSyncing(true);
    setStatusMessage({
      type: 'success',
      text: `Iniciando consolidação e sincronização unificada de TODOS os dados para o banco '${targetPreset.name}' (${targetPreset.config.projectId})...`
    });

    try {
      const res = await consolidateAllDataToTargetDatabase(targetPreset.config);
      setStatusMessage({
        type: 'success',
        text: `Sincronização concluída com sucesso! ${res.totalSynced} documentos unificados e preservados no banco '${targetPreset.name}' (${targetPreset.config.projectId}).`
      });
      if (onSwitchComplete) {
        onSwitchComplete();
      }
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Erro na consolidação: ${err?.message || 'Falha de conexão'}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSyncAll = async () => {
    if (!currentConfig || !currentConfig.projectId) return;

    // Find target preset
    const otherPreset = FIREBASE_PRESETS.find(p => p.config.projectId !== activeProjectId);
    if (!otherPreset) return;

    setIsSyncing(true);
    setStatusMessage({
      type: 'success',
      text: `Iniciando sincronização completa de rotas, auditorias e alertas de '${activeProjectId}' para '${otherPreset.config.projectId}'...`
    });

    try {
      const res = await syncFirebaseData(currentConfig, otherPreset.config);
      setStatusMessage({
        type: 'success',
        text: `Sincronização concluída com sucesso! ${res.count} registros copiados/sincronizados para '${otherPreset.name}' (${otherPreset.config.projectId}).`
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

      const success = await switchActiveFirebaseConfig(preset.config);
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
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
          <span className="flex items-center gap-1.5">
            <Database className="h-4 w-4 text-blue-600" />
            Alternar Banco de Dados Ativo:
          </span>
          <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border">
            ID: {activeProjectId || 'Nenhum'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {FIREBASE_PRESETS.map((preset) => {
            const isActive = activeProjectId === preset.config.projectId;
            const isLoading = loadingProjectId === preset.config.projectId;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                disabled={isLoading}
                className={`relative p-3 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between ${
                  isActive
                    ? 'bg-blue-50 border-blue-500 shadow-sm ring-2 ring-blue-500/20'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between w-full mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase border ${preset.badgeColor}`}>
                    {preset.badge}
                  </span>
                  {isActive && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />}
                </div>

                <div>
                  <h4 className="font-bold text-xs text-slate-900 truncate">{preset.name}</h4>
                  <p className="font-mono text-[10px] text-slate-500 truncate">{preset.config.projectId}</p>
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
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-600/10 text-blue-600 rounded-xl border border-blue-600/20">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
              Alternador Rápido de Banco de Dados
              <span className="text-[10px] bg-amber-100 text-amber-800 font-mono px-2 py-0.5 rounded-full border border-amber-300">
                1-Clique
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Alterne instantaneamente entre os bancos sem precisar redigitar credenciais.
            </p>
          </div>
        </div>

        <div className="text-right font-mono text-xs">
          <span className="text-[10px] uppercase font-sans text-slate-400 block font-bold">Banco Conectado</span>
          <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg inline-block">
            {activeProjectId || 'Carregando...'}
          </span>
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

      {/* Global Consolidation Feature Box */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-indigo-950 text-white rounded-xl p-4 shadow-md border border-emerald-500/30">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-400" /> Sincronização e Preservação Total
              </span>
              <span className="text-[11px] font-mono text-emerald-300 font-semibold">{activeProjectId || 'banco-01-34be4'}</span>
            </div>
            <h4 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-400" />
              Sincronizar e Preservar Todos os Dados
            </h4>
            <p className="text-xs text-slate-300 max-w-xl">
              Copia e unifica 100% das rotas, liberação de mapas, conferências, baixas, vales, motoristas, veículos e manuais entre <span className="font-mono text-emerald-300 font-bold">banco-01-34be4</span> e <span className="font-mono text-emerald-300 font-bold">banco-02-2fb6b</span> mantendo tudo totalmente sincronizado!
            </p>
          </div>

          <button
            type="button"
            onClick={handleConsolidateAll}
            disabled={isSyncing}
            className="w-full sm:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition active:scale-98 flex items-center justify-center gap-2 cursor-pointer shrink-0 border border-emerald-300/40"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-slate-950" />
                <span>Registrando e Sincronizando Tudo...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>Registrar Tudo de Uma Vez</span>
              </>
            )}
          </button>
        </div>
      </div>

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
