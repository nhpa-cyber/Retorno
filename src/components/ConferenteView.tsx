import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Driver, Vehicle, Product, ActiveAsset, AuditSession, AuditItem, AuditAssetItem, AuditExchangeItem, ReturnForecast, FiscalAlert, ImportedRoute, isTreatableAssetId, getAssetCode, getAssetCanonicalName } from '../types';
import { ImageDB, PhotoRecord } from '../imageDb';
import { DEFAULT_ACTIVE_ASSETS } from '../data';
import { 
  Play, ClipboardCheck, Search, Plus, Trash2, ArrowRight, AlertTriangle, 
  Clock, RefreshCw, UserCheck, Camera, Upload, Bell, CheckCircle2, 
  MapPin, Calendar, HelpCircle, Eye, EyeOff, AlertCircle, Sparkles, CheckSquare, XCircle, FileSpreadsheet, X,
  ShieldCheck, Calculator, Cloud, CloudOff, Check
} from 'lucide-react';

const formatDateToDiaMesAno = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    if (dateStr.includes('-')) {
      const parts = dateStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
};

const normalizeMapCode = (mapCode: any): string => {
  if (!mapCode) return '';
  const str = String(mapCode).trim();
  const digitsOnly = str.replace(/\D/g, '');
  if (digitsOnly.length > 0) {
    return String(parseInt(digitsOnly, 10));
  }
  return str;
};

interface ConferenteViewProps {
  currentUser: User;
  drivers: Driver[];
  vehicles: Vehicle[];
  products: Product[];
  activeAssets: ActiveAsset[];
  audits: AuditSession[];
  onSaveAudits: (audits: AuditSession[]) => void;
  onSaveDrivers: (drivers: Driver[]) => void;
  onSaveVehicles: (vehicles: Vehicle[]) => void;
  returnForecasts: ReturnForecast[];
  onSaveForecasts: (forecasts: ReturnForecast[]) => void;
  fiscalAlerts: FiscalAlert[];
  onSaveAlerts: (alerts: FiscalAlert[]) => void;
  importedRoutes?: ImportedRoute[];
  onSaveImportedRoutes?: (routes: ImportedRoute[]) => void;
}

