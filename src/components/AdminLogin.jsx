// src/components/AdminLogin.jsx
import { useState } from 'react';

export default function AdminLogin({ onBack, onSuccess }) {
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    // TODO: em produção real, troque isso por Supabase Auth (email + senha).
    // Por enquanto, a senha do admin fica numa variável de ambiente do Vercel.
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'althaia2026';
    if (senha !== adminPassword) {
      setError('Senha incorreta.');
      return;
    }
    setError('');
    onSuccess();
  };

  return (
    <div className="center-wrap">
      <div className="card">
        <h2>Acesso administrador</h2>
        <h3>Gerencia as 4 campanhas (Grandes Contas, Distribuição, Varejo, Geradores de Demanda)</h3>
        <label>Senha</label>
        <input
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="••••••••"
        />
        {error && <div className="error-msg">{error}</div>}
        <button className="btn btn-secondary" onClick={submit}>Entrar como admin</button>
        <button className="btn-link" style={{ marginTop: 10 }} onClick={onBack}>&larr; Voltar</button>
      </div>
    </div>
  );
}
