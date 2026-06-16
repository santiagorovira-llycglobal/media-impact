// frontend/src/components/AdminPanel.tsx
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Edit2, Key, Save, ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, LogOut, User, Activity, AlertTriangle, Check, Wrench, CalendarRange, Database } from 'lucide-react';
import { auth } from '../firebase';

interface TenantConfig {
  tenant_id: string;
  tenant_name: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  support_email: string;
  updated_at?: string;
  configured_secrets?: {
    'brandlight-key'?: boolean;
    'peec-key'?: boolean;
    'ga4-creds'?: boolean;
    'adobe-creds'?: boolean;
  };
}

interface AdminPanelProps {
  onBack: () => void;
  onPreviewTenant?: (tenantId: string) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack, onPreviewTenant }) => {
  const [tenants, setTenants] = useState<TenantConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Formulario de Tenant
  const [editingTenant, setEditingTenant] = useState<TenantConfig | null>(null);
  const [showTenantModal, setShowTenantModal] = useState(false);

  // Formulario de Secretos
  const [secretTenantId, setSecretTenantId] = useState<string | null>(null);
  const [secretType, setSecretType] = useState('brandlight-key');
  const [secretValue, setSecretValue] = useState('');
  
  // Estados para credenciales estructuradas de Adobe Analytics (Client ID, Secret, Org ID)
  const [adobeClientId, setAdobeClientId] = useState('');
  const [adobeClientSecret, setAdobeClientSecret] = useState('');
  const [adobeOrgId, setAdobeOrgId] = useState('');
  const [adobeCompaniesList, setAdobeCompaniesList] = useState<any[]>([]);
  const [adobeSuitesList, setAdobeSuitesList] = useState<any[]>([]);
  const [validatingAdobe, setValidatingAdobe] = useState(false);
  const [selectedAdobeCompany, setSelectedAdobeCompany] = useState('');
  const [selectedAdobeSuite, setSelectedAdobeSuite] = useState('');

  // Estados para validación e inyección estructurada de GA4
  const [ga4AccountsList, setGa4AccountsList] = useState<any[]>([]);
  const [ga4PropertiesList, setGa4PropertiesList] = useState<any[]>([]);
  const [validatingGa4, setValidatingGa4] = useState(false);
  const [selectedGa4Account, setSelectedGa4Account] = useState('');
  const [selectedGa4Property, setSelectedGa4Property] = useState('');

  const [showSecretModal, setShowSecretModal] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [adminEmail] = useState(localStorage.getItem('admin_user_email') || 'consultor@llyc.global');

  // Estados de Auditoría y Patcher
  const [auditTenantId, setAuditTenantId] = useState<string | null>(null);
  const [auditData, setAuditData] = useState<{ first_date: string | null; gaps: any[]; gap_count: number } | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [patching, setPatching] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);

  const fetchDataGaps = async (tenantId: string) => {
    try {
      setLoadingAudit(true);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/${tenantId}/data-gaps`);
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
      } else {
        throw new Error("No se pudieron detectar los huecos de BigQuery");
      }
    } catch (err: any) {
      alert("Error al auditar huecos: " + err.message);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleRunPatcher = async () => {
    if (!auditTenantId || !auditData || auditData.gaps.length === 0) return;
    
    try {
      setPatching(true);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/${auditTenantId}/patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gaps: auditData.gaps })
      });
      
      const result = await res.json();
      if (res.ok) {
        alert("¡Proceso de parchado completado con éxito! Se rellenaron los huecos en BigQuery.");
        fetchDataGaps(auditTenantId);
      } else {
        throw new Error(result.detail || "Error al ejecutar el parchado");
      }
    } catch (err: any) {
      alert("Fallo de parchado: " + err.message);
    } finally {
      setPatching(false);
    }
  };

  const openAuditModal = (tenantId: string) => {
    setAuditTenantId(tenantId);
    setAuditData(null);
    setShowAuditModal(true);
    fetchDataGaps(tenantId);
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      localStorage.removeItem('admin_user_email');
      window.location.hash = ''; // Quitar hash de admin
      onBack();
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:8080' 
    : '';

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !editingTenant) return;
    const file = e.target.files[0];
    
    // Si es un nuevo cliente, se necesita que escriban primero el Tenant ID para guardarlo con ese nombre
    if (!editingTenant.tenant_id) {
      alert("Por favor, escribe primero el ID del Cliente (Tenant ID) para poder asociarle el archivo de logotipo.");
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setUploadingLogo(true);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/${editingTenant.tenant_id}/logo`, {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      if (res.ok && result.logo_url) {
        setEditingTenant({ ...editingTenant, logo_url: result.logo_url });
        alert("¡Logotipo subido y guardado con éxito en Google Cloud Storage!");
      } else {
        throw new Error(result.detail || "Error al subir el logotipo");
      }
    } catch (err: any) {
      alert("Fallo al subir el logo: " + err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants`);
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
      } else {
        throw new Error("No se pudo obtener la lista de tenants");
      }
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: err.message || 'Error al conectar con el servidor' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const [activeTab, setActiveTab] = useState<'tenants' | 'etl'>('tenants');
  const [etlHistory, setEtlHistory] = useState<any[]>([]);
  const [etlAlerts, setEtlAlerts] = useState<any[]>([]);
  const [loadingEtl, setLoadingEtl] = useState(false);

  const fetchEtlData = async () => {
    try {
      setLoadingEtl(true);
      
      // 1. Fetch History
      const resHistory = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/etl/history`);
      const dataHistory = resHistory.ok ? await resHistory.json() : [];
      setEtlHistory(dataHistory);
      
      // 2. Fetch Active Alerts
      const resAlerts = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/etl/alerts`);
      const dataAlerts = resAlerts.ok ? await resAlerts.json() : [];
      setEtlAlerts(dataAlerts);
      
    } catch (err) {
      console.error("Error fetching ETL metrics:", err);
    } finally {
      setLoadingEtl(false);
    }
  };

  const handleDismissAlert = async (alertId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/etl/alerts/${alertId}/dismiss`, {
        method: 'POST'
      });
      if (res.ok) {
        // Remover localmente de la lista con un fade-out limpio
        setEtlAlerts(prev => prev.filter(a => a.alert_id !== alertId));
        setMessage({ type: 'success', text: "Alerta descartada con éxito." });
      } else {
        throw new Error("No se pudo descartar la alerta en Firestore");
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  useEffect(() => {
    if (activeTab === 'etl') {
      fetchEtlData();
    }
  }, [activeTab]);

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTenant)
      });

      if (res.ok) {
        setMessage({ type: 'success', text: `Tenant '${editingTenant.tenant_name}' guardado exitosamente.` });
        setShowTenantModal(false);
        fetchTenants();
      } else {
        throw new Error("Error del servidor al guardar el tenant");
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar el tenant' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretTenantId) return;

    let finalSecretValue = secretValue;

    if (secretType === 'adobe-creds') {
      finalSecretValue = JSON.stringify({
        client_id: adobeClientId.trim(),
        client_secret: adobeClientSecret.trim(),
        org_id: adobeOrgId.trim(),
        company_id: selectedAdobeCompany || undefined,
        property_id: selectedAdobeSuite || undefined
      });
    } else if (secretType === 'ga4-creds' && selectedGa4Property) {
      try {
        const parsed = JSON.parse(secretValue.trim());
        parsed.account_id = selectedGa4Account;
        parsed.property_id = selectedGa4Property;
        finalSecretValue = JSON.stringify(parsed);
      } catch (err) {
        console.warn("Pasted secret is not valid JSON, keeping as is:", err);
      }
    }

    if (!finalSecretValue) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/${secretTenantId}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret_type: secretType, secret_value: finalSecretValue })
      });

      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: `Secreto '${secretType}' guardado y encriptado con éxito en GCP Secret Manager para el cliente '${secretTenantId}'.` 
        });
        setShowSecretModal(false);
        setSecretValue('');
        fetchTenants(); // Recargar base de datos e integraciones actualizadas en tiempo real
      } else {
        throw new Error("Error al persistir el secreto en GCP Secret Manager");
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error de ciberseguridad al guardar el secreto' });
    } finally {
      setSaving(false);
    }
  };

  const openCreateModal = () => {
    setEditingTenant({
      tenant_id: '',
      tenant_name: '',
      logo_url: '',
      primary_color: '#F54963',
      secondary_color: '#36A7B7',
      font_family: 'Montserrat, sans-serif',
      support_email: ''
    });
    setShowTenantModal(true);
  };

  const openEditModal = (tenant: TenantConfig) => {
    setEditingTenant({ ...tenant });
    setShowTenantModal(true);
  };

  const openSecretModal = (tenantId: string) => {
    setSecretTenantId(tenantId);
    setSecretType('brandlight-key');
    setSecretValue('');
    setAdobeClientId('');
    setAdobeClientSecret('');
    setAdobeOrgId('');
    setAdobeCompaniesList([]);
    setAdobeSuitesList([]);
    setSelectedAdobeCompany('');
    setSelectedAdobeSuite('');
    setGa4AccountsList([]);
    setGa4PropertiesList([]);
    setSelectedGa4Account('');
    setSelectedGa4Property('');
    setRedeploying(false);
    setShowSecretModal(true);
  };

  const handleValidateGa4Credentials = async () => {
    if (!secretValue) {
      alert("Por favor pega el JSON de credenciales de Google para validar.");
      return;
    }
    
    try {
      setValidatingGa4(true);
      setMessage(null);
      
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/validate-ga4-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentials_json: secretValue.trim()
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setGa4AccountsList(data.accounts || []);
        setGa4PropertiesList(data.properties || []);
        
        if (data.accounts && data.accounts.length > 0) {
          setSelectedGa4Account(data.accounts[0].id);
        }
        if (data.properties && data.properties.length > 0) {
          setSelectedGa4Property(data.properties[0].id);
        }
        
        setMessage({
          type: 'success',
          text: `Credenciales de Google validadas con éxito. Se encontraron ${data.accounts?.length || 0} cuentas y ${data.properties?.length || 0} propiedades de GA4.`
        });
      } else {
        const err = await res.json();
        throw new Error(err.detail || "Fallo en la autenticación con Google Analytics API.");
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al conectar con el servicio de validación de Google' });
    } finally {
      setValidatingGa4(false);
    }
  };

  const handleGa4AccountChange = async (accountId: string) => {
    setSelectedGa4Account(accountId);
    setSelectedGa4Property('');
    setGa4PropertiesList([]);
    
    try {
      setValidatingGa4(true);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/validate-ga4-properties?credentials_json=${encodeURIComponent(secretValue.trim())}&account_id=${encodeURIComponent(accountId)}`);
      
      if (res.ok) {
        const data = await res.json();
        setGa4PropertiesList(data.properties || []);
        if (data.properties && data.properties.length > 0) {
          setSelectedGa4Property(data.properties[0].id);
        }
      }
    } catch (err: any) {
      console.error("Error loading properties for GA4 account:", err);
    } finally {
      setValidatingGa4(false);
    }
  };

  const handleValidateAdobeCredentials = async () => {
    if (!adobeClientId || !adobeClientSecret || !adobeOrgId) {
      alert("Por favor completa los tres campos de Adobe para validar.");
      return;
    }
    
    try {
      setValidatingAdobe(true);
      setMessage(null);
      
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/validate-adobe-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: adobeClientId.trim(),
          client_secret: adobeClientSecret.trim(),
          org_id: adobeOrgId.trim()
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setAdobeCompaniesList(data.companies || []);
        setAdobeSuitesList(data.suites || []);
        
        if (data.companies && data.companies.length > 0) {
          setSelectedAdobeCompany(data.companies[0].id);
        }
        if (data.suites && data.suites.length > 0) {
          setSelectedAdobeSuite(data.suites[0].id);
        }
        
        setMessage({
          type: 'success',
          text: `Credenciales de Adobe validadas con éxito. Se encontraron ${data.companies?.length || 0} compañías y ${data.suites?.length || 0} report suites.`
        });
      } else {
        const err = await res.json();
        throw new Error(err.detail || "Fallo en la autenticación con Adobe Discovery API.");
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al conectar con el servicio de validación de Adobe' });
    } finally {
      setValidatingAdobe(false);
    }
  };

  const handleAdobeCompanyChange = async (companyId: string) => {
    setSelectedAdobeCompany(companyId);
    setSelectedAdobeSuite('');
    setAdobeSuitesList([]);
    
    try {
      setValidatingAdobe(true);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/validate-adobe-properties?client_id=${encodeURIComponent(adobeClientId.trim())}&client_secret=${encodeURIComponent(adobeClientSecret.trim())}&org_id=${encodeURIComponent(adobeOrgId.trim())}&company_id=${encodeURIComponent(companyId)}`);
      
      if (res.ok) {
        const data = await res.json();
        const suites = data.suites || [];
        setAdobeSuitesList(suites);
        if (suites.length > 0) {
          const firstSuite = suites[0].id;
          setSelectedAdobeSuite(firstSuite);
        }
      }
    } catch (err: any) {
      console.error("Error loading properties for company:", err);
    } finally {
      setValidatingAdobe(false);
    }
  };

  const handleRedeployEtl = async () => {
    if (!secretTenantId) return;
    
    try {
      setRedeploying(true);
      setMessage(null);
      
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/${secretTenantId}/redeploy-etl`, {
        method: 'POST'
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: 'success',
          text: data.message || 'Infraestructura ETL re-desplegada con éxito. Se re-creó el Cloud Scheduler y se encoló el backfill histórico.'
        });
      } else {
        throw new Error("Error al re-desplegar la infraestructura ETL");
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al re-desplegar la ETL' });
    } finally {
      setRedeploying(false);
    }
  };

  const triggerDirectRedeploy = async (tenantId: string) => {
    try {
      setRedeploying(true);
      setMessage({
        type: 'success',
        text: `Iniciando re-despliegue de ETL y backfill histórico de 90 días para el cliente '${tenantId}'...`
      });
      
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/${tenantId}/redeploy-etl`, {
        method: 'POST'
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage({
          type: 'success',
          text: data.message || `Infraestructura ETL de '${tenantId}' re-desplegada con éxito. Se re-creó el Cloud Scheduler y se encoló el backfill histórico.`
        });
        fetchEtlData(); // Refrescar historial automáticamente
      } else {
        throw new Error(`Error al re-desplegar la infraestructura ETL para '${tenantId}'`);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al re-desplegar la ETL' });
    } finally {
      setRedeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy text-white font-sans flex flex-col">
      {/* HEADER DE ADMÍN */}
      <header className="h-16 bg-[#0a1829] border-b border-white/10 flex items-center justify-between px-8 sticky top-0 z-[50] backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-mid hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
          <div className="h-4 w-[1px] bg-white/10"></div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-red" />
            <span className="text-[11px] font-black uppercase tracking-widest text-red">
              LLYC MCP Superadmin <span className="text-white/50 font-normal">v2.0</span>
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={fetchTenants}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 text-mid ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <div className="h-4 w-[1px] bg-white/10"></div>
          
          {/* PERFIL DE USUARIO Y LOGOUT */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-red flex items-center justify-center text-[10px] font-black uppercase text-white shadow-md shadow-red/10">
                <User className="w-3 h-3 text-white" />
              </div>
              <span className="text-[11px] font-semibold text-white/80 max-w-[150px] truncate">{adminEmail}</span>
            </div>
            
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-3.5 h-3.5" /> Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-8 max-w-6xl mx-auto w-full space-y-6">
        {/* BANNER INFORMATIVO */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-black tracking-tight mb-1">Administración Global de Clientes</h1>
            <p className="text-xs text-mid">
              Crea nuevos clientes, gestiona sus colores corporativos, sube sus logotipos y administra sus credenciales de forma encriptada en GCP Secret Manager.
            </p>
          </div>
          <button 
            onClick={openCreateModal}
            className="flex items-center gap-2 self-start md:self-auto px-4 py-2.5 bg-red text-white rounded-lg text-[11px] font-black uppercase tracking-widest hover:bg-red/90 transition-colors shadow-lg shadow-red/20"
          >
            <Plus className="w-4 h-4" /> Crear Nuevo Cliente
          </button>
        </div>

        {/* MENSAJES DE ESTADO */}
        {message && (
          <div className={`p-4 rounded-xl flex items-start gap-3 border ${
            message.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span className="text-xs font-semibold">{message.text}</span>
          </div>
        )}

        {/* TABS SELECTOR */}
        <div className="flex border-b border-white/10 gap-6">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
              activeTab === 'tenants' 
                ? 'border-red text-red' 
                : 'border-transparent text-mid hover:text-white'
            }`}
          >
            📂 Gestión de Clientes
          </button>
          <button
            onClick={() => setActiveTab('etl')}
            className={`pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
              activeTab === 'etl' 
                ? 'border-red text-red font-black' 
                : 'border-transparent text-mid hover:text-white'
            }`}
          >
            ❤️ Monitor de Salud ETL
          </button>
        </div>

        {activeTab === 'tenants' ? (
          /* TAB 1: LISTADO DE CLIENTES */
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 bg-white/[0.02]">
              <h2 className="text-xs font-black uppercase tracking-widest text-mid">Clientes Activos ({tenants.length})</h2>
            </div>

            {loading ? (
              <div className="p-12 text-center text-mid flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-red" />
                <span className="text-xs font-bold uppercase tracking-widest">Cargando base de datos de inquilinos...</span>
              </div>
            ) : tenants.length === 0 ? (
              <div className="p-12 text-center text-mid text-xs">
                No hay clientes creados todavía en Firestore. Pulsa "Crear Nuevo Cliente" para comenzar.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {tenants.map((t) => (
                  <div key={t.tenant_id} className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-white/[0.01] transition-colors">
                    {/* Branding e info del cliente */}
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center p-2 border border-white/5 overflow-hidden">
                        {t.logo_url ? (
                          <img src={t.logo_url} alt={t.tenant_name} className="max-h-full object-contain" />
                        ) : (
                          <span className="text-xs font-black text-white/50 uppercase">{t.tenant_id.slice(0, 2)}</span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-sm">{t.tenant_name}</h3>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-white/10 text-white/70 uppercase tracking-wider">
                            ID: {t.tenant_id}
                          </span>
                        </div>
                        <p className="text-xs text-mid mt-0.5">{t.support_email}</p>
                        
                        {/* Visualización de colores */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-1">
                            <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: t.primary_color }}></div>
                            <span className="text-[9px] font-mono text-mid uppercase">{t.primary_color}</span>
                          </div>
                          <div className="h-2 w-[1px] bg-white/10"></div>
                          <div className="flex items-center gap-1">
                            <div className="w-3.5 h-3.5 rounded-full border border-white/10" style={{ backgroundColor: t.secondary_color }}></div>
                            <span className="text-[9px] font-mono text-mid uppercase">{t.secondary_color}</span>
                          </div>
                        </div>

                        {/* Estado de Integraciones */}
                        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                          <span className="text-[9px] text-mid uppercase tracking-wider font-semibold mr-1">Integraciones (GCP):</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                            (t.configured_secrets || {})['ga4-creds'] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
                          }`}>
                            GA4
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                            (t.configured_secrets || {})['adobe-creds'] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
                          }`}>
                            Adobe
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                            (t.configured_secrets || {})['peec-key'] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
                          }`}>
                            Peec.ai
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                            (t.configured_secrets || {})['brandlight-key'] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
                          }`}>
                            Brandlight
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 self-end md:self-auto">
                      {onPreviewTenant && (
                        <button
                          onClick={() => onPreviewTenant(t.tenant_id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                        >
                          👁️ Ver Dashboard
                        </button>
                      )}
                      <button
                        onClick={() => openAuditModal(t.tenant_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        <Wrench className="w-3.5 h-3.5" /> Auditoría / Patcher
                      </button>
                      <button
                        onClick={() => openSecretModal(t.tenant_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        <Key className="w-3.5 h-3.5" /> Claves API (GCP)
                      </button>
                      <button
                        onClick={() => openEditModal(t)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" /> Editar Marca
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: MONITOR DE SALUD ETL (NUEVO) */
          <div className="space-y-6">
            {/* ESTADO DE CONFIGURACIÓN DE ORÍGENES DE DATOS */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                <Database className="w-5 h-5 text-teal animate-pulse" />
                <h2 className="text-xs font-black uppercase tracking-widest text-white">Estado de Configuración de Orígenes (GCP Secret Manager)</h2>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tenants.map(t => {
                  const secrets = t.configured_secrets || {};
                  return (
                    <div key={t.tenant_id} className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-black text-xs uppercase tracking-wider text-white">{t.tenant_name}</h3>
                        <span className="text-[9px] text-mid mb-2 block">ID: {t.tenant_id}</span>
                        <button
                          type="button"
                          onClick={() => triggerDirectRedeploy(t.tenant_id)}
                          disabled={redeploying}
                          className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-400 hover:text-navy border border-amber-500/20 rounded text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${redeploying ? 'animate-spin' : ''}`} />
                          {redeploying ? 'Re-desplegando...' : 'Re-desplegar ETL'}
                        </button>
                      </div>
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                          secrets['ga4-creds'] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
                        }`} title={secrets['ga4-creds'] ? 'Configurado' : 'Sin Configurar'}>
                          GA4
                        </span>
                        <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                          secrets['adobe-creds'] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
                        }`} title={secrets['adobe-creds'] ? 'Configurado' : 'Sin Configurar'}>
                          Adobe
                        </span>
                        <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                          secrets['peec-key'] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
                        }`} title={secrets['peec-key'] ? 'Configurado' : 'Sin Configurar'}>
                          Peec
                        </span>
                        <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                          secrets['brandlight-key'] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/30 border border-white/5'
                        }`} title={secrets['brandlight-key'] ? 'Configurado' : 'Sin Configurar'}>
                          Brand
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ALERTAS DE SALUD MAESTRAS (CON ACCIÓN DISMISS) */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red" />
                <h2 className="text-xs font-black uppercase tracking-widest text-white">Alertas Operacionales Activas ({etlAlerts.length})</h2>
              </div>
              
              {etlAlerts.length === 0 ? (
                <div className="p-12 text-center text-mid text-xs flex flex-col items-center gap-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <span>¡Excelente! No hay alertas de salud activas en el ecosistema ETL.</span>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {etlAlerts.map(a => (
                    <div key={a.alert_id} className="p-5 flex items-center justify-between gap-4 hover:bg-white/[0.01] transition-all">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red shrink-0 mt-0.5" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs uppercase tracking-wider text-white">Inquilino: {a.tenant_id.toUpperCase()}</span>
                            <span className="text-[9px] px-1.5 py-0.5 bg-red-500/10 text-red-400 font-bold uppercase rounded">{a.provider}</span>
                          </div>
                          <p className="text-xs text-mid mt-1 font-semibold">{a.error_message}</p>
                          <span className="text-[10px] text-mid/60 mt-1 block">Ocurrido en: {new Date(a.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDismissAlert(a.alert_id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" /> Atendido / Borrar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* HISTORIAL DE LOGS DE INGESTA DIARIA */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-teal" />
                  <h2 className="text-xs font-black uppercase tracking-widest text-white">Historial de Ingesta Diaria</h2>
                </div>
                <button 
                  onClick={fetchEtlData}
                  className="text-[10px] font-bold uppercase text-mid hover:text-white transition-all"
                >
                  Sincronizar Monitor
                </button>
              </div>

              {loadingEtl ? (
                <div className="p-12 text-center text-mid text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-red" />
                  <span>Recuperando log de operaciones...</span>
                </div>
              ) : etlHistory.length === 0 ? (
                <div className="p-12 text-center text-mid text-xs">
                  No hay registros de ejecución de ETL todavía en Firestore.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.01] text-mid uppercase tracking-wider font-bold text-[10px]">
                        <th className="p-4">Tenant</th>
                        <th className="p-4">Fecha Sincronización</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-center">Registros Traídos (BQ)</th>
                        <th className="p-4">Detalles</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {etlHistory.map(h => (
                        <tr key={h.run_id} className="hover:bg-white/[0.01] transition-colors">
                          <td className="p-4 font-black uppercase text-white">{h.tenant_id}</td>
                          <td className="p-4 text-mid font-semibold">{new Date(h.timestamp).toLocaleString()}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              h.status === "success" 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : h.status === "partial_success"
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {h.status}
                            </span>
                          </td>
                          <td className="p-4 text-center font-bold text-white text-sm">{h.records_processed ?? 0}</td>
                          <td className="p-4 text-mid text-[11px] font-mono break-all max-w-[400px]">
                            {JSON.stringify(h.results_summary)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL DE CREAR / EDITAR CLIENTE */}
      {showTenantModal && editingTenant && (
        <div className="fixed inset-0 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-5 z-[1000]">
          <div className="bg-navy-light/20 border border-white/10 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 bg-white/[0.02]">
              <h3 className="font-black text-sm uppercase tracking-widest text-red">
                {editingTenant.tenant_id ? 'Editar Configuración de Marca' : 'Crear Nuevo Cliente'}
              </h3>
            </div>
            
            <form onSubmit={handleSaveTenant} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">ID del Cliente (Tenant ID)</label>
                <input 
                  type="text" 
                  value={editingTenant.tenant_id}
                  onChange={(e) => setEditingTenant({ ...editingTenant, tenant_id: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  disabled={!!editingTenant.updated_at} // Bloquear ID si ya existe
                  placeholder="ej: mi-organizacion"
                  required
                  className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red transition-colors disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Nombre Comercial</label>
                <input 
                  type="text" 
                  value={editingTenant.tenant_name}
                  onChange={(e) => setEditingTenant({ ...editingTenant, tenant_name: e.target.value })}
                  placeholder="ej: Mi Empresa S.A."
                  required
                  className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Logotipo del Cliente (SVG o PNG)</label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={editingTenant.logo_url}
                      onChange={(e) => setEditingTenant({ ...editingTenant, logo_url: e.target.value })}
                      placeholder="Escribe la URL del logo o sube un archivo..."
                      required
                      className="flex-1 bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red transition-colors"
                    />
                    <label className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-bold rounded-lg cursor-pointer flex items-center justify-center min-w-[120px] transition-colors">
                      {uploadingLogo ? 'Subiendo...' : 'Subir Archivo'}
                      <input 
                        type="file" 
                        accept=".svg,.png" 
                        onChange={handleLogoUpload} 
                        className="hidden" 
                        disabled={uploadingLogo} 
                      />
                    </label>
                  </div>
                  {editingTenant.logo_url && (
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between gap-4">
                      <span className="text-[10px] text-mid truncate max-w-[250px] font-mono">{editingTenant.logo_url}</span>
                      <img src={editingTenant.logo_url} alt="Vista previa" className="h-6 max-w-[60px] object-contain bg-white/5 p-0.5 rounded" />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Color Primario (Hex)</label>
                  <div className="flex gap-2">
                    <input 
                      type="color" 
                      value={editingTenant.primary_color}
                      onChange={(e) => setEditingTenant({ ...editingTenant, primary_color: e.target.value })}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                    <input 
                      type="text" 
                      value={editingTenant.primary_color}
                      onChange={(e) => setEditingTenant({ ...editingTenant, primary_color: e.target.value })}
                      maxLength={7}
                      required
                      className="flex-1 bg-[#0a1829] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-red"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Color Secundario (Hex)</label>
                  <div className="flex gap-2">
                    <input 
                      type="color" 
                      value={editingTenant.secondary_color}
                      onChange={(e) => setEditingTenant({ ...editingTenant, secondary_color: e.target.value })}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent"
                    />
                    <input 
                      type="text" 
                      value={editingTenant.secondary_color}
                      onChange={(e) => setEditingTenant({ ...editingTenant, secondary_color: e.target.value })}
                      maxLength={7}
                      required
                      className="flex-1 bg-[#0a1829] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-red"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Email de Soporte</label>
                <input 
                  type="email" 
                  value={editingTenant.support_email}
                  onChange={(e) => setEditingTenant({ ...editingTenant, support_email: e.target.value })}
                  placeholder="soporte@mi-organizacion.com"
                  required
                  className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button 
                  type="button"
                  onClick={() => setShowTenantModal(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red hover:bg-red/90 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar Marca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CLAVES API (GCP SECRET MANAGER) */}
      {showSecretModal && secretTenantId && (
        <div className="fixed inset-0 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-5 z-[1000]">
          <div className="bg-[#0b1b3d]/90 border border-white/10 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              <h3 className="font-black text-sm uppercase tracking-widest text-amber-400">
                Administrar Credenciales de Ciberseguridad (GCP)
              </h3>
            </div>
            
            <form onSubmit={handleSaveSecret} className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 text-[11px] text-amber-300/80 leading-relaxed">
                🛡️ **Seguridad Compliance**: Estas llaves serán guardadas y encriptadas de forma transparente y directa en **GCP Secret Manager** de producción. Nunca se almacenarán en bases de datos relacionales estándar en texto plano.
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Cliente Objetivo</label>
                <input 
                  type="text" 
                  value={secretTenantId.toUpperCase()} 
                  disabled 
                  className="w-full bg-white/5 border border-white/5 rounded-lg px-4 py-2.5 text-xs text-white/50 font-bold uppercase"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Tipo de Servicio Analítico</label>
                <select 
                  value={secretType}
                  onChange={(e) => setSecretType(e.target.value)}
                  className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red"
                >
                  <option value="brandlight-key">Brandlight BI API Key (Visibilidad / SoV)</option>
                  <option value="peec-key">Peec.ai API Token (Comportamiento de IA)</option>
                  <option value="ga4-creds">GA4 OAuth Token JSON (Sesiones de Google)</option>
                  <option value="adobe-creds">Adobe Analytics API Credentials (3 Campos)</option>
                </select>
              </div>

              {secretType === 'adobe-creds' ? (
                <div className="space-y-4 border-l-2 border-red pl-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Adobe Client ID (API Key)</label>
                    <input 
                      type="text" 
                      value={adobeClientId}
                      onChange={(e) => setAdobeClientId(e.target.value)}
                      placeholder="ej: e6c7619213194a289f81f18..."
                      required
                      className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-red"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Adobe Client Secret</label>
                    <input 
                      type="password" 
                      value={adobeClientSecret}
                      onChange={(e) => setAdobeClientSecret(e.target.value)}
                      placeholder="Pega aquí el Client Secret de Adobe..."
                      required
                      className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-red"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Adobe Organization ID (IMS Org ID)</label>
                    <input 
                      type="text" 
                      value={adobeOrgId}
                      onChange={(e) => setAdobeOrgId(e.target.value)}
                      placeholder="ej: 12345ABCDE@AdobeOrg"
                      required
                      className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-red"
                    />
                  </div>
                  
                  {/* Botón para validar en caliente */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleValidateAdobeCredentials}
                      disabled={validatingAdobe || !adobeClientId || !adobeClientSecret || !adobeOrgId}
                      className="px-4 py-2 bg-gradient-to-r from-red to-[#b91c1c] text-white hover:from-[#b91c1c] hover:to-[#991b1b] rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${validatingAdobe ? 'animate-spin' : ''}`} />
                      {validatingAdobe ? 'Validando...' : '🔍 Validar y Cargar Compañías de Adobe'}
                    </button>
                  </div>
                  
                  {/* Selectores de Compañías y Report Suites de Adobe */}
                  {adobeCompaniesList.length > 0 && (
                    <div className="space-y-4 pt-3 border-t border-white/5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1 text-teal">Compañía Seleccionada</label>
                        <select 
                          value={selectedAdobeCompany}
                          onChange={(e) => handleAdobeCompanyChange(e.target.value)}
                          className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red font-bold"
                        >
                          {adobeCompaniesList.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      {adobeSuitesList.length > 0 && (
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1 text-red">Report Suite (Propiedad para ETL)</label>
                          <select 
                            value={selectedAdobeSuite}
                            onChange={(e) => setSelectedAdobeSuite(e.target.value)}
                            className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red font-bold"
                          >
                            {adobeSuitesList.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Valor de la Llave Secreta (API Key / Token / JSON)</label>
                  <textarea 
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    placeholder={secretType === 'ga4-creds' ? "Pega aquí las credenciales JSON de Google..." : "Pega aquí la clave secreta obtenida del proveedor analítico..."}
                    required
                    rows={4}
                    className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-red resize-none"
                  />
                  
                  {secretType === 'ga4-creds' && (
                    <div className="space-y-4 mt-4 border-l-2 border-teal pl-4">
                      {/* Botón para validar GA4 */}
                      <button
                        type="button"
                        onClick={handleValidateGa4Credentials}
                        disabled={validatingGa4 || !secretValue}
                        className="px-4 py-2 bg-gradient-to-r from-teal to-[#0d9488] text-navy hover:from-[#0d9488] hover:to-[#0f766e] rounded-lg text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${validatingGa4 ? 'animate-spin' : ''}`} />
                        {validatingGa4 ? 'Validando...' : '🔍 Validar y Cargar Propiedades de Google'}
                      </button>
                      
                      {/* Dropdowns de Cuentas y Propiedades de GA4 */}
                      {ga4AccountsList.length > 0 && (
                        <div className="space-y-4 pt-3 border-t border-white/5">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1 text-teal">Cuenta Google Seleccionada</label>
                            <select 
                              value={selectedGa4Account}
                              onChange={(e) => handleGa4AccountChange(e.target.value)}
                              className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red font-bold"
                            >
                              {ga4AccountsList.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          </div>
                          
                          {ga4PropertiesList.length > 0 && (
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1 text-red">Propiedad GA4 (Para ETL)</label>
                              <select 
                                value={selectedGa4Property}
                                onChange={(e) => setSelectedGa4Property(e.target.value)}
                                className="w-full bg-[#0a1829] border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red font-bold text-red"
                              >
                                {ga4PropertiesList.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Sección de Automatización ETL y Scheduler (Para re-desplegar si falló) */}
              <div className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-3 mt-4">
                <div className="flex items-start gap-2.5">
                  <RefreshCw className={`w-4 h-4 text-amber-400 mt-0.5 ${redeploying ? 'animate-spin' : ''}`} />
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-white">Estado de Automatización (Daily ETL & Backfill)</h4>
                    <p className="text-[9px] text-mid leading-relaxed mt-1">
                      Si el Cloud Scheduler diario o el backfill de 90 días no se configuraron debido a un fallo inicial, puedes forzar su re-despliegue manual e inmediato.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRedeployEtl}
                  disabled={redeploying || saving}
                  className="w-full py-2 bg-gradient-to-r from-amber-500/10 to-amber-600/10 hover:from-amber-500/20 hover:to-amber-600/20 text-amber-400 hover:text-white border border-amber-500/20 disabled:opacity-50 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${redeploying ? 'animate-spin' : ''}`} />
                  {redeploying ? 'Re-desplegando...' : 'Forzar Re-despliegue de Scheduler & Backfill'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button 
                  type="button"
                  onClick={() => setShowSecretModal(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-navy rounded-lg text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {saving ? 'Cifrando...' : 'Encriptar y Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE AUDITORÍA Y PATCHER DE BIGQUERY */}
      {showAuditModal && auditTenantId && (
        <div className="fixed inset-0 bg-navy/80 backdrop-blur-sm flex items-center justify-center p-5 z-[1000]">
          <div className="bg-navy-light/20 border border-white/10 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-teal-400" />
                <h3 className="font-black text-sm uppercase tracking-widest text-teal-400">
                  Auditoría del Data Lake & Patcher
                </h3>
              </div>
              <button 
                onClick={() => setShowAuditModal(false)}
                className="text-xs font-bold text-mid hover:text-white transition-colors"
              >
                Cerrar [X]
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between bg-white/5 border border-white/5 p-4 rounded-xl">
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-widest text-mid">Cliente en auditoría</span>
                  <span className="font-black text-sm text-white uppercase">{auditTenantId}</span>
                </div>
                <div className="text-right">
                  <span className="block text-[9px] font-bold uppercase tracking-widest text-mid">Dataset de BigQuery</span>
                  <span className="font-mono text-xs text-teal-400 font-bold">media_impact_data</span>
                </div>
              </div>

              {loadingAudit ? (
                <div className="p-12 text-center text-mid text-xs flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
                  <span>Analizando consistencia de BigQuery...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Primera fecha de datos */}
                  <div className="flex items-center justify-between border-b border-white/5 pb-3">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <CalendarRange className="w-4 h-4 text-mid" /> Primera fecha registrada
                    </span>
                    <span className="font-mono text-xs font-bold bg-white/10 px-2 py-0.5 rounded text-white">
                      {auditData?.first_date || 'Sin datos todavía'}
                    </span>
                  </div>

                  {/* Diagnóstico de Huecos */}
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-2">
                      Huecos de datos detectados ({auditData?.gap_count || 0} días faltantes)
                    </span>
                    
                    {(!auditData || auditData.gaps.length === 0) ? (
                      <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-center text-emerald-400 text-xs flex flex-col items-center gap-2">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        <span>¡Línea de tiempo 100% íntegra! No se detectan huecos en la base de datos.</span>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="max-h-40 overflow-y-auto divide-y divide-white/5 border border-white/10 rounded-xl bg-white/[0.01] custom-scrollbar">
                          {auditData.gaps.map((g, idx) => (
                            <div key={idx} className="p-3 flex items-center justify-between text-xs text-red-400 font-mono">
                              <span className="flex items-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" /> Hueco: {g.display}
                              </span>
                              <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-black uppercase">Faltante</span>
                            </div>
                          ))}
                        </div>

                        {/* Botón de Patcher */}
                        <button
                          onClick={handleRunPatcher}
                          disabled={patching}
                          className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-navy text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-500/25 disabled:opacity-50"
                        >
                          <Wrench className="w-4 h-4" /> 
                          {patching ? 'Parchando Base de Datos...' : 'Parchar Huecos de Datos'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
