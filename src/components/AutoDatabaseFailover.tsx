import React, { useState, useEffect, useRef } from 'react';
import { Database, AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Server, Sparkles, ShieldAlert } from 'lucide-react';
import { FIREBASE_PRESETS, getActivePresetId } from '../firebasePresets';
import { getActiveFirebaseConfig, switchActiveFirebaseConfig, syncFirebaseData, getIsFirestoreQuotaExceeded, resetFirebaseClientErrors } from '../clientFirebase';

export const AutoDatabaseFailover: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [failoverStep, setFailoverStep] = useState<'detected' | 'syncing' | 'switching' | 'complete' | 'error'>('detected');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [targetPresetName, setTargetPresetName] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(3);
  const isExecutingRef = useRef(false);

  const startAutoFailover = async () => {
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;

    const currentCfg = getActiveFirebaseConfig();
    const activeProjectId = currentCfg?.projectId || '';

    // Find target preset (the other DB)
    const targetPreset = FIREBASE_PRESETS.find(p => p.config.projectId !== activeProjectId) || FIREBASE_PRESETS[1] || FIREBASE_PRESETS[0];
    setTargetPresetName(targetPreset.name);
    setShowModal(true);
    setFailoverStep('detected');
    setStatusMessage(`A plataforma identificou que o limite de LEITURAS do banco atual (${activeProjectId}) foi atingido e os dados deixaram de ser lidos/carregados pelos usuários. Iniciando transição automática para '${targetPreset.name}' em instantes...`);

    // Countdown before switching
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 1000));
    }

    setFailoverStep('syncing');
    setStatusMessage(`Sincronizando dados pendentes para o banco de dados de destino (${targetPreset.config.projectId})...`);

    try {
      if (currentCfg && currentCfg.projectId) {
        await syncFirebaseData(currentCfg, targetPreset.config).catch(err => {
          console.warn("[AutoFailover] Falha na pré-sincronização de failover (normal em quota excedida):", err);
        });
      }
    } catch (e) {
      // ignore
    }

    setFailoverStep('switching');
    setStatusMessage(`Alternando credenciais de conexão para '${targetPreset.name}'...`);

    try {
      const success = await switchActiveFirebaseConfig(targetPreset.config);
      if (success) {
        resetFirebaseClientErrors();
        setFailoverStep('complete');
        setStatusMessage(`Transição concluída com sucesso! A aplicação agora está conectada ao '${targetPreset.name}'. Recarregando página...`);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setFailoverStep('error');
        setStatusMessage("Não foi possível alternar automaticamente o banco de dados. Tente usar o seletor manual.");
        isExecutingRef.current = false;
      }
    } catch (err: any) {
      setFailoverStep('error');
      setStatusMessage(`Erro durante a transição automática: ${err?.message || 'Falha de conexão'}`);
      isExecutingRef.current = false;
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleQuotaExceeded = () => {
      console.warn("[AutoDatabaseFailover] Evento de Cota Excedida detectado! Iniciando failover automático...");
      startAutoFailover();
    };

    const handleManualFailoverTrigger = () => {
      isExecutingRef.current = false;
      startAutoFailover();
    };

    window.addEventListener('firestore_quota_exceeded', handleQuotaExceeded);
    window.addEventListener('trigger_auto_failover', handleManualFailoverTrigger);

    // Initial check
    if (getIsFirestoreQuotaExceeded()) {
      startAutoFailover();
    }

    return () => {
      window.removeEventListener('firestore_quota_exceeded', handleQuotaExceeded);
      window.removeEventListener('trigger_auto_failover', handleManualFailoverTrigger);
    };
  }, []);

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-100 animate-in fade-in duration-300">
      <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl text-white space-y-6 relative overflow-hidden">
        {/* Glow accent effect */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center space-x-4 border-b border-slate-800 pb-4">
          <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400 shrink-0 animate-pulse">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div>
            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-1">
              AUTOMÁTICO • ALTA DISPONIBILIDADE
            </span>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Cota do Banco Atingida
            </h3>
            <p className="text-xs text-slate-400">
              Redirecionando conexão automaticamente para o Banco de Dados 02...
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Progress / Steps display */}
          <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300 flex items-center gap-2">
                <Database className="h-4 w-4 text-sky-400" />
                Destino: <strong className="text-amber-400">{targetPresetName || 'Banco 02'}</strong>
              </span>
              {failoverStep === 'detected' && (
                <span className="font-mono text-amber-400 font-bold animate-pulse">
                  Em {countdown}s...
                </span>
              )}
            </div>

            {/* Stepper Status */}
            <div className="space-y-2 pt-2 text-xs">
              <div className={`flex items-center gap-2.5 ${failoverStep === 'detected' ? 'text-amber-300 font-bold' : 'text-emerald-400'}`}>
                {failoverStep === 'detected' ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>1. Identificação de Cota Excedida</span>
              </div>

              <div className={`flex items-center gap-2.5 ${
                failoverStep === 'syncing' ? 'text-amber-300 font-bold' : (failoverStep === 'switching' || failoverStep === 'complete') ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                {failoverStep === 'syncing' ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                ) : (failoverStep === 'switching' || failoverStep === 'complete') ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-slate-600" />
                )}
                <span>2. Sincronização de segurança antes de migrar</span>
              </div>

              <div className={`flex items-center gap-2.5 ${
                failoverStep === 'switching' ? 'text-amber-300 font-bold' : failoverStep === 'complete' ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                {failoverStep === 'switching' ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-400" />
                ) : failoverStep === 'complete' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-slate-600" />
                )}
                <span>3. Troca de chaves e conexão ao Banco 02</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/80 text-xs text-slate-300 leading-relaxed font-mono">
            {statusMessage}
          </div>
        </div>

        {failoverStep === 'error' && (
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                isExecutingRef.current = false;
                startAutoFailover();
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar Novamente
            </button>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
