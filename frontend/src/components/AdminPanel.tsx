// frontend/src/components/AdminPanel.tsx
import React, { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Edit2, Key, Save, ArrowLeft, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

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

interface AdminPanelProps {
  onBack: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
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
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
    if (!secretTenantId || !secretValue) return;

    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/admin/tenants/${secretTenantId}/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret_type: secretType, secret_value: secretValue })
      });

      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: `Secreto '${secretType}' guardado y encriptado con éxito en GCP Secret Manager para el cliente '${secretTenantId}'.` 
        });
        setShowSecretModal(false);
        setSecretValue('');
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
    setShowSecretModal(true);
  };

  return (
    <div className="min-h-screen bg-navy text-white font-sans flex flex-col">
      {/* HEADER DE ADMÍN */}
      <header className="h-16 bg-navy-light/10 border-b border-white/10 flex items-center justify-between px-8 sticky top-0 z-[50] backdrop-blur-md">
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
        
        <div>
          <button 
            onClick={fetchTenants}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 text-mid ${loading ? 'animate-spin' : ''}`} />
          </button>
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

        {/* LISTADO DE CLIENTES */}
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
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 self-end md:self-auto">
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
                  placeholder="ej: sanitas"
                  required
                  className="w-full bg-navy-light/10 border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red transition-colors disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Nombre Comercial</label>
                <input 
                  type="text" 
                  value={editingTenant.tenant_name}
                  onChange={(e) => setEditingTenant({ ...editingTenant, tenant_name: e.target.value })}
                  placeholder="ej: Sanitas España"
                  required
                  className="w-full bg-navy-light/10 border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red transition-colors"
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
                      className="flex-1 bg-navy-light/10 border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red transition-colors"
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
                      className="flex-1 bg-navy-light/10 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-red"
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
                      className="flex-1 bg-navy-light/10 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white uppercase font-mono focus:outline-none focus:border-red"
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
                  placeholder="soporte.sanitas@llyc.global"
                  required
                  className="w-full bg-navy-light/10 border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red transition-colors"
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
          <div className="bg-navy-light/20 border border-white/10 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 bg-white/[0.02] flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              <h3 className="font-black text-sm uppercase tracking-widest text-amber-400">
                Administrar Credenciales de Ciberseguridad (GCP)
              </h3>
            </div>
            
            <form onSubmit={handleSaveSecret} className="p-6 space-y-4">
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
                  className="w-full bg-navy-light/10 border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white focus:outline-none focus:border-red"
                >
                  <option value="brandlight-key">Brandlight BI API Key (Visibilidad / SoV)</option>
                  <option value="peec-key">Peec.ai API Token (Comportamiento de IA)</option>
                  <option value="ga4-creds">GA4 OAuth Token JSON (Sesiones de Google)</option>
                  <option value="adobe-creds">Adobe Analytics API Client Secret</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-mid mb-1">Valor de la Llave Secreta (API Key / Token)</label>
                <textarea 
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="Pega aquí la clave secreta obtenida del proveedor analítico..."
                  required
                  rows={4}
                  className="w-full bg-navy-light/10 border border-white/10 rounded-lg px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-red resize-none"
                />
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
    </div>
  );
};
