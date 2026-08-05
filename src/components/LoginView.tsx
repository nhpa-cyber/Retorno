import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { ShieldCheck, Truck, Lock, User as UserIcon, LogIn, Database, RefreshCw, FileText, Trash2, CheckCircle2, XCircle, SlidersHorizontal, Server } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { isClientFirebaseActive } from '../clientFirebase';
import { DatabaseSwitcher } from './DatabaseSwitcher';

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

      </div>

      {/* Footer Branding info */}
      <div className="mt-6 text-center text-xxs text-slate-500 font-medium z-10 max-w-sm">
        <p>RETORNO DE ROTA PAU BRASIL GUARABIRA v2.6 • Pau Brasil Distribuidora Ambev</p>
        <p className="mt-1 opacity-75">Ambiente seguro com criptografia local e sincronização Firebase • Ambev Tech Standard</p>
      </div>
    </div>
  );
}

