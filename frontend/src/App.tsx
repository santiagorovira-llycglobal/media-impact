// LLYC Intelligence Dashboard App - React Frontend (Branded Multisite)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { WelcomeScreen } from './components/WelcomeScreen';
import { Header, FilterBar } from './components/DashboardLayout';
import { KpiCard } from './components/KpiCard';
import { ChartWidget } from './components/ChartWidget';
import { TopicsCard } from './components/TopicsCard';
import { DomainsTable } from './components/DomainsTable';
import { useAnalytics } from './hooks/useAnalytics';
import { AdminPanel } from './components/AdminPanel';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

interface TenantConfig {
  tenant_id: string;
  tenant_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  support_email: string;
  updated_at?: string;
}

const App: React.FC = () => {
  const { state, data, loading, fetchData, updateState } = useAnalytics();
  const [lastUpdated, setLastUpdated] = useState('--:--');
  const [exporting, setExporting] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [isAdminView, setIsAdminView] = useState(false);

  // Inicializa showDashboard en true si se accede con un tenant específico en la URL o subdominio
  const [showDashboard, setShowDashboard] = useState(() => {
    // 1. Detección por query param
    const urlParams = new URLSearchParams(window.location.search);
    const tenantParam = urlParams.get('tenant');
    if (tenantParam && tenantParam.toLowerCase().trim() !== 'llyc') {
      return true;
    }
    
    // 2. Detección por subdominio (producción)
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('web.app')) {
      const parts = host.split('.');
      if (parts.length > 2 && parts[0].toLowerCase().trim() !== 'www') {
        return true;
      }
    }
    
    return false;
  });

  // 1. Observador de estado de Auth oficial de Firebase para mantener consistencia de login
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const email = user.email || '';
        if (email.toLowerCase().endsWith('@llyc.global') || email.toLowerCase().endsWith('@llyc.ai')) {
          localStorage.setItem('admin_user_email', email.toLowerCase());
        } else {
          // Expulsión automática si se cuela otra cuenta no corporativa
          auth.signOut();
          localStorage.removeItem('admin_user_email');
        }
      } else {
        localStorage.removeItem('admin_user_email');
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Guardia de Ruta Estricto en el Ruteo Nativo de la SPA
  useEffect(() => {
    const handleLocationChange = () => {
      const isHashAdmin = window.location.hash === '#admin' || window.location.pathname === '/admin';
      
      if (isHashAdmin) {
        // Verificar si existe una sesión de administrador corporativo LLYC activa
        const savedEmail = localStorage.getItem('admin_user_email');
        const isLlycEmail = savedEmail && (savedEmail.endsWith('@llyc.global') || savedEmail.endsWith('@llyc.ai'));
        
        if (!isLlycEmail) {
          // Bloquear el renderizado y expulsar inmediatamente a la landing
          window.location.hash = '';
          setIsAdminView(false);
          alert("Acceso denegado: Se requiere iniciar sesión con una cuenta corporativa de LLYC (@llyc.global o @llyc.ai) para acceder al panel de administración.");
        } else {
          setIsAdminView(true);
        }
      } else {
        setIsAdminView(false);
      }
    };
    
    // Ejecutar chequeo en la carga inicial
    handleLocationChange();
    
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const [adminPreviewTenant, setAdminPreviewTenant] = useState<string | null>(null);

  const handlePreviewTenant = async (tenantId: string) => {
    try {
      const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:8080' 
        : '';
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/tenant/config?tenant=${tenantId}`);
      if (res.ok) {
        const data: TenantConfig = await res.json();
        setTenant(data);
        
        // Aplicar la paleta de colores de marca dinámicamente en el documento
        if (data.primary_color) {
          document.documentElement.style.setProperty('--red', data.primary_color);
          document.documentElement.style.setProperty('--red-light', data.primary_color + '1A');
        }
        if (data.secondary_color) {
          document.documentElement.style.setProperty('--teal', data.secondary_color);
          document.documentElement.style.setProperty('--teal-light', data.secondary_color + '1A');
        }
        
        // Activar el modo de vista previa de administrador
        setAdminPreviewTenant(data.tenant_name);
        setIsAdminView(false);
        setShowDashboard(true);
      }
    } catch (err) {
      console.error("Error setting preview tenant:", err);
    }
  };

  const handleGoToDashboard = () => {
    window.location.hash = '';
    setIsAdminView(false);
    setAdminPreviewTenant(null); // Limpiar modo vista previa al volver de forma normal
    setShowDashboard(true); // Saltar WelcomeScreen al volver de admin
  };

  const [tenant, setTenant] = useState<TenantConfig>({
    tenant_id: 'llyc',
    tenant_name: 'LLYC Intelligence',
    logo_url: 'https://upload.wikimedia.org/wikipedia/commons/e/e5/LLYC_logo.svg',
    primary_color: '#F54963',
    secondary_color: '#36A7B7',
    font_family: 'Montserrat, sans-serif',
    support_email: 'intelligence.mcp@llyc.global'
  });

  // 0. Efecto para cargar dinámicamente la configuración visual del Tenant (Sanitas, LLYC, etc.)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tenantParam = urlParams.get('tenant');
    
    const fetchTenantConfig = async () => {
      try {
        const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
          ? 'http://localhost:8080' 
          : '';
        const url = tenantParam 
          ? `${API_BASE_URL}/api/v1/mcp-analytics/tenant/config?tenant=${tenantParam}`
          : `${API_BASE_URL}/api/v1/mcp-analytics/tenant/config`;
          
        const res = await fetch(url);
        if (res.ok) {
          const data: TenantConfig = await res.json();
          setTenant(data);
          
          // Aplicar la paleta de colores de marca dinámicamente en el documento
          if (data.primary_color) {
            document.documentElement.style.setProperty('--red', data.primary_color);
            // Generar una versión al 10% de opacidad para el color de fondo claro
            document.documentElement.style.setProperty('--red-light', data.primary_color + '1A');
          }
          if (data.secondary_color) {
            document.documentElement.style.setProperty('--teal', data.secondary_color);
            document.documentElement.style.setProperty('--teal-light', data.secondary_color + '1A');
          }
        }
      } catch (err) {
        console.error("Error fetching tenant config:", err);
      }
    };
    
    fetchTenantConfig();
  }, []);

  const [mockData, setMockData] = useState({
    total_sessions: "128",
    ai_referred: "9.7",
    ai_inferred: "18.1",
    engagement_score: "74",
    visibility_score: "68",
    sentiment_score: "7.8"
  });

  const [lineData, setLineData] = useState({
    labels: ['1/4', '5/4', '10/4', '15/4', '20/4', '25/4', '30/4'],
    datasets: [
      {
        label: 'Sesiones totales',
        data: [3200, 3500, 3100, 4200, 3800, 4500, 4100],
        borderColor: '#C5D2DA',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        tension: 0.3
      },
      {
        label: 'Sesiones IA',
        data: [600, 800, 750, 1100, 950, 1300, 1200],
        borderColor: '#F54963',
        backgroundColor: 'rgba(245,73,99,.07)',
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3
      }
    ]
  });

  const randomizeMockData = useCallback(() => {
    setMockData({
      total_sessions: (100 + Math.random() * 50).toFixed(0),
      ai_referred: (8 + Math.random() * 4).toFixed(1),
      ai_inferred: (15 + Math.random() * 8).toFixed(1),
      engagement_score: (65 + Math.random() * 20).toFixed(0),
      visibility_score: (60 + Math.random() * 15).toFixed(0),
      sentiment_score: (7 + Math.random() * 2).toFixed(1)
    });

    setLineData(prev => ({
      ...prev,
      datasets: [
        { ...prev.datasets[0], data: prev.datasets[0].data.map(v => Math.round(v * (0.9 + Math.random() * 0.2))) },
        { ...prev.datasets[1], data: prev.datasets[1].data.map(v => Math.round(v * (0.8 + Math.random() * 0.4))) }
      ]
    }));
    
    setLastUpdated(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }));
  }, []);

  const handleApplyFilters = useCallback(() => {
    if (state.connection_id === 'mock-ga4' || !state.connection_id) {
      randomizeMockData();
    } else {
      fetchData();
    }
  }, [state.connection_id, randomizeMockData, fetchData]);

  // 1. Efecto para inicialización desde URL (solo una vez al montar)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connId = urlParams.get('connection_id');
    const sessId = urlParams.get('session_id');
    
    if (connId || sessId) {
      updateState({ connection_id: connId || 'google', session_id: sessId || '' });
      setShowDashboard(true);
    }
  }, []); // Sin dependencias para que solo corra una vez

  // 2. Efecto para carga inicial de datos cuando se activa el dashboard
  useEffect(() => {
    if (showDashboard && (state.connection_id || state.property_id)) {
      if (state.connection_id === 'mock-ga4' || !state.connection_id) {
        if (mockData.total_sessions === "128") {
          randomizeMockData();
        }
      } else {
        fetchData();
      }
    }
  }, [showDashboard, state.connection_id, state.property_id]);

  const handleSelectGA4 = () => {
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:8080' 
      : '';
    window.location.href = `${API_BASE_URL}/api/v1/mcp-analytics/oauth/login`;
  };

  const handleSelectAdobe = (creds: any) => {
    console.log("Adobe Creds:", creds);
    updateState({ connection_id: 'adobe-temp' });
    setShowDashboard(true);
  };

  const handleSelectPeec = (apiKey: string) => {
    console.log("Peec API Key:", apiKey);
    updateState({ connection_id: 'peec-temp', property_id: 'peec-proj-1' });
    setShowDashboard(true);
  };

  const handleFileUpload = async (file: File) => {
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:8080' 
      : '';
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/upload-data`, {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      if (result.status === 'success') {
        updateState({ connection_id: 'local', property_id: result.property_id });
        setShowDashboard(true);
      } else {
        alert("Error: " + result.message);
      }
    } catch (err) {
      alert("Error de conexión");
    }
  };

  const handleExportPDF = async () => {
    if (!dashboardRef.current) return;
    setExporting(true);
    
    try {
      const el = dashboardRef.current;
      const cv = await html2canvas(el, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#F0F2F4',
        logging: false
      });
      
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const iw = pw - 20;
      const ih = iw / (cv.width / cv.height);
      
      pdf.setFillColor(10, 38, 59);
      pdf.rect(0, 0, pw, 14, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      pdf.text('LLYC — Intelligence Dashboard', 10, 9);
      
      const pageH = ph - 18 - 8;
      let rem = ih;
      let sy = 0;
      let first = true;
      
      while (rem > 0) {
        if (!first) pdf.addPage();
        const sh = Math.min(pageH, rem);
        const ss = (sh / ih) * cv.height;
        
        const sc = document.createElement('canvas');
        sc.width = cv.width;
        sc.height = Math.round(ss);
        const ctx = sc.getContext('2d');
        if (ctx) {
          ctx.drawImage(cv, 0, Math.round(sy), cv.width, Math.round(ss), 0, 0, cv.width, Math.round(ss));
          pdf.addImage(sc.toDataURL('image/jpeg', 0.92), 'JPEG', 10, first ? 18 : 10, iw, sh);
        }
        
        sy += ss;
        rem -= sh;
        first = false;
      }
      
      pdf.save(`LLYC_Dashboard_${state.market}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e) {
      console.error("PDF Export error:", e);
      alert("Error al generar el PDF");
    } finally {
      setExporting(false);
    }
  };

  if (isAdminView) {
    return <AdminPanel onBack={handleGoToDashboard} onPreviewTenant={handlePreviewTenant} />;
  }

  if (!showDashboard) {
    return (
      <WelcomeScreen 
        onSelectGA4={handleSelectGA4}
        onSelectAdobe={handleSelectAdobe}
        onSelectPeec={handleSelectPeec}
        onFileUpload={handleFileUpload}
        tenant={tenant}
      />
    );
  }

  const mult = (parseInt(mockData.total_sessions)/128);

  const top10Unbranded = [
    {d:'expansion.com',m:142,g:24},{d:'elconfidencial.com',m:98,g:18},{d:'cincodias.elpais.com',m:87,g:-12},
    {d:'marketingnews.es',m:74,g:9},{d:'prnoticias.com',m:61,g:-7},{d:'comunicae.es',m:53,g:15},
    {d:'dircomfidencial.com',m:49,g:6},{d:'abc.es',m:44,g:-4},{d:'iprn.es',m:38,g:11},{d:'eleconomista.es',m:31,g:-9}
  ].map(r => ({ ...r, m: Math.round(r.m * mult) }));

  const top10Branded = [
    {d:'llorenteycuenca.com',m:310,g:41},{d:'linkedin.com/llyc',m:189,g:28},{d:'expansion.com',m:112,g:19},
    {d:'prweek.com',m:78,g:-8},{d:'elconfidencial.com',m:65,g:14},{d:'cincodias.elpais.com',m:54,g:-11},
    {d:'abc.es',m:47,g:7},{d:'iprn.es',m:39,g:-5},{d:'prnoticias.com',m:33,g:12},{d:'dircomfidencial.com',m:27,g:-3}
  ].map(r => ({ ...r, m: Math.round(r.m * mult) }));

  return (
    <div className="min-h-screen flex flex-col bg-dashboard-bg">
      {adminPreviewTenant && (
        <div className="bg-amber-500 text-navy py-2 px-8 flex items-center justify-between text-xs font-black uppercase tracking-wider shadow-md z-[100]">
          <div className="flex items-center gap-2">
            <span>👁️ Modo Vista Previa de Administrador</span>
            <span className="bg-navy text-white px-2 py-0.5 rounded text-[10px] font-black uppercase">Visualizando: {adminPreviewTenant}</span>
          </div>
          <button 
            onClick={() => {
              window.location.hash = '#admin';
              setIsAdminView(true);
            }}
            className="underline hover:text-white transition-colors"
          >
            Volver a la Administración →
          </button>
        </div>
      )}
      <Header 
        onRefresh={handleApplyFilters} 
        onExport={handleExportPDF}
        onFileUpload={handleFileUpload}
        loading={loading} 
        exporting={exporting}
        lastUpdated={lastUpdated} 
        tenant={tenant}
      />
      <FilterBar 
        state={state} 
        updateState={updateState} 
        onApply={handleApplyFilters} 
      />

      <main ref={dashboardRef} className="flex-1 p-8 space-y-6 max-w-[1400px] mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <KpiCard label="Sesiones totales" value={data?.total_sessions || mockData.total_sessions} suffix="K" trend="+12.3%" source="GA4" />
          <KpiCard label="IA referida" value={data?.ai_referred || mockData.ai_referred} suffix="K" trend="+34.1%" source="GA4" />
          <KpiCard label="IA inferida" value={data?.ai_inferred || mockData.ai_inferred} suffix="K" trend="+21.7%" source="GA4" />
          <KpiCard label="Engagement IA" value={data?.engagement_score || mockData.engagement_score} suffix="/100" trend="+8 pts" source="GA4" />
          <KpiCard label="Visibilidad unbranded" value={data?.visibility_score || mockData.visibility_score} suffix="%" trend="+5 pts" source="BL" colorClass="!bg-teal-light/20 border-teal/20" />
          <KpiCard label="Score sentimiento" value={data?.sentiment_score || mockData.sentiment_score} suffix="/10" trend="+0.4" source="BL" />
          <KpiCard label="Modelos analizados" value="5" trend="GPT · Gemini · Perplexity..." source="BL" />
          <KpiCard label="Dominios monitorizados" value="847" trend="+23 nuevos" source="BL" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ChartWidget 
              type="line" 
              title="Evolución tráfico IA" 
              source="GA4" 
              data={lineData}
              height={200}
              footer={
                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-mid">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-1 border-t-2 border-dashed border-mid/50"></div> Sesiones totales</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-red"></div> Sesiones IA</div>
                </div>
              }
            />
          </div>
          <div>
            <ChartWidget 
              type="doughnut" 
              title="Composición de audiencia" 
              source="GA4" 
              data={{
                labels: ['IA directa', 'IA inferida', 'Resto'],
                datasets: [{
                  data: [7.6, 14.1, 78.3],
                  backgroundColor: ['#F54963', '#0A263B', '#C5D2DA'],
                  borderWidth: 0
                }]
              }}
              height={200}
              footer={
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-widest text-mid">
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-red"></div> IA directa 7.6%</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-navy"></div> IA inferida 14.1%</div>
                  <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-mid/30"></div> Resto 78.3%</div>
                </div>
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl overflow-hidden border border-dashboard-border shadow-sm">
             <div className="p-5 pb-0">
                <div className="text-[11px] font-bold text-navy uppercase tracking-widest mb-1 flex items-center gap-1">
                  Rendimiento por motor IA <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-teal-light text-teal uppercase">GA4</span>
                </div>
                <div className="text-[10px] text-mid mb-4">Sesiones · duración · conversión · score</div>
             </div>
             <table className="w-full text-left border-collapse">
                <thead className="bg-dashboard-bg/50">
                  <tr className="text-[10px] font-bold text-mid uppercase tracking-widest">
                    <th className="px-5 py-2">Motor</th>
                    <th className="px-5 py-2 text-right">Sesiones</th>
                    <th className="px-5 py-2 text-right">Duración</th>
                    <th className="px-5 py-2 text-right">Conv.</th>
                    <th className="px-5 py-2">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashboard-border text-xs">
                  {[
                    {n:'ChatGPT',s:'4,821',d:'3m 42s',c:'4.2%',sc:82},
                    {n:'Perplexity',s:'2,340',d:'4m 15s',c:'5.8%',sc:91},
                    {n:'Gemini',s:'1,870',d:'2m 58s',c:'3.1%',sc:67},
                    {n:'Copilot',s:'512',d:'2m 11s',c:'2.4%',sc:54},
                    {n:'Claude',s:'178',d:'5m 02s',c:'7.1%',sc:95}
                  ].map((r,i) => (
                    <tr key={i} className="hover:bg-dashboard-bg/20 transition-colors">
                      <td className="px-5 py-2 font-bold text-navy">{r.n}</td>
                      <td className="px-5 py-2 text-right text-mid">{r.s}</td>
                      <td className="px-5 py-2 text-right text-mid">{r.d}</td>
                      <td className="px-5 py-2 text-right text-mid">{r.c}</td>
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1 bg-dashboard-bg rounded-full overflow-hidden min-w-[40px]">
                            <div className="h-full bg-red" style={{width:`${r.sc}%`}}></div>
                          </div>
                          <span className="text-[10px] font-bold text-mid">{r.sc}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
          <ChartWidget 
            type="bar" 
            title="Visibilidad de marca por motor IA" 
            source="BL" 
            data={{
              labels: ['ChatGPT', 'Gemini', 'Perplexity', 'Claude', 'Copilot'],
              datasets: [
                { label: 'LLYC', data: [72, 65, 58, 81, 44], backgroundColor: '#36A7B7', borderRadius: 4 },
                { label: 'Prom.', data: [51, 48, 43, 55, 38], backgroundColor: '#C5D2DA', borderRadius: 4 }
              ]
            }}
            height={200}
            footer={
              <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-mid">
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-teal"></div> LLYC</div>
                <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-mid/30"></div> Prom. competidores</div>
              </div>
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ChartWidget 
            type="bar" 
            title="Clusters de comportamiento IA" 
            source="GA4" 
            data={{
              labels: ['Investigadores', 'Transaccional', 'Resumen', 'Casual'],
              datasets: [{ data: [38, 27, 22, 13], backgroundColor: ['#F54963', '#36A7B7', '#0A263B', '#E8A020'], borderRadius: 4 }]
            }}
          />
          <ChartWidget 
            type="bar" 
            title="Visibilidad unbranded — top 5" 
            source="BL" 
            options={{ indexAxis: 'y' }}
            data={{
              labels: ['LLYC', 'Weber', 'Edelman', 'FTI', 'Brunswick'],
              datasets: [{ data: [68, 54, 47, 39, 31], backgroundColor: ['#F54963', '#0A263B', '#0A263B', '#0A263B', '#0A263B'], borderRadius: 4 }]
            }}
          />
          <ChartWidget 
            type="bar" 
            title="Sentimiento de marca — top 5" 
            source="BL" 
            options={{ indexAxis: 'y', scales: { x: { min: 5, max: 10 } } }}
            data={{
              labels: ['LLYC', 'Weber', 'Edelman', 'FTI', 'Brunswick'],
              datasets: [{ data: [7.8, 7.1, 6.9, 6.4, 6.0], backgroundColor: ['#36A7B7', '#0A263B', '#0A263B', '#0A263B', '#0A263B'], borderRadius: 4 }]
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopicsCard 
            title="Temáticas clave — Comunicación & PR" 
            source="BL"
            topics={[
              {l:'Reputación corporativa',w:91},{l:'Comunicación de crisis',w:78},
              {l:'Relaciones con medios',w:65},{l:'ESG & sostenibilidad',w:54},{l:'Comunicación interna',w:42}
            ]}
          />
          <TopicsCard 
            title="Temáticas clave — Digital & Crisis" 
            source="BL"
            topics={[
              {l:'Transformación digital',w:88},{l:'IA generativa',w:82},
              {l:'Gestión de crisis online',w:71},{l:'Social media strategy',w:60},{l:'Influencer relations',w:38}
            ]}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DomainsTable title="Top 10 dominios · gap score (unbranded)" source="BL" rows={top10Unbranded} />
          <DomainsTable title="Top 10 dominios · gap score (branded)" source="BL" rows={top10Branded} />
        </div>
      </main>

      {exporting && (
        <div className="fixed inset-0 bg-navy/80 flex items-center justify-center p-5 z-[2000]">
          <div className="bg-white rounded-xl p-8 max-w-xs w-full shadow-2xl text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-red/20 border-t-red rounded-full spin"></div>
            <p className="text-navy font-bold uppercase tracking-widest text-xs">Generando PDF…</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
