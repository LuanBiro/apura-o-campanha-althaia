// src/App.jsx
import { useState, useEffect, useCallback } from 'react';
import { CAMPAIGNS } from './lib/campaigns';
import { loadCampaign } from './lib/supabaseClient';
import Landing from './components/Landing';
import AdminLogin from './components/AdminLogin';
import CampaignLogin from './components/CampaignLogin';
import ComercialView from './components/ComercialView';
import GestorView from './components/GestorView';
import AdminView from './components/AdminView';

export default function App() {
  const [campaigns, setCampaigns] = useState(null); // { [id]: camp } | null enquanto carrega
  const [session, setSession] = useState(null);     // {type:'comercial'|'gestor', campaignId, nome} | {type:'admin'}
  const [landingCampaignId, setLandingCampaignId] = useState(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const reloadCampaign = useCallback(async (campaignId) => {
    const fresh = await loadCampaign(campaignId);
    setCampaigns(prev => ({ ...prev, [campaignId]: fresh }));
  }, []);

  useEffect(() => {
    (async () => {
      const loaded = await Promise.all(CAMPAIGNS.map(c => loadCampaign(c.id)));
      const map = {};
      CAMPAIGNS.forEach((c, i) => { map[c.id] = loaded[i]; });
      setCampaigns(map);
    })();
  }, []);

  if (!campaigns) {
    return (
      <div className="center-wrap">
        <div className="card"><div className="empty">Carregando...</div></div>
      </div>
    );
  }

  const handleLogout = () => {
    setSession(null);
    setLandingCampaignId(null);
    setShowAdminLogin(false);
  };

  const topbarTag = session
    ? (session.campaignId ? campaigns[session.campaignId].label : 'Administrador')
    : null;

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="mark">ALTHAIA</span>
          <span className="sub">Apuração de Campanha Comercial</span>
          {topbarTag && <span className="camp-tag">{topbarTag}</span>}
        </div>
        <div className="topbar-actions">
          {session && <button className="btn-ghost" onClick={handleLogout}>Sair</button>}
        </div>
      </div>

      {(() => {
        if (!session) {
          if (showAdminLogin) {
            return (
              <AdminLogin
                onBack={() => setShowAdminLogin(false)}
                onSuccess={() => { setSession({ type: 'admin' }); setShowAdminLogin(false); }}
              />
            );
          }
          if (!landingCampaignId) {
            return (
              <Landing
                onSelectCampaign={setLandingCampaignId}
                onAdminClick={() => setShowAdminLogin(true)}
              />
            );
          }
          return (
            <CampaignLogin
              camp={campaigns[landingCampaignId]}
              onBack={() => setLandingCampaignId(null)}
              onLoginSuccess={(resolved) => setSession({ type: resolved.type, campaignId: landingCampaignId, nome: resolved.nome })}
            />
          );
        }

        if (session.type === 'comercial') {
          return <ComercialView camp={campaigns[session.campaignId]} nome={session.nome} />;
        }
        if (session.type === 'gestor') {
          return <GestorView camp={campaigns[session.campaignId]} gestorNome={session.nome} />;
        }
        if (session.type === 'admin') {
          return <AdminView campaigns={campaigns} onReloadCampaign={reloadCampaign} />;
        }
        return null;
      })()}
    </>
  );
}
