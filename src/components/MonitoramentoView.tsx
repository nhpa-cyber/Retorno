import React, { useState } from 'react';
import { User, ImportedRoute, ReturnForecast, Driver, Vehicle, AuditSession, RouteObservation } from '../types';
import { Truck, Clock, Calendar, Check, Save, RefreshCw, AlertCircle, FileSpreadsheet, MapPin, AlertTriangle, BarChart3, Plus, MessageSquare, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

interface MonitoramentoViewProps {
  currentUser: User;
  importedRoutes: ImportedRoute[];
  onSaveImportedRoutes: (routes: ImportedRoute[]) => void;
  returnForecasts: ReturnForecast[];
  onSaveForecasts: (forecasts: ReturnForecast[]) => void;
  drivers: Driver[];
  onSaveDrivers?: (drivers: Driver[]) => void;
  vehicles: Vehicle[];
  audits?: AuditSession[];
  onSaveAudits?: (audits: AuditSession[]) => void;
}

export default function MonitoramentoView({
  currentUser,
  importedRoutes = [],
  onSaveImportedRoutes,
  returnForecasts = [],
  onSaveForecasts,
  drivers = [],
  onSaveDrivers,
  vehicles = [],
  audits = [],
  onSaveAudits
}: MonitoramentoViewProps) {
  // Helper to determine if a route is closed based on audits
  const isRouteClosedInAudits = (routeMap: string) => {
    return audits.some(a => 
      (a.routeMap.toUpperCase() === routeMap.toUpperCase() || 
       (a.unifiedMaps && a.unifiedMaps.some(m => m.toUpperCase() === routeMap.toUpperCase()))) &&
      (a.status === 'finalizado_ok' || a.status === 'finalizado_divergente')
    );
  };

  // Local state for editing route forecast
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedObsRouteId, setSelectedObsRouteId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [isDriverDragOver, setIsDriverDragOver] = useState(false);
  const [etaStart, setEtaStart] = useState('15:00');
  const [etaEnd, setEtaEnd] = useState('16:00');
  const [obs, setObs] = useState('');
  const [tripStatus, setTripStatus] = useState<'retornam' | 'pernoitam'>('retornam');
  const [status, setStatus] = useState<'em_rota' | 'chegando' | 'no_patio'>('em_rota');
  const [discrepancyObs, setDiscrepancyObs] = useState('');
  const [obsAuthor, setObsAuthor] = useState<'Monitoramento' | 'Financeiro'>('Monitoramento');
  const [obsText, setObsText] = useState('');
  const [obsType, setObsType] = useState<'sobra' | 'falta' | 'todos'>('todos');

  // Justifications local state for overdue alerts
  const [justificationTexts, setJustificationTexts] = useState<Record<string, string>>({});

  const getForecastStatusLabel = (f: ReturnForecast) => {
    const matchingRoute = importedRoutes.find(r => r.routeMap.toUpperCase() === f.routeMap.toUpperCase());
    
    if (f.tripStatus === 'pernoitam') {
      return {
        label: 'PERNOITE',
        color: 'bg-red-100 text-red-700 border-red-300 font-extrabold uppercase'
      };
    }

    if (matchingRoute && (matchingRoute.status === 'conferindo' || matchingRoute.status === 'em_analise')) {
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

  const handleSaveJustification = (routeId: string) => {
    const text = justificationTexts[routeId];
    if (!text || !text.trim()) {
      alert("Por favor, digite uma justificativa antes de salvar.");
      return;
    }

    const updatedRoutes = importedRoutes.map(r => {
      if (r.id === routeId) {
        return { ...r, justification: text };
      }
      return r;
    });

    onSaveImportedRoutes(updatedRoutes);
    alert("Justificativa de atraso de fechamento registrada com sucesso!");
  };

  const handleStartEditing = (route: ImportedRoute) => {
    setSelectedRouteId(route.id);
    setSelectedDriverId(route.driverId || '');
    
    // Find existing forecast if any
    const existing = returnForecasts.find(f => f.routeMap === route.routeMap);
    if (existing && existing.eta) {
      if (existing.eta.includes(' as ')) {
        const parts = existing.eta.split(' as ');
        setEtaStart(parts[0] || '15:00');
        setEtaEnd(parts[1] || '16:00');
      } else {
        setEtaStart(existing.eta || '15:00');
        const [h, m] = (existing.eta || '15:00').split(':');
        const nextHour = (parseInt(h) + 1) % 24;
        const paddedHour = nextHour.toString().padStart(2, '0');
        setEtaEnd(`${paddedHour}:${m || '00'}`);
      }
      setTripStatus(existing.tripStatus || 'retornam');
      setStatus(existing.status || 'em_rota');
    } else {
      setEtaStart('15:00');
      setEtaEnd('16:00');
      setTripStatus('retornam');
      setStatus('em_rota');
    }
    setDiscrepancyObs(route.discrepancyObservation || '');
    setObs('');
  };

  const handleSaveTracking = (route: ImportedRoute) => {
    if (!etaStart || !etaEnd) {
      alert('Por favor, informe a janela de previsão de horário (De / Até).');
      return;
    }

    const finalEta = `${etaStart} as ${etaEnd}`;

    // 1. Create or update ReturnForecast
    const existingIndex = returnForecasts.findIndex(f => f.routeMap.toUpperCase() === route.routeMap.toUpperCase());
    
    // Find driver name or matched name
    const matchedDriver = drivers.find(d => d.id === selectedDriverId);
    const dName = matchedDriver ? matchedDriver.name : 'Motorista Sob Consulta';

    const newForecast: ReturnForecast = {
      id: returnForecasts[existingIndex]?.id || `fc_${Date.now()}`,
      plate: route.plate,
      driverName: dName,
      routeMap: route.routeMap,
      eta: finalEta,
      status: status,
      tripStatus: tripStatus,
      updatedAt: new Date().toISOString()
    };

    let updatedForecasts = [...returnForecasts];
    if (existingIndex > -1) {
      updatedForecasts[existingIndex] = newForecast;
    } else {
      updatedForecasts.push(newForecast);
    }
    onSaveForecasts(updatedForecasts);

    // 2. If tripStatus is 'pernoitam', we can optionally update something or just let the Conferente know they stayed overnight.
    // Also change status of ImportedRoute if appropriate
    if (onSaveImportedRoutes) {
      const updatedRoutes = importedRoutes.map(r => {
        if (r.id === route.id) {
          return {
            ...r,
            driverId: selectedDriverId,
            // If they are in court, keep state or mark
            status: status === 'no_patio' ? ('conferindo' as const) : r.status,
            discrepancyObservation: discrepancyObs.trim() || undefined,
            routeObservations: r.routeObservations
          };
        }
        return r;
      });
      onSaveImportedRoutes(updatedRoutes);
    }

    setSelectedRouteId(null);
    alert(`Previsão do mapa ${route.routeMap} salva com sucesso! O Conferente e o Fiscal já conseguem ver as atualizações em tempo real.`);
  };

  const handleAddObservation = (route: ImportedRoute) => {
    if (!obsText.trim()) {
      alert('Por favor, digite uma observação antes de salvar.');
      return;
    }

    const newObs: RouteObservation = {
      id: `obs_${Date.now()}`,
      author: obsAuthor,
      text: obsText.trim(),
      timestamp: new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      type: obsType
    };

    const currentObsList = route.routeObservations || [];
    const updatedObsList = [...currentObsList, newObs];

    // 1. Update ImportedRoute with combined discrepancy string too for legacy compatibility
    const updatedRoutes = importedRoutes.map(r => {
      if (r.id === route.id) {
        const combinedString = updatedObsList.map(o => `[${o.author} - ${o.timestamp}]: ${o.text}`).join('\n');
        return {
          ...r,
          routeObservations: updatedObsList,
          discrepancyObservation: combinedString
        };
      }
      return r;
    });
    onSaveImportedRoutes(updatedRoutes);

    // 2. Sync to active AuditSession (and reconciliationNotes)
    if (audits && onSaveAudits) {
      const updatedAudits = audits.map(audit => {
        if (audit.routeMap.toUpperCase() === route.routeMap.toUpperCase()) {
          let currentNotes = audit.reconciliationNotes || '';
          const newObsStr = `[${newObs.author} - ${newObs.timestamp}]: ${newObs.text}`;
          if (currentNotes) {
            if (!currentNotes.includes(newObsStr)) {
              currentNotes = currentNotes + '\n' + newObsStr;
            }
          } else {
            currentNotes = newObsStr;
          }

          return {
            ...audit,
            routeObservations: updatedObsList,
            reconciliationNotes: currentNotes
          };
        }
        return audit;
      });
      onSaveAudits(updatedAudits);
    }

    setObsText('');
    setObsType('todos');
    alert(`Observação do ${obsAuthor} adicionada com sucesso e sincronizada com o painel da auxiliar!`);
  };

  // Group imported routes by date
  const uniqueDates = Array.from(new Set(importedRoutes.map(r => r.routeDate))).sort();
  const [selectedDate, setSelectedDate] = useState(() => {
    return uniqueDates[uniqueDates.length - 1] || new Date().toISOString().split('T')[0];
  });

  const routesForSelectedDate = importedRoutes.filter(r => r.routeDate === selectedDate && r.status !== 'fechado' && !isRouteClosedInAudits(r.routeMap));

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-8" id="monitoramento_workspace">
      
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="bg-amber-500 text-slate-950 font-extrabold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded shadow-xs font-mono">
            Módulo de Monitoramento e Rastreabilidade
          </span>
          <h1 className="font-sans font-extrabold text-2xl tracking-tight text-white mt-1 uppercase">
            Painel de Previsão & Controle de Chegadas
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Insira previsões de horário (ETA), observações de viagem e configure o status das cargas que retornam ou pernoitam no pátio.
          </p>
        </div>
        
        {/* Date Filter */}
        <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 rounded-xl p-2">
          <Calendar className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-semibold text-slate-300 font-sans uppercase">Filtrar por Rota:</span>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs bg-transparent border-none text-white focus:outline-none font-semibold font-mono"
          >
            {uniqueDates.length === 0 ? (
              <option value={new Date().toISOString().split('T')[0]}>Sem rotas importadas</option>
            ) : (
              uniqueDates.map(d => (
                <option key={d} value={d} className="bg-slate-900 text-white">
                  {new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* 1. VISUAL CHARTS AND STATUS GRAPHS BLOCK */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8" id="monitoramento_graphics_section">
        
        {/* Closure Status Distribution Chart card */}
        <div className="md:col-span-8 bg-white rounded-xl border border-slate-200 p-6 shadow-3xs space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100">
            <h3 className="font-sans font-bold text-slate-900 text-sm uppercase flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              <span>Status de Fechamento de Mapas (Visão Gráfica)</span>
            </h3>
            <span className="text-xxs font-mono text-slate-400 font-bold">Consolidado Geral</span>
          </div>

          {(() => {
            const total = importedRoutes.length;
            const closed = importedRoutes.filter(r => r.status === 'fechado').length;
            const auditing = importedRoutes.filter(r => r.status === 'conferindo').length;
            const pending = importedRoutes.filter(r => r.status === 'pendente').length;

            const closedPct = total > 0 ? (closed / total) * 100 : 0;
            const auditingPct = total > 0 ? (auditing / total) * 100 : 0;
            const pendingPct = total > 0 ? (pending / total) * 100 : 0;

            return (
              <div className="space-y-6">
                {/* Visual bar graph representation */}
                <div className="h-8 rounded-xl overflow-hidden flex shadow-3xs border border-slate-100">
                  {closedPct > 0 && (
                    <div 
                      className="bg-emerald-500 h-full flex items-center justify-center text-white text-[10px] font-bold transition-all"
                      style={{ width: `${closedPct}%` }}
                      title={`Fechados: ${closed} (${closedPct.toFixed(0)}%)`}
                    >
                      {closedPct > 10 && `Fechados (${closedPct.toFixed(0)}%)`}
                    </div>
                  )}
                  {auditingPct > 0 && (
                    <div 
                      className="bg-amber-500 h-full flex items-center justify-center text-slate-950 text-[10px] font-bold transition-all"
                      style={{ width: `${auditingPct}%` }}
                      title={`Conferindo: ${auditing} (${auditingPct.toFixed(0)}%)`}
                    >
                      {auditingPct > 10 && `Conferindo (${auditingPct.toFixed(0)}%)`}
                    </div>
                  )}
                  {pendingPct > 0 && (
                    <div 
                      className="bg-red-500 h-full flex items-center justify-center text-white text-[10px] font-bold transition-all"
                      style={{ width: `${pendingPct}%` }}
                      title={`Pendentes: ${pending} (${pendingPct.toFixed(0)}%)`}
                    >
                      {pendingPct > 10 && `Pendentes (${pendingPct.toFixed(0)}%)`}
                    </div>
                  )}
                  {total === 0 && (
                    <div className="bg-slate-100 w-full h-full flex items-center justify-center text-slate-400 text-xs italic">
                      Sem dados de rotas cadastrados
                    </div>
                  )}
                </div>

                {/* Legend Grid */}
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                    <span className="text-xxs text-slate-400 font-bold uppercase block font-mono">Baixados (Ok)</span>
                    <span className="text-xl font-bold font-sans text-emerald-600 block mt-1">{closed}</span>
                    <span className="text-[10px] text-slate-500 block">({closedPct.toFixed(1)}%)</span>
                  </div>
                  <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                    <span className="text-xxs text-slate-400 font-bold uppercase block font-mono">Em Aferição</span>
                    <span className="text-xl font-bold font-sans text-amber-600 block mt-1">{auditing}</span>
                    <span className="text-[10px] text-slate-500 block">({auditingPct.toFixed(1)}%)</span>
                  </div>
                  <div className="p-3 bg-red-50/50 rounded-xl border border-red-100">
                    <span className="text-xxs text-slate-400 font-bold uppercase block font-mono">Pendentes</span>
                    <span className="text-xl font-bold font-sans text-red-600 block mt-1">{pending}</span>
                    <span className="text-[10px] text-slate-500 block">({pendingPct.toFixed(1)}%)</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Delay alert system card */}
        <div className="md:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-3xs flex flex-col justify-between">
          <div>
            <h3 className="font-sans font-bold text-slate-900 text-sm uppercase flex items-center space-x-2 border-b border-slate-100 pb-3 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-500 animate-pulse" />
              <span>Alertas de Atraso (&gt;= 2 dias)</span>
            </h3>

            {(() => {
              const overdueRoutesList = importedRoutes.filter(route => {
                if (route.status === 'fechado') return false;
                const today = new Date();
                const rDateObj = new Date(route.routeDate + 'T00:00:00');
                const diffTime = today.getTime() - rDateObj.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                return diffDays >= 2;
              });

              if (overdueRoutesList.length === 0) {
                return (
                  <div className="text-center py-8 text-slate-400 space-y-1 bg-slate-50 rounded-xl border border-dashed border-slate-200 p-4">
                    <Check className="h-6 w-6 text-emerald-600 mx-auto" />
                    <p className="text-xs font-semibold text-slate-800">Conformidade Plena!</p>
                    <p className="text-xxs text-slate-400 leading-relaxed">Nenhum mapa pendente de fechamento há mais de 2 dias.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                  {overdueRoutesList.map(route => {
                    const rDateObj = new Date(route.routeDate + 'T00:00:00');
                    const daysOld = Math.floor((new Date().getTime() - rDateObj.getTime()) / (1000 * 60 * 60 * 24));

                    return (
                      <div key={route.id} className="bg-red-50/40 p-3 rounded-lg border border-red-200 space-y-2 text-xxs">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-slate-900 font-sans block">{route.routeMap}</span>
                            <span className="font-mono text-[9px] text-slate-400 bg-white border px-1 rounded block mt-0.5 w-max">Placa: {route.plate}</span>
                          </div>
                          <span className="text-[9px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded uppercase">
                            Atraso {daysOld} dias
                          </span>
                        </div>

                        {route.justification ? (
                          <div className="bg-white p-2 rounded border border-slate-150">
                            <span className="text-[9px] text-slate-400 font-bold block uppercase font-mono">Justificativa Registrada:</span>
                            <p className="text-slate-700 italic leading-tight mt-0.5">{route.justification}</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5 pt-1.5 border-t border-red-100">
                            <label className="block font-bold text-slate-600 uppercase tracking-wider text-[8px]">Solicitar Justificativa de Atraso:</label>
                            <div className="flex space-x-1">
                              <input
                                type="text"
                                placeholder="Digite a justificativa..."
                                value={justificationTexts[route.id] || ''}
                                onChange={e => setJustificationTexts({ ...justificationTexts, [route.id]: e.target.value })}
                                className="flex-1 text-[10px] p-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveJustification(route.id)}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold px-2 rounded flex items-center justify-center transition cursor-pointer"
                                title="Salvar Justificativa"
                              >
                                <Save className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT 2 COLUMNS: MAPAS IMPORTADOS LIST */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
            <h3 className="font-sans font-bold text-slate-900 text-base mb-4 uppercase tracking-wider flex items-center space-x-2">
              <FileSpreadsheet className="h-5 w-5 text-amber-500" />
              <span>Mapas do dia {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
            </h3>

            {routesForSelectedDate.length === 0 ? (
              <div className="text-center p-12 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                Nenhum mapa importado para a data selecionada.
              </div>
            ) : (
              <div className="space-y-4">
                {routesForSelectedDate.map(route => {
                  const existingForecast = returnForecasts.find(f => f.routeMap.toUpperCase() === route.routeMap.toUpperCase());
                  const matchedDriver = drivers.find(d => d.id === route.driverId);
                  const isEditing = selectedRouteId === route.id;

                  return (
                    <div
                      key={route.id}
                      className={`p-5 rounded-xl border transition-all ${
                        isEditing 
                          ? 'border-amber-400 bg-amber-50/10 ring-1 ring-amber-400 shadow-sm'
                          : existingForecast?.tripStatus === 'pernoitam'
                            ? 'border-red-300 bg-red-50/30 text-slate-900 shadow-3xs'
                            : 'border-slate-150 bg-slate-50/50 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <div className="flex items-center space-x-2.5">
                            <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 shadow-3xs">
                              {route.plate}
                            </span>
                            <span className="text-slate-900 font-extrabold text-sm font-sans">
                              Mapa: {route.routeMap}
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              route.status === 'fechado' 
                                ? 'bg-slate-100 text-slate-800'
                                : 'bg-amber-100 text-amber-800 animate-pulse'
                            }`}>
                              {route.status === 'fechado' ? 'Aferido/Fechado' : 'Em Rota'}
                            </span>
                          </div>
                          
                          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                            <div className="text-slate-500">
                              <span className="text-slate-400 font-medium">Motorista:</span> {matchedDriver ? matchedDriver.name : (route.driverId === 'temporario' ? 'Temporário' : route.driverId)}
                            </div>
                            <div className="text-slate-500">
                              <span className="text-slate-400 font-medium">Importado em:</span> {new Date(route.importedAt).toLocaleTimeString('pt-BR')}
                            </div>
                          </div>

                          {/* Forecast Badge if exists */}
                          {existingForecast && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="bg-blue-50 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded flex items-center space-x-1 border border-blue-200">
                                <Clock className="h-3 w-3 text-blue-500" />
                                <span>Previsto Janela: {existingForecast.eta}</span>
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                existingForecast.tripStatus === 'pernoitam'
                                  ? 'bg-red-100 text-red-800 border-red-300 font-extrabold uppercase'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}>
                                {existingForecast.tripStatus === 'pernoitam' ? '🌙 Pernoite' : '🚗 Retorna Hoje'}
                              </span>
                            </div>
                          )}
                        </div>

                        {route.status !== 'fechado' && !isEditing && (
                          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0 items-stretch sm:items-center justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                handleStartEditing(route);
                                setSelectedObsRouteId(null);
                              }}
                              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg cursor-pointer transition shadow-3xs text-center flex items-center justify-center h-9 sm:w-[160px] whitespace-nowrap px-4"
                            >
                              Atualizar Previsão
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedObsRouteId === route.id) {
                                  setSelectedObsRouteId(null);
                                } else {
                                  setSelectedObsRouteId(route.id);
                                  setSelectedRouteId(null);
                                  setObsText('');
                                }
                              }}
                              className={`font-bold text-xs rounded-lg cursor-pointer transition shadow-3xs flex items-center justify-center space-x-1.5 border h-9 sm:w-[160px] whitespace-nowrap px-4 ${
                                selectedObsRouteId === route.id
                                  ? 'bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent'
                              }`}
                            >
                              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                              <span>{selectedObsRouteId === route.id ? 'Fechar Observações' : 'Anotar Observação'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* EDIT PANEL EXPANSION */}
                      {isEditing && (
                        <div className="mt-4 pt-4 border-t border-amber-200 space-y-4">
                          <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider font-mono">
                            Parâmetros de Rastreamento (Mapa {route.routeMap})
                          </h4>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                            <div>
                              <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">Previsão Chegada De *</label>
                              <input
                                type="time"
                                value={etaStart}
                                onChange={(e) => setEtaStart(e.target.value)}
                                className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:ring-1 focus:ring-amber-500"
                              />
                            </div>

                            <div>
                              <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">Janela Até *</label>
                              <input
                                type="time"
                                value={etaEnd}
                                onChange={(e) => setEtaEnd(e.target.value)}
                                className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:ring-1 focus:ring-amber-500"
                              />
                            </div>

                            <div>
                              <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">Logística de Retorno *</label>
                              <select
                                value={tripStatus}
                                onChange={(e) => setTripStatus(e.target.value as 'retornam' | 'pernoitam')}
                                className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="retornam">Retorna Hoje (Aferição Direta)</option>
                                <option value="pernoitam">Vai Pernoitar (Fica Aberto)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">Selecionar Motorista</label>
                              <select
                                value={selectedDriverId}
                                onChange={(e) => setSelectedDriverId(e.target.value)}
                                className="w-full text-xs p-2 bg-white border border-slate-200 rounded focus:ring-1 focus:ring-amber-500 font-sans text-slate-800"
                              >
                                <option value="">-- Selecione o Motorista --</option>
                                <option value="temporario">Temporário</option>
                                {drivers.map(d => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="sm:col-span-4 font-sans">
                              <label className="block text-xxs font-bold text-red-600 uppercase mb-1">Divergências de Ativos de Giro ou P.A Mapeados (Guia de Observação)</label>
                              <textarea
                                rows={2}
                                placeholder="Ex: Identificada divergência de 2 paletes PBR ou 5 cx de Spaten. Favor verificar antes do encerramento."
                                value={discrepancyObs}
                                onChange={(e) => setDiscrepancyObs(e.target.value)}
                                className="w-full text-xs p-2.5 bg-white border border-red-250 rounded focus:ring-1 focus:ring-red-500 leading-normal font-sans"
                              />
                              <p className="text-[10px] text-red-500 mt-0.5 font-semibold">Esta observação ficará visível para o Auxiliar de Logística para evitar o fechamento do mapa com divergências.</p>
                            </div>
                          </div>

                          <div className="flex justify-end space-x-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setSelectedRouteId(null)}
                              className="text-xs text-slate-500 hover:bg-slate-100 py-1.5 px-3 rounded font-medium"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveTracking(route)}
                              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs py-1.5 px-4 rounded-lg flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                            >
                              <Save className="h-3.5 w-3.5" />
                              <span>Salvar Tracking</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* DEDICATED OBSERVATIONS PANEL */}
                      {selectedObsRouteId === route.id && (
                        <div className="mt-4 pt-4 border-t border-indigo-200 space-y-4">
                          <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-150 space-y-3 font-sans">
                            <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                              <div className="flex items-center space-x-2">
                                <MessageSquare className="h-4 w-4 text-indigo-600 animate-pulse" />
                                <h5 className="font-sans font-bold text-xs text-slate-800 uppercase">
                                  Observações e Comodatos - Mapa {route.routeMap}
                                </h5>
                              </div>
                              <span className="text-[10px] bg-indigo-100 text-indigo-800 font-extrabold px-2 py-0.5 rounded-full uppercase">
                                Multissetorial
                              </span>
                            </div>

                            {/* LIST OF CURRENT SAVED OBSERVATIONS */}
                            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                              {!route.routeObservations || route.routeObservations.length === 0 ? (
                                <p className="text-xxs text-slate-400 italic">
                                  Nenhuma observação cadastrada para este mapa.
                                </p>
                              ) : (
                                route.routeObservations.map((observation) => {
                                  const isFin = observation.author === 'Financeiro';
                                  const type = observation.type || 'todos';
                                  return (
                                    <div key={observation.id} className="bg-white p-2.5 rounded-lg border border-slate-250 shadow-3xs space-y-1">
                                      <div className="flex justify-between items-center text-[10px]">
                                        <div className="flex items-center space-x-1.5">
                                          <span className={`font-extrabold uppercase px-1.5 py-0.5 rounded text-[8px] ${
                                            isFin 
                                              ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                                              : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                          }`}>
                                            {observation.author}
                                          </span>
                                          {type === 'sobra' && (
                                            <span className="flex items-center space-x-0.5 bg-emerald-50 text-emerald-700 border border-emerald-150 px-1 rounded text-[8px] font-bold">
                                              <ArrowUpCircle className="h-3 w-3 text-emerald-600" />
                                              <span>SOBRA</span>
                                            </span>
                                          )}
                                          {type === 'falta' && (
                                            <span className="flex items-center space-x-0.5 bg-rose-50 text-rose-700 border border-rose-150 px-1 rounded text-[8px] font-bold">
                                              <ArrowDownCircle className="h-3 w-3 text-rose-600" />
                                              <span>FALTA</span>
                                            </span>
                                          )}
                                          {type === 'todos' && (
                                            <span className="flex items-center space-x-0.5 bg-slate-50 text-slate-600 border border-slate-150 px-1 rounded text-[8px] font-bold">
                                              <AlertCircle className="h-3 w-3 text-slate-500" />
                                              <span>TODOS</span>
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-slate-400 font-mono font-medium">{observation.timestamp}</span>
                                      </div>
                                      <p className="text-xxs text-slate-800 font-medium leading-relaxed font-sans whitespace-pre-wrap">
                                        {observation.text}
                                      </p>
                                    </div>
                                  );
                                })
                              )}
                            </div>

                            {/* INPUT FORM FOR NEW OBSERVATION */}
                            <div className="pt-2 border-t border-indigo-150 space-y-2">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                  Nova Observação / Registro de Comodato/Recolha:
                                </span>
                                <div className="flex items-center space-x-2">
                                  <span className="text-[10px] text-slate-400">Setor Autor:</span>
                                  <button
                                    type="button"
                                    onClick={() => setObsAuthor('Monitoramento')}
                                    className={`text-[9px] font-extrabold px-2.5 py-1 rounded transition border cursor-pointer ${
                                      obsAuthor === 'Monitoramento'
                                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-3xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    Monitoramento
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setObsAuthor('Financeiro')}
                                    className={`text-[9px] font-extrabold px-2.5 py-1 rounded transition border cursor-pointer ${
                                      obsAuthor === 'Financeiro'
                                        ? 'bg-purple-600 text-white border-purple-700 shadow-3xs'
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    Financeiro (Comodatos & Recolhas)
                                  </button>
                                </div>
                              </div>



                              <div className="flex gap-2 items-end">
                                <textarea
                                  rows={2}
                                  value={obsText}
                                  onChange={(e) => setObsText(e.target.value)}
                                  placeholder={
                                    obsAuthor === 'Financeiro'
                                      ? "Ex: Cliente NB 4593 possui comodatos de 5 caixas Spaten e recolhas pendentes de vasilhames."
                                      : "Ex: Monitoramento reporta que veículo pernoitará devido a atraso na descarga do último cliente."
                                  }
                                  className="flex-1 text-xs p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-indigo-500 leading-normal font-sans resize-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddObservation(route)}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] px-4 py-2.5 rounded-lg shrink-0 flex flex-col justify-center items-center gap-1 shadow-3xs cursor-pointer transition-all h-[52px]"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  <span>Salvar Obs</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={() => setSelectedObsRouteId(null)}
                              className="text-xs text-slate-500 hover:bg-slate-100 py-1.5 px-3 rounded font-medium cursor-pointer"
                            >
                              Fechar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: VEÍCULOS EM ABERTO & OVERNIGHT SUMMARY */}
        <div className="space-y-6">
          
          {/* Section: Veículos com Mapa em Aberto */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-sans font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center space-x-1.5">
                <MapPin className="h-4.5 w-4.5 text-indigo-600" />
                <span>Veículos com Mapa em Aberto</span>
              </h3>
              <p className="text-xxs text-slate-400 mt-0.5">Visão consolidada das cargas aguardando pátio ou pernoitadas.</p>
            </div>

            {(() => {
              const activeForecastsList = returnForecasts.filter(fc => {
                const todayStr = new Date().toISOString().split('T')[0];

                // Check if route is closed/audit finished
                const matchingRoute = importedRoutes.find(r => r.routeMap.toUpperCase() === fc.routeMap.toUpperCase());
                if (matchingRoute && matchingRoute.status === 'fechado') {
                  return false;
                }

                const isAuditClosed = isRouteClosedInAudits(fc.routeMap);
                if (isAuditClosed) {
                  return false;
                }

                if (fc.status === 'no_patio') {
                  return false;
                }

                // If pernoite, check date rollover
                if (fc.tripStatus === 'pernoitam') {
                  if (fc.updatedAt && fc.updatedAt.split('T')[0] < todayStr) {
                    return false;
                  }
                }

                return true;
              });

              if (activeForecastsList.length === 0) {
                return <p className="text-xxs text-slate-400 italic py-4 text-center">Nenhum veículo em rota ou pernoitado registrado.</p>;
              }

              return (
                <div className="space-y-3">
                  {activeForecastsList.map(fc => {
                    const statusInfo = getForecastStatusLabel(fc);
                    const isPernoite = fc.tripStatus === 'pernoitam';
                    return (
                      <div
                        key={fc.id}
                        className={`p-3 rounded-xl border flex justify-between items-center transition-all ${
                          isPernoite
                            ? 'bg-red-50 border-red-300 text-red-950 shadow-3xs'
                            : statusInfo.label.includes('CONFERINDO')
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                              : statusInfo.label === 'CHEGANDO'
                                ? 'bg-amber-50 border-amber-300 text-amber-950'
                                : 'bg-slate-50 border-slate-150 text-slate-800'
                        }`}
                      >
                        <div>
                          <span className="text-xs font-extrabold block">{fc.routeMap}</span>
                          <span className="text-xxs font-mono">Placa: {fc.plate}</span>
                          <span className="text-[10px] block mt-0.5 font-medium">{fc.driverName}</span>
                        </div>

                        <div className="text-right space-y-1">
                          <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded block text-center border ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                          <span className="text-xxs font-bold block font-mono">ETA: {fc.eta}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Help Box */}
          <div className="bg-amber-50/30 rounded-xl border border-amber-200/60 p-5 space-y-2">
            <div className="flex items-center space-x-2 text-amber-800">
              <AlertCircle className="h-5 w-5" />
              <h4 className="text-xs font-bold uppercase font-sans tracking-wide">Instruções de Integração</h4>
            </div>
            <p className="text-xxs text-slate-600 leading-relaxed font-sans">
              As previsões de horário, tripStatus (Pernoite) e status de viagem salvos pelo Monitoramento aparecem imediatamente para o <strong>Conferente</strong> ao dar entrada e para o <strong>Fiscal</strong> na tela de reconciliação fiscal.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
