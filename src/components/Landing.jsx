// src/components/Landing.jsx
import { CAMPAIGNS } from '../lib/campaigns';

export default function Landing({ onSelectCampaign, onAdminClick }) {
  return (
    <div className="landing-wrap">
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Qual campanha você quer consultar?</h2>
        <h3>Selecione seu time para ver objetivo, realizado e ranking</h3>
      </div>
      <div className="camp-grid">
        {CAMPAIGNS.map(c => (
          <button key={c.id} className="camp-card" onClick={() => onSelectCampaign(c.id)}>
            <div className="icon">{c.icon}</div>
            <h3>{c.label}</h3>
            <p>Ver apuração da campanha {c.label}</p>
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <button className="btn-link" onClick={onAdminClick}>Sou administrador</button>
      </div>
      <div className="footer-note">Dados de apuração de campanhas comerciais Althaia Genéricos.</div>
    </div>
  );
}
