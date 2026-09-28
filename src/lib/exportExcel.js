// src/lib/exportExcel.js
import * as XLSX from 'xlsx';
import { isPositivacaoCampaign } from './stats';

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
