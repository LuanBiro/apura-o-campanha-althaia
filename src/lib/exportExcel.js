// src/lib/exportExcel.js
import * as XLSX from 'xlsx';
import {
  isPositivacaoCampaign, computeTeamMap, computeAllIndividualStats,
  computeCampaignProdutoStats, computeRanking, computeGestorRanking
} from './stats';

function statusLabel(p) {
  if (p.isUnclassified) return 'Verificar dosagem';
  if (p.cob >= 100) return 'Atingido';
  if (p.cob >= 70) return 'Próximo';
  return 'Abaixo';
}

// Monta as linhas de uma tabela de produtos (usada tanto pra consultor quanto
// pra soma de equipe/campanha), no formato aoa (array de arrays) pronto pro Excel.
function produtosAoa(produtos, isPos) {
  const header = ['Produto', 'OBJ', isPos ? 'Positivados' : 'Realizado', 'Cobertura %', 'Status'];
  const rows = produtos.map(p => [
    p.label,
    p.isUnclassified ? '' : p.obj,
    isPos ? p.positivacao : p.realizado,
    p.isUnclassified ? '' : Math.round(p.cob * 10) / 10,
    statusLabel(p)
  ]);
  return [header, ...rows];
}

// Exporta a parcial de um consultor individual: uma aba com os produtos dele.
export function exportConsultorExcel(camp, nome, stats) {
  const isPos = isPositivacaoCampaign(camp);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(produtosAoa(stats.produtos, isPos));
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
  const fileSafe = nome.replace(/[\\/:*?"<>|]/g, '').trim();
  XLSX.writeFile(wb, `${camp.label} - ${fileSafe}.xlsx`);
}

// Exporta a parcial de um gestor: uma aba com o total da equipe por produto,
// outra com o detalhe por consultor.
export function exportGestorExcel(camp, gestorNome, stats) {
  const isPos = isPositivacaoCampaign(camp);
  const wb = XLSX.utils.book_new();

  const wsProdutos = XLSX.utils.aoa_to_sheet(produtosAoa(stats.produtos, isPos));
  XLSX.utils.book_append_sheet(wb, wsProdutos, 'Produtos da Equipe');

  const consultoresHeader = ['Nome', 'OBJ', isPos ? 'Positivados' : 'Realizado', 'Cobertura %', 'Produtos 100%'];
  const consultoresRows = stats.memberStats.map(ms => [
    ms.nome,
    isPos ? ms.totalObj : ms.totalObj,
    isPos ? ms.totalAchieved : ms.totalRealizado,
    Math.round(ms.totalCob * 10) / 10,
    `${ms.count100}/${ms.coreCount}`
  ]);
  const wsConsultores = XLSX.utils.aoa_to_sheet([consultoresHeader, ...consultoresRows]);
  XLSX.utils.book_append_sheet(wb, wsConsultores, 'Consultores');

  const fileSafe = gestorNome.replace(/[\\/:*?"<>|]/g, '').trim();
  XLSX.writeFile(wb, `${camp.label} - Equipe de ${fileSafe}.xlsx`);
}


// ---------------------------------------------------------------------
// Exportação do ADMIN: apuração completa de uma campanha ou de todas.
// Abas: Resumo, Produtos, Gestores, Pessoas, Detalhe (pessoa x produto).
// Todas as abas têm as colunas "Campanha" e "Métrica" pra facilitar filtro/tabela dinâmica.
// ---------------------------------------------------------------------
function round1(v) { return Math.round((v || 0) * 10) / 10; }

function sheetFromAoa(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const ncols = aoa[0].length;
  // largura das colunas conforme o conteúdo (limitada a 50)
  ws['!cols'] = aoa[0].map((_, c) => {
    const maxLen = aoa.reduce((m, row) => Math.max(m, String(row[c] === undefined || row[c] === null ? '' : row[c]).length), 0);
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });
  // filtro automático no cabeçalho
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(aoa.length - 1, 0), c: ncols - 1 } }) };
  return ws;
}