export default function ConferenteView({
  currentUser,
  drivers,
  vehicles,
  products,
  activeAssets,
  audits,
  onSaveAudits,
  onSaveDrivers,
  onSaveVehicles,
  returnForecasts,
  onSaveForecasts,
  fiscalAlerts,
  onSaveAlerts,
  importedRoutes = [],
  onSaveImportedRoutes
}: ConferenteViewProps) {
  const getDriverName = (id: string) => id === 'temporario' ? 'Temporário' : (drivers.find(d => d.id === id)?.name || id);
  const getHelperName = (id?: string) => id ? drivers.find(d => d.id === id)?.name || id : 'Sem ajudante';

  // Navigation / active sub-view
  const [activeSession, setActiveSession] = useState<AuditSession | null>(null);

  // Custom Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const requestConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };
  
  // Suspension modal states
  const [showSuspensionModal, setShowSuspensionModal] = useState(false);
  const [suspensionNotesText, setSuspensionNotesText] = useState('');

  
  const getForecastStatusLabel = (f: ReturnForecast) => {
    const matchingAudit = audits.find(a => a.routeMap.toUpperCase() === f.routeMap.toUpperCase());
    const matchingRoute = importedRoutes.find(r => r.routeMap.toUpperCase() === f.routeMap.toUpperCase());
    
    if (f.tripStatus === 'pernoitam') {
      const todayStr = new Date().toISOString().split('T')[0];
      const isClosed = (matchingAudit && (matchingAudit.status === 'finalizado_ok' || matchingAudit.status === 'finalizado_divergente' || matchingAudit.surplusFlowStatus === 'BAIXADO')) || (matchingRoute && matchingRoute.status === 'fechado');
      const isDateRolledOver = f.updatedAt && f.updatedAt.split('T')[0] < todayStr;

      if (!isClosed && !isDateRolledOver && f.status !== 'no_patio') {
        return {
          label: 'PERNOITE',
          color: 'bg-red-100 text-red-700 border-red-300 font-extrabold uppercase'
        };
      }
    }

    if (
      (matchingAudit && (matchingAudit.status === 'em_aberto' || matchingAudit.status === 'conferido_fisico')) ||
      (matchingRoute && (matchingRoute.status === 'conferindo' || matchingRoute.status === 'em_analise'))
    ) {
      return {
        label: 'CONFERINDO / PÁTIO',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-bold uppercase'
      };
    }

    try {
      const timePart = f.eta.includes(' as ') ? f.eta.split(' as ')[0] : f.eta;
      const [hoursStr, minutesStr] = timePart.trim().split(':');
      const etaHours = parseInt(hoursStr, 10);
      const etaMinutes = parseInt(minutesStr, 10) || 0;

      if (!isNaN(etaHours)) {
        const etaTime = new Date();
        etaTime.setHours(etaHours, etaMinutes, 0, 0);

        const currentTime = new Date();
        const diffMs = etaTime.getTime() - currentTime.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours >= -12 && diffHours <= 2) {
          return {
            label: 'CHEGANDO',
            color: 'bg-amber-100 text-amber-800 border-amber-200 font-bold uppercase animate-pulse'
          };
        }
      }
    } catch (e) {
      console.error(e);
    }

    return {
      label: 'EM ROTA',
      color: 'bg-blue-100 text-blue-800 border-blue-200 font-bold uppercase'
    };
  };
  
  // Stopwatch state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const stopwatchInterval = useRef<NodeJS.Timeout | null>(null);

  // Form states for new return
  const [routeMap, setRouteMap] = useState('');
  const [selectedRouteMaps, setSelectedRouteMaps] = useState<string[]>([]);
  const [typedMapInput, setTypedMapInput] = useState('');
  const [plate, setPlate] = useState('');
  const [exchangePlate, setExchangePlate] = useState('');
  const [driverId, setDriverId] = useState('');
  const [helperId, setHelperId] = useState('');
  const [arrivalKm, setArrivalKm] = useState<number | ''>('');
  const [selectedRoutesForUnify, setSelectedRoutesForUnify] = useState<string[]>([]);
  
  // Temporary registration request states
  const [tempPlate, setTempPlate] = useState('');
  const [tempDriverName, setTempDriverName] = useState('');
  const [tempHelperName, setTempHelperName] = useState('');
  
  // Add item search states
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductCode, setSelectedProductCode] = useState('');
  const [productQtyToAdd, setProductQtyToAdd] = useState<number | ''>('');

  // Exchange addition states
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [selectedExchangeProductCode, setSelectedExchangeProductCode] = useState('');
  const [exchangeQtyToAdd, setExchangeQtyToAdd] = useState<number | ''>('');

  // Return forecast scheduler sub-form
  const [showForecastForm, setShowForecastForm] = useState(false);
  const [fcPlate, setFcPlate] = useState('');
  const [fcDriver, setFcDriver] = useState('');
  const [fcHelper, setFcHelper] = useState('');
  const [fcRoute, setFcRoute] = useState('');
  const [fcEta, setFcEta] = useState('');
  const [fcTripStatus, setFcTripStatus] = useState<'retornam' | 'pernoitam'>('retornam');

  // Photos evidence states for active audit
  const [sessionPhotos, setSessionPhotos] = useState<PhotoRecord[]>([]);
  const [photoItemTarget, setPhotoItemTarget] = useState('Geral / Multi-itens');
  const [photoComment, setPhotoComment] = useState('');

  // PA and AG separate evidence states
  const [paSelectedCode, setPaSelectedCode] = useState('Geral / PA');
  const [paComment, setPaComment] = useState('');
  const [agSelectedId, setAgSelectedId] = useState('Geral / AG');
  const [agComment, setAgComment] = useState('');
  
  // Refugo state
  const [refugoAssetId, setRefugoAssetId] = useState<string>('');
  const [refugoQty, setRefugoQty] = useState<number | ''>('');
  const [refugoReason, setRefugoReason] = useState<'BICADA EXTERNA' | 'BICADA INTERNA' | 'QUEBRADA' | 'SEGUNDA (OUTRAS EMPRESAS)' | 'COLORAÇÃO FORA DO PADRÃO' | 'TAMPADA' | 'SUJIDADE INTERNA' | 'SUJIDADE EXTERNA' | 'GARRAFEIRA QUEBRADA'>('BICADA EXTERNA');
  const [refugoPhotos, setRefugoPhotos] = useState<string[]>([]);
  const [refugoFormValues, setRefugoFormValues] = useState<Record<string, { qty: string; reason: string }>>({});
  const [webcamTargetRefugo, setWebcamTargetRefugo] = useState<boolean>(false);

  // Webcam native integration states
  const [showWebcam, setShowWebcam] = useState(false);
  const [isWebcamSimulated, setIsWebcamSimulated] = useState(false);
  const [webcamTarget, setWebcamTarget] = useState<'pa' | 'ag' | 'troca_reposicao' | 'refugo' | null>(null);
  const [exchangeSelectedCode, setExchangeSelectedCode] = useState<string>('');
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSessionIdRef = useRef<string | null>(null);

  const findRegisteredDriver = (val: string): Driver | null => {
    if (!val) return null;
    const rawValUpper = val.trim().toUpperCase();
    if (!rawValUpper) return null;

    const normalizeId = (id: string) => id.toUpperCase().replace(/^G/, '').replace(/^0+/, '').trim();
    const toNumericOnly = (str: string) => str.replace(/\D/g, '').replace(/^0+/, '');

    // 1. Numeric-only match
    const inputNumeric = toNumericOnly(rawValUpper);
    if (inputNumeric) {
      const found = drivers.find(d => toNumericOnly(d.id) === inputNumeric);
      if (found) return found;
    }

    // 2. Exact match on ID
    let found = drivers.find(d => d.id.toUpperCase() === rawValUpper);
    if (found) return found;

    // 3. Normalize ID match
    const cleanVal = rawValUpper.replace(/^G/, '').replace(/^0+/, '').trim();
    if (cleanVal) {
      found = drivers.find(d => normalizeId(d.id) === cleanVal);
      if (found) return found;
    }

    // 4. Extract sequences
    const digitSequences = rawValUpper.match(/\d+/g);
    if (digitSequences) {
      for (const seq of digitSequences) {
        const cleanSeq = seq.replace(/^0+/, '');
        if (cleanSeq) {
          found = drivers.find(d => {
            const dbCleanId = normalizeId(d.id);
            const dbNumericOnly = toNumericOnly(d.id);
            return dbCleanId === cleanSeq || dbNumericOnly === cleanSeq;
          });
          if (found) return found;
        }
      }
    }

    // 5. Exact name match
    found = drivers.find(d => d.name.trim().toLowerCase() === val.toLowerCase());
    if (found) return found;

    // 6. Partial name match
    found = drivers.find(d => {
      const dbName = d.name.trim().toLowerCase();
      const inputName = val.toLowerCase();
      return dbName.includes(inputName) || inputName.includes(dbName);
    });
    if (found) return found;

    return null;
  };

  const autoSelectDriverForRoute = (route: ImportedRoute) => {
    if (!route || !route.driverId) {
      setDriverId('');
      setTempDriverName('');
      return;
    }
    const matched = findRegisteredDriver(route.driverId);
    if (matched) {
      setDriverId(matched.id);
      setTempDriverName('');
    } else {
      setDriverId('solicitar_cadastro');
      setTempDriverName(route.driverId.toUpperCase());
    }
  };

  // Blitz confirmation states
  const [showBlitzModal, setShowBlitzModal] = useState(false);
  const [blitzBoxesChecked, setBlitzBoxesChecked] = useState<number>(10);
  const [blitzAvariasFound, setBlitzAvariasFound] = useState<number>(0);

  // Concurrency tracking state
  const [loadedSessionTime, setLoadedSessionTime] = useState<string | undefined>(undefined);

  // Floating Bottle Calculator states
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calc600, setCalc600] = useState<number | ''>('');

  const handleApplyCalculator = () => {
    if (!activeSession) return;
    const isRecon = activeSession.status === 'reconferencia';

    const updatedAssets = activeSession.assets.map(asset => {
      const code = getAssetCode(asset.assetId, asset.assetName);
      if (code === '899599' && calc600 !== '') {
        const val = Number(calc600);
        return isRecon ? { ...asset, rePhysicalQty: val } : { ...asset, physicalQty: val };
      }
      if ((code === '786238' || code === '27983') && calc600 !== '') {
        const val = Number(calc600) * 24;
        return isRecon ? { ...asset, rePhysicalQty: val } : { ...asset, physicalQty: val };
      }
      return asset;
    });

    const updatedSession = { ...activeSession, assets: updatedAssets };
    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
    alert('Quantidades da calculadora aplicadas com sucesso na contagem física!');
  };

  // Prevent accidental tab closing or reload during active physical conference
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeSession) {
        e.preventDefault();
        e.returnValue = 'Você possui uma conferência física em andamento. Para evitar perda de dados, salve ou finalize antes de sair.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeSession]);

  // Load photos for active session when it changes
  useEffect(() => {
    if (activeSession) {
      loadSessionPhotos(activeSession.id);
      
      // Only reset form inputs if we are switching to a DIFFERENT session
      if (lastSessionIdRef.current !== activeSession.id) {
        lastSessionIdRef.current = activeSession.id;
        if (activeSession.assets && activeSession.assets.length > 0) {
          setRefugoAssetId(activeSession.assets[0].assetId);
        } else {
          setRefugoAssetId('');
        }
        setRefugoQty(1);
        setRefugoReason('BICADA EXTERNA');
        setRefugoPhotos([]);
        setRefugoFormValues({});
      }
    } else {
      lastSessionIdRef.current = null;
      setSessionPhotos([]);
      stopWebcamStream();
    }
  }, [activeSession]);

  // Keep activeSession in sync with updates from parent audits (real-time/collaboration sync, checking for conflicts)
  useEffect(() => {
    if (activeSession) {
      const currentInAudits = audits.find(a => a.id === activeSession.id);
      if (currentInAudits) {
        if (JSON.stringify(currentInAudits) !== JSON.stringify(activeSession)) {
          // If there is an active concurrency conflict, we do NOT auto-overwrite,
          // giving the user the opportunity to resolve or sync via the banner
          const hasConflict = currentInAudits.updatedAt && 
                              loadedSessionTime && 
                              currentInAudits.updatedAt !== loadedSessionTime && 
                              currentInAudits.lastUpdatedBy !== currentUser.name;
          
          if (!hasConflict) {
            let mergedSession = { ...currentInAudits };
            if (!mergedSession.assets || mergedSession.assets.length === 0) {
              const assetsSource = activeAssets && activeAssets.length > 0 ? activeAssets : DEFAULT_ACTIVE_ASSETS;
              mergedSession.assets = assetsSource.map(asset => ({
                assetId: asset.id,
                assetName: asset.name,
                cost: asset.cost,
                physicalQty: 0
              }));
            }
            setActiveSession(mergedSession);
            // Also keep loadedSessionTime updated if we seamlessly merged
            setLoadedSessionTime(currentInAudits.updatedAt);
          }
        }
      } else {
        // If the session is not found in the parent audits list, it might be due to temporary sync lag,
        // local-only creations, or network latency on mobile. To prevent kicking the user out of their
        // active screen (which they perceive as an automatic restart), we DO NOT set activeSession to null.
        console.warn("[ConferenteView] Active session not found in parent audits. Retaining local session in memory.");
      }
    }
  }, [audits, activeSession?.id, loadedSessionTime, currentUser.name, activeAssets]);

  // Auto-repair empty assets array in activeSession for resilience
  useEffect(() => {
    if (activeSession) {
      if (!activeSession.assets || activeSession.assets.length === 0) {
        console.log("Repairing activeSession: assets array is empty or undefined");
        const assetsSource = activeAssets && activeAssets.length > 0 ? activeAssets : DEFAULT_ACTIVE_ASSETS;
        const initialAssets: AuditAssetItem[] = assetsSource.map(asset => ({
          assetId: asset.id,
          assetName: asset.name,
          cost: asset.cost,
          physicalQty: 0
        }));
        
        const updatedSession = { ...activeSession, assets: initialAssets };
        setActiveSession(updatedSession);
        
        const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
        onSaveAudits(updatedAudits);
      }
    }
  }, [activeSession, activeAssets, audits, onSaveAudits]);

  const loadSessionPhotos = async (auditId: string) => {
    try {
      const photos = await ImageDB.getPhotosByAudit(auditId);
      setSessionPhotos(photos);
    } catch (e) {
      console.error('Failed to load photos from IndexedDB:', e);
    }
  };

  // Start ticking stopwatch when session is active
  useEffect(() => {
    if (activeSession && activeSession.status !== 'finalizado_ok' && activeSession.status !== 'finalizado_divergente') {
      const updateStopwatch = () => {
        if (activeSession.isSuspended) {
          setElapsedSeconds(Math.floor((activeSession.totalCountingDurationMs || 0) / 1000));
        } else {
          const baseMs = activeSession.totalCountingDurationMs || 0;
          const currentIntervalMs = activeSession.lastTimerStart 
            ? (Date.now() - new Date(activeSession.lastTimerStart).getTime()) 
            : 0;
          setElapsedSeconds(Math.floor((baseMs + currentIntervalMs) / 1000));
        }
      };
      updateStopwatch();
      stopwatchInterval.current = setInterval(updateStopwatch, 1000);
    } else {
      if (stopwatchInterval.current) clearInterval(stopwatchInterval.current);
      setElapsedSeconds(0);
    }
    return () => {
      if (stopwatchInterval.current) clearInterval(stopwatchInterval.current);
    };
  }, [activeSession]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Auto-persist active session ID in localStorage and restore on mount
  useEffect(() => {
    if (activeSession) {
      localStorage.setItem('conferente_active_session_id', activeSession.id);
    } else {
      localStorage.removeItem('conferente_active_session_id');
    }
  }, [activeSession?.id]);

  useEffect(() => {
    if (!activeSession && audits && audits.length > 0) {
      const savedSessionId = localStorage.getItem('conferente_active_session_id');
      if (savedSessionId) {
        const found = audits.find(a => 
          a.id === savedSessionId && 
          (a.status === 'em_aberto' || a.status === 'reconferencia')
        );
        if (found) {
          handleOpenSession(found);
          return;
        } else {
          localStorage.removeItem('conferente_active_session_id');
        }
      }
      const activeForUser = audits.find(a => 
        (a.status === 'em_aberto' || a.status === 'reconferencia') && 
        a.conferenteId === currentUser.id
      );
      if (activeForUser) {
        handleOpenSession(activeForUser);
      }
    }
  }, []);

  const handleOpenSession = (audit: AuditSession) => {
    const nowStr = new Date().toISOString();
    setLoadedSessionTime(audit.updatedAt);
    
    // Ensure exchanges are populated
    let initialExchanges = audit.exchanges;
    if (!initialExchanges || initialExchanges.length === 0) {
      const matchingRoute = importedRoutes.find(r => r.routeMap.toUpperCase() === audit.routeMap.trim().toUpperCase());
      if (matchingRoute && matchingRoute.exchanges && matchingRoute.exchanges.length > 0) {
        initialExchanges = matchingRoute.exchanges;
      } else {
        initialExchanges = [];
      }
    }

    // Ensure assets are populated
    let initialAssets = audit.assets;
    if (!initialAssets || initialAssets.length === 0) {
      const assetsSource = activeAssets && activeAssets.length > 0 ? activeAssets : DEFAULT_ACTIVE_ASSETS;
      initialAssets = assetsSource.map(asset => ({
        assetId: asset.id,
        assetName: asset.name,
        cost: asset.cost,
        physicalQty: 0
      }));
    }

    // Calculate accumulated elapsed duration from previous session run if active
    let accumulatedMs = audit.totalCountingDurationMs || 0;
    if (!audit.isSuspended && audit.lastTimerStart) {
      const delta = Date.now() - new Date(audit.lastTimerStart).getTime();
      if (delta > 0 && !isNaN(delta)) {
        accumulatedMs += delta;
      }
    }

    // If already suspended, don't start ticking. Else, tick starting now.
    const updatedSession: AuditSession = {
      ...audit,
      lastTimerStart: audit.isSuspended ? undefined : nowStr,
      totalCountingDurationMs: accumulatedMs,
      exchanges: initialExchanges,
      assets: initialAssets
    };
    
    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === audit.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const handleExitSession = () => {
    if (!activeSession) return;
    
    let updatedSession = { ...activeSession };
    if (!activeSession.isSuspended && activeSession.lastTimerStart) {
      const delta = Date.now() - new Date(activeSession.lastTimerStart).getTime();
      updatedSession.totalCountingDurationMs = (activeSession.totalCountingDurationMs || 0) + delta;
    }
    updatedSession.lastTimerStart = undefined; // pause ticking
    
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
    setActiveSession(null);
  };

  const handleUrgentSuspend = (notes: string) => {
    if (!activeSession) return;
    const nowStr = new Date().toISOString();
    
    let updatedSession = { ...activeSession };
    if (!activeSession.isSuspended && activeSession.lastTimerStart) {
      const delta = Date.now() - new Date(activeSession.lastTimerStart).getTime();
      updatedSession.totalCountingDurationMs = (activeSession.totalCountingDurationMs || 0) + delta;
    }
    updatedSession.isSuspended = true;
    updatedSession.suspensionNotes = notes;
    updatedSession.lastTimerStart = undefined; // pause ticking
    updatedSession.history = [
      ...activeSession.history,
      {
        timestamp: nowStr,
        action: 'Contagem Suspensa (Urgência)',
        user: currentUser.name,
        details: `Motivo: ${notes}`
      }
    ];

    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const handleUrgentResume = () => {
    if (!activeSession) return;
    const nowStr = new Date().toISOString();

    const updatedSession: AuditSession = {
      ...activeSession,
      isSuspended: false,
      lastTimerStart: nowStr,
      history: [
        ...activeSession.history,
        {
          timestamp: nowStr,
          action: 'Contagem Retomada',
          user: currentUser.name,
          details: 'Retomado após pausa de urgência.'
        }
      ]
    };

    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const handleUpdateBlitzData = (boxes: number, avarias: number) => {
    if (!activeSession) return;
    const updatedSession = {
      ...activeSession,
      blitzBoxesChecked: boxes,
      blitzAvariasFound: avarias
    };
    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const findMapInfo = (mCode: string) => {
    const mapUpper = mCode.trim().toUpperCase();
    const openItem = openRoutesList.find(x => x.routeMap.toUpperCase() === mapUpper);
    if (openItem) {
      return { plate: openItem.plate, driverName: openItem.driverName };
    }
    const impItem = importedRoutes.find(x => x.routeMap.toUpperCase() === mapUpper);
    if (impItem) {
      return { plate: impItem.plate, driverName: (impItem as any).driverName };
    }
    const audItem = audits.find(a => a.routeMap.toUpperCase() === mapUpper);
    if (audItem) {
      return { plate: audItem.plate, driverName: getDriverName(audItem.driverId) };
    }
    return undefined;
  };

  const handleAddMapTag = (value: string) => {
    const clean = value.trim().toUpperCase();
    if (!clean) return;

    setSelectedRouteMaps(prev => {
      if (prev.includes(clean)) return prev;
      const next = [...prev, clean];

      // Update form fields automatically
      setRouteMap(next.join(' + '));

      // Update plates and driver based on selected maps
      const plates = next.map(m => findMapInfo(m)?.plate).filter(Boolean) as string[];
      const uniquePlates = Array.from(new Set(plates));
      if (uniquePlates.length > 0) {
        setPlate(uniquePlates.join(' / '));
      }

      const firstInfo = findMapInfo(next[0]);
      if (firstInfo) {
        autoSelectDriverForRoute({ driverName: firstInfo.driverName } as any);
      }

      // Also sync selectedRoutesForUnify
      setSelectedRoutesForUnify(next);

      return next;
    });
  };

  const handleRemoveMapTag = (mapToRemove: string) => {
    const cleanToRemove = mapToRemove.trim().toUpperCase();
    setSelectedRouteMaps(prev => {
      const next = prev.filter(m => m !== cleanToRemove);

      // Update form fields automatically
      setRouteMap(next.join(' + '));

      if (next.length === 0) {
        setPlate('');
        setDriverId('');
        setHelperId('');
      } else {
        const plates = next.map(m => findMapInfo(m)?.plate).filter(Boolean) as string[];
        const uniquePlates = Array.from(new Set(plates));
        setPlate(uniquePlates.join(' / '));

        const firstInfo = findMapInfo(next[0]);
        if (firstInfo) {
          autoSelectDriverForRoute({ driverName: firstInfo.driverName } as any);
        }
      }

      // Also sync selectedRoutesForUnify
      setSelectedRoutesForUnify(next);

      return next;
    });
  };

  const handleToggleRouteMap = (mapCode: string) => {
    const uppercaseMap = mapCode.trim().toUpperCase();
    if (!uppercaseMap) return;

    setSelectedRouteMaps(prev => {
      const isAlreadySelected = prev.includes(uppercaseMap);
      let next: string[];
      if (isAlreadySelected) {
        next = prev.filter(m => m !== uppercaseMap);
      } else {
        next = [...prev, uppercaseMap];
      }

      // Automatically update plate, driver, helper based on the updated next list
      if (next.length === 0) {
        setRouteMap('');
        setPlate('');
        setDriverId('');
        setHelperId('');
      } else {
        setRouteMap(next.join(' + '));

        // Find plates of all selected routes
        const plates = next.map(m => findMapInfo(m)?.plate).filter(Boolean) as string[];
        const uniquePlates = Array.from(new Set(plates));
        setPlate(uniquePlates.join(' / '));

        // Find driver of the first selected route
        const firstInfo = findMapInfo(next[0]);
        if (firstInfo) {
          autoSelectDriverForRoute({ driverName: firstInfo.driverName } as any);
        }
      }

      // Also sync selectedRoutesForUnify
      setSelectedRoutesForUnify(next);

      return next;
    });
  };

  const handleStartNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeMap || !plate || !driverId || !arrivalKm) {
      alert('Por favor, preencha todos os campos obrigatórios (Mapa, Placa, Motorista e KM).');
      return;
    }

    // Validation checks for temporary registration requests
    if (plate === 'solicitar_cadastro' && !tempPlate.trim()) {
      alert('Por favor, preencha a placa temporária do veículo solicitado.');
      return;
    }
    if (driverId === 'solicitar_cadastro' && !tempDriverName.trim()) {
      alert('Por favor, preencha o nome do motorista temporário solicitado.');
      return;
    }
    if (helperId === 'solicitar_cadastro' && !tempHelperName.trim()) {
      alert('Por favor, preencha o nome do ajudante temporário solicitado.');
      return;
    }

    // Handle temporary vehicle registration
    let finalPlate = plate;
    if (plate === 'solicitar_cadastro') {
      const plateClean = tempPlate.trim().toUpperCase();
      const existing = vehicles.find(v => v.plate === plateClean);
      if (!existing) {
        const newVeh: Vehicle = {
          plate: plateClean,
          capacityPallets: 10,
          isTemporary: true
        };
        onSaveVehicles([...vehicles, newVeh]);
      }
      finalPlate = plateClean;
    }

    // Handle temporary driver and helper registrations (batch save to avoid state overwrites)
    let finalDriverId = driverId;
    let finalHelperId = helperId;
    let updatedDrivers = [...drivers];
    let driversChanged = false;

    if (driverId === 'solicitar_cadastro') {
      const nameClean = tempDriverName.trim().toUpperCase();
      const existing = drivers.find(d => d.name === nameClean && d.role === 'MOTORISTA');
      if (existing) {
        finalDriverId = existing.id;
      } else {
        const generatedId = `TEMP_M_${Date.now()}`;
        const newDrv: Driver = {
          id: generatedId,
          name: nameClean,
          role: 'MOTORISTA',
          cpf: 'TEMPORÁRIO',
          isTemporary: true
        };
        updatedDrivers.push(newDrv);
        finalDriverId = generatedId;
        driversChanged = true;
      }
    }

    if (helperId === 'solicitar_cadastro') {
      const nameClean = tempHelperName.trim().toUpperCase();
      const existing = drivers.find(d => d.name === nameClean && d.role === 'AJUDANTE');
      if (existing) {
        finalHelperId = existing.id;
      } else {
        const generatedId = `TEMP_A_${Date.now()}`;
        const newHlp: Driver = {
          id: generatedId,
          name: nameClean,
          role: 'AJUDANTE',
          cpf: 'TEMPORÁRIO',
          isTemporary: true
        };
        updatedDrivers.push(newHlp);
        finalHelperId = generatedId;
        driversChanged = true;
      }
    }

    if (driversChanged) {
      onSaveDrivers(updatedDrivers);
    }

    // Parse unifiedMaps from selectedRouteMaps
    let unifiedMaps = selectedRouteMaps.length > 1 ? selectedRouteMaps : undefined;
    let finalRouteMap = routeMap.trim().toUpperCase();

    // Fallback if selectedRouteMaps is empty but routeMap has a typed value
    if (selectedRouteMaps.length === 0 && finalRouteMap) {
      if (finalRouteMap.includes(' + ')) {
        unifiedMaps = finalRouteMap.split(' + ').map(m => m.trim().toUpperCase());
      } else {
        unifiedMaps = undefined;
      }
    } else if (selectedRouteMaps.length > 0) {
      finalRouteMap = selectedRouteMaps.join(' + ');
    }

    // Check if any map in finalRouteMap or unifiedMaps already has an active or reconferência session
    const targetMaps = unifiedMaps && unifiedMaps.length > 0 ? unifiedMaps : [finalRouteMap];
    const targetMapsUpper = targetMaps.map(m => m.trim().toUpperCase());

    const existingActiveSession = audits.find(a => 
      a.routeMap.toUpperCase() === finalRouteMap.toUpperCase() && 
      (a.status === 'em_aberto' || a.status === 'reconferencia')
    );

    if (existingActiveSession) {
      alert(`Aviso: Já existe uma conferência física em andamento para o mapa ${finalRouteMap}. Retomando a sessão existente...`);
      handleOpenSession(existingActiveSession);
      // Clear form
      setRouteMap('');
      setSelectedRouteMaps([]);
      setPlate('');
      setExchangePlate('');
      setDriverId('');
      setHelperId('');
      setArrivalKm('');
      setSelectedRoutesForUnify([]);
      setTempPlate('');
      setTempDriverName('');
      setTempHelperName('');
      return;
    }

    // Search for an existing active/reconferencia audit among member maps to unify/update
    const existingMemberAudit = audits.find(a => 
      (a.status === 'em_aberto' || a.status === 'reconferencia') &&
      (
        targetMapsUpper.includes(a.routeMap.toUpperCase()) ||
        (a.unifiedMaps && a.unifiedMaps.some(um => targetMapsUpper.includes(um.toUpperCase())))
      )
    );

    // Initialize clean audit items & assets
    const assetsSource = activeAssets && activeAssets.length > 0 ? activeAssets : DEFAULT_ACTIVE_ASSETS;
    const initialAssets: AuditAssetItem[] = assetsSource.map(asset => ({
      assetId: asset.id,
      assetName: asset.name,
      cost: asset.cost,
      physicalQty: 0
    }));

    const initialItems: AuditItem[] = [];

    // Initialize and combine exchanges from unified maps if present
    let initialExchanges: AuditExchangeItem[] = [];
    if (unifiedMaps && unifiedMaps.length > 0) {
      const combinedExchangesMap: { [key: string]: AuditExchangeItem } = {};
      unifiedMaps.forEach(mapCode => {
        const r = importedRoutes.find(route => route.routeMap.toUpperCase() === mapCode.toUpperCase());
        if (r && r.exchanges) {
          r.exchanges.forEach(ex => {
            const key = `${ex.productCode}_${ex.type}`;
            if (combinedExchangesMap[key]) {
              combinedExchangesMap[key].qty += ex.qty;
            } else {
              combinedExchangesMap[key] = { ...ex };
            }
          });
        }
      });
      initialExchanges = Object.values(combinedExchangesMap);
    } else {
      const matchingRoute = importedRoutes.find(r => r.routeMap.toUpperCase() === finalRouteMap);
      if (matchingRoute && matchingRoute.exchanges) {
        initialExchanges = matchingRoute.exchanges;
      } else {
        initialExchanges = [];
      }
    }

    const nowStr = new Date().toISOString();
    let sessionToActivate: AuditSession;

    if (existingMemberAudit) {
      const isReconferencia = existingMemberAudit.status === 'reconferencia';
      sessionToActivate = {
        ...existingMemberAudit,
        routeMap: finalRouteMap,
        unifiedMaps: unifiedMaps,
        plate: finalPlate.toUpperCase(),
        exchangePlate: exchangePlate.trim().toUpperCase() || existingMemberAudit.exchangePlate,
        driverId: finalDriverId,
        helperId: finalHelperId || existingMemberAudit.helperId,
        arrivalKm: Number(arrivalKm) || existingMemberAudit.arrivalKm,
        exchanges: initialExchanges.length > 0 ? initialExchanges : existingMemberAudit.exchanges,
        status: isReconferencia ? 'reconferencia' : 'em_aberto',
        history: [
          ...(existingMemberAudit.history || []),
          {
            timestamp: nowStr,
            action: 'Conferência Unificada',
            user: currentUser.name,
            details: `Mapas unificados na mesma conferência: ${finalRouteMap} (KM Chegada: ${arrivalKm})`
          }
        ]
      };

      // Filter out duplicate member audits if any, and place updated session
      const updatedAuditsList = audits.map(a => a.id === existingMemberAudit.id ? sessionToActivate : a)
        .filter(a => {
          if (a.id === sessionToActivate.id) return true;
          const isOtherMemberDuplicate = (a.status === 'em_aberto' || a.status === 'reconferencia') &&
            targetMapsUpper.includes(a.routeMap.toUpperCase());
          return !isOtherMemberDuplicate;
        });

      onSaveAudits(updatedAuditsList);

      if (onSaveImportedRoutes) {
        const updatedRoutes = importedRoutes.map(r => {
          const isMatched = r.routeMap.toUpperCase() === finalRouteMap ||
            (targetMapsUpper.includes(r.routeMap.toUpperCase()));
          if (isMatched) {
            const newStatus: 'reconferir' | 'conferindo' = isReconferencia ? 'reconferir' : 'conferindo';
            return { ...r, status: newStatus };
          }
          return r;
        });
        onSaveImportedRoutes(updatedRoutes);
      }
    } else {
      const newSession: AuditSession = {
        id: 'aud_' + Date.now(),
        routeMap: finalRouteMap,
        unifiedMaps,
        plate: finalPlate.toUpperCase(),
        exchangePlate: exchangePlate.trim().toUpperCase() || undefined,
        driverId: finalDriverId,
        helperId: finalHelperId || undefined,
        arrivalKm: Number(arrivalKm),
        arrivalDate: new Date().toISOString().split('T')[0],
        startTime: nowStr,
        lastTimerStart: nowStr,
        totalCountingDurationMs: 0,
        isSuspended: false,
        status: 'em_aberto',
        conferenteId: currentUser.id,
        items: initialItems,
        assets: initialAssets,
        exchanges: initialExchanges,
        history: [
          {
            timestamp: nowStr,
            action: 'Conferência Física Iniciada',
            user: currentUser.name,
            details: `KM Chegada: ${arrivalKm}${unifiedMaps && unifiedMaps.length > 0 ? ` (Unificados: ${unifiedMaps.join(', ')})` : ''}`
          }
        ]
      };
      sessionToActivate = newSession;
      onSaveAudits([newSession, ...audits]);

      if (onSaveImportedRoutes) {
        const updatedRoutes = importedRoutes.map(r => {
          const isMatched = r.routeMap.toUpperCase() === finalRouteMap ||
            (unifiedMaps && unifiedMaps.some(m => m.toUpperCase() === r.routeMap.toUpperCase()));
          if (isMatched) {
            return { ...r, status: 'conferindo' as const };
          }
          return r;
        });
        onSaveImportedRoutes(updatedRoutes);
      }
    }

    setLoadedSessionTime(sessionToActivate.updatedAt || nowStr);
    handleOpenSession(sessionToActivate);
    
    // Clear form
    setRouteMap('');
    setSelectedRouteMaps([]);
    setPlate('');
    setExchangePlate('');
    setDriverId('');
    setHelperId('');
    setArrivalKm('');
    setSelectedRoutesForUnify([]);
    setTempPlate('');
    setTempDriverName('');
    setTempHelperName('');
  };

  const handleLoadDemoForm = () => {
    const randomMap = 'MAPA-' + Math.floor(100 + Math.random() * 900);
    setRouteMap(randomMap);
    setSelectedRouteMaps([randomMap]);
    if (vehicles.length > 0) setPlate(vehicles[Math.floor(Math.random() * vehicles.length)].plate);
    const motoristas = drivers.filter(d => d.role === 'MOTORISTA');
    const ajudantes = drivers.filter(d => d.role === 'AJUDANTE');
    if (motoristas.length > 0) setDriverId(motoristas[Math.floor(Math.random() * motoristas.length)].id);
    if (ajudantes.length > 0) setHelperId(ajudantes[Math.floor(Math.random() * ajudantes.length)].id);
    setArrivalKm(Math.floor(50000 + Math.random() * 150000));
  };

  const handleAddProductToSession = () => {
    if (!activeSession) return;
    if (!selectedProductCode) {
      alert('Por favor, selecione um produto.');
      return;
    }
    const qty = Number(productQtyToAdd);
    if (isNaN(qty) || qty < 0) {
      alert('Por favor, informe uma quantidade válida.');
      return;
    }
    if (activeSession.status !== 'reconferencia' && qty <= 0) {
      alert('Por favor, informe uma quantidade maior que zero.');
      return;
    }
    
    const prod = products.find(p => p.code === selectedProductCode);
    if (!prod) return;

    const existingIndex = activeSession.items.findIndex(i => i.productCode === selectedProductCode);
    let updatedItems = [...activeSession.items];

    if (existingIndex > -1) {
      if (activeSession.status === 'reconferencia') {
        updatedItems[existingIndex].rePhysicalQty = qty;
      } else {
        updatedItems[existingIndex].physicalQty = qty;
      }
    } else {
      // Find matching imported route for the current session to pull expected fiscal quantity
      const matchingRoute = importedRoutes.find(r => r.routeMap.toUpperCase() === activeSession.routeMap.toUpperCase());
      const matchingRouteItem = matchingRoute?.items?.find(item => item.productCode === selectedProductCode);
      const fiscalQty = matchingRouteItem ? matchingRouteItem.qty : 0;

      const newItem: AuditItem = {
        productCode: prod.code,
        productDescription: prod.description,
        cost: prod.cost,
        physicalQty: activeSession.status === 'reconferencia' ? 0 : qty,
        rePhysicalQty: activeSession.status === 'reconferencia' ? qty : undefined,
        fiscalQty: fiscalQty
      };
      updatedItems.push(newItem);
    }

    const updatedSession = { ...activeSession, items: updatedItems };
    setActiveSession(updatedSession);
    
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);

    setProductSearch('');
    setSelectedProductCode('');
    setProductQtyToAdd('');
  };

  const handleAddExchangeToSession = () => {
    if (!activeSession) return;
    if (!selectedExchangeProductCode) {
      alert('Por favor, selecione um produto para a troca.');
      return;
    }
    const qty = Number(exchangeQtyToAdd) || 0;
    if (qty <= 0) {
      alert('A quantidade deve ser maior que zero.');
      return;
    }
    
    const prod = products.find(p => p.code === selectedExchangeProductCode);
    if (!prod) return;

    const existingExchanges = activeSession.exchanges || [];
    const existingIndex = existingExchanges.findIndex(e => e.productCode === selectedExchangeProductCode && e.type === 'TROCA');
    let updatedExchanges = [...existingExchanges];

    if (existingIndex > -1) {
      updatedExchanges[existingIndex] = {
        ...updatedExchanges[existingIndex],
        qty: updatedExchanges[existingIndex].qty + qty
      };
    } else {
      updatedExchanges.push({
        productCode: prod.code,
        productDescription: prod.description,
        qty: qty,
        type: 'TROCA'
      });
    }

    const updatedSession = {
      ...activeSession,
      exchanges: updatedExchanges
    };

    setActiveSession(updatedSession);
    
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);

    // Reset fields
    setExchangeSearch('');
    setSelectedExchangeProductCode('');
    setExchangeQtyToAdd('');
  };

  const handleDeleteExchangeFromSession = (productCode: string) => {
    if (!activeSession) return;
    const existingExchanges = activeSession.exchanges || [];
    const updatedExchanges = existingExchanges.filter(e => !(e.productCode === productCode && e.type === 'TROCA'));

    const updatedSession = {
      ...activeSession,
      exchanges: updatedExchanges
    };

    setActiveSession(updatedSession);

    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const handleUpdateProductQty = (code: string, val: number) => {
    if (!activeSession) return;
    const updatedItems = activeSession.items.map(item => {
      if (item.productCode === code) {
        if (activeSession.status === 'reconferencia') {
          return { ...item, rePhysicalQty: val };
        } else {
          return { ...item, physicalQty: val };
        }
      }
      return item;
    });

    const updatedSession = { ...activeSession, items: updatedItems };
    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const handleUpdateAssetQty = (assetId: string, val: number) => {
    if (!activeSession) return;
    
    const isRecon = activeSession.status === 'reconferencia';
    
    // Find name of current asset to accurately resolve its code
    const currentAsset = activeSession.assets.find(a => a.assetId === assetId);
    const code = currentAsset ? getAssetCode(assetId, currentAsset.assetName) : assetId;

    // Determine target auto-updates
    let targetCodes: string[] = [];
    let multiplier = 1;
    if (code === '188005') {
      targetCodes = ['188006', 'g_1l'];
      multiplier = 12;
    } else if (code === '863059') {
      targetCodes = ['198214', 'g_300'];
      multiplier = 23;
    }

    const updatedAssets = activeSession.assets.map(asset => {
      if (asset.assetId === assetId) {
        if (isRecon) {
          return { ...asset, rePhysicalQty: val };
        } else {
          return { ...asset, physicalQty: val };
        }
      }
      
      const otherCode = getAssetCode(asset.assetId, asset.assetName);
      if (targetCodes.includes(otherCode) || targetCodes.includes(asset.assetId)) {
        if (isRecon) {
          return { ...asset, rePhysicalQty: val * multiplier };
        } else {
          return { ...asset, physicalQty: val * multiplier };
        }
      }
      return asset;
    });

    const updatedSession = { ...activeSession, assets: updatedAssets };
    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const handleUpdateRefugo = (assetId: string, qtyVal: string, reasonVal: string) => {
    if (!activeSession) return;
    
    // Convert to quantity number
    const qty = qtyVal === '' ? 0 : parseInt(qtyVal, 10) || 0;
    
    // Find asset
    const asset = activeSession.assets.find(a => a.assetId === assetId);
    if (!asset) return;
    
    // Filter out existing refugo for this asset
    const otherRefugos = (activeSession.refugos || []).filter(r => r.assetId !== assetId);
    
    let updatedRefugos = [...otherRefugos];
    
    if (qty > 0) {
      // If qty > 0, we add or update it
      updatedRefugos.push({
        id: 'ref_' + assetId,
        assetId: assetId,
        assetName: asset.assetName,
        qty: qty,
        reason: reasonVal as any
      });
    }
    
    const updatedSession = { ...activeSession, refugos: updatedRefugos };
    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const handleRemoveProduct = (code: string) => {
    if (!activeSession) return;
    const updatedItems = activeSession.items.map(item => {
      if (item.productCode === code) {
        if (activeSession.status === 'reconferencia') {
          return { ...item, rePhysicalQty: undefined };
        } else {
          return { ...item, physicalQty: 0 };
        }
      }
      return item;
    }).filter(item => {
      const hasFiscal = (item.fiscalQty ?? 0) > 0;
      const hasPhysical = (item.physicalQty ?? 0) > 0;
      const hasRecount = item.rePhysicalQty !== undefined;
      
      if (activeSession.status === 'reconferencia') {
        return hasFiscal || hasPhysical || hasRecount;
      }
      return hasFiscal || hasPhysical;
    });

    const updatedSession = { ...activeSession, items: updatedItems };
    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
  };

  const handleConfirmBlitz = () => {
    if (!activeSession) return;
    
    const updatedSession: AuditSession = {
      ...activeSession,
      blitzBoxesChecked: 0,
      blitzAvariasFound: 0
    };
    
    // Update local state first
    setActiveSession(updatedSession);
    const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
    onSaveAudits(updatedAudits);
    
    // Hide the blitz modal
    setShowBlitzModal(false);
    
    // Now call the finalization routine
    setTimeout(() => {
      const isReconferindo = updatedSession.status === 'reconferencia';
      const now = new Date().toISOString();
      const nextStatus = isReconferindo ? 'recontagem_finalizada' : 'conferido_fisico';
      const actionText = isReconferindo ? 'Reconferência Física Finalizada' : 'Conferência Física Finalizada';
      const detailsText = isReconferindo 
        ? `Re-conferido com ${sessionPhotos.length} fotos salvas como prova. Veículo em blitz.` 
        : `Aguardando validação fiscal. Veículo em blitz.`;

      let finalDurationMs = updatedSession.totalCountingDurationMs || 0;
      if (!updatedSession.isSuspended && updatedSession.lastTimerStart) {
        finalDurationMs += Date.now() - new Date(updatedSession.lastTimerStart).getTime();
      }

      const finalizedSession: AuditSession = {
        ...updatedSession,
        items: getMergedFinalItems(updatedSession),
        status: nextStatus,
        reopeningRequested: false,
        endTime: now,
        lastTimerStart: undefined,
        totalCountingDurationMs: finalDurationMs,
        history: [
          ...updatedSession.history,
          {
            timestamp: now,
            action: actionText,
            user: currentUser.name,
            details: detailsText
          }
        ]
      };

      const finalAudits = audits.some(a => a.id === activeSession.id)
        ? audits.map(a => a.id === activeSession.id ? finalizedSession : a)
        : [finalizedSession, ...audits];
      onSaveAudits(finalAudits);

      // Create notification alert for Auxiliar de Logistica
      if (onSaveAlerts && fiscalAlerts) {
        const newAlert: FiscalAlert = {
          id: 'al_' + Date.now(),
          routeMap: activeSession.routeMap,
          plate: activeSession.plate,
          status: isReconferindo ? 'recontagem_finalizada' as const : 'conferido_fisico' as const,
          timestamp: now,
          read: false,
          title: isReconferindo ? 'Recontagem Finalizada (Blitz)' : 'Veículo Conferido (Blitz)',
          message: isReconferindo 
            ? `O conferente ${currentUser.name} finalizou a recontagem com blitz do mapa ${activeSession.routeMap} (${activeSession.plate}).`
            : `O conferente ${currentUser.name} finalizou a conferência física com blitz do mapa ${activeSession.routeMap} (${activeSession.plate}).`,
          targetRole: 'auxiliar_logistica'
        };
        onSaveAlerts([newAlert, ...fiscalAlerts]);
      }

      // Update imported route status on client-side
      if (onSaveImportedRoutes && importedRoutes) {
        const targetMapCodes = (activeSession.unifiedMaps && activeSession.unifiedMaps.length > 0)
          ? activeSession.unifiedMaps.map(m => normalizeMapCode(m).toUpperCase())
          : activeSession.routeMap.split('+').map(m => normalizeMapCode(m).toUpperCase());
        const sessionMapNorm = normalizeMapCode(activeSession.routeMap).toUpperCase();

        const updatedRoutes = importedRoutes.map(r => {
          const rNorm = normalizeMapCode(r.routeMap).toUpperCase();
          const isMatched = rNorm === sessionMapNorm || targetMapCodes.includes(rNorm);
          return isMatched ? { ...r, status: 'em_analise' as const } : r;
        });
        onSaveImportedRoutes(updatedRoutes);
      }

      // Show success feedback
      alert(`Conferência e Blitz finalizadas com sucesso! Rota ${activeSession.routeMap} enviada para conciliação fiscal.`);
      
      // Close session and remove saved active session
      setRefugoPhotos([]);
      localStorage.removeItem('conferente_active_session_id');
      setActiveSession(null);
    }, 100);
  };

  // Action: Complete physical conference & save
  const handleFinishPhysicalAudit = async () => {
    if (!activeSession) return;
    
    // Check if the route is a blitz route and hasn't had the blitz data entered yet
    const matchingRoute = importedRoutes.find(r => r.routeMap.toUpperCase() === activeSession.routeMap.trim().toUpperCase());
    if (matchingRoute?.isBlitz && activeSession.blitzBoxesChecked === undefined) {
      setBlitzBoxesChecked(10);
      setBlitzAvariasFound(0);
      setShowBlitzModal(true);
      return;
    }

    const isReconferindo = activeSession.status === 'reconferencia';

    // If reconferência, photo is OBLIGATORY as proof for driver vales / confrontation
    if (isReconferindo && sessionPhotos.length === 0) {
      alert('ERRO: Como esta é uma Reconferência por divergências apontadas pelo Fiscal, é OBRIGATÓRIO anexar foto(s) de evidência física (ativos de giro ou produtos) como prova documental antes de finalizar.');
      return;
    }

    const now = new Date().toISOString();
    const nextStatus = isReconferindo ? 'recontagem_finalizada' : 'conferido_fisico';
    const actionText = isReconferindo ? 'Reconferência Física Finalizada' : 'Conferência Física Finalizada';
    const detailsText = isReconferindo 
      ? `Re-conferido com ${sessionPhotos.length} fotos salvas como prova.` 
      : 'Aguardando validação fiscal';

    let finalDurationMs = activeSession.totalCountingDurationMs || 0;
    if (!activeSession.isSuspended && activeSession.lastTimerStart) {
      finalDurationMs += Date.now() - new Date(activeSession.lastTimerStart).getTime();
    }

    // Auto-associate any captured refugoPhotos to the refugos in the session
    let updatedRefugos = [...(activeSession.refugos || [])];
    if (refugoPhotos.length > 0 && updatedRefugos.length > 0) {
      const savedPhotoIds: string[] = [];
      for (let pIdx = 0; pIdx < refugoPhotos.length; pIdx++) {
        const photo = refugoPhotos[pIdx];
        const savedRecord = await savePhotoRecordToDb(
          photo,
          `ref_batch_${Date.now()}_${pIdx}`,
          `Refugo e Avarias (${updatedRefugos.length} itens)`,
          'refugo'
        );
        if (savedRecord) {
          savedPhotoIds.push(savedRecord.id);
        }
      }

      if (savedPhotoIds.length > 0) {
        updatedRefugos = updatedRefugos.map((ref, index) => {
          const photoId = savedPhotoIds[index % savedPhotoIds.length] || savedPhotoIds[0];
          return { ...ref, photoId, photoUrl: undefined };
        });
      }
    }

    const updatedSession: AuditSession = {
      ...activeSession,
      items: getMergedFinalItems(activeSession),
      status: nextStatus,
      reopeningRequested: false,
      endTime: now,
      lastTimerStart: undefined,
      totalCountingDurationMs: finalDurationMs,
      refugos: updatedRefugos,
      history: [
        ...activeSession.history,
        {
          timestamp: now,
          action: actionText,
          user: currentUser.name,
          details: detailsText
        }
      ]
    };

    const updatedAudits = audits.some(a => a.id === activeSession.id)
      ? audits.map(a => a.id === activeSession.id ? updatedSession : a)
      : [updatedSession, ...audits];
    onSaveAudits(updatedAudits);

    // Create notification alert for Auxiliar de Logistica
    if (onSaveAlerts && fiscalAlerts) {
      const newAlert: FiscalAlert = {
        id: 'al_' + Date.now(),
        routeMap: activeSession.routeMap,
        plate: activeSession.plate,
        status: isReconferindo ? 'recontagem_finalizada' as const : 'conferido_fisico' as const,
        timestamp: now,
        read: false,
        title: isReconferindo ? 'Recontagem Finalizada' : 'Veículo Conferido',
        message: isReconferindo 
          ? `O conferente ${currentUser.name} finalizou a recontagem do mapa ${activeSession.routeMap} (${activeSession.plate}).`
          : `O conferente ${currentUser.name} finalizou a conferência física do mapa ${activeSession.routeMap} (${activeSession.plate}).`,
        targetRole: 'auxiliar_logistica'
      };
      onSaveAlerts([newAlert, ...fiscalAlerts]);
    }

    // Transition matching ImportedRoute to em_analise (green status)
    if (onSaveImportedRoutes && importedRoutes) {
      const targetMapCodes = (activeSession.unifiedMaps && activeSession.unifiedMaps.length > 0)
        ? activeSession.unifiedMaps.map(m => normalizeMapCode(m).toUpperCase())
        : activeSession.routeMap.split('+').map(m => normalizeMapCode(m).toUpperCase());
      const sessionMapNorm = normalizeMapCode(activeSession.routeMap).toUpperCase();

      const updatedRoutes = importedRoutes.map(r => {
        const rNorm = normalizeMapCode(r.routeMap).toUpperCase();
        const isMatched = rNorm === sessionMapNorm || targetMapCodes.includes(rNorm);
        return isMatched ? { ...r, status: 'em_analise' as const } : r;
      });
      onSaveImportedRoutes(updatedRoutes);
    }

    alert(`${actionText} com sucesso! Enviado para conciliação do Auxiliar de Armazém/Logística.`);
    setRefugoPhotos([]);
    localStorage.removeItem('conferente_active_session_id');
    setActiveSession(null);
  };

  // Webcam stream handlers
  const startWebcam = async (target: 'pa' | 'ag' | 'refugo' | 'troca_reposicao', codeForExchange?: string) => {
    setErrorMsg('');
    if (target === 'refugo') {
      setWebcamTarget('refugo');
      setWebcamTargetRefugo(true);
    } else if (target === 'troca_reposicao') {
      setWebcamTarget('troca_reposicao');
      setWebcamTargetRefugo(false);
      if (codeForExchange) {
        setExchangeSelectedCode(codeForExchange);
      }
    } else {
      setWebcamTarget(target);
      setWebcamTargetRefugo(false);
    }
    setIsWebcamSimulated(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: 640, height: 480 } 
      });
      setWebcamStream(stream);
      setShowWebcam(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 150);
    } catch (err) {
      console.warn('Failed to open native webcam, initiating fallback simulator:', err);
      // Fallback Simulator activated
      setIsWebcamSimulated(true);
      setShowWebcam(true);
    }
  };

  const stopWebcamStream = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    }
    setShowWebcam(false);
    setWebcamTarget(null);
    setWebcamTargetRefugo(false);
  };

  const handleCaptureSnapshot = () => {
    if (!activeSession) return;
    
    // Choose item details based on target
    let currentTargetItem = '';
    let currentTargetComment = '';
    let photoItemTargetType: 'produto' | 'ativo' | 'refugo' | 'troca_reposicao' = 'produto';

    if (webcamTarget === 'pa') {
      currentTargetItem = paSelectedCode;
      currentTargetComment = paComment || 'Evidência de Produto Acabado (PA)';
      photoItemTargetType = 'produto';
    } else if (webcamTarget === 'ag') {
      currentTargetItem = agSelectedId;
      currentTargetComment = agComment || 'Evidência de Ativo de Giro (AG)';
      photoItemTargetType = 'ativo';
    } else if (webcamTarget === 'refugo') {
      currentTargetItem = refugoAssetId;
      currentTargetComment = `Refugo de Ativo: ${refugoReason}`;
      photoItemTargetType = 'refugo';
    } else if (webcamTarget === 'troca_reposicao') {
      currentTargetItem = exchangeSelectedCode;
      const matchedEx = activeSession.exchanges?.find(e => e.productCode === exchangeSelectedCode);
      const desc = matchedEx ? matchedEx.productDescription : 'Troca/Reposição';
      const typeLabel = matchedEx ? matchedEx.type : 'TROCA/REPOSIÇÃO';
      currentTargetComment = `Foto de ${typeLabel}: ${desc}`;
      photoItemTargetType = 'troca_reposicao';
    }

    if (isWebcamSimulated) {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw background simulated warehouse
        if (webcamTargetRefugo) {
          ctx.fillStyle = '#ef4444';
        } else if (photoItemTargetType === 'troca_reposicao') {
          ctx.fillStyle = '#581c87'; // dark purple
        } else {
          ctx.fillStyle = photoItemTargetType === 'produto' ? '#111827' : '#0f172a';
        }
        ctx.fillRect(0, 0, 480, 360);
        
        // Draw some mock pallets/boxes
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        
        if (webcamTargetRefugo) {
          // Draw simulated broken glass/boxes
          ctx.fillStyle = '#fecaca';
          ctx.fillRect(100, 100, 280, 160);
          ctx.fillStyle = '#dc2626';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText("SIMULAÇÃO REFUGO / AVARIA", 130, 160);
          ctx.font = '11px sans-serif';
          ctx.fillText(`MOTIVO: DIVERSOS / EM LOTE`, 130, 190);
          ctx.fillText(`ATIVO: MULTIPLOS RETORNOS`, 130, 210);
        } else if (photoItemTargetType === 'troca_reposicao') {
          // Draw simulated exchange items
          ctx.fillStyle = '#6b21a8'; // purple
          ctx.fillRect(100, 100, 280, 160);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText("SIMULAÇÃO TROCA / REPOSIÇÃO PA", 115, 150);
          ctx.font = '10px sans-serif';
          const matchedEx = activeSession.exchanges?.find(e => e.productCode === exchangeSelectedCode);
          ctx.fillText(`PRODUTO: ${matchedEx ? matchedEx.productDescription : exchangeSelectedCode}`, 115, 180);
          ctx.fillText(`TIPO: ${matchedEx ? matchedEx.type : 'N/A'} • QTD: ${matchedEx ? matchedEx.qty : 0}`, 115, 200);
        } else {
          ctx.fillStyle = photoItemTargetType === 'produto' ? '#f59e0b' : '#3b82f6';
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(60 + i * 95, 100, 80, 110);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(60 + i * 95, 100, 80, 110);
            
            // Draw "AMBEV" text on simulated boxes
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText("AMBEV", 82 + i * 95, 150);
            ctx.font = '8px sans-serif';
            ctx.fillText(photoItemTargetType === 'produto' ? 'PA-PRODUTO' : 'AG-ATIVO', 75 + i * 95, 170);
            
            ctx.fillStyle = photoItemTargetType === 'produto' ? '#f59e0b' : '#3b82f6';
          }
        }
        
        // Draw simulated webcam overlays
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(15, 15, 450, 330);
        
        // Watermark overlay
        ctx.fillStyle = 'rgba(15, 53, 169, 0.8)';
        ctx.fillRect(0, 310, 480, 50);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        let titleLabel = `SIMULADOR CÂMERA INTELIGENTE AMBEV - ${photoItemTargetType.toUpperCase()}`;
        if (webcamTargetRefugo) {
          titleLabel = "SIMULADOR REFUGOS AMBEV";
        } else if (photoItemTargetType === 'troca_reposicao') {
          titleLabel = "SIMULADOR TROCA E REPOSIÇÃO PA AMBEV";
        }
        ctx.fillText(titleLabel, 10, 325);
        ctx.font = '7.5px sans-serif';
        ctx.fillText(`MAPA: ${activeSession.routeMap} • PLACA: ${activeSession.plate} • CONFERENTE: ${currentUser.name}`, 10, 337);
        ctx.fillText(`DATA AUTOMÁTICA: ${new Date().toLocaleString()}`, 10, 347);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        
        if (webcamTargetRefugo) {
          setRefugoPhotos(prev => [...prev, dataUrl]);
          stopWebcamStream();
          alert('Foto do refugo gerada com sucesso pelo simulador!');
          return;
        }

        savePhotoRecordToDb(dataUrl, currentTargetItem, currentTargetComment, photoItemTargetType);
        
        // Clear inputs after capture
        if (webcamTarget === 'pa') {
          setPaComment('');
        } else {
          setAgComment('');
        }
        stopWebcamStream();
        alert('Foto evidência gerada com sucesso pelo simulador!');
        return;
      }
    }

    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Draw video frame
      ctx.drawImage(videoRef.current, 0, 0, 480, 360);
      
      // Draw brand and timestamp watermark (ensures legal and audit legitimacy)
      let watermarkBg = 'rgba(15, 53, 169, 0.75)';
      let titleLabel = `PAU BRASIL AMBEV - PROVA FÍSICA RETORNO`;
      if (webcamTargetRefugo) {
        watermarkBg = 'rgba(220, 38, 38, 0.85)';
        titleLabel = "REFUGO REGISTRADO - CÂMERA AMBEV";
      } else if (photoItemTargetType === 'troca_reposicao') {
        watermarkBg = 'rgba(107, 33, 168, 0.85)'; // purple
        titleLabel = "TROCA / REPOSIÇÃO REGISTRADA - CÂMERA AMBEV";
      }
      ctx.fillStyle = watermarkBg;
      ctx.fillRect(0, 325, 480, 35);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(titleLabel, 10, 338);
      ctx.font = '8px sans-serif';
      ctx.fillText(`Mapa: ${activeSession.routeMap} • Placa: ${activeSession.plate} • Data: ${new Date().toLocaleString()}`, 10, 348);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.65); // high compression, keeps payload ~15KB
      
      if (webcamTargetRefugo) {
        setRefugoPhotos(prev => [...prev, dataUrl]);
        stopWebcamStream();
        alert('Foto do refugo capturada com sucesso pela câmera!');
        return;
      }

      savePhotoRecordToDb(dataUrl, currentTargetItem, currentTargetComment, photoItemTargetType);
      
      if (webcamTarget === 'pa') {
        setPaComment('');
      } else {
        setAgComment('');
      }
      stopWebcamStream();
    }
  };

  const [errorMsg, setErrorMsg] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'pa' | 'ag' | 'troca_reposicao') => {
    const files = e.target.files;
    if (!files || !activeSession) return;

    let currentTargetItem = '';
    let currentTargetComment = '';
    let photoItemTargetType: 'produto' | 'ativo' | 'troca_reposicao' = 'produto';

    if (target === 'pa') {
      currentTargetItem = paSelectedCode;
      currentTargetComment = paComment || 'Evidência de Produto Acabado (PA)';
      photoItemTargetType = 'produto';
    } else if (target === 'ag') {
      currentTargetItem = agSelectedId;
      currentTargetComment = agComment || 'Evidência de Ativo de Giro (AG)';
      photoItemTargetType = 'ativo';
    } else {
      currentTargetItem = 'TROCAS_REUNIDAS';
      currentTargetComment = 'Evidência Fotográfica das Trocas Reunidas';
      photoItemTargetType = 'troca_reposicao';
    }

    (Array.from(files) as File[]).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 480;
          canvas.height = 360;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, 480, 360);
            
            // Draw watermark
            let watermarkBg = 'rgba(15, 53, 169, 0.75)';
            let titleLabel = `PAU BRASIL AMBEV - PROVA REGISTRADA`;
            if (photoItemTargetType === 'troca_reposicao') {
              watermarkBg = 'rgba(107, 33, 168, 0.85)';
              titleLabel = "TROCA / REPOSIÇÃO REGISTRADA - CÂMERA AMBEV";
            }
            ctx.fillStyle = watermarkBg;
            ctx.fillRect(0, 325, 480, 35);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px monospace';
            ctx.fillText(titleLabel, 10, 338);
            ctx.font = '8px sans-serif';
            ctx.fillText(`Mapa: ${activeSession.routeMap} • Placa: ${activeSession.plate} • Data: ${new Date().toLocaleString()}`, 10, 348);
            
            const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
            savePhotoRecordToDb(dataUrl, currentTargetItem, currentTargetComment, photoItemTargetType);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });

    if (target === 'pa') {
      setPaComment('');
    } else if (target === 'ag') {
      setAgComment('');
    }
    
    alert(`Enviando ${files.length} foto(s) de evidência...`);
  };

  const savePhotoRecordToDb = async (base64Photo: string, itemCode: string, comment: string, photoType: 'produto' | 'ativo' | 'refugo' | 'troca_reposicao'): Promise<PhotoRecord | null> => {
    if (!activeSession) return null;
    
    const matchedDriver = drivers.find(d => d.id === activeSession.driverId);
    const dName = matchedDriver ? matchedDriver.name : activeSession.driverId;

    try {
      const saved = await ImageDB.savePhoto({
        auditId: activeSession.id,
        itemCode: itemCode,
        itemName: comment || (photoType === 'produto' ? 'Evidência fotográfica de Produto Acabado (PA).' : 'Evidência fotográfica de Ativo de Giro (AG).'),
        photoUrl: base64Photo,
        conferenteId: currentUser.id,
        driverId: activeSession.driverId,
        driverName: dName,
        type: photoType
      });
      
      // Reload photos list
      loadSessionPhotos(activeSession.id);
      return saved;
    } catch (e) {
      alert('Erro ao salvar foto de evidência no banco de dados local. Limite atingido.');
      return null;
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!activeSession) return;
    requestConfirm(
      "Excluir Imagem",
      "Deseja excluir esta imagem de prova?",
      async () => {
        await ImageDB.deletePhoto(photoId);
        loadSessionPhotos(activeSession.id);
      }
    );
  };

  // Return Forecast Scheduler submit handler
  const handleAddForecast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fcPlate || !fcDriver || !fcRoute || !fcEta) {
      alert('Por favor, informe todos os campos da previsão.');
      return;
    }

    const newFc: ReturnForecast = {
      id: 'fc_' + Date.now(),
      plate: fcPlate.trim().toUpperCase(),
      driverName: fcDriver.trim().toUpperCase(),
      helperName: fcHelper ? fcHelper.trim().toUpperCase() : undefined,
      routeMap: fcRoute.trim().toUpperCase(),
      eta: fcEta,
      status: 'em_rota',
      tripStatus: fcTripStatus,
      updatedAt: new Date().toISOString()
    };

    onSaveForecasts([newFc, ...returnForecasts]);
    setFcPlate('');
    setFcDriver('');
    setFcHelper('');
    setFcRoute('');
    setFcEta('');
    setFcTripStatus('retornam');
    setShowForecastForm(false);
    alert('Nova previsão de retorno cadastrada para monitoramento!');
  };

  const handleUpdateForecastStatus = (id: string, nextStatus: 'em_rota' | 'chegando' | 'no_patio') => {
    const updated = returnForecasts.map(f => {
      if (f.id === id) {
        return { ...f, status: nextStatus, updatedAt: new Date().toISOString() };
      }
      return f;
    });
    onSaveForecasts(updated);
  };

  const handleRemoveForecast = (id: string) => {
    requestConfirm(
      "Remover Previsão",
      "Remover esta previsão de chegada do painel?",
      () => {
        onSaveForecasts(returnForecasts.filter(f => f.id !== id));
      }
    );
  };

  const handleMarkAlertAsRead = (alertId: string) => {
    const updated = fiscalAlerts.map(a => a.id === alertId ? { ...a, read: true } : a);
    onSaveAlerts(updated);
  };

  const handleClearAllAlerts = () => {
    onSaveAlerts([]);
  };

  // Helper to determine if a route is closed based on audits
  const isRouteClosedInAudits = (routeMap: string) => {
    return audits.some(a => 
      (a.routeMap.toUpperCase() === routeMap.toUpperCase() || 
       (a.unifiedMaps && a.unifiedMaps.some(m => m.toUpperCase() === routeMap.toUpperCase()))) &&
      (a.status === 'finalizado_ok' || a.status === 'finalizado_divergente') &&
      !a.reopeningRequested
    );
  };

  // List of all open/pending routes including those requested for reopening
  const openRoutesList = useMemo(() => {
    const list: Array<{
      id: string;
      routeMap: string;
      plate: string;
      driverName?: string;
      status: string;
      isBlitz?: boolean;
      reopeningRequested?: boolean;
      audit?: AuditSession;
    }> = [];

    const processedMaps = new Set<string>();

    // 1. Process imported routes
    (importedRoutes || []).forEach(route => {
      const routeMapUpper = route.routeMap.toUpperCase();
      const routeMapNorm = normalizeMapCode(route.routeMap).toUpperCase();

      const matchingAudit = audits.find(a => {
        const aNorm = normalizeMapCode(a.routeMap).toUpperCase();
        if (aNorm === routeMapNorm || a.routeMap.toUpperCase() === routeMapUpper) return true;
        if (a.unifiedMaps) {
          return a.unifiedMaps.some(m => normalizeMapCode(m).toUpperCase() === routeMapNorm || m.toUpperCase() === routeMapUpper);
        }
        return false;
      });

      const isReopeningReq = matchingAudit?.reopeningRequested === true;
      const isAuditActive = matchingAudit && (matchingAudit.status === 'em_aberto' || matchingAudit.status === 'reconferencia');
      const isSubmittedToFiscal = matchingAudit && (matchingAudit.status === 'conferido_fisico' || matchingAudit.status === 'recontagem_finalizada');
      const isClosed = (isRouteClosedInAudits(route.routeMap) || route.status === 'fechado') && !isReopeningReq;

      // Only include routes that are truly open/pending for physical count
      if ((!isClosed && !isSubmittedToFiscal && route.status !== 'em_analise') || isReopeningReq || isAuditActive) {
        processedMaps.add(routeMapUpper);
        processedMaps.add(routeMapNorm);
        
        let effectiveStatus: string = route.status || 'pendente';
        if (isReopeningReq) {
          effectiveStatus = 'solicitado_reabertura';
        } else if (matchingAudit?.status === 'reconferencia') {
          effectiveStatus = 'reconferir';
        } else if (matchingAudit?.status === 'em_aberto') {
          effectiveStatus = 'conferindo';
        }

        list.push({
          id: route.id,
          routeMap: route.routeMap,
          plate: route.plate,
          driverName: (route as any).driverName,
          status: effectiveStatus,
          isBlitz: !!route.isBlitz,
          reopeningRequested: isReopeningReq,
          audit: matchingAudit
        });
      }
    });

    // 2. Add any audit that has reopeningRequested === true or is active, but wasn't added yet
    (audits || []).forEach(audit => {
      const auditMapUpper = audit.routeMap.toUpperCase();
      const isReopeningReq = audit.reopeningRequested === true;
      const isAuditActive = audit.status === 'em_aberto' || audit.status === 'reconferencia';

      if ((isReopeningReq || isAuditActive) && !processedMaps.has(auditMapUpper)) {
        processedMaps.add(auditMapUpper);

        let effectiveStatus: string = audit.status;
        if (isReopeningReq) {
          effectiveStatus = 'solicitado_reabertura';
        } else if (audit.status === 'reconferencia') {
          effectiveStatus = 'reconferir';
        } else if (audit.status === 'em_aberto') {
          effectiveStatus = 'conferindo';
        }

        list.push({
          id: 'audit_open_' + audit.id,
          routeMap: audit.routeMap,
          plate: audit.plate,
          driverName: getDriverName(audit.driverId),
          status: effectiveStatus,
          isBlitz: false,
          reopeningRequested: isReopeningReq,
          audit: audit
        });
      }
    });

    return list;
  }, [importedRoutes, audits]);

  // Helper stats for today
  const mapsToday = importedRoutes.length;
  const mapsCompletedOk = audits.filter(a => a.status === 'finalizado_ok').length;
  const mapsCompletedDivergent = audits.filter(a => a.status === 'finalizado_divergente').length;
  const mapsInCount = openRoutesList.length;
  const mapsInRecon = audits.filter(a => a.status === 'reconferencia').length;
  const mapsCompletedCount = mapsCompletedOk + mapsCompletedDivergent;

  // Calculate most requested products from historic audits to optimize entry speed
  const productUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    audits.forEach(audit => {
      if (audit.items) {
        audit.items.forEach(item => {
          counts[item.productCode] = (counts[item.productCode] || 0) + (item.physicalQty || 1);
        });
      }
      if (audit.exchanges) {
        audit.exchanges.forEach(exch => {
          counts[exch.productCode] = (counts[exch.productCode] || 0) + (exch.qty || 1);
        });
      }
    });
    return counts;
  }, [audits]);

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => 
        p.description.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.code.includes(productSearch)
      )
      .sort((a, b) => {
        const countA = productUsageCounts[a.code] || 0;
        const countB = productUsageCounts[b.code] || 0;
        return countB - countA;
      })
      .slice(0, 5);
  }, [products, productSearch, productUsageCounts]);

  const filteredExchangeProducts = useMemo(() => {
    return products
      .filter(p => 
        p.description.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
        p.code.includes(exchangeSearch)
      )
      .sort((a, b) => {
        const countA = productUsageCounts[a.code] || 0;
        const countB = productUsageCounts[b.code] || 0;
        return countB - countA;
      })
      .slice(0, 5);
  }, [products, exchangeSearch, productUsageCounts]);

  const getMergedFinalItems = (session: AuditSession): AuditItem[] => {
    const routeItems: { [key: string]: AuditItem } = {};
    const mapsToSearch = session.unifiedMaps && session.unifiedMaps.length > 0
      ? session.unifiedMaps
      : [session.routeMap];

    mapsToSearch.forEach(mapCode => {
      const r = importedRoutes.find(route => route.routeMap.toUpperCase() === mapCode.toUpperCase());
      if (r && r.items) {
        r.items.forEach(item => {
          const prod = products.find(p => p.code === item.productCode);
          const cost = prod ? prod.cost : 0;
          if (routeItems[item.productCode]) {
            routeItems[item.productCode].fiscalQty = (routeItems[item.productCode].fiscalQty || 0) + item.qty;
          } else {
            routeItems[item.productCode] = {
              productCode: item.productCode,
              productDescription: item.productDescription,
              cost: cost,
              physicalQty: 0,
              fiscalQty: item.qty
            };
          }
        });
      }
    });

    const finalizedItems: AuditItem[] = Object.values(routeItems).map(routeItem => {
      const checkerItem = session.items.find(i => i.productCode === routeItem.productCode);
      if (checkerItem) {
        return {
          ...routeItem,
          physicalQty: checkerItem.physicalQty ?? 0,
          rePhysicalQty: checkerItem.rePhysicalQty
        };
      }
      return routeItem;
    });

    // Also include any custom items that the checker added which were NOT on the route maps
    session.items.forEach(checkerItem => {
      if (!routeItems[checkerItem.productCode]) {
        finalizedItems.push(checkerItem);
      }
    });

    return finalizedItems;
  };

  const visibleItems = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.items.filter(item => {
      if (activeSession.status === 'reconferencia') {
        return (item.physicalQty ?? 0) > 0 || (item.fiscalQty ?? 0) > 0 || item.rePhysicalQty !== undefined;
      }
      return item.physicalQty > 0;
    });
  }, [activeSession]);

  const pendingOrActiveAudits = audits.filter(a => 
    a.status === 'em_aberto' || a.status === 'reconferencia' || a.reopeningRequested === true
  );

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-8 animate-fade-in" id="conferente_view">
      
      {/* Banner / Instructions with Pau Brasil distribution look */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 mb-8 text-white shadow-xl border border-blue-900 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <ClipboardCheck className="h-40 w-40 text-blue-500" />
        </div>
        <div className="relative z-10">
          <span className="bg-[#38bdf8] text-slate-950 font-mono text-xxs font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
            PAU BRASIL • Distribuição Ambev Tech
          </span>
          <h1 className="text-3xl font-sans font-bold tracking-tight text-white mt-3 flex items-center gap-2">
            Aferição Física de Retornos de Rota
          </h1>
          <p className="text-slate-300 mt-2 max-w-3xl text-sm leading-relaxed">
            Área de recepção do conferente físico. Realize as contagens de PA (Cegas) e de AG. Em caso de reconferência por divergência fiscal, <strong>a evidência fotográfica é obrigatória</strong> para a geração segura de vales do motorista.
          </p>
        </div>
      </div>

      {/* PERSISTENT ALERTS BANNER PANEL */}
      {(() => {
        const relevantAlerts = (fiscalAlerts || []).filter(a => 
          !a.read && (a.targetRole === 'conferente' || a.targetRole === 'todos' || !a.targetRole)
        );
        if (relevantAlerts.length === 0) return null;

        return (
          <div className="mb-8 bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 shadow-sm space-y-4 animate-fade-in" id="persistent_alerts_panel">
            <div className="flex items-center justify-between border-b border-amber-200 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600 border border-amber-200">
                  <AlertCircle className="h-5 w-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="font-sans font-extrabold text-slate-900 text-sm uppercase tracking-wide">
                    Alertas do Fiscal de Baixa ({relevantAlerts.length})
                  </h3>
                  <p className="text-slate-500 text-xxs font-sans">
                    Novas solicitações de recontagem ou avisos importantes da balança/fiscalia.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  const updated = fiscalAlerts.map(a => 
                    (a.targetRole === 'conferente' || a.targetRole === 'todos' || !a.targetRole) ? { ...a, read: true } : a
                  );
                  onSaveAlerts && onSaveAlerts(updated);
                }}
                className="text-amber-800 hover:text-amber-950 font-sans font-bold text-xxs uppercase bg-amber-100/60 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg transition"
              >
                Marcar Todos como Lidos
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relevantAlerts.map(alert => (
                <div key={alert.id} className="bg-white p-4 rounded-xl border border-amber-150 shadow-xs hover:shadow-sm transition flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="bg-red-500 text-white font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded-md">
                        {alert.title}
                      </span>
                      <span className="text-xxs text-slate-400 font-mono">
                        {new Date(alert.timestamp).toLocaleDateString('pt-BR')} {new Date(alert.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    <h4 className="font-sans font-bold text-xs text-slate-800 mt-2 flex items-center gap-1.5">
                      Roteiro: <span className="text-slate-950 font-extrabold">{alert.routeMap}</span> 
                      <span className="text-slate-400 font-normal">|</span> 
                      Placa: <span className="text-slate-950 font-mono font-bold bg-slate-100 px-1 py-0.2 rounded text-[10px]">{alert.plate}</span>
                    </h4>
                    
                    <p className="text-xxs text-slate-600 mt-1 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {alert.message}
                    </p>
                  </div>
                  
                  <div className="flex justify-end mt-3 pt-2.5 border-t border-slate-100">
                    <button 
                      onClick={() => handleMarkAlertAsRead(alert.id)}
                      className="text-blue-600 hover:text-blue-800 font-sans font-extrabold text-[10px] uppercase flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Entendido, arquivar alerta</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {!activeSession ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT & CENTER: Status of the Day + Pending Audits */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* STATUS DO DIA (Dashboard Widget) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-sans font-bold text-slate-900 text-sm uppercase tracking-wider mb-4 flex items-center justify-between">
                <span>Painel Operacional do Dia</span>
                <span className="text-xxs font-semibold text-slate-400">Tempo real</span>
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-center">
                  <span className="text-xxs font-medium text-slate-400 block uppercase">Registros</span>
                  <span className="text-xl font-bold text-slate-900 block">{mapsToday}</span>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-center">
                  <span className="text-xxs font-medium text-amber-700 block uppercase">Em Aberto</span>
                  <span className="text-xl font-bold text-amber-800 block">{mapsInCount}</span>
                </div>
                <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
                  <span className="text-xxs font-medium text-red-700 block uppercase">Recount</span>
                  <span className="text-xl font-bold text-red-800 block">{mapsInRecon}</span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center">
                  <span className="text-xxs font-medium text-emerald-700 block uppercase">Baixa OK</span>
                  <span className="text-xl font-bold text-emerald-800 block">{mapsCompletedOk}</span>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 text-center">
                  <span className="text-xxs font-medium text-purple-700 block uppercase">Baixa Div.</span>
                  <span className="text-xl font-bold text-purple-800 block">{mapsCompletedDivergent}</span>
                </div>
              </div>
            </div>

            {/* PENDING AUDITS LIST */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-sans font-bold text-lg text-slate-900 flex items-center space-x-2">
                  <span>Conferências Físicas de Hoje</span>
                  <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                    {pendingOrActiveAudits.length}
                  </span>
                </h2>
              </div>

              {pendingOrActiveAudits.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                  <ClipboardCheck className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">Nenhuma conferência ativa ou pendente.</p>
                  <p className="text-xs text-slate-400 mt-1">Utilize o painel lateral para iniciar o registro físico.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingOrActiveAudits.map((audit) => {
                    const isReconferindo = audit.status === 'reconferencia';
                    return (
                      <div 
                        key={audit.id}
                        className={`p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between transition-all ${
                          isReconferindo 
                            ? 'border-red-200 bg-red-50/40 hover:bg-red-50/60 shadow-xs' 
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-sans font-bold text-slate-900 text-base">
                              {audit.routeMap}
                            </span>
                            <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Placa: {audit.plate}
                            </span>
                            {audit.reopeningRequested ? (
                              <span className="bg-amber-600 text-white text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-amber-500 animate-pulse flex items-center space-x-1">
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                <span>REABERTURA SOLICITADA</span>
                              </span>
                            ) : isReconferindo ? (
                              <span className="bg-red-600 text-white text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-red-500 animate-pulse flex items-center space-x-1">
                                <AlertTriangle className="h-3 w-3" />
                                <span>RECONFERÊNCIA COMPULSÓRIA</span>
                              </span>
                            ) : (
                              <span className="bg-amber-100 text-amber-800 text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-amber-200">
                                Em aberto
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                            <div>
                              <strong className="text-slate-700">Motorista:</strong> {getDriverName(audit.driverId)}
                            </div>
                            <div>
                              <strong className="text-slate-700">Ajudante:</strong> {getHelperName(audit.helperId)}
                            </div>
                            <div>
                              <strong className="text-slate-700">KM Chegada:</strong> {audit.arrivalKm.toLocaleString()} km
                            </div>
                            <div>
                              <strong className="text-slate-700">Data:</strong> {formatDateToDiaMesAno(audit.arrivalDate)}
                            </div>
                          </div>

                          {audit.reopeningRequested && audit.reopeningJustification && (
                            <div className="mt-2 bg-amber-50 border-l-4 border-amber-500 p-3 text-xs text-amber-900 rounded-lg">
                              <strong>Motivo da Reabertura:</strong> "{audit.reopeningJustification}"
                              {audit.reopeningRequestUser && <span className="block mt-0.5 text-[10px] text-amber-700">Solicitado por: {audit.reopeningRequestUser}</span>}
                            </div>
                          )}

                          {isReconferindo && audit.reconciliationNotes && (
                            <div className="mt-2 bg-red-50 border-l-4 border-red-500 p-3 text-xs text-red-900 rounded-lg">
                              <strong>Divergência Fiscal apontada:</strong> "{audit.reconciliationNotes}"
                              <span className="block mt-1 font-semibold text-red-700 uppercase text-[10px]">⚠️ Re-confronte e tire fotos provas obrigatórias</span>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 md:mt-0 flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleRouteMap(audit.routeMap)}
                            className={`px-3 py-2 rounded-lg font-bold text-xs border transition-all cursor-pointer ${
                              selectedRouteMaps.includes(audit.routeMap.toUpperCase())
                                ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            }`}
                            title="Marcar para unificar com outro mapa"
                          >
                            {selectedRouteMaps.includes(audit.routeMap.toUpperCase()) ? '✓ Selecionado' : '+ Unificar'}
                          </button>
                          <button
                            onClick={() => handleOpenSession(audit)}
                            className={`flex-grow md:flex-grow-0 flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-bold text-xs md:text-sm transition-all shadow-sm ${
                              audit.reopeningRequested
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : isReconferindo
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-[#0f35a9] hover:bg-blue-800 text-white'
                            }`}
                          >
                            <span>{audit.reopeningRequested ? 'Re-conferir Mapa Reaberto' : isReconferindo ? 'Sanar Divergência' : 'Lançar'}</span>
                            <ArrowRight className="h-4 w-4 shrink-0" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* PREVISÕES DE RETORNO DO MONITORAMENTO PANEL */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-sans font-bold text-slate-900 text-lg flex items-center space-x-2">
                    <MapPin className="h-5 w-5 text-[#0f35a9]" />
                    <span>Monitoramento: Previsões de Retorno</span>
                  </h3>
                  <p className="text-xs text-slate-400">Previsões registradas pelo monitoramento para sua organização de pátio.</p>
                </div>
                <button
                  onClick={() => setShowForecastForm(!showForecastForm)}
                  className="bg-slate-100 hover:bg-slate-200 text-[#0f35a9] font-semibold text-xs px-3 py-1.5 rounded-lg transition border border-slate-200"
                >
                  {showForecastForm ? 'Fechar Cadastro' : 'Informar Previsão'}
                </button>
              </div>

              {/* Sub-form for scheduler simulation */}
              {showForecastForm && (
                <form onSubmit={handleAddForecast} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">Registrar Novo Veículo em Rota</span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xxs font-semibold text-slate-600 mb-1">Placa <span className="text-red-500 font-extrabold">*</span></label>
                      <input 
                        type="text" required placeholder="Ex: TOU7F39" 
                        value={fcPlate} onChange={e => setFcPlate(e.target.value)}
                        className="w-full text-xs p-2 bg-white border border-slate-200 rounded-md uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xxs font-semibold text-slate-600 mb-1">Motorista <span className="text-red-500 font-extrabold">*</span></label>
                      <input 
                        type="text" required placeholder="Ex: EDENILSON" 
                        value={fcDriver} onChange={e => setFcDriver(e.target.value)}
                        className="w-full text-xs p-2 bg-white border border-slate-200 rounded-md uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xxs font-semibold text-slate-600 mb-1">Mapa de Rota <span className="text-red-500 font-extrabold">*</span></label>
                      <input 
                        type="text" required placeholder="Ex: MAPA-502" 
                        value={fcRoute} onChange={e => setFcRoute(e.target.value)}
                        className="w-full text-xs p-2 bg-white border border-slate-200 rounded-md uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xxs font-semibold text-slate-600 mb-1">Previsão Chegada <span className="text-red-500 font-extrabold">*</span></label>
                      <input 
                        type="time" required 
                        value={fcEta} onChange={e => setFcEta(e.target.value)}
                        className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <button 
                      type="button" onClick={() => setShowForecastForm(false)}
                      className="text-xxs text-slate-500 hover:bg-slate-100 px-3 py-1.5 rounded"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="bg-[#0f35a9] text-white text-xxs font-bold px-4 py-1.5 rounded-lg hover:bg-blue-800 transition"
                    >
                      Prever Chegada
                    </button>
                  </div>
                </form>
              )}

              {returnForecasts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                  Nenhum retorno previsto cadastrado no momento. Use o botão acima para simular previsões de entrada.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {returnForecasts.map((f) => {
                    const statusInfo = getForecastStatusLabel(f);

                    return (
                      <div key={f.id} className="p-4 rounded-xl border border-slate-150 bg-slate-50/50 hover:bg-slate-50 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {f.plate}
                              </span>
                              <span className="text-slate-400 text-xxs ml-2 font-mono">{f.routeMap}</span>
                            </div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </div>

                          <div className="text-xs text-slate-700 mt-2 font-medium">
                            <span className="text-slate-400 block text-xxs uppercase">Colaborador</span>
                            {f.driverName}
                          </div>

                          <div className="flex items-center space-x-1.5 mt-2 text-xs font-bold text-slate-900">
                            <Clock className="h-3.5 w-3.5 text-blue-600" />
                            <span>ETA Previsto: {f.eta}h</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-200 flex justify-end items-center">
                          <button
                            onClick={() => handleRemoveForecast(f.id)}
                            title="Remover"
                            className="text-slate-400 hover:text-red-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
          
          {/* RIGHT: REGISTER RETURN FROM ROUTE PANEL */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-sans font-bold text-lg text-slate-900 flex items-center space-x-2">
                  <Play className="h-5 w-5 text-amber-500" />
                  <span>MAPAS EM ABERTO</span>
                </h2>
                <button
                  type="button"
                  onClick={handleLoadDemoForm}
                  className="text-xxs font-semibold uppercase tracking-wider text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-2 py-1 rounded transition border border-amber-200"
                >
                  Autopreencher Teste
                </button>
              </div>

              {/* Mapas Importados e Reabertos Quick Fill Panel */}
              {openRoutesList.length > 0 && (
                <div className="mb-5 bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center space-x-1.5 font-mono">
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>Veículos com Mapas em Aberto</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold font-mono">
                      {openRoutesList.length} abertos
                    </span>
                  </div>

                  {/* Unify Maps Button Banner */}
                  {selectedRoutesForUnify.length > 1 && (
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="text-slate-700 font-medium">
                        <span className="font-bold text-amber-800">{selectedRoutesForUnify.length} mapas</span> selecionados para unificar: {selectedRoutesForUnify.join(', ')}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const firstRoute = openRoutesList.find(r => r.routeMap.toUpperCase() === selectedRoutesForUnify[0].toUpperCase());
                          setRouteMap(selectedRoutesForUnify.join(' + '));
                          const plates = selectedRoutesForUnify.map(m => {
                            const r = openRoutesList.find(x => x.routeMap.toUpperCase() === m.toUpperCase());
                            return r ? r.plate : '';
                          }).filter(p => p !== '');
                          const uniquePlates = Array.from(new Set(plates));
                          setPlate(uniquePlates.join(' / '));
                          if (firstRoute) {
                            autoSelectDriverForRoute({ driverName: firstRoute.driverName } as any);
                          }
                        }}
                        className="bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-3 py-1.5 rounded transition shadow-xs text-[10px] uppercase cursor-pointer self-end sm:self-auto"
                      >
                        Unificar no Formulário
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {openRoutesList.map(route => {
                      const isPendente = route.status === 'pendente' || !route.status;
                      const isConferindo = route.status === 'conferindo';
                      const isEmAnalise = route.status === 'em_analise';
                      const isReconferir = route.status === 'reconferir';
                      const isReabertura = route.status === 'solicitado_reabertura' || route.reopeningRequested;

                      let btnStyle = "bg-red-50 text-red-950 border-red-200";
                      let badgeStyle = "bg-red-100 text-red-800 border border-red-200";
                      let statusText = "Pendente";

                      if (isReabertura) {
                        btnStyle = "bg-amber-50/80 text-amber-950 border-amber-300 font-extrabold";
                        badgeStyle = "bg-amber-600 text-white border border-amber-700 font-extrabold animate-pulse";
                        statusText = "🔄 Reabertura Solicitada";
                      } else if (isConferindo) {
                        btnStyle = "bg-amber-50 text-amber-950 border-amber-200";
                        badgeStyle = "bg-amber-100 text-amber-800 border border-amber-200";
                        statusText = "Conferindo";
                      } else if (isEmAnalise) {
                        btnStyle = "bg-emerald-50 text-emerald-950 border-emerald-200";
                        badgeStyle = "bg-emerald-100 text-emerald-800 border border-emerald-200";
                        statusText = "Em Análise";
                      } else if (isReconferir) {
                        btnStyle = "bg-purple-50 text-purple-950 border-purple-200";
                        badgeStyle = "bg-purple-100 text-purple-800 border border-purple-200";
                        statusText = "Reconferir";
                      }

                      const isSelected = selectedRouteMaps.includes(route.routeMap.toUpperCase());

                      return (
                        <div
                          key={route.id}
                          className={`w-full text-left border text-xs p-3 rounded-xl space-y-2 font-medium shadow-3xs transition-all duration-150 ${btnStyle} ${isSelected ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50' : ''}`}
                        >
                          <div 
                            className="flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:opacity-85"
                            onClick={() => {
                              if (selectedRouteMaps.length > 0) {
                                handleToggleRouteMap(route.routeMap);
                                return;
                              }
                              if (route.audit) {
                                handleOpenSession(route.audit);
                                return;
                              }
                              if (isConferindo || isReconferir) {
                                const matchingAudit = audits.find(a => 
                                  a.routeMap.toUpperCase() === route.routeMap.toUpperCase() || 
                                  (a.unifiedMaps && a.unifiedMaps.some(m => m.toUpperCase() === route.routeMap.toUpperCase()))
                                );
                                if (matchingAudit) {
                                  handleOpenSession(matchingAudit);
                                  return;
                                }
                              }
                              handleToggleRouteMap(route.routeMap);
                            }}
                            title={selectedRouteMaps.length > 0 ? "Clique para selecionar/desmarcar este mapa" : route.audit ? "Clique para abrir e conferir este mapa" : "Clique para selecionar este mapa"}
                          >
                            <div className="flex items-center space-x-2 flex-wrap min-w-0">
                              {(isPendente || isReabertura || isReconferir || isConferindo) && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleToggleRouteMap(route.routeMap);
                                  }}
                                  className="h-4 w-4 rounded text-amber-500 border-slate-300 focus:ring-amber-500 cursor-pointer mr-1 shrink-0"
                                  title="Marcar para unificar com outro mapa"
                                />
                              )}
                              <span className="font-extrabold text-sm truncate">{route.routeMap}</span>
                              <span className="text-[10px] opacity-75 font-mono truncate">({route.plate})</span>
                              {route.isBlitz && (
                                <span className="bg-red-600 text-white text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse flex items-center gap-0.5 shrink-0">
                                  ⚡ Blitz de Refugo
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                              <span className={`text-[8px] font-extrabold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${badgeStyle}`}>
                                {statusText}
                              </span>
                              {(isReconferir || isConferindo || route.audit) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleRouteMap(route.routeMap);
                                  }}
                                  className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer whitespace-nowrap ${isSelected ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                                  title="Unificar este mapa"
                                >
                                  {isSelected ? '✓ Selecionado' : '+ Unificar'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
 
              <form onSubmit={handleStartNewSession} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mapa de Rota <span className="text-red-500 font-extrabold">*</span>
                  </label>
                  {/* Visual container mimicking an input field with interactive map tags/balloons */}
                  <div 
                    className="flex flex-wrap gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-transparent min-h-[44px] items-center cursor-text"
                    onClick={() => {
                      const inputElement = document.getElementById('route-map-tag-input');
                      if (inputElement) inputElement.focus();
                    }}
                  >
                    {selectedRouteMaps.map(map => (
                      <div 
                        key={map} 
                        className="flex items-center space-x-1 bg-amber-100 border border-amber-200 text-amber-950 pl-2.5 pr-1 py-1 rounded-md text-xs font-extrabold font-sans select-none animate-fade-in shadow-xs transition-transform hover:scale-[1.02]"
                      >
                        <span>{map}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMapTag(map);
                          }}
                          className="text-amber-600 hover:text-red-600 hover:bg-red-50 rounded-full p-0.5 transition-colors cursor-pointer"
                          title="Remover este mapa"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    
                    <input
                      id="route-map-tag-input"
                      type="text"
                      placeholder={selectedRouteMaps.length === 0 ? "Ex: MAPA-201" : ""}
                      value={typedMapInput}
                      onChange={(e) => setTypedMapInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
                          e.preventDefault();
                          const val = typedMapInput.trim().toUpperCase();
                          if (val) {
                            handleAddMapTag(val);
                            setTypedMapInput('');
                          }
                        } else if (e.key === 'Backspace' && !typedMapInput && selectedRouteMaps.length > 0) {
                          handleRemoveMapTag(selectedRouteMaps[selectedRouteMaps.length - 1]);
                        }
                      }}
                      onBlur={() => {
                        const val = typedMapInput.trim().toUpperCase();
                        if (val) {
                          handleAddMapTag(val);
                          setTypedMapInput('');
                        }
                      }}
                      className="flex-grow bg-transparent border-none outline-none text-sm p-1 text-slate-900 focus:ring-0 min-w-[100px] uppercase placeholder-slate-400"
                    />
                  </div>
                  {/* Hidden input to preserve native form validation for required routeMap, placed relatively so tooltip centers on the box */}
                  <div className="relative w-full h-0">
                    <input
                      type="text"
                      required
                      value={routeMap}
                      onChange={() => {}} // dummy handler to avoid warning
                      className="absolute left-0 right-0 -top-8 h-8 w-full opacity-0 pointer-events-none"
                      tabIndex={-1}
                    />
                  </div>
                  {selectedRouteMaps.length > 1 && (
                    <span className="text-[10px] font-semibold text-amber-600 mt-1 block">
                      💡 {selectedRouteMaps.length} Mapas selecionados serão unificados na mesma conferência de pátio.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Placa do Veículo <span className="text-red-500 font-extrabold">*</span>
                  </label>
                  <select
                    required
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Selecione...</option>
                    <option value="solicitar_cadastro">⚠️ Não localizado (Solicitar Cadastro)...</option>
                    {vehicles.map(v => (
                      <option key={v.plate} value={v.plate}>{v.plate} ({v.capacityPallets} Pallets)</option>
                    ))}
                  </select>
                </div>

                {plate === 'solicitar_cadastro' && (
                  <div className="space-y-1 animate-fade-in bg-amber-50/30 p-3 rounded-lg border border-amber-200">
                    <label className="block text-xxs font-bold text-amber-850 uppercase">
                      Solicitar Cadastro de Veículo - Placa Temporária <span className="text-red-500 font-extrabold">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: ABC1234"
                      value={tempPlate}
                      onChange={(e) => setTempPlate(e.target.value.toUpperCase())}
                      className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase font-mono font-bold"
                    />
                    <span className="text-[10px] text-amber-700 font-medium block">
                      Isso enviará uma solicitação de cadastro de placa temporária ao gestor.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      KM de Chegada <span className="text-red-500 font-extrabold">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="Ex: 125300"
                      value={arrivalKm}
                      onChange={(e) => setArrivalKm(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prestador de Contas (Motorista) <span className="text-red-500 font-extrabold">*</span>
                  </label>
                  <select
                    required
                    value={driverId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDriverId(val);
                    }}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Selecione...</option>
                    <option value="temporario">Temporário</option>
                    <option value="solicitar_cadastro">⚠️ Não localizado (Solicitar Cadastro)...</option>
                    {drivers.filter(d => d.role === 'MOTORISTA').map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                    ))}
                  </select>
                </div>

                {driverId === 'solicitar_cadastro' && (
                  <div className="space-y-1 animate-fade-in bg-amber-50/30 p-3 rounded-lg border border-amber-200">
                    <label className="block text-xxs font-bold text-amber-850 uppercase">
                      Solicitar Cadastro de Motorista - Nome Temporário *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: CARLOS ALBERTO DE SOUZA"
                      value={tempDriverName}
                      onChange={(e) => setTempDriverName(e.target.value.toUpperCase())}
                      className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase font-bold"
                    />
                    <span className="text-[10px] text-amber-700 font-medium block">
                      Será gerado um registro temporário visível para homologação do gestor.
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ajudante {driverId === 'temporario' ? <span className="text-red-500 font-extrabold">* (Obrigatório)</span> : '(Opcional)'}
                  </label>
                  <select
                    required={driverId === 'temporario'}
                    value={helperId}
                    onChange={(e) => setHelperId(e.target.value)}
                    className={`w-full text-sm rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 ${
                      driverId === 'temporario'
                        ? 'bg-amber-50 border-amber-300 focus:ring-amber-500 border-2'
                        : 'bg-slate-50 border border-slate-200 focus:ring-amber-500'
                    }`}
                  >
                    <option value="">Selecione...</option>
                    <option value="solicitar_cadastro">⚠️ Não localizado (Solicitar Cadastro)...</option>
                    {drivers.filter(d => d.role === 'AJUDANTE').map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                    ))}
                  </select>
                </div>

                {helperId === 'solicitar_cadastro' && (
                  <div className="space-y-1 animate-fade-in bg-amber-50/30 p-3 rounded-lg border border-amber-200">
                    <label className="block text-xxs font-bold text-amber-850 uppercase">
                      Solicitar Cadastro de Ajudante - Nome Temporário *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: JOÃO BATISTA DOS SANTOS"
                      value={tempHelperName}
                      onChange={(e) => setTempHelperName(e.target.value.toUpperCase())}
                      className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 uppercase font-bold"
                    />
                    <span className="text-[10px] text-amber-700 font-medium block">
                      Será gerado um registro temporário para o gestor homologar posteriormente.
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-4 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2"
                >
                  <Play className="h-4 w-4 text-amber-500" />
                  <span>Iniciar Conferência Física</span>
                </button>
              </form>
            </div>

            {/* QUICK NOTIFICATIONS STATUS CLEAR */}
            {fiscalAlerts.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Alerta de baixa fiscal ativo ({fiscalAlerts.length})</span>
                <button 
                  onClick={handleClearAllAlerts}
                  className="text-red-600 hover:text-red-700 font-bold uppercase text-[10px]"
                >
                  Limpar Histórico de Alertas
                </button>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* ACTIVE CONFERÊNCIA EM ANDAMENTO */
        <div className="space-y-8" id="active_audit_panel">
          
          {(() => {
            const currentInAudits = audits.find(a => a.id === activeSession.id);
            const hasConflict = currentInAudits &&
                                currentInAudits.updatedAt &&
                                loadedSessionTime &&
                                currentInAudits.updatedAt !== loadedSessionTime &&
                                currentInAudits.lastUpdatedBy !== currentUser.name;

            if (hasConflict) {
              return (
                <div className="bg-amber-500/15 border-l-4 border-amber-500 rounded-xl p-4 text-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-md animate-fade-in animate-pulse-slow" id="concurrency_conflict_banner">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0 animate-bounce" />
                    <div>
                      <strong className="text-amber-900 block font-bold text-xs uppercase tracking-wide">⚠️ Atenção: Conflito de Edição de Rede</strong>
                      <p className="text-xxs text-slate-700 mt-0.5 font-sans leading-relaxed">
                        Este mapa de rota foi atualizado por <strong>{currentInAudits.lastUpdatedBy || 'outro usuário'}</strong> às <strong>{new Date(currentInAudits.updatedAt!).toLocaleTimeString()}</strong>. Para evitar que suas alterações locais apaguem as dele, clique em "Sincronizar com a Rede" para carregar os dados mais recentes.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSession(currentInAudits);
                      setLoadedSessionTime(currentInAudits.updatedAt);
                    }}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] uppercase rounded-lg transition shrink-0 shadow-sm"
                  >
                    Sincronizar com a Rede
                  </button>
                </div>
              );
            }
            return null;
          })()}

          {/* Header Info Panel */}
          <div className="bg-slate-900 text-white p-6 rounded-xl border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center shadow-lg gap-4">
            <div className="space-y-1">
              <span className="text-xs text-amber-500 font-mono tracking-widest uppercase font-bold">
                PROCESSO DE CONFERÊNCIA EM ANDAMENTO
              </span>
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-sans font-bold tracking-tight">
                  {activeSession.routeMap}
                </h2>
                <span className="bg-slate-800 text-slate-300 font-mono text-xs px-2.5 py-0.5 rounded border border-slate-700">
                  {activeSession.plate} {activeSession.exchangePlate ? `🔄 ${activeSession.exchangePlate}` : ''}
                </span>
                {activeSession.status === 'reconferencia' && (
                  <span className="bg-red-600 text-white border border-red-500 text-[10px] font-bold px-2.5 py-0.5 rounded-full animate-pulse uppercase">
                    DIVERGÊNCIA IDENTIFICADA
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-x-4">
                <span><strong>Motorista:</strong> {getDriverName(activeSession.driverId)}</span>
                <span>•</span>
                <span><strong>Ajudante:</strong> {getHelperName(activeSession.helperId)}</span>
                <span>•</span>
                <span><strong>KM Chegada:</strong> {activeSession.arrivalKm}</span>
              </div>
            </div>

            {/* Timer Block */}
            <div className="flex items-center space-x-3 bg-slate-850 p-3 rounded-lg border border-slate-800 self-stretch md:self-auto justify-between md:justify-start">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-amber-500 animate-spin-slow" />
                <div>
                  <span className="text-xxs text-slate-400 block font-sans">TEMPO DECORRIDO</span>
                  <span className="font-mono text-xl font-bold tracking-wider text-amber-400">
                    {formatTime(elapsedSeconds)}
                  </span>
                </div>
              </div>
              <div className="flex space-x-1.5">
                <button
                  type="button"
                  onClick={() => setShowSuspensionModal(true)}
                  className="text-[10px] bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white px-2.5 py-1.5 rounded-lg transition border border-red-500/30 cursor-pointer font-bold font-sans"
                >
                  Pausa
                </button>
                <button
                  type="button"
                  onClick={handleExitSession}
                  className="text-[10px] bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg transition border border-slate-700 cursor-pointer font-sans"
                >
                  Sair (Salvar)
                </button>
              </div>
            </div>
          </div>

          {/* Blitz de Refugo warning banner */}
          {(() => {
            const matchingRoute = importedRoutes.find(r => r.routeMap.toUpperCase() === activeSession.routeMap.toUpperCase());
            if (matchingRoute?.isBlitz) {
              return (
                <div className="bg-red-50 border-l-4 border-red-600 rounded-xl p-5 text-slate-950 shadow-xs space-y-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-red-900 block font-sans text-sm uppercase tracking-wider font-bold">🚨 VEÍCULO EM BLITZ DE REFUGO (2x por Dia) 🚨</strong>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                        Este veículo foi sorteado hoje na escala circular diária. O conferente tem o dever obrigatório de <strong>rebater todas as caixas</strong> buscando encontrar refugo oculto da rota (bicadas, sujeiras, tampadas, garrafeira quebrada, etc.).
                      </p>
                      <p className="text-xs font-bold text-red-950 mt-1 font-mono">
                        ⚠️ ATENÇÃO: Faça uma varredura física completa e minuciosa! Insira todos os refugos encontrados na aba abaixo.
                      </p>
                    </div>
                  </div>

                  <div className="bg-red-50/50 p-4 rounded-lg border border-red-200 mt-3">
                    <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider mb-2 flex items-center gap-1.5 font-sans">
                      <Sparkles className="h-3.5 w-3.5 text-red-600 animate-spin-slow" />
                      Blitz de Refugo Ativa
                    </h4>
                    <p className="text-xs text-slate-700 leading-relaxed font-sans">
                      Este veículo está sob auditoria circular obrigatória hoje. O conferente tem o dever de inspecionar fisicamente e registrar qualquer refugo ou avaria encontrada diretamente na aba <strong>"Refugos e Avarias"</strong> abaixo.
                    </p>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Re-audit warning */}
          {activeSession.status === 'reconferencia' && (
            <div className="bg-red-50 border-l-4 border-red-600 rounded-xl p-4 text-slate-950 flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <strong className="text-red-900 block font-sans text-sm">RECONFERÊNCIA DE DIVERGÊNCIA OBRIGATÓRIA</strong>
                <p className="text-xs text-slate-700 mt-1">
                  O setor auxiliar fiscal retornou este mapa devido a contagens de produtos ou ativos de giro conflitantes. <strong>A lei interna da Pau Brasil exige evidências fotográficas das divergências físicas</strong> para instruir a emissão de vales/vouchers.
                </p>
                {activeSession.reconciliationNotes && (
                  <div className="mt-2 text-xs bg-white p-2.5 rounded border border-red-100 font-mono text-red-800 font-semibold">
                    MOTIVO DO RE-AUDIT: "{activeSession.reconciliationNotes}"
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dual Category Grid: PA and AG */}
          {activeSession.isSuspended ? (
            <div className="bg-white rounded-2xl border border-red-200 p-8 text-center space-y-6 max-w-2xl mx-auto shadow-md animate-fade-in" id="suspension_view">
              <div className="mx-auto h-16 w-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="h-10 w-10 text-red-600 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h3 className="font-sans font-black text-2xl text-red-900 uppercase tracking-tight">CONTAGEM FÍSICA PAUSADA</h3>
                <p className="text-sm text-slate-500">
                  Este processo de contagem foi temporariamente suspenso para que você possa atender a uma demanda de urgência.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left font-mono space-y-2">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans font-bold uppercase">MOTIVO DA PAUSA / URGÊNCIA:</span>
                  <span className="text-sm font-semibold text-slate-800 font-sans">"{activeSession.suspensionNotes || 'Nenhum motivo informado'}"</span>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans font-bold">Tempo acumulado:</span>
                    <span className="font-bold text-slate-700">{formatTime(elapsedSeconds)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans font-bold">Pausado por:</span>
                    <span className="font-bold text-slate-700">{currentUser.name}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleUrgentResume}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center space-x-2 text-base cursor-pointer uppercase"
                >
                  <Play className="h-5 w-5 animate-pulse text-amber-300" />
                  <span>Informar Retomada do Processo</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT COLUMN: Products Finished Goods (PA) */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="border-b border-slate-100 pb-4 mb-4">
                  <h3 className="font-sans font-bold text-lg text-slate-900 flex items-center space-x-2">
                    <span className="bg-[#0f35a9] text-white text-xs px-2.5 py-0.5 rounded-full font-sans uppercase font-extrabold">PA</span>
                    <span>Produtos Acabados</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Insira os produtos e as quantidades aferidas às cegas.</p>
                </div>

                {/* Add Item Form */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 space-y-3">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">Adicionar Produto à Lista</span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-7 relative">
                      <label className="block text-xxs font-semibold text-slate-600 mb-1">Pesquisar por Código ou Descrição</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Digite para pesquisar..."
                          value={productSearch}
                          onChange={(e) => {
                            setProductSearch(e.target.value);
                            setSelectedProductCode('');
                          }}
                          className="w-full text-xs bg-white border border-slate-200 rounded p-2.5 pl-8 focus:outline-none"
                        />
                        <Search className="absolute left-2.5 top-3 h-3.5 w-3.5 text-slate-400" />
                      </div>

                      {/* Search Autocomplete List */}
                      {productSearch && !selectedProductCode && (
                        <div className="absolute z-20 left-0 right-0 bg-white border border-slate-200 rounded-b-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                          {filteredProducts.length === 0 ? (
                            <div className="p-3 text-xxs text-slate-400 text-center">Nenhum produto cadastrado encontrado</div>
                          ) : (
                            filteredProducts.map(p => (
                              <button
                                type="button"
                                key={p.code}
                                onClick={() => {
                                  setSelectedProductCode(p.code);
                                  setProductSearch(`[${p.code}] ${p.description}`);
                                }}
                                className="w-full text-left px-3 py-2 text-xxs hover:bg-slate-50 border-b border-slate-100 flex justify-between items-center cursor-pointer"
                              >
                                <span>{p.description}</span>
                                <span className="font-mono text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{p.code}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xxs font-semibold text-slate-600 mb-1">Qtd Férrea <span className="text-red-500 font-extrabold">*</span></label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Qtd"
                        value={productQtyToAdd}
                        onChange={(e) => setProductQtyToAdd(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full text-xs bg-white border border-slate-200 rounded p-2.5 text-center font-bold focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddProductToSession}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-2 rounded flex items-center justify-center space-x-1 text-xs cursor-pointer shadow-sm"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Products Checked Table */}
                {visibleItems.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <ClipboardCheck className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500 font-medium">Contagem de PA vazia. Adicione os produtos acabados que retornaram de rota.</p>
                  </div>
                ) : (
                  <div>
                    {/* MOBILE VIEW (card list) */}
                    <div className="block sm:hidden space-y-3">
                      {visibleItems.map((item) => {
                        const isReconferindo = activeSession.status === 'reconferencia';
                        const difference = isReconferindo 
                          ? ((item.rePhysicalQty ?? 0) - (item.fiscalQty ?? 0))
                          : ((item.physicalQty ?? 0) - (item.fiscalQty ?? 0));

                        return (
                          <div 
                            key={item.productCode} 
                            className={`p-4 rounded-xl border bg-white shadow-xs space-y-3 transition-all ${
                              isReconferindo ? 'border-red-200 bg-red-50/5' : 'border-slate-200'
                            }`}
                            id={`pa-mobile-card-${item.productCode}`}
                          >
                            {/* Header: Code & Description & Delete Action */}
                            <div className="flex justify-between items-start gap-2.5">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                  <span className="inline-block font-mono text-[9px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-black">
                                    SKU {item.productCode}
                                  </span>
                                  {isReconferindo && (
                                    <span className="inline-block font-sans text-[8px] bg-red-100 text-red-700 font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                                      Recontar
                                    </span>
                                  )}
                                </div>
                                <h4 className="font-sans font-extrabold text-slate-900 text-xs leading-tight break-words">
                                  {item.productDescription}
                                </h4>
                              </div>
                              
                              {/* Delete button: larger touch target, colored icon */}
                              <button
                                type="button"
                                onClick={() => handleRemoveProduct(item.productCode)}
                                className="text-red-500 hover:text-red-700 bg-red-50 active:bg-red-100 p-2.5 rounded-lg transition cursor-pointer shrink-0 border border-red-200/50"
                                title="Excluir produto"
                                id={`pa-mobile-delete-${item.productCode}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            
                            {/* Detailed Info Grid */}
                            <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-150">
                              {/* Column 1: Expected/Fiscal */}
                              <div className="bg-slate-50 border border-slate-200 p-1.5 rounded text-center">
                                <span className="block text-[8px] text-slate-500 font-black uppercase tracking-wider mb-0.5">Nota (Fisc)</span>
                                <span className="font-mono text-xs font-bold text-slate-700">
                                  {item.fiscalQty ?? 0}
                                </span>
                              </div>

                              {/* Column 2: First Count / Old count */}
                              <div className="bg-amber-50/50 border border-amber-200 p-1.5 rounded text-center">
                                <span className="block text-[8px] text-amber-700 font-black uppercase tracking-wider mb-0.5">Contagem 1</span>
                                <span className="font-mono text-xs font-bold text-amber-800">
                                  {item.physicalQty}
                                </span>
                              </div>

                              {/* Column 3: Status / Difference */}
                              <div className={`p-1.5 rounded border text-center ${
                                difference === 0 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                  : 'bg-red-50 border-red-200 text-red-800'
                              }`}>
                                <span className="block text-[8px] font-black uppercase tracking-wider mb-0.5">Dif.</span>
                                <span className="font-mono text-xs font-bold">
                                  {difference > 0 ? `+${difference}` : difference}
                                </span>
                              </div>
                            </div>

                            {/* Quantity Input Area */}
                            <div className="pt-2">
                              {isReconferindo ? (
                                <div className="space-y-1">
                                  <label className="block text-[9px] text-red-600 font-black uppercase tracking-wide">
                                    Novo Recount (Quantidade Correta) *
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Informe o recount..."
                                    value={item.rePhysicalQty ?? ''}
                                    onChange={(e) => handleUpdateProductQty(item.productCode, Number(e.target.value) || 0)}
                                    className="w-full text-xs bg-white border border-red-300 rounded-lg p-2.5 text-center font-bold focus:outline-none focus:ring-2 focus:ring-red-500 font-sans"
                                    id={`pa-mobile-recount-${item.productCode}`}
                                  />
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <label className="block text-[9px] text-slate-600 font-black uppercase tracking-wide">
                                    Quantidade Férrea Aferida *
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.physicalQty}
                                    onChange={(e) => handleUpdateProductQty(item.productCode, Number(e.target.value) || 0)}
                                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    id={`pa-mobile-qty-${item.productCode}`}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* DESKTOP VIEW (table) */}
                    <div className="hidden sm:block border border-slate-100 rounded-lg overflow-x-auto shadow-xs">
                      <table className="min-w-full divide-y divide-slate-100 text-left">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-2 font-sans font-bold text-xxs text-slate-500 uppercase tracking-wider">Cód / Descrição</th>
                            <th className="px-4 py-2 font-sans font-bold text-xxs text-slate-500 uppercase tracking-wider text-center w-28">
                              {activeSession.status === 'reconferencia' ? 'Antigo' : 'Quantidade'}
                            </th>
                            {activeSession.status === 'reconferencia' && (
                              <th className="px-4 py-2 font-sans font-bold text-xxs text-slate-500 uppercase tracking-wider text-center w-28 bg-red-50 text-red-950">
                                Novo Recount *
                              </th>
                            )}
                            <th className="px-4 py-2 w-12"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {visibleItems.map((item) => (
                            <tr key={item.productCode} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-2.5">
                                <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded font-bold mr-2">{item.productCode}</span>
                                <span className="font-sans font-semibold text-slate-800 text-xs">{item.productDescription}</span>
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {activeSession.status === 'reconferencia' ? (
                                  <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                    {item.physicalQty}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.physicalQty}
                                    onChange={(e) => handleUpdateProductQty(item.productCode, Number(e.target.value) || 0)}
                                    className="w-20 text-xs bg-slate-50 border border-slate-200 rounded p-1 text-center font-bold focus:outline-none focus:ring-1 focus:ring-amber-500"
                                    id={`pa-desktop-qty-${item.productCode}`}
                                  />
                                )}
                              </td>
                              {activeSession.status === 'reconferencia' && (
                                <td className="px-4 py-2.5 text-center bg-red-50/20">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Recount"
                                    value={item.rePhysicalQty ?? ''}
                                    onChange={(e) => handleUpdateProductQty(item.productCode, Number(e.target.value) || 0)}
                                    className="w-20 text-xs bg-white border border-red-200 rounded p-1 text-center font-bold focus:outline-none focus:ring-1 focus:ring-red-500 font-sans"
                                    id={`pa-desktop-recount-${item.productCode}`}
                                  />
                                </td>
                              )}
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProduct(item.productCode)}
                                  className="text-slate-400 hover:text-red-600 transition p-1 cursor-pointer"
                                  id={`pa-desktop-delete-${item.productCode}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Card de Trocas */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="border-b border-slate-100 pb-4 mb-4">
                  <h3 className="font-sans font-bold text-base text-slate-900 flex items-center space-x-2">
                    <span className="bg-purple-600 text-white text-xxs font-sans uppercase font-extrabold px-2 py-0.5 rounded-full">TROCA</span>
                    <span>Trocas de PA (Opcional)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Se houver produtos de troca (avariados que retornaram na rota), adicione-os na lista abaixo para registrar as evidências fotográficas.
                  </p>
                </div>

                {/* Add Exchange Form */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 space-y-3">
                  <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider block">Adicionar Troca à Lista</span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-7 relative">
                      <label className="block text-xxs font-semibold text-slate-600 mb-1">Pesquisar por Código ou Descrição</label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Digite para pesquisar produto..."
                          value={exchangeSearch}
                          onChange={(e) => {
                            setExchangeSearch(e.target.value);
                            setSelectedExchangeProductCode('');
                          }}
                          className="w-full text-xs bg-white border border-slate-200 rounded p-2.5 pl-8 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <Search className="absolute left-2.5 top-3 h-3.5 w-3.5 text-slate-400" />
                      </div>

                      {/* Autocomplete List */}
                      {exchangeSearch && !selectedExchangeProductCode && (
                        <div className="absolute z-20 left-0 right-0 bg-white border border-slate-200 rounded-b-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                          {filteredExchangeProducts.length === 0 ? (
                            <div className="p-3 text-xxs text-slate-400 text-center">Nenhum produto encontrado</div>
                          ) : (
                            filteredExchangeProducts.map(p => (
                              <button
                                type="button"
                                key={p.code}
                                onClick={() => {
                                  setSelectedExchangeProductCode(p.code);
                                  setExchangeSearch(`[${p.code}] ${p.description}`);
                                }}
                                className="w-full text-left px-3 py-2 text-xxs hover:bg-slate-50 border-b border-slate-100 flex justify-between items-center cursor-pointer"
                              >
                                <span>{p.description}</span>
                                <span className="font-mono text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{p.code}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xxs font-semibold text-slate-600 mb-1">Qtd Troca <span className="text-red-500 font-extrabold">*</span></label>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qtd"
                        value={exchangeQtyToAdd}
                        onChange={(e) => setExchangeQtyToAdd(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full text-xs bg-white border border-slate-200 rounded p-2.5 text-center font-bold focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddExchangeToSession}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-2 rounded flex items-center justify-center space-x-1 text-xs cursor-pointer shadow-sm transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table of Exchanges */}
                {!(activeSession.exchanges || []).filter(e => e.type === 'TROCA').length ? (
                  <div className="text-center py-8 bg-slate-50 rounded-lg text-slate-400 text-xs border border-dashed border-slate-300">
                    Nenhuma troca registrada para esta rota. (Opcional)
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="border border-slate-100 rounded-lg overflow-x-auto shadow-xs">
                      <table className="min-w-full divide-y divide-slate-100 text-left">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-2 font-sans font-bold text-xxs text-slate-500 uppercase tracking-wider">Cód / Descrição</th>
                            <th className="px-4 py-2 font-sans font-bold text-xxs text-slate-500 uppercase tracking-wider text-center w-20">Qtd</th>
                            <th className="px-4 py-2 w-16"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {(activeSession.exchanges || [])
                            .filter(e => e.type === 'TROCA')
                            .map((item) => {
                              return (
                                <tr key={item.productCode} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <span className="font-mono text-[10px] text-purple-700 bg-purple-50 px-1 py-0.5 rounded font-bold mr-2">{item.productCode}</span>
                                    <span className="font-sans font-semibold text-slate-800 text-xs">{item.productDescription}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-center font-mono text-xs font-bold text-slate-700">
                                    {item.qty}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteExchangeFromSession(item.productCode)}
                                      className="text-red-500 hover:bg-red-50 p-1.5 rounded transition cursor-pointer"
                                      title="Excluir troca"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>

                    {/* Single Combined Photo Capture Section for all swaps gathered together */}
                    {(() => {
                      const exPhoto = sessionPhotos.find(p => p.itemCode === 'TROCAS_REUNIDAS' && p.type === 'troca_reposicao');
                      return (
                        <div className="bg-purple-50/45 rounded-xl border border-purple-100 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <h5 className="font-sans font-bold text-slate-900 text-xs">📸 Foto das Trocas Reunidas</h5>
                              <p className="text-[10px] text-slate-500">Agrupe todas as trocas listadas acima em um só local e bata uma única foto de prova das mesmas juntas.</p>
                            </div>
                            {exPhoto && (
                              <span className="bg-green-100 text-green-800 text-[9px] font-bold px-2 py-0.5 rounded-full">✓ Foto Salva</span>
                            )}
                          </div>

                          <div className="flex items-center space-x-4">
                            {exPhoto ? (
                              <div className="relative w-24 h-24 rounded-lg border border-purple-200 overflow-hidden bg-slate-100 shadow-sm flex-shrink-0">
                                <img src={exPhoto.photoUrl} alt="Trocas Reunidas" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <button
                                  type="button"
                                  onClick={() => handleDeletePhoto(exPhoto.id)}
                                  className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow-md transition cursor-pointer"
                                  title="Remover foto"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="w-24 h-24 rounded-lg border-2 border-dashed border-purple-200 bg-purple-50/30 flex flex-col items-center justify-center text-purple-400 flex-shrink-0">
                                <Camera className="h-6 w-6 stroke-1 mb-1" />
                                <span className="text-[9px] font-medium font-sans">Sem Foto</span>
                              </div>
                            )}

                            <div className="flex-1 space-y-2">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => startWebcam('troca_reposicao', 'TROCAS_REUNIDAS')}
                                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer transition shadow-3xs"
                                >
                                  <Camera className="h-3.5 w-3.5" />
                                  <span>{exPhoto ? 'Bater Nova Foto' : 'Bater Foto Reunida'}</span>
                                </button>

                                <label className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold py-1.5 px-3 rounded-lg text-xs flex items-center space-x-1.5 cursor-pointer transition shadow-3xs">
                                  <Upload className="h-3.5 w-3.5 text-slate-500" />
                                  <span>Anexar Foto</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(e) => handleFileUpload(e, 'troca_reposicao')}
                                    className="hidden"
                                  />
                                </label>
                              </div>
                              <p className="text-[9px] text-slate-400 italic">Formato aceito: JPEG/PNG de até 15MB. A imagem será comprimida automaticamente para auditoria rápida.</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* REQUIRED PHOTO EVIDENCE WORKSPACE: TWO ALIGNED BALLOON CARDS */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* BALLOON 1: Evidência PA (Produto Acabado) */}
                  <div className="bg-amber-50/20 rounded-xl shadow-xs border border-amber-200 p-5 space-y-4 relative flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="bg-amber-600 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded shadow-2xs">PA</span>
                        <h4 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider">Evidência PA (Produto Acabado)</h4>
                      </div>
                      <p className="text-[10px] text-slate-500">Registre divergências de caixas quebradas, sobra de produto ou falta física de PA.</p>
                      
                      <div className="space-y-2.5 pt-2">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1">Selecione o Produto Acabado</label>
                          <select
                            value={paSelectedCode}
                            onChange={e => setPaSelectedCode(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                          >
                            <option value="Geral / PA">Geral / Produto Acabado</option>
                            {visibleItems.map(i => (
                              <option key={i.productCode} value={i.productCode}>
                                {i.productDescription} ({i.productCode})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1 font-sans">Observação de Divergência PA <span className="text-red-500 font-extrabold">*</span></label>
                          <input
                            type="text"
                            placeholder="Ex: Amassados / Sobra de 5 un na caixa"
                            value={paComment}
                            onChange={e => setPaComment(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => startWebcam('pa')}
                        className="bg-[#0f35a9] hover:bg-blue-800 text-white font-bold py-2 px-2.5 rounded text-[10px] flex items-center justify-center space-x-1 cursor-pointer transition shadow-2xs"
                      >
                        <Camera className="h-3.5 w-3.5 text-amber-400" />
                        <span>Câmera PA</span>
                      </button>
                      
                      <label className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-2.5 rounded text-[10px] flex items-center justify-center space-x-1 cursor-pointer transition text-center shadow-2xs">
                        <Upload className="h-3.5 w-3.5 text-slate-600" />
                        <span>Anexar (Multi)</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={e => handleFileUpload(e, 'pa')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* BALLOON 2: Evidência AG (Ativo de Giro) */}
                  <div className="bg-blue-50/20 rounded-xl shadow-xs border border-blue-200 p-5 space-y-4 relative flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="bg-blue-600 text-white text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded shadow-2xs">AG</span>
                        <h4 className="font-sans font-bold text-slate-900 text-xs uppercase tracking-wider">Evidência AG (Ativo de Giro)</h4>
                      </div>
                      <p className="text-[10px] text-slate-500">Comprovação fotográfica de Garrafeiras, Chapatex quebrados ou divergência AG.</p>
                      
                      <div className="space-y-2.5 pt-2">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1">Selecione o Ativo de Giro</label>
                          <select
                            value={agSelectedId}
                            onChange={e => setAgSelectedId(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                          >
                            <option value="Geral / AG">Geral / Ativo de Giro</option>
                            {activeSession.assets.map(a => {
                              const code = getAssetCode(a.assetId, a.assetName);
                              const displayName = code ? `[${code}] ${getAssetCanonicalName(code) || a.assetName}` : a.assetName;
                              return (
                                <option key={a.assetId} value={a.assetId}>
                                  {displayName}
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[9px] font-bold text-slate-600 uppercase mb-1 font-sans">Observação de Divergência AG <span className="text-red-500 font-extrabold">*</span></label>
                          <input
                            type="text"
                            placeholder="Ex: 2 Garrafeiras 1L quebradas / Sem Chapatex"
                            value={agComment}
                            onChange={e => setAgComment(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => startWebcam('ag')}
                        className="bg-[#0f35a9] hover:bg-blue-800 text-white font-bold py-2 px-2.5 rounded text-[10px] flex items-center justify-center space-x-1 cursor-pointer transition shadow-2xs"
                      >
                        <Camera className="h-3.5 w-3.5 text-amber-400" />
                        <span>Câmera AG</span>
                      </button>
                      
                      <label className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-2.5 rounded text-[10px] flex items-center justify-center space-x-1 cursor-pointer transition text-center shadow-2xs">
                        <Upload className="h-3.5 w-3.5 text-slate-600" />
                        <span>Anexar (Multi)</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={e => handleFileUpload(e, 'ag')}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                </div>

                {/* Webcam Live Capture / Simulator block (Floating Modal Overlay for Pristine UX) */}
                {showWebcam && (
                  <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
                    <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 max-w-md w-full space-y-4 flex flex-col items-center shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between w-full pb-2 border-b border-slate-800">
                        <div className="flex items-center space-x-2">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
                          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-sans">
                            {isWebcamSimulated ? 'Simulador Digital Ambev Ativo (Sandbox)' : 'Câmera do Dispositivo Ativa'}
                          </span>
                        </div>
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 uppercase font-extrabold font-mono">
                          {webcamTargetRefugo ? 'Alvo: Refugo' :
                           webcamTarget === 'pa' ? 'Alvo: PA' :
                           webcamTarget === 'troca_reposicao' ? 'Alvo: Troca/Rep' : 'Alvo: AG'}
                        </span>
                      </div>

                      {isWebcamSimulated ? (
                        <div className="w-full aspect-video bg-slate-900 rounded-lg flex flex-col items-center justify-center border border-slate-800 relative overflow-hidden group">
                          <Sparkles className="h-8 w-8 text-amber-400 animate-bounce mb-2" />
                          <span className="text-xs font-bold text-white text-center px-4 font-sans uppercase tracking-tight">Visualização da Carga de Retorno</span>
                          <span className="text-[10px] text-slate-400 text-center px-4 mt-1">Pronto para simular registro fotográfico do mapa {activeSession.routeMap}</span>
                          <div className="absolute bottom-2 left-2 right-2 text-center text-[8px] font-mono text-slate-500 bg-black/50 py-1 rounded">
                            Foco Inteligente Automático Ativo
                          </div>
                        </div>
                      ) : (
                        <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg border border-slate-800 aspect-video bg-slate-900" />
                      )}

                      {errorMsg && (
                        <p className="text-xxs font-semibold text-red-500 bg-red-500/10 p-2.5 rounded-lg w-full text-center border border-red-500/20">{errorMsg}</p>
                      )}

                      <div className="flex space-x-3 w-full">
                        <button
                          type="button"
                          onClick={handleCaptureSnapshot}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-md"
                        >
                          <Camera className="h-4 w-4 text-amber-300" />
                          <span>Capturar Foto</span>
                        </button>
                        <button
                          type="button"
                          onClick={stopWebcamStream}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2.5 px-4 rounded-xl cursor-pointer transition border border-slate-700 font-bold"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div className="flex items-center justify-between w-full pt-2.5 border-t border-slate-900">
                        <button
                          type="button"
                          onClick={async () => {
                            if (isWebcamSimulated) {
                              try {
                                const stream = await navigator.mediaDevices.getUserMedia({ 
                                  video: { facingMode: 'environment', width: 640, height: 480 } 
                                });
                                setWebcamStream(stream);
                                setIsWebcamSimulated(false);
                                setTimeout(() => {
                                  if (videoRef.current) videoRef.current.srcObject = stream;
                                }, 150);
                              } catch (err) {
                                alert('Não foi possível acessar a câmera web do dispositivo: ' + err);
                              }
                            } else {
                              if (webcamStream) {
                                webcamStream.getTracks().forEach(track => track.stop());
                                setWebcamStream(null);
                              }
                              setIsWebcamSimulated(true);
                            }
                          }}
                          className="text-[10px] font-sans font-bold text-amber-500 hover:text-amber-400 bg-slate-900 hover:bg-slate-850 px-2.5 py-1.5 rounded-lg border border-slate-800 transition cursor-pointer flex items-center space-x-1 uppercase"
                        >
                          <span>{isWebcamSimulated ? "🔌 Forçar Câmera Real" : "🧪 Ativar Simulador"}</span>
                        </button>
                        <span className="text-[9px] text-slate-500 italic font-sans">Alternar método de captura</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Captured Evidence Gallery */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3 shadow-inner">
                  <span className="text-xxs font-bold text-slate-500 uppercase tracking-wider block">Galeria de Provas Registradas ({sessionPhotos.length})</span>
                  {sessionPhotos.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic py-6 text-center border border-dashed border-slate-300 rounded-lg bg-white">Nenhuma foto anexada a este mapa até o momento.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {sessionPhotos.map(photo => {
                        const isAsset = photo.type === 'ativo';
                        return (
                          <div key={photo.id} className="border border-slate-200 rounded-lg p-2 bg-white relative flex flex-col justify-between group shadow-xs">
                            <div className="relative">
                              <img 
                                src={photo.photoUrl} 
                                alt="evidência" 
                                className="w-full h-24 object-cover rounded border border-slate-100"
                                referrerPolicy="no-referrer"
                              />
                              <span className={`absolute top-1 left-1 text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded shadow-sm ${
                                photo.type === 'ativo' ? 'bg-blue-600 text-white' :
                                photo.type === 'refugo' ? 'bg-red-600 text-white' :
                                photo.type === 'troca_reposicao' ? 'bg-purple-600 text-white' :
                                'bg-amber-600 text-white'
                              }`}>
                                {photo.type === 'ativo' ? 'Ativo AG' :
                                 photo.type === 'refugo' ? 'Refugo' :
                                 photo.type === 'troca_reposicao' ? 'Troca/Rep' :
                                 'Prod PA'}
                              </span>

                              {/* Sync and Cloud Storage state overlays */}
                              <span className={`absolute bottom-1 right-1 text-[7px] font-extrabold uppercase px-1 py-0.5 rounded shadow-sm flex items-center gap-0.5 ${
                                photo.syncPending ? 'bg-amber-500 text-white animate-pulse' : 'bg-emerald-600 text-white'
                              }`} title={photo.syncPending ? "Aguardando sincronização com o Firebase Storage" : "Sincronizado e seguro na nuvem (Firebase Storage)"}>
                                {photo.syncPending ? (
                                  <>
                                    <CloudOff className="h-2 w-2" />
                                    <span>Pendente</span>
                                  </>
                                ) : (
                                  <>
                                    <Cloud className="h-2 w-2" />
                                    <Check className="h-2 w-2 stroke-[3px]" />
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                              <span className="text-[9px] font-bold text-slate-800 block truncate" title={photo.itemCode}>
                                {photo.itemCode}
                              </span>
                              <span className="text-[8px] text-slate-400 block truncate" title={photo.itemName}>
                                {photo.itemName}
                              </span>
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => handleDeletePhoto(photo.id)}
                              className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow-md cursor-pointer transition opacity-90"
                              title="Remover prova fotográfica"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* RIGHT COLUMN: Active Circulation Assets (AG) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="border-b border-slate-100 pb-4 mb-4">
                  <h3 className="font-sans font-bold text-lg text-slate-900 flex items-center space-x-2">
                    <span className="bg-amber-500 text-slate-950 text-xs px-2.5 py-0.5 rounded-full font-sans uppercase font-extrabold">AG</span>
                    <span>Ativos de Giro (Ativos Retornados)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Preencha as garrafeiras, garrafas e paletes retornados.</p>
                </div>

                <div className="space-y-4">
                  {activeSession.assets.map((asset) => {
                    const isGarrafeira = asset.assetName.includes('GARRAFEIRA');
                    const isPallet = asset.assetName.includes('PALETE') || asset.assetName.includes('CHAPATEX');
                    
                    let bgBadge = 'bg-slate-100 text-slate-700';
                    if (isGarrafeira) bgBadge = 'bg-amber-50 text-amber-800 border-amber-100';
                    else if (isPallet) bgBadge = 'bg-blue-50 text-blue-800 border-blue-100';

                    const mappedCode = getAssetCode(asset.assetId, asset.assetName);
                    const canonicalName = getAssetCanonicalName(mappedCode) || asset.assetName;

                    return (
                      <div 
                        key={asset.assetId} 
                        className={`flex items-center justify-between p-3 rounded-lg border border-slate-150 hover:bg-slate-50 transition-all ${
                          activeSession.status === 'reconferencia' ? 'bg-red-50/10' : ''
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${bgBadge}`}>
                              {asset.assetName.includes('GARRAFEIRA') ? 'Garrafeira' : 
                               asset.assetName.includes('GARRAFA') ? 'Garrafa' : 'Estrutura'}
                            </span>
                            {mappedCode && (
                              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {mappedCode}
                              </span>
                            )}
                          </div>
                          <span className="font-sans font-semibold text-slate-800 text-xs block pt-1">
                            {canonicalName}
                          </span>
                        </div>

                        <div className="flex items-center space-x-3">
                          {activeSession.status === 'reconferencia' && (
                            <div className="text-right">
                              <span className="text-xxs text-slate-400 block font-sans">Aferido</span>
                              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {asset.physicalQty}
                              </span>
                            </div>
                          )}

                          <div className="text-right">
                            <span className="text-xxs font-semibold text-slate-500 block font-sans">
                              {activeSession.status === 'reconferencia' ? 'Recount' : 'Contagem'}
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={
                                activeSession.status === 'reconferencia'
                                  ? (asset.rePhysicalQty === undefined || asset.rePhysicalQty === 0 ? '' : asset.rePhysicalQty)
                                  : (asset.physicalQty === 0 ? '' : asset.physicalQty)
                              }
                              onChange={(e) => handleUpdateAssetQty(asset.assetId, e.target.value === '' ? 0 : Number(e.target.value))}
                              className={`w-16 text-xs text-center font-bold rounded p-1.5 focus:outline-none ${
                                activeSession.status === 'reconferencia'
                                  ? 'bg-white border border-red-200 focus:ring-1 focus:ring-red-500 font-sans'
                                  : 'bg-slate-50 border border-slate-200 focus:ring-1 focus:ring-amber-500'
                              }`}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SEÇÃO REFUGOS DE ATIVOS DE GIRO */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4" id="section_refugos_ag">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="bg-red-500 text-white text-xs px-2.5 py-0.5 rounded-full font-sans uppercase font-extrabold">Refugos AG</span>
                    <h3 className="font-sans font-bold text-slate-950 text-sm uppercase">Refugo & Avarias de Ativos de Giro</h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Registro e Evidenciamento por Câmera</span>
                </div>

                <p className="text-xs text-slate-500">
                  Caso existam garrafas trincadas/quebradas, garrafeiras quebradas ou outros ativos com avaria, registre as quantidades e motivos abaixo. Tire fotos para auditoria.
                </p>

                {/* Refugo addition sub-form */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans">Ativo de Giro (Retornado)</th>
                          <th className="pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans text-center w-28">Qtd Refugada</th>
                          <th className="pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-sans w-52">Motivo do Refugo / Avaria</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeSession.assets.map((asset) => {
                          const mappedCode = getAssetCode(asset.assetId, asset.assetName);
                          const canonicalName = getAssetCanonicalName(mappedCode) || asset.assetName;
                          
                          // Read directly from the persistent refugos array in activeSession
                          const refugoEntry = (activeSession.refugos || []).find(r => r.assetId === asset.assetId);
                          const currentQty = refugoEntry ? String(refugoEntry.qty) : '';
                          const currentReason = refugoEntry ? refugoEntry.reason : 'BICADA EXTERNA';
                          
                          return (
                            <tr key={asset.assetId} className="hover:bg-slate-100/50 transition-colors">
                              <td className="py-2.5">
                                <span className="font-sans font-semibold text-slate-800 text-xs block">
                                  {canonicalName}
                                </span>
                                {mappedCode && (
                                  <span className="font-mono text-[9px] font-bold text-slate-400 bg-slate-150 px-1 py-0.2 rounded border border-slate-200 mt-0.5 inline-block">
                                    {mappedCode}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={currentQty}
                                  placeholder=""
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateRefugo(asset.assetId, val, currentReason);
                                  }}
                                  className="w-20 text-xs p-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 font-mono text-center font-bold"
                                />
                              </td>
                              <td className="py-2.5">
                                <select
                                  value={currentReason}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleUpdateRefugo(asset.assetId, currentQty, val);
                                  }}
                                  className="w-full text-xxs p-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 font-sans"
                                >
                                  <option value="BICADA EXTERNA">BICADA EXTERNA</option>
                                  <option value="BICADA INTERNA">BICADA INTERNA</option>
                                  <option value="QUEBRADA">QUEBRADA</option>
                                  <option value="SEGUNDA (OUTRAS EMPRESAS)">SEGUNDA (GARRAFAS DE OUTRAS EMPRESAS)</option>
                                  <option value="COLORAÇÃO FORA DO PADRÃO">COLORAÇÃO FORA DO PADRÃO</option>
                                  <option value="TAMPADA">TAMPADA</option>
                                  <option value="SUJIDADE INTERNA">SUJIDADE INTERNA</option>
                                  <option value="SUJIDADE EXTERNA">SUJIDADE EXTERNA</option>
                                  <option value="GARRAFEIRA QUEBRADA">GARRAFEIRA QUEBRADA</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                    {/* Refugo Camera Integration (Multi-photo!) */}
                    <div className="space-y-2">
                      <span className="block text-[10px] font-bold text-slate-600 uppercase font-sans">4. Evidência Fotográfica do Refugo</span>
                      <p className="text-[10px] text-slate-500">Tire fotos ou anexe imagens que comprovem os refugos registrados.</p>
                      
                      <div className="grid grid-cols-3 gap-2">
                        {refugoPhotos.map((photo, pIdx) => (
                          <div key={pIdx} className="relative aspect-video rounded-lg overflow-hidden border border-slate-300 shadow-sm bg-slate-900 group">
                            <img src={photo} alt={`Refugo ${pIdx + 1}`} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                            <button
                              type="button"
                              onClick={() => setRefugoPhotos(prev => prev.filter((_, idx) => idx !== pIdx))}
                              className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white p-1 rounded-full shadow-md transition cursor-pointer animate-fade-in"
                              title="Remover foto"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {refugoPhotos.length === 0 && (
                          <div className="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center bg-slate-100/50 flex flex-col items-center justify-center space-y-1 h-32 col-span-3">
                            <Camera className="h-8 w-8 text-slate-400" />
                            <span className="text-xxs text-slate-400">Nenhuma foto do refugo capturada</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            startWebcam('refugo');
                          }}
                          className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 px-2 rounded-lg text-[10px] flex items-center justify-center space-x-1 cursor-pointer transition shadow-2xs font-sans uppercase"
                        >
                          <Camera className="h-3 w-3" />
                          <span>Tirar Foto</span>
                        </button>

                        <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-2 rounded-lg text-[10px] flex items-center justify-center space-x-1 cursor-pointer border border-slate-300 transition shadow-2xs text-center font-sans uppercase">
                          <span>Anexar Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files) {
                                Array.from(files).forEach(file => {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    const img = new Image();
                                    img.onload = () => {
                                      const canvas = document.createElement('canvas');
                                      canvas.width = 480;
                                      canvas.height = 360;
                                      const ctx = canvas.getContext('2d');
                                      if (ctx) {
                                        ctx.drawImage(img, 0, 0, 480, 360);
                                        
                                        // Draw watermark
                                        ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
                                        ctx.fillRect(0, 325, 480, 35);
                                        
                                        ctx.fillStyle = '#ffffff';
                                        ctx.font = 'bold 9px monospace';
                                        ctx.fillText(`REFUGO REGISTRADO - AMBEV`, 10, 338);
                                        ctx.font = '8px sans-serif';
                                        ctx.fillText(`Mapa: ${activeSession.routeMap} • Data: ${new Date().toLocaleString()}`, 10, 348);
                                        
                                        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
                                        setRefugoPhotos(prev => [...prev, dataUrl]);
                                      }
                                    };
                                    img.src = event.target?.result as string;
                                  };
                                  reader.readAsDataURL(file as any);
                                });
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Informative Help Panel */}
                    <div className="flex flex-col justify-center space-y-3 bg-red-50/40 p-4 rounded-xl border border-red-100">
                      <div className="flex items-start space-x-2.5">
                        <Camera className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="block text-xs font-bold text-red-950 uppercase tracking-wider font-sans">Vínculo Automático de Fotos</span>
                          <p className="text-[11px] text-red-800 leading-relaxed font-sans">
                            As fotos capturadas ou anexadas acima serão salvas e associadas automaticamente aos itens de refugo preenchidos assim que você enviar a conferência física. Não é necessário salvar individualmente!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Display list of refugos */}
                {(activeSession.refugos || []).length > 0 ? (
                  <div className="space-y-2 pt-2">
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Refugos Adicionados na Sessão ({activeSession.refugos?.length}):</span>
                    <div className="border border-slate-150 rounded-lg overflow-hidden bg-white divide-y divide-slate-100">
                      {activeSession.refugos?.map((ref) => (
                        <div key={ref.id} className="flex items-center justify-between p-3 hover:bg-slate-50 transition">
                          <div className="flex items-center space-x-3">
                            {(() => {
                              const photoUrl = ref.photoId
                                ? sessionPhotos.find(p => p.id === ref.photoId)?.photoUrl
                                : (ref.photoUrl || sessionPhotos.find(p => p.itemCode === ref.id || p.itemCode === ref.assetId)?.photoUrl);
                              return photoUrl ? (
                                <div className="w-10 h-10 rounded border border-slate-200 overflow-hidden bg-slate-50 shrink-0">
                                  <img src={photoUrl} alt="Thumbnail" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded border border-dashed border-slate-200 flex items-center justify-center bg-slate-50 shrink-0">
                                  <Camera className="h-4 w-4 text-slate-300" />
                                </div>
                              );
                            })()}
                            <div>
                              <div className="font-sans font-bold text-slate-900 text-xs">{ref.assetName}</div>
                              <div className="flex items-center space-x-2 mt-0.5">
                                <span className="bg-red-50 text-red-700 font-extrabold text-[9px] px-1.5 py-0.2 rounded font-sans uppercase">{ref.reason}</span>
                                <span className="text-xxs text-slate-400">Qtd: <strong>{ref.qty} un</strong></span>
                              </div>
                            </div>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              const updatedRefugos = (activeSession.refugos || []).filter(r => r.id !== ref.id);
                              const updatedSession = { ...activeSession, refugos: updatedRefugos };
                              setActiveSession(updatedSession);
                              const updatedAudits = audits.map(a => a.id === activeSession.id ? updatedSession : a);
                              onSaveAudits(updatedAudits);
                            }}
                            className="text-slate-400 hover:text-red-600 p-1.5 rounded transition hover:bg-red-50 cursor-pointer"
                            title="Remover refugo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 border border-dashed border-slate-200 rounded-xl text-xxs text-slate-400 italic">
                    Nenhum refugo registrado nesta conferência.
                  </div>
                )}
              </div>

              {/* Action Operations Card with obligatoriness logic display */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex flex-col space-y-3 shadow-inner">
                {activeSession.status === 'reconferencia' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-900 text-xxs font-sans flex items-start space-x-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 mt-0.5" />
                    <div>
                      <strong>CONTROLE DE QUALIDADE OBRIGATÓRIO ATIVO:</strong>
                      <span className="block mt-0.5">
                        Como há divergências abertas, você deve anexar pelo menos 1 foto prova. {sessionPhotos.length > 0 ? (
                          <span className="text-emerald-700 font-bold block mt-0.5">✓ Evidência adicionada! Liberado para envio.</span>
                        ) : (
                          <span className="text-red-700 font-bold block mt-0.5">✗ Nenhuma evidência adicionada. Envio travado!</span>
                        )}
                      </span>
                    </div>
                  </div>
                )}

                <span className="text-xxs text-slate-500 block text-center font-sans">
                  Ao finalizar, sua contagem física será travada e disponibilizada para reconciliação fiscal do auxiliar de logística.
                </span>
                
                <button
                  type="button"
                  onClick={handleFinishPhysicalAudit}
                  className={`w-full text-white font-bold py-3.5 px-4 rounded-lg shadow-md transition-all flex items-center justify-center space-x-2 text-base cursor-pointer ${
                    activeSession.status === 'reconferencia' && sessionPhotos.length === 0
                      ? 'bg-red-400 cursor-not-allowed opacity-80'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  <UserCheck className="h-5 w-5" />
                  <span>
                    {activeSession.status === 'reconferencia' ? 'Enviar Reconferência Física' : 'Enviar Conferência Física'}
                  </span>
                </button>
              </div>

            </div>

          </div>
          )}
        </div>
      )}

      {/* URGENT SUSPENSION MODAL */}
      {showSuspensionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto animate-fade-in" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Background overlay - positioned below the modal panel */}
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity cursor-pointer" 
            onClick={() => {
              setShowSuspensionModal(false);
              setSuspensionNotesText('');
            }}
          ></div>

          {/* Scrolling wrapper for modal panel with pointer-events-none */}
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0 relative pointer-events-none">
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
            
            {/* Modal panel - relative z-10 and pointer-events-auto to capture clicks */}
            <div className="relative z-10 pointer-events-auto inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-slate-200">
              <div className="bg-white px-6 pt-6 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-amber-50 sm:mx-0 sm:h-10 sm:w-10 border border-amber-200">
                    <AlertTriangle className="h-6 w-6 text-amber-500 animate-pulse" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-sans font-black text-slate-900 uppercase tracking-tight" id="modal-title">
                      Confirmar Pausa da Conferência?
                    </h3>
                    <div className="mt-2">
                      <p className="text-xs text-slate-600">
                        Você tem certeza de que deseja realizar a pausa da conferência física? O cronômetro será interrompido imediatamente. Para prosseguir, selecione ou digite o motivo da pausa abaixo.
                      </p>
                    </div>

                    {/* Pre-defined options */}
                    <div className="mt-4 space-y-2">
                      <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Selecione o Motivo da Pausa:</span>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          'Ida ao banheiro / Necessidade Fisiológica',
                          'Parada técnica solicitada pela supervisão',
                          'Necessidade urgente de apoio em outro veículo',
                          'Dúvida de carga / Conferência de Nota Fiscal com Divergência',
                        ].map((reasonOption) => (
                          <button
                            key={reasonOption}
                            type="button"
                            onClick={() => setSuspensionNotesText(reasonOption)}
                            className={`w-full text-left text-xs px-3 py-2.5 rounded-lg transition cursor-pointer font-medium border ${
                              suspensionNotesText === reasonOption
                                ? 'bg-amber-100 text-amber-900 border-amber-400'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {reasonOption}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4">
                      <label htmlFor="suspension_notes" className="text-[10px] text-slate-500 font-bold block uppercase mb-1 tracking-wider">
                        Ou digite o motivo detalhado:
                      </label>
                      <textarea
                        id="suspension_notes"
                        rows={3}
                        className="w-full p-3 bg-slate-50 text-slate-850 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none font-sans"
                        placeholder="Informe o motivo da parada técnica ou urgência..."
                        value={suspensionNotesText}
                        onChange={(e) => setSuspensionNotesText(e.target.value)}
                      ></textarea>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-4 sm:px-6 sm:flex sm:flex-row-reverse gap-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={!suspensionNotesText.trim()}
                  onClick={() => {
                    handleUrgentSuspend(suspensionNotesText.trim());
                    setShowSuspensionModal(false);
                    setSuspensionNotesText('');
                  }}
                  className={`w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                    suspensionNotesText.trim()
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer shadow-xs'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Confirmar Pausa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSuspensionModal(false);
                    setSuspensionNotesText('');
                  }}
                  className="mt-3 sm:mt-0 w-full inline-flex justify-center rounded-lg border border-slate-200 shadow-sm px-4 py-2.5 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition font-sans"
                >
                  Voltar à Conferência
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in" id="custom_confirm_modal_conferente">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="p-2 bg-amber-50 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 animate-bounce" />
              </div>
              <h3 className="font-sans font-bold text-slate-950 text-sm">{confirmModal.title}</h3>
            </div>
            
            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmModal.message}
            </p>
            
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xxs font-bold rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-[#0f35a9] hover:bg-[#0c2a86] text-white text-xxs font-bold rounded-lg transition shadow-3xs"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BLITZ DE REFUGO CONFIRMATION MODAL */}
      {showBlitzModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in" id="blitz_refugo_modal">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="p-2 bg-red-50 rounded-lg">
                <ShieldCheck className="h-6 w-6 text-red-600 animate-pulse" />
              </div>
              <div>
                <h3 className="font-sans font-black text-slate-950 text-sm uppercase tracking-wide">Blitz de Refugo Obrigatória!</h3>
                <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider font-mono">Veículo Sorteado em Sistema</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Este veículo (Placa: <strong>{activeSession?.plate}</strong>, Rota: <strong>{activeSession?.routeMap}</strong>) foi sorteado na escala circular para a realização da <strong>Blitz de Refugo</strong>.
              <br /><br />
              O conferente tem o dever de fazer o rebatimento completo das caixas. Certifique-se de que todas as avarias e refugos identificados foram inseridos na aba <strong>"Refugos e Avarias"</strong> antes de prosseguir com a finalização.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBlitzModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xxs font-bold rounded-lg transition uppercase font-sans"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmBlitz}
                className="px-4 py-2 bg-red-600 hover:bg-red-750 text-white text-xxs font-bold rounded-lg transition shadow-sm hover:shadow uppercase font-sans"
              >
                Entendi, Finalizar Conferência com Blitz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botão Flutuante da Calculadora de Garrafas */}
      <div className="fixed bottom-20 right-3 sm:bottom-24 sm:right-6 z-40 font-sans max-w-[calc(100vw-1.5rem)]" id="bottle_calculator_fab_wrapper">
        <button
          type="button"
          id="btn_toggle_calculator"
          onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}
          className={`flex items-center justify-center p-3.5 rounded-full shadow-lg border text-white transition-all hover:scale-105 active:scale-95 ${
            isCalculatorOpen
              ? 'bg-amber-600 border-amber-700 ring-2 ring-amber-500'
              : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-700'
          }`}
          title="Calculadora de Garrafas"
        >
          <Calculator className="h-5 w-5" />
        </button>
      </div>

      {/* Janela Flutuante da Calculadora */}
      {isCalculatorOpen && (
        <div 
          id="bottle_calculator_window"
          className="fixed bottom-32 right-3 sm:bottom-36 sm:right-6 z-50 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl w-[calc(100vw-1.5rem)] max-w-xs sm:w-80 p-5 text-white animate-fade-in"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center space-x-2 text-amber-400">
              <Calculator className="h-5 w-5" />
              <span className="font-sans font-bold text-sm uppercase tracking-wider">Calculadora de Garrafas</span>
            </div>
            <button
              type="button"
              onClick={() => setIsCalculatorOpen(false)}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Digite a quantidade de garrafeiras de 600ml para obter a multiplicação automática por 24 garras.
            </p>

            {/* Garrafeira 600ml */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase block font-sans">Garrafeira 600ML</label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0"
                  placeholder="Qtd Garrafeiras"
                  value={calc600}
                  onChange={(e) => setCalc600(e.target.value === '' ? '' : Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 w-full font-mono font-bold"
                />
                <span className="text-xs text-slate-400 font-bold shrink-0">➔</span>
                <div className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-400 font-mono font-extrabold w-28 text-center shrink-0">
                  {calc600 !== '' ? calc600 * 24 : 0} <span className="text-[9px] text-slate-400 uppercase font-sans font-bold">garras</span>
                </div>
              </div>
            </div>

            {/* Apply & Reset Buttons */}
            <div className="pt-2 flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  setCalc600('');
                }}
                className="w-1/2 bg-slate-800 hover:bg-slate-750 text-slate-300 py-1.5 rounded-lg text-[10px] font-bold uppercase transition"
              >
                Limpar
              </button>
              {activeSession ? (
                <button
                  type="button"
                  onClick={handleApplyCalculator}
                  className="w-1/2 bg-amber-500 hover:bg-amber-600 text-slate-950 py-1.5 rounded-lg text-[10px] font-bold uppercase transition"
                >
                  Aplicar Saldo
                </button>
              ) : (
                <div className="w-1/2 text-center text-[9px] text-slate-500 py-1.5 font-sans">
                  Abra uma rota para aplicar
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
