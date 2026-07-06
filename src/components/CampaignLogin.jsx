// src/components/CampaignLogin.jsx
import { useState } from 'react';
import { resolveLogin, hashPassword } from '../lib/stats';
import { saveUserPassword } from '../lib/supabaseClient';

export default function CampaignLogin({ camp, onBack, onLoginSuccess }) {
  const [stage, setStage] = useState('identify'); // 'identify' | 'password' | 'create-password'
  const [resolved, setResolved] = useState(null); // {nome, type}
  const [nomeCodigo, setNomeCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [error, setError] = useState('');

  const resetFlow = () => {
    setStage('identify');
    setResolved(null);
    setSenha(''); setNovaSenha(''); setConfirmaSenha(''); setError('');
  };

  const handleIdentify = () => {
    const r = resolveLogin(camp, nomeCodigo);
    if (!r) {
      setError('Não encontrei esse nome ou código nesta campanha.');
      return;
    }
    setError('');
    setResolved(r);
    setStage(camp.userAuth[r.nome] ? 'password' : 'create-password');
  };

  const handlePasswordSubmit = async () => {
    const hash = await hashPassword(senha);
    if (hash !== camp.userAuth[resolved.nome].passwordHash) {
      setError('Senha incorreta.');
      return;
    }
    setError('');
    onLoginSuccess(resolved);
    resetFlow();
  };

  const handleCreatePassword = async () => {
    if (novaSenha.length < 4) { setError('A senha precisa ter pelo menos 4 caracteres.'); return; }
    if (novaSenha !== confirmaSenha) { setError('As senhas não coincidem.'); return; }
    setError('');
    const hash = await hashPassword(novaSenha);
    await saveUserPassword(camp.id, resolved.nome, hash);
    camp.userAuth[resolved.nome] = { passwordHash: hash };
    onLoginSuccess(resolved);
    resetFlow();
  };

  if (stage === 'password') {
    return (
      <div className="center-wrap">
        <div className="card">
          <button className="btn-link" style={{ marginBottom: 10 }} onClick={resetFlow}>&larr; Não sou eu</button>
          <h2>Olá, {resolved.nome}</h2>
          <h3>{camp.label} · digite sua senha</h3>
          <label>Senha</label>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()} placeholder="••••••••" />
          {error && <div className="error-msg">{error}</div>}
          <button className="btn" onClick={handlePasswordSubmit}>Entrar</button>
          <div className="hint" style={{ marginTop: 10 }}>
            Esqueceu a senha? Peça ao administrador da campanha para resetar o seu acesso.
          </div>
        </div>
      </div>
    );
  }

  if (stage === 'create-password') {
    return (
      <div className="center-wrap">
        <div className="card">
          <button className="btn-link" style={{ marginBottom: 10 }} onClick={resetFlow}>&larr; Não sou eu</button>
          <h2>Primeiro acesso, {resolved.nome}</h2>
          <h3>{camp.label} · crie uma senha para os próximos acessos</h3>
          <label>Nova senha</label>
          <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo 4 caracteres" />
          <label>Confirmar senha</label>
          <input type="password" value={confirmaSenha} onChange={e => setConfirmaSenha(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreatePassword()} placeholder="Repita a senha" />
          {error && <div className="error-msg">{error}</div>}
          <button className="btn" onClick={handleCreatePassword}>Criar senha e entrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="center-wrap">
      <div className="card">
        <button className="btn-link" style={{ marginBottom: 10 }} onClick={onBack}>&larr; Trocar campanha</button>
        <h2>{camp.label}</h2>
        <h3>{camp.campaignName || camp.label}</h3>
        <label>Nome ou código</label>
        <input type="text" value={nomeCodigo} onChange={e => setNomeCodigo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleIdentify()}
          placeholder="Ex: AMANDA SANTANNA DA SILVA ou 122000" />
        <div className="hint" style={{ marginTop: -12 }}>
          Gestores digitam o próprio nome e veem automaticamente a apuração consolidada da equipe.
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn" onClick={handleIdentify}>Continuar</button>
      </div>
      <div className="footer-note">Dados de apuração de campanhas comerciais Althaia Genéricos.</div>
    </div>
  );
}
