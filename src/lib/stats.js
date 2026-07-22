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

// Extrai a "família base" removendo a dosagem (ex: "ROSUVASTATINA 40MG" e
// "ROSUVASTATINA 5/10/20" -> "ROSUVASTATINA"). Usado como fallback quando a
// Família do Qlik não vem escrita de forma idêntica à da planilha de OBJ.
function baseFamilyOf(s) {
  return String(s || '').toUpperCase().replace(/[0-9].*$/, '').trim();
}

export function computeConsultorStats(camp, nome) {
  const objBlock = camp.objData[nome] || {};
  const realBlock = camp.realizadoData[nome] || {};

  // agrupa os produtos do OBJ dessa pessoa por família base
  const objGroups = {}; // baseFam -> [{key,label,obj}]
  Object.keys(objBlock).forEach(key => {
    const baseFam = baseFamilyOf(key);
    if (!objGroups[baseFam]) objGroups[baseFam] = [];
    objGroups[baseFam].push({ key, label: objBlock[key].label, obj: objBlock[key].obj || 0 });
  });

  // agrega o realizado por família base também (para o fallback de casamento)
  const realByBase = {}; // baseFam -> {valor, cnpjSet}
  Object.keys(realBlock).forEach(key => {
    const baseFam = baseFamilyOf(key);
    if (!realByBase[baseFam]) realByBase[baseFam] = { valor: 0, cnpjSet: new Set() };
    realByBase[baseFam].valor += realBlock[key].valor || 0;
    (realBlock[key].cnpjs || []).forEach(c => realByBase[baseFam].cnpjSet.add(c));
  });

  const produtos = [];
  Object.keys(objGroups).forEach(baseFam => {
    const group = objGroups[baseFam];
    const aggBase = realByBase[baseFam] || { valor: 0, cnpjSet: new Set() };

    if (group.length === 1) {
      // única entrada para essa família: soma tudo que existir naquela família,
      // não importa se a dose no Qlik veio escrita diferente ou nem veio
      const p = group[0];
      const realizado = aggBase.valor;
      const cnpjs = Array.from(aggBase.cnpjSet);
      const cob = p.obj > 0 ? (realizado / p.obj * 100) : 0;
      produtos.push({ key: p.key, label: p.label, obj: p.obj, realizado, cob, cnpjs, positivacao: cnpjs.length, isUnclassified: false });
    } else {
      // múltiplas entradas (dosagens diferentes no OBJ): tenta casar por texto exato primeiro
      let matchedValor = 0;
      const matchedCnpjs = new Set();
      group.forEach(p => {
        const exact = realBlock[p.key];
        const realizado = exact ? exact.valor : 0;
        const cnpjs = exact ? (exact.cnpjs || []) : [];
        matchedValor += realizado;
        cnpjs.forEach(c => matchedCnpjs.add(c));
        const cob = p.obj > 0 ? (realizado / p.obj * 100) : 0;
        produtos.push({ key: p.key, label: p.label, obj: p.obj, realizado, cob, cnpjs, positivacao: cnpjs.length, isUnclassified: false });
      });
      // sobra da família que não bateu com nenhuma dose específica (ex: veio sem dose no Qlik)
      const unclassifiedValor = aggBase.valor - matchedValor;
      const unclassifiedCnpjs = Array.from(aggBase.cnpjSet).filter(c => !matchedCnpjs.has(c));
      if (unclassifiedValor > 0.5 || unclassifiedCnpjs.length) {
        produtos.push({
          key: baseFam + '__unclassified',
          label: baseFam + ' (dosagem não identificada no Qlik)',
          obj: 0, realizado: Math.max(unclassifiedValor, 0), cob: 0,
          cnpjs: unclassifiedCnpjs, positivacao: unclassifiedCnpjs.length, isUnclassified: true
        });
      }
    }
  });

  produtos.sort((a, b) => a.label.localeCompare(b.label));
  const coreProdutos = produtos.filter(p => !p.isUnclassified);
  const totalObj = coreProdutos.reduce((s, p) => s + p.obj, 0);
  const totalRealizado = produtos.reduce((s, p) => s + p.realizado, 0);
  const totalCob = totalObj > 0 ? (totalRealizado / totalObj * 100) : 0;
  const count100 = coreProdutos.filter(p => p.cob >= 100).length;
  // positivação total da pessoa: união de CNPJs distintos em qualquer produto (um cliente pode contar 1x mesmo comprando vários produtos)
  const cnpjsUnicos = new Set();
  produtos.forEach(p => p.cnpjs.forEach(c => cnpjsUnicos.add(c)));

  return { nome, produtos, coreCount: coreProdutos.length, totalObj, totalRealizado, totalCob, count100, positivacaoTotal: cnpjsUnicos.size };
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
      if (!produtoAgg[p.key]) produtoAgg[p.key] = { label: p.label, obj: 0, realizado: 0, cnpjSet: new Set(), isUnclassified: p.isUnclassified };
      produtoAgg[p.key].obj += p.obj;
      produtoAgg[p.key].realizado += p.realizado;
      p.cnpjs.forEach(c => produtoAgg[p.key].cnpjSet.add(c));
    });
  });

  const produtos = Object.keys(produtoAgg).map(key => {
    const o = produtoAgg[key];
    const cob = o.obj > 0 ? (o.realizado / o.obj * 100) : 0;
    return { key, label: o.label, obj: o.obj, realizado: o.realizado, cob, positivacao: o.cnpjSet.size, isUnclassified: o.isUnclassified };
  });

  produtos.sort((a, b) => a.label.localeCompare(b.label));
  const coreProdutos = produtos.filter(p => !p.isUnclassified);
  const totalObj = coreProdutos.reduce((s, p) => s + p.obj, 0);
  const totalRealizado = produtos.reduce((s, p) => s + p.realizado, 0);
  const totalCob = totalObj > 0 ? (totalRealizado / totalObj * 100) : 0;
  const count100 = coreProdutos.filter(p => p.cob >= 100).length;
  memberStats.sort((a, b) => b.totalCob - a.totalCob);
  // positivação total da equipe: união de CNPJs distintos em qualquer membro/produto
  const cnpjsUnicosEquipe = new Set();
  memberStats.forEach(ms => ms.produtos.forEach(p => p.cnpjs.forEach(c => cnpjsUnicosEquipe.add(c))));

  return { gestorNome, members, memberStats, produtos, coreCount: coreProdutos.length, totalObj, totalRealizado, totalCob, count100, positivacaoTotal: cnpjsUnicosEquipe.size };
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

// Resolve login só por nome — retorna {nome, type: 'comercial'|'gestor'} ou null.
export function resolveLogin(camp, input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const teamMap = computeTeamMap(camp);
  let nome = null;

  if (camp.objData[upper]) nome = upper;
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
