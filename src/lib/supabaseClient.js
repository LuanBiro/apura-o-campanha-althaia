// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

// Essas duas variáveis vêm do painel do Supabase (Project Settings > API Keys).
// No Vercel, configure como variáveis de ambiente:
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=sua-publishable-key (sb_publishable_...) ou anon key legada
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Lança um erro legível se a chamada ao Supabase falhar, em vez de deixar passar em silêncio.
function check(result, contexto) {
  if (result && result.error) {
    throw new Error(`[${contexto}] ${result.error.message || JSON.stringify(result.error)}`);
  }
  return result;
}

// -----------------------------------------------------------------
// Carrega tudo de uma campanha (equivalente ao antigo storeGet por campanha)
// -----------------------------------------------------------------
export async function loadCampaign(campaignId) {
  const [campaignRow, objRows, realRows, cnpjRows, codigoRows, supervisorRows, authRows] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', campaignId).single(),
    supabase.from('obj_entries').select('*').eq('campaign_id', campaignId),
    supabase.from('realizado_entries').select('*').eq('campaign_id', campaignId),
    supabase.from('realizado_cnpjs').select('*').eq('campaign_id', campaignId),
    supabase.from('codigo_map').select('*').eq('campaign_id', campaignId),
    supabase.from('supervisor_map').select('*').eq('campaign_id', campaignId),
    supabase.from('user_auth').select('nome, password_hash').eq('campaign_id', campaignId),
  ]);

  check(campaignRow, 'loadCampaign: campaigns');
  check(objRows, 'loadCampaign: obj_entries');
  check(realRows, 'loadCampaign: realizado_entries');
  check(cnpjRows, 'loadCampaign: realizado_cnpjs');
  check(codigoRows, 'loadCampaign: codigo_map');
  check(supervisorRows, 'loadCampaign: supervisor_map');
  check(authRows, 'loadCampaign: user_auth');

  const objData = {};
  (objRows.data || []).forEach(r => {
    if (!objData[r.nome]) objData[r.nome] = {};
    objData[r.nome][r.produto_key] = { label: r.produto_label, obj: Number(r.obj) };
  });

  const realizadoData = {};
  (realRows.data || []).forEach(r => {
    if (!realizadoData[r.nome]) realizadoData[r.nome] = {};
    realizadoData[r.nome][r.produto_key] = { valor: Number(r.valor), cnpjs: [] };
  });
  (cnpjRows.data || []).forEach(r => {
    if (!realizadoData[r.nome]) realizadoData[r.nome] = {};
    if (!realizadoData[r.nome][r.produto_key]) realizadoData[r.nome][r.produto_key] = { valor: 0, cnpjs: [] };
    realizadoData[r.nome][r.produto_key].cnpjs.push(r.cnpj_raiz);
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
  check(
    await supabase.from('obj_entries').delete().eq('campaign_id', campaignId),
    'saveObjData: delete'
  );

  const rows = [];
  Object.keys(objData).forEach(nome => {
    Object.keys(objData[nome]).forEach(key => {
      rows.push({
        campaign_id: campaignId, nome, produto_key: key,
        produto_label: objData[nome][key].label, obj: objData[nome][key].obj
      });
    });
  });

  if (rows.length) {
    check(await supabase.from('obj_entries').insert(rows), 'saveObjData: insert');
  }
  check(
    await supabase.from('campaigns').update({ updated_at: new Date().toISOString() }).eq('id', campaignId),
    'saveObjData: update campaigns'
  );
}

// -----------------------------------------------------------------
// Grava a base de realizado + código + supervisor (substitui a existente)
// -----------------------------------------------------------------
export async function saveRealizadoData(campaignId, { data, codigoMap, supervisorMap }) {
  check(
    await supabase.from('realizado_entries').delete().eq('campaign_id', campaignId),
    'saveRealizadoData: delete'
  );
  check(
    await supabase.from('realizado_cnpjs').delete().eq('campaign_id', campaignId),
    'saveRealizadoData: delete cnpjs'
  );

  const realRows = [];
  const cnpjRows = [];
  Object.keys(data).forEach(nome => {
    Object.keys(data[nome]).forEach(key => {
      const entry = data[nome][key];
      realRows.push({ campaign_id: campaignId, nome, produto_key: key, valor: entry.valor });
      (entry.cnpjs || []).forEach(cnpjRaiz => {
        cnpjRows.push({ campaign_id: campaignId, nome, produto_key: key, cnpj_raiz: cnpjRaiz });
      });
    });
  });
  if (realRows.length) {
    check(await supabase.from('realizado_entries').insert(realRows), 'saveRealizadoData: insert realizado');
  }
  if (cnpjRows.length) {
    check(await supabase.from('realizado_cnpjs').insert(cnpjRows), 'saveRealizadoData: insert cnpjs');
  }

  if (codigoMap && Object.keys(codigoMap).length) {
    const codRows = Object.keys(codigoMap).map(cod => ({ campaign_id: campaignId, codigo: cod, nome: codigoMap[cod] }));
    check(
      await supabase.from('codigo_map').upsert(codRows, { onConflict: 'campaign_id,codigo' }),
      'saveRealizadoData: upsert codigo_map'
    );
  }
  if (supervisorMap && Object.keys(supervisorMap).length) {
    const supRows = Object.keys(supervisorMap).map(nome => ({ campaign_id: campaignId, nome, supervisor_nome: supervisorMap[nome] }));
    check(
      await supabase.from('supervisor_map').upsert(supRows, { onConflict: 'campaign_id,nome' }),
      'saveRealizadoData: upsert supervisor_map'
    );
  }
  check(
    await supabase.from('campaigns').update({ updated_at: new Date().toISOString() }).eq('id', campaignId),
    'saveRealizadoData: update campaigns'
  );
}

// -----------------------------------------------------------------
// Senha do time comercial
// -----------------------------------------------------------------
export async function saveUserPassword(campaignId, nome, passwordHash) {
  check(
    await supabase.from('user_auth').upsert(
      { campaign_id: campaignId, nome, password_hash: passwordHash },
      { onConflict: 'campaign_id,nome' }
    ),
    'saveUserPassword'
  );
}
export async function resetUserPassword(campaignId, nome) {
  check(
    await supabase.from('user_auth').delete().eq('campaign_id', campaignId).eq('nome', nome),
    'resetUserPassword'
  );
}

// -----------------------------------------------------------------
// Configurações da campanha (nome, toggles de ranking)
// -----------------------------------------------------------------
export async function updateCampaignConfig(campaignId, patch) {
  const dbPatch = {};
  if ('campaignName' in patch) dbPatch.campaign_name = patch.campaignName;
  if ('rankingVisible' in patch) dbPatch.ranking_visible = patch.rankingVisible;
  if ('rankingVisibleGestores' in patch) dbPatch.ranking_visible_gestores = patch.rankingVisibleGestores;
  check(
    await supabase.from('campaigns').update(dbPatch).eq('id', campaignId),
    'updateCampaignConfig'
  );
}

// -----------------------------------------------------------------
// Zera os dados de uma campanha (mantém o registro da campanha em si)
// -----------------------------------------------------------------
export async function clearCampaignData(campaignId) {
  check(await supabase.from('obj_entries').delete().eq('campaign_id', campaignId), 'clearCampaignData: obj_entries');
  check(await supabase.from('realizado_entries').delete().eq('campaign_id', campaignId), 'clearCampaignData: realizado_entries');
  check(await supabase.from('realizado_cnpjs').delete().eq('campaign_id', campaignId), 'clearCampaignData: realizado_cnpjs');
  check(await supabase.from('codigo_map').delete().eq('campaign_id', campaignId), 'clearCampaignData: codigo_map');
  check(await supabase.from('supervisor_map').delete().eq('campaign_id', campaignId), 'clearCampaignData: supervisor_map');
  check(await supabase.from('user_auth').delete().eq('campaign_id', campaignId), 'clearCampaignData: user_auth');
}
