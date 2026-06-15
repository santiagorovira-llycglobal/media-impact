import React from 'react';
import { Calendar, MapPin, RefreshCw, FileText, Filter } from 'lucide-react';
import type { AnalyticsState } from '../types';

interface HeaderProps {
  onRefresh: () => void;
  onExport: () => void;
  loading: boolean;
  exporting: boolean;
  lastUpdated: string;
  tenant?: {
    tenant_id: string;
    tenant_name: string;
    logo_url: string;
    primary_color: string;
  };
}

export const Header: React.FC<HeaderProps> = ({ onRefresh, onExport, loading, exporting, lastUpdated, tenant }) => (
  <header className="h-16 bg-white border-b border-dashboard-border flex items-center justify-between px-8 sticky top-0 z-[50]">
    <div className="flex items-center gap-6">
      {tenant?.logo_url ? (
        <img src={tenant.logo_url} alt={tenant.tenant_name} className="h-8 object-contain max-w-[120px]" />
      ) : (
        <div className="text-red font-black text-xl tracking-tighter">{tenant?.tenant_name || 'LLYC'}</div>
      )}
      <div className="h-4 w-[1px] bg-dashboard-border"></div>
      <div className="text-[11px] font-black uppercase tracking-widest text-navy">
        Intelligence Dashboard <span className="text-mid font-medium">2026</span>
      </div>
    </div>
    
    <div className="flex items-center gap-4">
      <div id="ts" className="text-[10px] font-bold uppercase tracking-widest text-mid">
        Actualizado: {lastUpdated}
      </div>
      <button 
        onClick={onRefresh}
        className="w-8 h-8 flex items-center justify-center bg-dashboard-bg rounded-lg hover:bg-navy-light transition-colors"
        disabled={loading}
      >
        <RefreshCw className={`w-4 h-4 text-navy ${loading ? 'spin' : ''}`} />
      </button>
      <button 
        onClick={onExport}
        disabled={exporting}
        className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        <FileText className={`w-4 h-4 ${exporting ? 'spin' : ''}`} /> {exporting ? 'Exportando...' : 'Exportar PDF'}
      </button>
    </div>
  </header>
);

interface FilterBarProps {
  state: AnalyticsState;
  updateState: (updates: Partial<AnalyticsState>) => void;
  onApply: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({ state, updateState, onApply }) => (
  <div className="bg-white border-b border-dashboard-border px-8 py-3 flex items-center gap-4 overflow-x-auto whitespace-nowrap custom-scrollbar">
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-mid" />
      <span className="text-[11px] font-bold text-mid uppercase tracking-widest">Desde</span>
      <input 
        type="date" 
        value={state.from} 
        onChange={e => updateState({ from: e.target.value })}
        className="bg-dashboard-bg border border-dashboard-border rounded px-2 py-1 text-xs outline-none focus:ring-1 ring-red/20"
      />
      <span className="text-[11px] font-bold text-mid uppercase tracking-widest">hasta</span>
      <input 
        type="date" 
        value={state.to} 
        onChange={e => updateState({ to: e.target.value })}
        className="bg-dashboard-bg border border-dashboard-border rounded px-2 py-1 text-xs outline-none focus:ring-1 ring-red/20"
      />
    </div>
    
    <div className="h-4 w-[1px] bg-dashboard-border"></div>
    
    <div className="flex items-center gap-2">
      <MapPin className="w-4 h-4 text-mid" />
      <span className="text-[11px] font-bold text-mid uppercase tracking-widest">Mercado</span>
      <select 
        value={state.market}
        onChange={e => updateState({ market: e.target.value })}
        className="bg-dashboard-bg border border-dashboard-border rounded px-2 py-1 text-xs outline-none focus:ring-1 ring-red/20"
      >
        <option value="all">Todos los mercados</option>
        <option value="es">España</option>
        <option value="mx">México</option>
        <option value="co">Colombia</option>
        {/* ... other markets */}
      </select>
    </div>
    
    <div className="h-4 w-[1px] bg-dashboard-border"></div>
    
    <button 
      onClick={onApply}
      className="bg-red/10 text-red px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red hover:text-white transition-all flex items-center gap-1"
    >
      <Filter className="w-3 h-3" /> Aplicar Filtros
    </button>
  </div>
);
