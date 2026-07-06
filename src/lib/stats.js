// lib/stats.js
// Cálculo de cobertura e rankings — idêntico à lógica validada no protótipo.

export function formatBRL(v) {
  if (v === undefined || v === null || isNaN(v)) v = 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatPct(v) {
  if (v === undefined || v === null || isNaN(v)) v = 0;
  return v.toFixed(1).replace('.', ',') + '%';
}

// camp = { objData, realizadoData, supervisorMap, codigoMap }
export function computeTeamMap(camp) {
  const map = {};
  Object.keys(camp.supervisorMap || {}).forEach(consultor => {
    const sup = camp.supervisorMap[consultor];
    if (sup && sup !== consultor) {
      if (!map[sup]) map[sup] = [];
      map[sup].push(consultor);
    }
  });
  return map;
}

export function computeConsultorStats(camp, nome) {
  const objBlock = camp.objData[nome] || {};
  const realBlock = camp.realizadoData[nome] || {};

  const produtos = Object.keys(objBlock).map(key => {
    const obj = objBlock[key].obj || 0;
    const realizado = realBlock[key] || 0;
    const cob = obj > 0 ? (realizado / obj * 100) : 0;
    return { key, label: objBlock[key].label, obj, realizado, cob };
  });

  produtos.sort((a, b) => a.label.localeCompare(b.label));
  const totalObj = produtos.reduce((s, p) => s + p.obj, 0);
  const totalRealizado = produtos.reduce((s, p) => s + p.realizado, 0);
  const totalCob = totalObj > 0 ? (totalRealizado / totalObj * 100) : 0;
  const count100 = produtos.filter(p => p.cob >= 100).length;

  return { nome, produtos, coreCount: produtos.length, totalObj, totalRealizado, totalCob, count100 };
}

export function computeGestorStats(camp, gestorNome) {
  const teamMap = computeTeamMap(camp);
  const members = teamMap[gestorNome] || [];
  const memberStats = members.map(m => computeConsultorStats(camp, m));

  // se o gestor também tiver bloco de OBJ próprio (ex: atende cliente direto), soma junto
  const hasOwnAccount = !!camp.objData[gestorNome];
  if (hasOwnAccount) {
    const ownStats = computeConsultorStats(camp, gestorNome);
    ownStats.isSelfAccount = true;
    memberStats.push(ownStats);
  }

  const produtoAgg = {};
  memberStats.forEach(ms => {
    ms.produtos.forEach(p => {
      if (!produtoAgg[p.key]) produtoAgg[p.key] = { label: p.label, obj: 0, realizado: 0 };
      produtoAgg[p.key].obj += p.obj;
      produtoAgg[p.key].realizado += p.realizado;
    });
  });

  const produtos = Object.keys(produtoAgg).map(key => {
    const o = produtoAgg[key];
    const cob = o.obj > 0 ? (o.realizado / o.obj * 100) : 0;
    return { key, label: o.label, obj: o.obj, realizado: o.realizado, cob };
  });

  produtos.sort((a, b) => a.label.localeCompare(b.label));
  const totalObj = produtos.reduce((s, p) => s + p.obj, 0);
  const totalRealizado = produtos.reduce((s, p) => s + p.realizado, 0);
  const totalCob = totalObj > 0 ? (totalRealizado / totalObj * 100) : 0;
  const count100 = produtos.filter(p => p.cob >= 100).length;
  memberStats.sort((a, b) => b.totalCob - a.totalCob);

  return { gestorNome, members, memberStats, produtos, coreCount: produtos.length, totalObj, totalRealizado, totalCob, count100 };
}

// Ranking de consultores: exclui quem é gestor de equipe.
export function computeRanking(camp) {
  const teamMap = computeTeamMap(camp);
  const nomes = Object.keys(camp.objData).filter(n => !teamMap[n]);
  const list = nomes.map(n => computeConsultorStats(camp, n));
  list.sort((a, b) => (b.count100 - a.count100) || (b.totalCob - a.totalCob));
  return list;
}

// Todas as pessoas com OBJ, sem filtrar gestores (uso administrativo).
export function computeAllIndividualStats(camp) {
  return Object.keys(camp.objData)
    .map(n => computeConsultorStats(camp, n))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

// Ranking de gestores: compara o total consolidado de cada equipe.
export function computeGestorRanking(camp) {
  const teamMap = computeTeamMap(camp);
  const list = Object.keys(teamMap).map(g => computeGestorStats(camp, g));
  list.sort((a, b) => (b.count100 - a.count100) || (b.totalCob - a.totalCob));
  return list;
}

// Resolve login por nome ou código — retorna {nome, type: 'comercial'|'gestor'} ou null.
export function resolveLogin(camp, input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const teamMap = computeTeamMap(camp);
  let nome = null;

  if (camp.objData[upper]) nome = upper;
  else if (camp.codigoMap[raw]) nome = camp.codigoMap[raw];
  else {
    const codeMatch = Object.keys(camp.codigoMap).find(c => c.trim() === raw.trim());
    if (codeMatch) nome = camp.codigoMap[codeMatch];
  }
  if (!nome) {
    const partial = Object.keys(camp.objData).find(n => n.indexOf(upper) > -1);
    if (partial) nome = partial;
  }
  if (!nome && teamMap[upper]) nome = upper;
  if (!nome) {
    const partialSup = Object.keys(teamMap).find(s => s.indexOf(upper) > -1);
    if (partialSup) nome = partialSup;
  }
  if (!nome) return null;
  return { nome, type: teamMap[nome] ? 'gestor' : 'comercial' };
}

// Hash de senha (SHA-256) — usar Web Crypto API (browser) ou 'crypto' (Node/edge functions).
export async function hashPassword(pw) {
  const enc = new TextEncoder().encode(String(pw));
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
