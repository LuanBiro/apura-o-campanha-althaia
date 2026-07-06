// src/components/AdminView.jsx
import { useState, useRef } from 'react';
import { CAMPAIGNS } from '../lib/campaigns';
import { readFileAsWorkbook, parseObjWorkbook, parseRealizadoWorkbook, parseRealizadoMDTR } from '../lib/parsers';
import {
  computeTeamMap, computeAllIndividualStats, computeRanking, computeGestorRanking,
  formatBRL, formatPct
} from '../lib/stats';
import {
  saveObjData, saveRealizadoData, updateCampaignConfig, clearCampaignData, resetUserPassword
} from '../lib/supabaseClient';

export default function AdminView({ campaigns, onReloadCampaign }) {
  const [adminCampaignId, setAdminCampaignId] = useState(CAMPAIGNS[0].id);
  const [adminTab, setAdminTab] = useState('importar');
  const camp = campaigns[adminCampaignId];

  return (
    <div className="wrap">
      <div className="card">
        <h2>Painel do administrador</h2>
        <h3>Gerencie cada campanha separadamente. Cada time compete só dentro do próprio ranking.</h3>
        <div className="camp-tabs no-print">
          {CAMPAIGNS.map(c => (
            <button
              key={c.id}
              className={`camp-tab-btn ${adminCampaignId === c.id ? 'active' : ''}`}
              onClick={() => setAdminCampaignId(c.id)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>{camp.label}</h2>
        <h3>{camp.campaignName || camp.label} {camp.updatedAt ? '· Atualizado em ' + new Date(camp.updatedAt).toLocaleString('pt-BR') : ''}</h3>
      </div>

      <div className="tabs no-print">
        <button className={`tab-btn ${adminTab === 'importar' ? 'active' : ''}`} onClick={() => setAdminTab('importar')}>Importar dados</button>
        <button className={`tab-btn ${adminTab === 'apuracoes' ? 'active' : ''}`} onClick={() => setAdminTab('apuracoes')}>Apurações (todas)</button>
        <button className={`tab-btn ${adminTab === 'ranking' ? 'active' : ''}`} onClick={() => setAdminTab('ranking')}>Ranking</button>
        <button className={`tab-btn ${adminTab === 'config' ? 'active' : ''}`} onClick={() => setAdminTab('config')}>Configurações</button>
      </div>

      {adminTab === 'importar' && <ImportarTab camp={camp} onReloadCampaign={onReloadCampaign} />}
      {adminTab === 'apuracoes' && <ApuracoesTab camp={camp} onReloadCampaign={onReloadCampaign} />}
      {adminTab === 'ranking' && <RankingTab camp={camp} onReloadCampaign={onReloadCampaign} />}
      {adminTab === 'config' && <ConfigTab camp={camp} onReloadCampaign={onReloadCampaign} />}
    </div>
  );
}

function ImportarTab({ camp, onReloadCampaign }) {
  const isMDTR = camp.id === 'geradores-demanda';
  const [objStatus, setObjStatus] = useState(null);
  const [realStatus, setRealStatus] = useState(null);
  const objInputRef = useRef(null);
  const realInputRef = useRef(null);

  const objCount = Object.keys(camp.objData).length;
  const realCount = Object.keys(camp.realizadoData).length;

  const handleObjFile = async (file) => {
    setObjStatus({ type: 'hint', text: 'Lendo arquivo...' });
    try {
      const wb = await readFileAsWorkbook(file);
      const { data, peopleFound, rowsFound } = parseObjWorkbook(wb);
      if (!peopleFound) {
        setObjStatus({ type: 'bad', text: 'Não encontrei blocos de OBJ nesse arquivo. Verifique o formato (nome + coluna "OBJ").' });
        return;
      }
      await saveObjData(camp.id, data);
      await onReloadCampaign(camp.id);
      setObjStatus({ type: 'ok', text: `✓ ${peopleFound} pessoas, ${rowsFound} linhas de produto carregadas em ${camp.label}` });
    } catch (err) {
      console.error(err);
      setObjStatus({ type: 'bad', text: `Erro ao salvar: ${err.message || err}` });
    }
  };

  const handleRealFile = async (file) => {
    setRealStatus({ type: 'hint', text: 'Lendo arquivo...' });
    try {
      const wb = await readFileAsWorkbook(file);
      const result = isMDTR ? parseRealizadoMDTR(wb) : parseRealizadoWorkbook(wb);
      if (result.error) {
        setRealStatus({ type: 'bad', text: result.error });
        return;
      }
      await saveRealizadoData(camp.id, result);
      await onReloadCampaign(camp.id);
      setRealStatus({ type: 'ok', text: `✓ ${Object.keys(result.data).length} pessoas, ${result.rowsFound} linhas processadas em ${camp.label}` });
    } catch (err) {
      console.error(err);
      setRealStatus({ type: 'bad', text: `Erro ao salvar: ${err.message || err}` });
    }
  };

  const realHint = isMDTR
    ? 'Formato MDTR desta campanha: colunas PPP (valor realizado), Família e Ger. Demanda (código e nome juntos, ex: "111199 - DANILO DE AZEVEDO SANTIAGO"). Não tem coluna de gestor — essa campanha é sempre apurada por pessoa. O texto da Família precisa ser igual ao da planilha de OBJ.'
    : 'Colunas esperadas: Consultor Cod, Consultor Nome, Supervisor Nome, Família, Fat+OL. A Família deve vir já separada por dosagem quando necessário (ex: "ROSUVASTATINA 40MG" e "ROSUVASTATINA 5/10/20" como linhas distintas) — o texto precisa ser igual ao que está na planilha de OBJ. A coluna Supervisor Nome é usada para montar a visão consolidada de cada gestor automaticamente.';

  return (
    <>
      <div className="card">
        <h2>1. Planilha de OBJ (meta por pessoa)</h2>
        <h3>Formato: nome no cabeçalho do bloco, produtos e valores de OBJ abaixo, encerrando em "TOTAL" — igual ao seu relatório atual.</h3>
        <div className="dropzone" onClick={() => objInputRef.current.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleObjFile(e.dataTransfer.files[0]); }}>
          <input ref={objInputRef} type="file" accept=".xlsx,.xls,.csv"
            onChange={e => e.target.files[0] && handleObjFile(e.target.files[0])} />
          <div className="dz-title">Clique para selecionar ou arraste o arquivo de OBJ</div>
          <div className="dz-sub">.xlsx ou .xls</div>
        </div>
        <div style={{ marginTop: 8 }}>
          {objStatus
            ? <span className={objStatus.type === 'ok' ? 'status-ok' : objStatus.type === 'bad' ? 'status-bad' : 'hint'}>{objStatus.text}</span>
            : (objCount > 0
              ? <span className="status-ok">✓ {objCount} pessoas carregadas na base de OBJ</span>
              : <span className="hint">Nenhuma base carregada ainda.</span>)}
        </div>
      </div>

      <div className="card">
        <h2>2. Base de realizado {isMDTR ? '(MDTR)' : '(Qlik)'}</h2>
        <h3>{realHint}</h3>
        <div className="dropzone" onClick={() => realInputRef.current.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) handleRealFile(e.dataTransfer.files[0]); }}>
          <input ref={realInputRef} type="file" accept=".xlsx,.xls,.csv"
            onChange={e => e.target.files[0] && handleRealFile(e.target.files[0])} />
          <div className="dz-title">Clique para selecionar ou arraste a base de {isMDTR ? 'MDTR' : 'Qlik'}</div>
          <div className="dz-sub">.xlsx ou .xls</div>
        </div>
        <div style={{ marginTop: 8 }}>
          {realStatus
            ? <span className={realStatus.type === 'ok' ? 'status-ok' : realStatus.type === 'bad' ? 'status-bad' : 'hint'}>{realStatus.text}</span>
            : (realCount > 0
              ? <span className="status-ok">✓ {realCount} pessoas com dados de realizado</span>
              : <span className="hint">Nenhuma base carregada ainda.</span>)}
        </div>
      </div>
    </>
  );
}

function ApuracoesTab({ camp, onReloadCampaign }) {
  const [filter, setFilter] = useState('');
  const all = computeAllIndividualStats(camp);
  const teamMap = computeTeamMap(camp);
  const f = filter.trim().toUpperCase();
  const filtered = f ? all.filter(r => r.nome.indexOf(f) > -1) : all;

  if (!Object.keys(camp.objData).length) {
    return <div className="card"><div className="empty">Importe a base de OBJ para ver as apurações por pessoa.</div></div>;
  }

  const handleResetSenha = async (nome) => {
    if (!confirm(`Resetar a senha de ${nome}? Na próxima vez que ela entrar, vai poder criar uma senha nova.`)) return;
    await resetUserPassword(camp.id, nome);
    await onReloadCampaign(camp.id);
  };

  return (
    <div className="card">
      <h2>Todas as apurações · {camp.label}</h2>
      <input type="text" className="search-box" placeholder="Buscar por nome..."
        value={filter} onChange={e => setFilter(e.target.value)} />
      <table>
        <thead>
          <tr><th>Nome</th><th>Reporta para</th><th className="num">OBJ</th><th className="num">Realizado</th><th className="num">Cob. %</th><th className="num">Produtos 100%</th><th>Acesso</th></tr>
        </thead>
        <tbody>
          {filtered.length ? filtered.map(r => {
            const isGestor = !!teamMap[r.nome];
            const temSenha = !!camp.userAuth[r.nome];
            return (
              <tr key={r.nome}>
                <td>{r.nome}{isGestor && <span className="pill pill-warn" style={{ marginLeft: 8 }}>Gestor</span>}</td>
                <td>{camp.supervisorMap[r.nome] || '—'}</td>
                <td className="num">{formatBRL(r.totalObj)}</td>
                <td className="num">{formatBRL(r.totalRealizado)}</td>
                <td className="num">{formatPct(r.totalCob)}</td>
                <td className="num">{r.count100}/{r.coreCount}</td>
                <td>
                  {temSenha
                    ? <button className="btn-link" style={{ padding: '2px 0' }} onClick={() => handleResetSenha(r.nome)}>Resetar senha</button>
                    : <span className="hint" style={{ margin: 0 }}>Sem senha ainda</span>}
                </td>
              </tr>
            );
          }) : <tr><td colSpan="7" className="empty">Nenhum resultado.</td></tr>}
        </tbody>
      </table>
      <div className="hint" style={{ marginTop: 10 }}>
        Linhas marcadas "Gestor" mostram só o OBJ/realizado pessoal dele (ex: atendimento direto), não o total da equipe. O total da equipe aparece no ranking de gestores.
      </div>
    </div>
  );
}

function RankingTab({ camp, onReloadCampaign }) {
  const ranking = computeRanking(camp);
  const gestorRanking = computeGestorRanking(camp);
  const hasGestores = gestorRanking.length > 0;

  if (!ranking.length && !gestorRanking.length) {
    return <div className="card"><div className="empty">Sem dados de OBJ carregados ainda para {camp.label}.</div></div>;
  }

  const toggleConsultores = async (checked) => {
    await updateCampaignConfig(camp.id, { rankingVisible: checked });
    await onReloadCampaign(camp.id);
  };
  const toggleGestores = async (checked) => {
    await updateCampaignConfig(camp.id, { rankingVisibleGestores: checked });
    await onReloadCampaign(camp.id);
  };

  return (
    <>
      <div className="card">
        <div className="toggle-row">
          <div>
            <strong>Ranking de consultores visível para o time</strong>
            <div className="hint" style={{ margin: '2px 0 0' }}>Afeta só esta campanha. Gestores não entram nesse ranking.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={camp.rankingVisible} onChange={e => toggleConsultores(e.target.checked)} />
            <span className="slider"></span>
          </label>
        </div>
      </div>
      <div className="card">
        <h2>Prévia do ranking de consultores</h2>
        <h3>Critério: produtos 100% da meta · desempate pela cobertura total</h3>
        {ranking.length ? ranking.map((r, i) => (
          <div key={r.nome} className={`rank-item ${i < 3 ? 'top3' : ''}`}>
            <div className="rank-pos">{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div className="rank-name">{r.nome}</div>
              <div className="rank-meta">{r.count100} de {r.coreCount} produtos na meta</div>
            </div>
            <div className="rank-cov">{formatPct(r.totalCob)}</div>
          </div>
        )) : <div className="empty">Nenhum consultor (não-gestor) com OBJ carregado.</div>}
      </div>

      {hasGestores ? (
        <>
          <div className="card">
            <div className="toggle-row">
              <div>
                <strong>Ranking de gestores visível para os gestores</strong>
                <div className="hint" style={{ margin: '2px 0 0' }}>Compara o resultado consolidado de cada equipe. Independente do ranking de consultores.</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={camp.rankingVisibleGestores} onChange={e => toggleGestores(e.target.checked)} />
                <span className="slider"></span>
              </label>
            </div>
          </div>
          <div className="card">
            <h2>Prévia do ranking de gestores</h2>
            <h3>Critério: produtos 100% da meta da equipe · desempate pela cobertura total da equipe</h3>
            {gestorRanking.map((r, i) => (
              <div key={r.gestorNome} className={`rank-item ${i < 3 ? 'top3' : ''}`}>
                <div className="rank-pos">{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div className="rank-name">{r.gestorNome}</div>
                  <div className="rank-meta">{r.count100} de {r.coreCount} produtos na meta · {r.members.length} consultores</div>
                </div>
                <div className="rank-cov">{formatPct(r.totalCob)}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="card"><div className="empty">Nenhum gestor identificado em {camp.label} ainda (precisa de Supervisor Nome na base).</div></div>
      )}
    </>
  );
}

function ConfigTab({ camp, onReloadCampaign }) {
  const [campaignName, setCampaignName] = useState(camp.campaignName || camp.label);

  const saveCampaignName = async () => {
    await updateCampaignConfig(camp.id, { campaignName: campaignName.trim() || camp.label });
    await onReloadCampaign(camp.id);
  };

  const resetData = async () => {
    if (!confirm(`Tem certeza? Isso vai apagar OBJ, Realizado e senhas de acesso de ${camp.label}.`)) return;
    await clearCampaignData(camp.id);
    await onReloadCampaign(camp.id);
  };

  return (
    <>
      <div className="card">
        <h2>Nome / período da campanha</h2>
        <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)}
          placeholder="Ex: Grandes Contas - Julho 2026" />
        <button className="btn btn-small" style={{ width: 'auto' }} onClick={saveCampaignName}>Salvar nome</button>
      </div>
      <div className="card">
        <h2>Senha de administrador</h2>
        <h3>Configurada via variável de ambiente no Vercel (VITE_ADMIN_PASSWORD). Para trocar, atualize a variável e faça um novo deploy — ou migre para Supabase Auth para gerenciar por aqui.</h3>
      </div>
      <div className="card">
        <h2>Zona de risco</h2>
        <div className="hint">Isso apaga OBJ, Realizado e as senhas de acesso do time carregados só de {camp.label} (não afeta as outras campanhas, nem a senha do admin ou o nome da campanha).</div>
        <button className="btn btn-small btn-danger" style={{ width: 'auto' }} onClick={resetData}>Limpar dados de {camp.label}</button>
      </div>
    </>
  );
}
