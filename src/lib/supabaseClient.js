// lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Essas duas variáveis vêm do painel do Supabase (Project Settings > API).
// No Vercel, configure como variáveis de ambiente:
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=sua-anon-key
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// -----------------------------------------------------------------
// Carrega tudo de uma campanha (equivalente ao antigo storeGet por campanha)
// -----------------------------------------------------------------
export async function loadCampaign(campaignId) {
  const [campaignRow, objRows, realRows, codigoRows, supervisorRows, authRows] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', campaignId).single(),
    supabase.from('obj_entries').select('*').eq('campaign_id', campaignId),
    supabase.from('realizado_entries').select('*').eq('campaign_id', campaignId),
    supabase.from('codigo_map').select('*').eq('campaign_id', campaignId),
    supabase.from('supervisor_map').select('*').eq('campaign_id', campaignId),
    supabase.from('user_auth').select('nome, password_hash').eq('campaign_id', campaignId),
  ]);

  const objData = {};
  (objRows.data || []).forEach(r => {
    if (!objData[r.nome]) objData[r.nome] = {};
    objData[r.nome][r.produto_key] = { label: r.produto_label, obj: Number(r.obj) };
  });

  const realizadoData = {};
  (realRows.data || []).forEach(r => {
    if (!realizadoData[r.nome]) realizadoData[r.nome] = {};
    realizadoData[r.nome][r.produto_key] = Number(r.valor);
  });

  const codigoMap = {};
  (codigoRows.data || []).forEach(r => { codigoMap[r.codigo] = r.nome; });

  const supervisorMap = {};
  (supervisorRows.data || []).forEach(r => { supervisorMap[r.nome] = r.supervisor_nome; });

  const userAuth = {};
  (authRows.data || []).forEach(r => { userAuth[r.nome] = { passwordHash: r.password_hash }; });

  const c = campaignRow.data || {};
  return {
    id: campaignId,
    label: c.label,
    campaignName: c.campaign_name,
    rankingVisible: c.ranking_visible,
    rankingVisibleGestores: c.ranking_visible_gestores,
    updatedAt: c.updated_at,
    objData, realizadoData, codigoMap, supervisorMap, userAuth
  };
}

// -----------------------------------------------------------------
// Grava a base de OBJ inteira (substitui o que já existir daquela campanha)
// -----------------------------------------------------------------
export async function saveObjData(campaignId, objData) {
  await supabase.from('obj_entries').delete().eq('campaign_id', campaignId);
  const rows = [];
  Object.keys(objData).forEach(nome => {
    Object.keys(objData[nome]).forEach(key => {
      rows.push({
        campaign_id: campaignId, nome, produto_key: key,
        produto_label: objData[nome][key].label, obj: objData[nome][key].obj
      });
    });
  });
  if (rows.length) await supabase.from('obj_entries').insert(rows);
  await supabase.from('campaigns').update({ updated_at: new Date().toISOString() }).eq('id', campaignId);
}

// -----------------------------------------------------------------
// Grava a base de realizado + código + supervisor (substitui a existente)
// -----------------------------------------------------------------
export async function saveRealizadoData(campaignId, { data, codigoMap, supervisorMap }) {
  await supabase.from('realizado_entries').delete().eq('campaign_id', campaignId);
  const realRows = [];
  Object.keys(data).forEach(nome => {
    Object.keys(data[nome]).forEach(key => {
      realRows.push({ campaign_id: campaignId, nome, produto_key: key, valor: data[nome][key] });
    });
  });
  if (realRows.length) await supabase.from('realizado_entries').insert(realRows);

  if (codigoMap && Object.keys(codigoMap).length) {
    const codRows = Object.keys(codigoMap).map(cod => ({ campaign_id: campaignId, codigo: cod, nome: codigoMap[cod] }));
    await supabase.from('codigo_map').upsert(codRows, { onConflict: 'campaign_id,codigo' });
  }
  if (supervisorMap && Object.keys(supervisorMap).length) {
    const supRows = Object.keys(supervisorMap).map(nome => ({ campaign_id: campaignId, nome, supervisor_nome: supervisorMap[nome] }));
    await supabase.from('supervisor_map').upsert(supRows, { onConflict: 'campaign_id,nome' });
  }
  await supabase.from('campaigns').update({ updated_at: new Date().toISOString() }).eq('id', campaignId);
}

// -----------------------------------------------------------------
// Senha do time comercial
// -----------------------------------------------------------------
export async function saveUserPassword(campaignId, nome, passwordHash) {
  await supabase.from('user_auth').upsert(
    { campaign_id: campaignId, nome, password_hash: passwordHash },
    { onConflict: 'campaign_id,nome' }
  );
}
export async function resetUserPassword(campaignId, nome) {
  await supabase.from('user_auth').delete().eq('campaign_id', campaignId).eq('nome', nome);
}

// -----------------------------------------------------------------
// Configurações da campanha (nome, toggles de ranking)
// -----------------------------------------------------------------
export async function updateCampaignConfig(campaignId, patch) {
  const dbPatch = {};
  if ('campaignName' in patch) dbPatch.campaign_name = patch.campaignName;
  if ('rankingVisible' in patch) dbPatch.ranking_visible = patch.rankingVisible;
  if ('rankingVisibleGestores' in patch) dbPatch.ranking_visible_gestores = patch.rankingVisibleGestores;
  await supabase.from('campaigns').update(dbPatch).eq('id', campaignId);
}

// -----------------------------------------------------------------
// Zera os dados de uma campanha (mantém o registro da campanha em si)
// -----------------------------------------------------------------
export async function clearCampaignData(campaignId) {
  await Promise.all([
    supabase.from('obj_entries').delete().eq('campaign_id', campaignId),
    supabase.from('realizado_entries').delete().eq('campaign_id', campaignId),
    supabase.from('codigo_map').delete().eq('campaign_id', campaignId),
    supabase.from('supervisor_map').delete().eq('campaign_id', campaignId),
    supabase.from('user_auth').delete().eq('campaign_id', campaignId),
  ]);
}
