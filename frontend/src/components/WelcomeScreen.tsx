import React, { useState } from 'react';
import { LayoutGrid, Cloud, FileUp, ShieldCheck, Sparkles } from 'lucide-react';

interface WelcomeScreenProps {
  onSelectGA4: () => void;
  onSelectAdobe: (creds: any) => void;
  onSelectPeec: (apiKey: string) => void;
  onFileUpload: (file: File) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ 
  onSelectGA4, 
  onSelectAdobe, 
  onSelectPeec,
  onFileUpload 
}) => {
  const [showAdobeModal, setShowAdobeModal] = useState(false);
  const [showPeecModal, setShowPeecModal] = useState(false);
  const [adobeCreds, setAdobeCreds] = useState({
    client_id: '',
    client_secret: '',
    org_id: '',
    company_id: ''
  });
  const [peecApiKey, setPeecApiKey] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileUpload(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 bg-dashboard-bg flex items-center justify-center p-5 z-[1000]">
      <div className="bg-white rounded-2xl p-10 max-w-3xl w-full shadow-2xl text-center">
        <div className="text-red font-bold text-3xl mb-6 tracking-tighter">LLYC</div>
        <h2 className="text-2xl font-bold text-navy mb-2">Intelligence Dashboard 2026</h2>
        <p className="text-mid mb-8">Selecciona tu origen de datos para comenzar el análisis</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button 
            onClick={onSelectGA4}
            className="bg-dashboard-bg rounded-xl p-6 flex flex-col items-center gap-3 transition-all hover:border-red hover:bg-white hover:-translate-y-1 hover:shadow-lg border-2 border-transparent"
          >
            <Cloud className="w-10 h-10 text-navy" />
            <span className="font-bold text-xs uppercase tracking-widest text-navy">Google Analytics 4</span>
          </button>

          <button 
            onClick={() => setShowAdobeModal(true)}
            className="bg-dashboard-bg rounded-xl p-6 flex flex-col items-center gap-3 transition-all hover:border-red hover:bg-white hover:-translate-y-1 hover:shadow-lg border-2 border-transparent"
          >
            <LayoutGrid className="w-10 h-10 text-navy" />
            <span className="font-bold text-xs uppercase tracking-widest text-navy">Adobe Analytics</span>
          </button>

          <button 
            onClick={() => setShowPeecModal(true)}
            className="bg-dashboard-bg rounded-xl p-6 flex flex-col items-center gap-3 transition-all hover:border-red hover:bg-white hover:-translate-y-1 hover:shadow-lg border-2 border-transparent"
          >
            <Sparkles className="w-10 h-10 text-red" />
            <span className="font-bold text-xs uppercase tracking-widest text-navy">Peec.ai (AI Analytics)</span>
          </button>

          <label className="bg-dashboard-bg rounded-xl p-6 flex flex-col items-center gap-3 transition-all hover:border-red hover:bg-white hover:-translate-y-1 hover:shadow-lg border-2 border-transparent cursor-pointer">
            <FileUp className="w-10 h-10 text-navy" />
            <span className="font-bold text-xs uppercase tracking-widest text-navy">Archivo Local</span>
            <input type="file" className="hidden" onChange={handleFileChange} accept=".csv,.xlsx,.xls" />
          </label>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <button 
            onClick={onSelectGA4}
            className="text-[10px] font-black uppercase tracking-[0.2em] text-mid hover:text-red transition-colors border border-dashboard-border px-4 py-2 rounded-full hover:border-red"
          >
            (Mock Up)
          </button>
          
          <div className="flex items-center justify-center gap-2 text-[10px] text-mid font-bold uppercase tracking-widest">
            <ShieldCheck className="w-3 h-3" />
            LLYC Intelligence · Privacy & Data Secure
          </div>
        </div>
      </div>

      {showAdobeModal && (
        <div className="fixed inset-0 bg-navy/80 flex items-center justify-center p-5 z-[1100]">
          <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold mb-6 text-navy">Credenciales Adobe</h3>
            
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold text-mid uppercase mb-1">Client ID (API Key)</label>
                <input 
                  type="text" 
                  className="w-full p-3 border border-dashboard-border rounded-lg text-sm focus:ring-2 ring-red/20 outline-none"
                  value={adobeCreds.client_id}
                  onChange={e => setAdobeCreds({...adobeCreds, client_id: e.target.value})}
                  placeholder="8c6..."
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-mid uppercase mb-1">Client Secret</label>
                <input 
                  type="password" 
                  className="w-full p-3 border border-dashboard-border rounded-lg text-sm focus:ring-2 ring-red/20 outline-none"
                  value={adobeCreds.client_secret}
                  onChange={e => setAdobeCreds({...adobeCreds, client_secret: e.target.value})}
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-mid uppercase mb-1">Org ID</label>
                <input 
                  type="text" 
                  className="w-full p-3 border border-dashboard-border rounded-lg text-sm focus:ring-2 ring-red/20 outline-none"
                  value={adobeCreds.org_id}
                  onChange={e => setAdobeCreds({...adobeCreds, org_id: e.target.value})}
                  placeholder="XXXX@AdobeOrg"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-mid uppercase mb-1">Company ID</label>
                <input 
                  type="text" 
                  className="w-full p-3 border border-dashboard-border rounded-lg text-sm focus:ring-2 ring-red/20 outline-none"
                  value={adobeCreds.company_id}
                  onChange={e => setAdobeCreds({...adobeCreds, company_id: e.target.value})}
                  placeholder="llyc_prod"
                />
              </div>
            </div>

            <button 
              onClick={() => onSelectAdobe(adobeCreds)}
              className="w-full mt-6 bg-red text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              Conectar Adobe
            </button>
            <button 
              onClick={() => setShowAdobeModal(false)}
              className="w-full mt-2 bg-navy-light text-navy py-3 rounded-lg font-bold hover:bg-dashboard-border transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {showPeecModal && (
        <div className="fixed inset-0 bg-navy/80 flex items-center justify-center p-5 z-[1100]">
          <div className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold mb-6 text-navy">Conectar Peec.ai</h3>
            
            <div className="space-y-4 text-left">
              <div>
                <label className="block text-[10px] font-bold text-mid uppercase mb-1">Peec.ai API Key</label>
                <input 
                  type="password" 
                  className="w-full p-3 border border-dashboard-border rounded-lg text-sm focus:ring-2 ring-red/20 outline-none"
                  value={peecApiKey}
                  onChange={e => setPeecApiKey(e.target.value)}
                  placeholder="peec_api_key_xxxxxxxx"
                />
                <p className="text-[10px] text-mid mt-1">
                  Obtén tu API key desde la sección de configuración de tu cuenta en docs.peec.ai.
                </p>
              </div>
            </div>

            <button 
              onClick={() => onSelectPeec(peecApiKey)}
              className="w-full mt-6 bg-red text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              Conectar Peec.ai
            </button>
            <button 
              onClick={() => setShowPeecModal(false)}
              className="w-full mt-2 bg-navy-light text-navy py-3 rounded-lg font-bold hover:bg-dashboard-border transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