function buildAdminWorkbook(campList) {
  const resumo = [['Campanha', 'Métrica', 'Pessoas contabilizadas', 'Gestores', 'OBJ total', 'Realizado / Positivados', 'Cobertura %', 'Produtos 100%', 'Total de produtos', 'Clientes únicos (só Varejo)', 'Faturamento (R$)', 'Última atualização']];
  const produtos = [['Campanha', 'Métrica', 'Produto', 'OBJ', 'Realizado / Positivados', 'Cobertura %', 'Status', 'Faturamento (R$)']];
  const gestores = [['Campanha', 'Métrica', 'Posição', 'Gestor', 'Consultores', 'OBJ', 'Realizado / Positivados', 'Cobertura %', 'Produtos 100%', 'Total de produtos', 'Faturamento (R$)']];
  const pessoas = [['Campanha', 'Métrica', 'Posição no ranking', 'Nome', 'Reporta para', 'Gestor?', 'OBJ', 'Realizado / Positivados', 'Cobertura %', 'Produtos 100%', 'Total de produtos', 'Faturamento (R$)']];
  const detalhe = [['Campanha', 'Métrica', 'Nome', 'Reporta para', 'Produto', 'OBJ', 'Realizado / Positivados', 'Cobertura %', 'Status', 'Faturamento (R$)']];

  campList.forEach(camp => {
    const isPos = isPositivacaoCampaign(camp);
    const metrica = isPos ? 'Positivação (clientes)' : 'R$';
    const teamMap = computeTeamMap(camp);
    const all = computeAllIndividualStats(camp).filter(r => !(isPos && teamMap[r.nome]));
    const prodStats = computeCampaignProdutoStats(camp);
    const gestorRanking = computeGestorRanking(camp);
    const posMap = {};
    computeRanking(camp).forEach((r, i) => { posMap[r.nome] = i + 1; });

    resumo.push([
      camp.label, metrica, all.length, gestorRanking.length,
      prodStats.totalObj, prodStats.totalAchieved, round1(prodStats.totalCob),
      prodStats.count100, prodStats.coreCount,
      isPos ? prodStats.positivacaoTotal : '',
      prodStats.totalRealizado,
      camp.updatedAt ? new Date(camp.updatedAt).toLocaleString('pt-BR') : ''
    ]);

    prodStats.produtos.forEach(p => {
      produtos.push([
        camp.label, metrica, p.label,
        p.isUnclassified ? '' : p.obj,
        isPos ? p.positivacao : p.realizado,
        p.isUnclassified ? '' : round1(p.cob),
        statusLabel(p), p.realizado
      ]);
    });

    gestorRanking.forEach((g, i) => {
      gestores.push([
        camp.label, metrica, i + 1, g.gestorNome, g.members.length,
        g.totalObj, g.totalAchieved, round1(g.totalCob),
        g.count100, g.coreCount, g.totalRealizado
      ]);
    });

    all.forEach(r => {
      const isGestor = !!teamMap[r.nome];
      const reportaPara = (camp.supervisorMap || {})[r.nome] || '';
      pessoas.push([
        camp.label, metrica, isGestor ? '' : (posMap[r.nome] || ''), r.nome, reportaPara,
        isGestor ? 'Sim' : 'Não',
        r.totalObj, r.totalAchieved, round1(r.totalCob),
        r.count100, r.coreCount, r.totalRealizado
      ]);
      r.produtos.forEach(p => {
        detalhe.push([
          camp.label, metrica, r.nome, reportaPara, p.label,
          p.isUnclassified ? '' : p.obj,
          isPos ? p.positivacao : p.realizado,
          p.isUnclassified ? '' : round1(p.cob),
          statusLabel(p), p.realizado
        ]);
      });
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(resumo), 'Resumo');
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(produtos), 'Produtos');
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(gestores), 'Gestores');
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(pessoas), 'Pessoas');
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(detalhe), 'Detalhe pessoa x produto');
  return wb;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

// camp = objeto de uma campanha
export function exportAdminCampaignExcel(camp) {
  const wb = buildAdminWorkbook([camp]);
  XLSX.writeFile(wb, `Apuração - ${camp.label} - ${todayStamp()}.xlsx`);
}

// campList = array com todas as campanhas (na ordem que devem aparecer)
export function exportAdminAllCampaignsExcel(campList) {
  const wb = buildAdminWorkbook(campList);
  XLSX.writeFile(wb, `Apuração - Todas as campanhas - ${todayStamp()}.xlsx`);
}

// usado só nos testes
export { buildAdminWorkbook };
