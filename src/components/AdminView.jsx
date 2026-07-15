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

      {adminTab === 'importar' && <ImportarTab key={camp.id} camp={camp} onReloadCampaign={onReloadCampaign} />}
      {adminTab === 'apuracoes' && <ApuracoesTab key={camp.id} camp={camp} onReloadCampaign={onReloadCampaign} />}
      {adminTab === 'ranking' && <RankingTab key={camp.id} camp={camp} onReloadCampaign={onReloadCampaign} />}
      {adminTab === 'config' && <ConfigTab key={camp.id} camp={camp} onReloadCampaign={onReloadCampaign} />}
    </div>
  );
}

/* ---------------- Importar ---------------- */
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
          onDrop={e => { e.preventDefault(); if
