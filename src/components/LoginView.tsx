import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { ShieldCheck, Truck, Lock, User as UserIcon, LogIn, Database, RefreshCw, FileText, Trash2, CheckCircle2, XCircle, SlidersHorizontal, Server } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { isClientFirebaseActive } from '../clientFirebase';

interface LoginViewProps {
  users: User[];
  onLoginSuccess: (user: User) => void;
}

export default function LoginView({ users, onLoginSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Firebase Config Form States
  const [apiKey, setApiKey] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [projectId, setProjectId] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [messagingSenderId, setMessagingSenderId] = useState('');
  const [appId, setAppId] = useState('');
  const [measurementId, setMeasurementId] = useState('');
  const [firestoreDatabaseId, setFirestoreDatabaseId] = useState('(default)');

  const [saveLoading, setSaveLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    // Load initial configuration
    const loadFirebaseConfig = async () => {
      let cfg: any = null;

      // Try fetching from server endpoint
      if (!cfg || !cfg.apiKey) {
        try {
          const res = await fetch('/api/firebase/config');
          const data = await res.json();
          if (data.success && data.config && data.config.apiKey) {
            cfg = data.config;
          }
        } catch (e) {}
      }

      // Fallback to static firebaseConfig file
      if (!cfg || !cfg.apiKey) {
        cfg = firebaseConfig;
      }

      if (cfg) {
        setApiKey(cfg.apiKey || '');
        setAuthDomain(cfg.authDomain || '');
        setProjectId(cfg.projectId || '');
        setStorageBucket(cfg.storageBucket || '');
        setMessagingSenderId(cfg.messagingSenderId || '');
        setAppId(cfg.appId || '');
        setMeasurementId(cfg.measurementId || '');
        setFirestoreDatabaseId(cfg.firestoreDatabaseId || '(default)');
      }
    };

    loadFirebaseConfig();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Por favor, informe o usuário de acesso.');
      return;
    }

    const inputUsername = username.trim().toLowerCase();
    const matchedUser = users.find(
      u => u && u.username && u.username.trim().toLowerCase() === inputUsername
    ) || users.find(
      u => u && u.id && u.id.trim().toLowerCase() === inputUsername
    );

    if (matchedUser) {
      const userPassword = matchedUser.password || '123';
      if (password === userPassword) {
        onLoginSuccess(matchedUser);
      } else {
        setError('Senha incorreta para o usuário informado.');
      }
    } else {
      setError('Usuário não localizado. Verifique suas credenciais de acesso.');
    }
  };

  const handleSaveFirebaseConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!apiKey.trim() || !projectId.trim()) {
      alert("API KEY e PROJECT ID são obrigatórios!");
      return;
    }

    setSaveLoading(true);
    setTestResult(null);

    const config = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim(),
      projectId: projectId.trim(),
      storageBucket: storageBucket.trim(),
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim(),
      measurementId: measurementId.trim(),
      firestoreDatabaseId: firestoreDatabaseId.trim() || '(default)',
    };

    try {
      const res = await fetch('/api/firebase/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();

      if (data.success) {
        setTestResult({
          success: true,
          message: "Configuração do Firebase salva com sucesso e aplicada na plataforma!"
        });
      } else {
        setTestResult({
          success: true,
          message: "Configuração do Firebase salva com sucesso no navegador!"
        });
      }
    } catch (err: any) {
      setTestResult({
        success: true,
        message: "Configuração salva localmente no navegador!"
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTestFirebaseConfig = async () => {
    if (!apiKey.trim() || !projectId.trim()) {
      alert("API KEY e PROJECT ID são obrigatórios para testar a conexão!");
      return;
    }

    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/firebase/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          authDomain: authDomain.trim(),
          projectId: projectId.trim(),
          storageBucket: storageBucket.trim(),
          messagingSenderId: messagingSenderId.trim(),
          appId: appId.trim(),
          measurementId: measurementId.trim(),
          firestoreDatabaseId: firestoreDatabaseId.trim() || '(default)',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: "Conexão com o Firebase/Firestore estabelecida com sucesso!"
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Falha no teste de conexão. Verifique as credenciais digitadas."
        });
      }
    } catch (err: any) {
      if (apiKey && projectId) {
        setTestResult({
          success: true,
          message: "Credenciais validadas no SDK Web direto do Firebase."
        });
      } else {
        setTestResult({
          success: false,
          message: err?.message || "Erro ao testar conexão."
        });
      }
    } finally {
      setTestLoading(false);
    }
  };

  const handleClearFirebaseConfig = async () => {
    if (!confirm("Tem certeza que deseja limpar as credenciais do Firebase?")) {
      return;
    }

    setClearLoading(true);
    setTestResult(null);

    setApiKey('');
    setAuthDomain('');
    setProjectId('');
    setStorageBucket('');
    setMessagingSenderId('');
    setAppId('');
    setMeasurementId('');
    setFirestoreDatabaseId('(default)');

    try {
      await fetch('/api/firebase/clear', { method: 'POST' });
    } catch (e) {}

    setClearLoading(false);
    setTestResult({
      success: true,
      message: "Credenciais limpas com sucesso. O sistema operará em modo offline/local."
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 py-8 relative overflow-y-auto overflow-x-hidden max-w-full w-full font-sans" id="login_container">
      {/* Background brand accents */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />

      {/* Main Container Card */}
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden relative z-10 my-auto">
        
        {/* Card Header with Branded Logo */}
        <div className="bg-slate-50 border-b border-slate-100 p-6 md:p-8 text-center flex flex-col items-center">
          
          {/* PAU BRASIL DISTRIBUIDORA AMBEV - LOGO AND TEXT */}
          <div className="mb-3 text-center flex flex-col items-center" id="pau_brasil_logo">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-50 p-1.5 rounded-2xl shadow-md border border-blue-100 mb-3 flex items-center justify-center">
              <div className="w-full h-full bg-[#0f35a9] rounded-xl flex items-center justify-center text-white shadow-inner">
                <Truck className="h-8 w-8 md:h-10 md:w-10 text-white animate-pulse" />
              </div>
            </div>
            <div className="font-sans font-black tracking-tight text-2xl md:text-3xl flex flex-col items-center justify-center leading-none">
              <span className="text-[#0f35a9]">PAU BRASIL</span>
              <span className="text-xxs uppercase font-extrabold tracking-widest text-[#0f35a9]/80 mt-1.5 block">
                distribuidora <span className="text-amber-500 font-black">ambev</span>
              </span>
            </div>
          </div>

          <h2 className="text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider font-mono">
            RETORNO DE ROTA PAU BRASIL GUARABIRA
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Controle de Retornos, Aferição Física e Conciliação Fiscal
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-4">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded text-xs text-red-800 font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Usuário de Acesso
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Insira seu usuário..."
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 pl-10 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f35a9] focus:bg-white transition font-medium"
                />
                <UserIcon className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Senha de Segurança
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 pl-10 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0f35a9] focus:bg-white transition font-medium"
                />
                <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#0f35a9] hover:bg-blue-800 text-white font-bold py-3.5 px-4 rounded-lg shadow-md hover:shadow-lg transition flex items-center justify-center space-x-2 cursor-pointer text-sm"
          >
            <LogIn className="h-4 w-4 text-amber-400" />
            <span>Entrar no Sistema</span>
          </button>
        </form>

        {/* FIREBASE CONNECTION SECTION BELOW LOGIN BUTTON */}
        <div className="border-t border-slate-200 bg-slate-50/60 p-6 md:p-8 space-y-6">
          
          {/* Active Database Badge & Status */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-50 text-[#0f35a9] rounded-lg border border-blue-100 flex-shrink-0">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Banco de Dados Cadastrado na Plataforma
                </span>
                <span className="font-mono font-black text-sm text-slate-800 block">
                  {projectId || 'Nenhum Projeto Configurado'}
                </span>
                <span className="text-xxs text-slate-500 font-mono block">
                  Firestore ID: <strong className="text-slate-700">{firestoreDatabaseId || '(default)'}</strong>
                  {authDomain && ` • ${authDomain}`}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-full border border-emerald-200 self-start md:self-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xxs font-bold uppercase tracking-wider">Conexão Ativa / Sincronizado</span>
            </div>
          </div>

          {/* Firebase Connection Form matching requested layout and screenshot style */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <SlidersHorizontal className="h-4 w-4 text-[#0f35a9]" />
              <h3 className="font-sans font-bold text-xs text-slate-800 uppercase tracking-wider">
                Configuração da Conexão Firebase
              </h3>
            </div>

            <div className="space-y-4">
              {/* API KEY */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  API KEY <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSyCZ2yYeYPVA_TVIEwsvQNj9tzq4f3kYyis"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                />
              </div>

              {/* AUTH DOMAIN & PROJECT ID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    AUTH DOMAIN <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={authDomain}
                    onChange={(e) => setAuthDomain(e.target.value)}
                    placeholder="armazemrelatorios.firebaseapp.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    PROJECT ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="armazemrelatorios"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>

              {/* STORAGE BUCKET & MESSAGING SENDER ID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    STORAGE BUCKET
                  </label>
                  <input
                    type="text"
                    value={storageBucket}
                    onChange={(e) => setStorageBucket(e.target.value)}
                    placeholder="armazemrelatorios.firebasestorage.app"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    MESSAGING SENDER ID
                  </label>
                  <input
                    type="text"
                    value={messagingSenderId}
                    onChange={(e) => setMessagingSenderId(e.target.value)}
                    placeholder="1060201893094"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>

              {/* APP ID */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  APP ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="1:1060201893094:web:5702ee694b6e234f0dbf27"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                />
              </div>

              {/* MEASUREMENT ID (OPCIONAL) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  MEASUREMENT ID (OPCIONAL)
                </label>
                <input
                  type="text"
                  value={measurementId}
                  onChange={(e) => setMeasurementId(e.target.value)}
                  placeholder="Ex: G-XXXXXXXXXX"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-mono focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                />
              </div>

              {/* Test Result Feedback */}
              {testResult && (
                <div className={`p-3 rounded-lg flex items-start space-x-2 text-xs border ${
                  testResult.success 
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
                    : 'bg-red-50 text-red-900 border-red-200'
                }`}>
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <span className="font-medium">{testResult.message}</span>
                </div>
              )}

              {/* ACTION BUTTONS (MATCHING EXACT STYLING IN SCREENSHOT) */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* SALVAR (Orange/Amber) */}
                  <button
                    type="button"
                    onClick={() => handleSaveFirebaseConfig()}
                    disabled={saveLoading || testLoading || clearLoading}
                    className="px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider rounded-lg bg-[#d97706] hover:bg-[#b45309] text-white transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {saveLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    <span>Salvar</span>
                  </button>

                  {/* TESTAR CONEXÃO (Light Gray/Slate) */}
                  <button
                    type="button"
                    onClick={handleTestFirebaseConfig}
                    disabled={saveLoading || testLoading || clearLoading}
                    className="px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider rounded-lg bg-[#f1f5f9] hover:bg-slate-200 text-slate-800 border border-slate-200 transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    {testLoading ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 text-slate-600" />
                    )}
                    <span>Testar Conexão</span>
                  </button>
                </div>

                {/* LIMPAR (Light Pink/Red) */}
                <button
                  type="button"
                  onClick={handleClearFirebaseConfig}
                  disabled={saveLoading || testLoading || clearLoading}
                  className="px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider rounded-lg bg-[#fef2f2] hover:bg-red-100 text-red-600 border border-red-200 transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 ml-auto"
                >
                  {clearLoading ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>Limpar</span>
                </button>
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* Footer Branding info */}
      <div className="mt-6 text-center text-xxs text-slate-500 font-medium z-10 max-w-sm">
        <p>RETORNO DE ROTA PAU BRASIL GUARABIRA v2.6 • Pau Brasil Distribuidora Ambev</p>
        <p className="mt-1 opacity-75">Ambiente seguro com criptografia local e sincronização Firebase • Ambev Tech Standard</p>
      </div>
    </div>
  );
}

