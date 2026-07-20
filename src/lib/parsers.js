// lib/parsers.js
// Lógica de leitura das planilhas — idêntica à validada no protótipo em Claude.
// Depende da lib "xlsx" (SheetJS): npm install xlsx

import * as XLSX from 'xlsx';

export function normalizeNome(s) {
  return String(s || '').trim().toUpperCase();
}

export function normalizeProdutoKey(s) {
  // normaliza caixa e espaços, mas preserva números — a Família já vem separada
  // por dosagem quando necessário (ex: "ROSUVASTATINA 40MG" vs "ROSUVASTATINA 5/10/20")
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

export function parseCurrencyCell(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.indexOf(',') > -1) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export function extractCodeAndName(raw) {
  // "112096 - DANIELE ASSUNCAO DILL" -> {cod:'112096', nome:'DANIELE ASSUNCAO DILL'}
  // "DANIELE ASSUNCAO DILL" -> {cod:'', nome:'DANIELE ASSUNCAO DILL'}
  const text = String(raw || '').trim();
  const dashIdx = text.indexOf(' - ');
  if (dashIdx > -1) {
    const maybeCod = text.substring(0, dashIdx).trim();
    if (/^\d+$/.test(maybeCod)) {
      return { cod: maybeCod, nome: normalizeNome(text.substring(dashIdx + 3)) };
    }
  }
  return { cod: '', nome: normalizeNome(text) };
}

export function readFileAsWorkbook(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        resolve(XLSX.read(data, { type: 'array', cellDates: false }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// -----------------------------------------------------------------
// Planilha de OBJ: bloco por pessoa (nome no cabeçalho, produtos abaixo, "TOTAL" fecha o bloco)
// Usada por TODAS as campanhas.
// -----------------------------------------------------------------
export function parseObjWorkbook(workbook) {
  const result = {}; // { NOME: { produtoKey: {label, obj} } }
  let rowsFound = 0, peopleFound = 0;

  workbook.SheetNames.forEach(sheetName => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    let currentPerson = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const c0 = String(row[0] || '').trim();
      const c1 = String(row[1] || '').trim();
      if (!c0) continue;
      const c1Upper = c1.toUpperCase();
      const c0Upper = c0.toUpperCase();
      const isTotalRow = c0Upper === 'TOTAL' || c0Upper === 'TOTAL GERAL';

      // Formato A: nome e "OBJ" na mesma linha (ex: "AMANDA SANTANNA | OBJ | REALIZADO | COB.%")
      const isHeaderSameLine = c1Upper === 'OBJ' || c1Upper.indexOf('OBJ') === 0;

      // Formato B: nome sozinho numa linha, com "FAMÍLIA | OBJ | COB.%" na linha seguinte
      let isHeaderNextLine = false;
      if (!isHeaderSameLine && !c1 && !isTotalRow) {
        const nextRow = rows[i + 1];
        if (nextRow) {
          const n0 = String(nextRow[0] || '').trim().toUpperCase();
          const n1 = String(nextRow[1] || '').trim().toUpperCase();
          if (n0.indexOf('FAM') === 0 || n1 === 'OBJ' || n1.indexOf('OBJ') === 0) {
            isHeaderNextLine = true;
          }
        }
      }

      if (isHeaderSameLine) {
        currentPerson = extractCodeAndName(c0).nome;
        if (!result[currentPerson]) { result[currentPerson] = {}; peopleFound++; }
        continue;
      }
      if (isHeaderNextLine) {
        currentPerson = extractCodeAndName(c0).nome;
        if (!result[currentPerson]) { result[currentPerson] = {}; peopleFound++; }
        i++; // pula a linha de sub-cabeçalho "FAMÍLIA | OBJ | COB.%"
        continue;
      }
      if (isTotalRow) { currentPerson = null; continue; }

      if (currentPerson) {
        const objVal = parseCurrencyCell(row[1]);
        if (c0 && (objVal > 0 || row[1] !== '')) {
          const key = normalizeProdutoKey(c0);
          if (key) {
            result[currentPerson][key] = { label: c0.trim(), obj: objVal };
            rowsFound++;
          }
        }
      }
    }
  });

  return { data: result, peopleFound, rowsFound };
}

// -----------------------------------------------------------------
// Base do Qlik: Consultor Cod, Consultor Nome, Supervisor Nome, Família, Fat+OL
// Usada em Grandes Contas, Distribuição e Varejo.
// -----------------------------------------------------------------
export function parseRealizadoWorkbook(workbook) {
  const result = {};
  const codigoMap = {};
  const supervisorMap = {};
  let rowsFound = 0;

  const sheetName = workbook.SheetNames.find(sn => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sn], { header: 1, defval: '' });
    return rows.length > 1 && rows[0].some(h => String(h).toLowerCase().indexOf('nome') > -1);
  }) || workbook.SheetNames[workbook.SheetNames.length - 1];

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  if (!rows.length) return { data: {}, codigoMap: {}, supervisorMap: {}, rowsFound: 0, error: 'Planilha vazia' };

  const header = rows[0].map(h => String(h).toLowerCase());
  const idxCod = header.findIndex(h => h.indexOf('cod') > -1 && h.indexOf('artigo') === -1 && h.indexOf('cnpj') === -1);
  const idxNome = header.findIndex(h => h.indexOf('nome') > -1 && h.indexOf('supervisor') === -1);
  const idxSupervisor = header.findIndex(h => h.indexOf('supervisor') > -1);
  const idxFamilia = header.findIndex(h => h.indexOf('fam') > -1);
  const idxValor = header.findIndex(h => h.indexOf('fat') > -1 || h.indexOf('realizado') > -1 || h.indexOf('valor') > -1);
  const idxCnpjRaiz = header.findIndex(h => h.indexOf('cnpj') > -1);

  if (idxNome === -1 || idxFamilia === -1 || idxValor === -1) {
    return { data: {}, codigoMap: {}, supervisorMap: {}, rowsFound: 0, error: 'Não encontrei as colunas esperadas (Consultor Nome, Família, Fat+OL).' };
  }

  // acumuladores intermediários usando Set pra positivação (contagem de CNPJ Raiz distintos)
  const cnpjSets = {}; // { nome: { produtoKey: Set<cnpjRaiz> } }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const nome = normalizeNome(row[idxNome]);
    if (!nome) continue;
    const key = normalizeProdutoKey(row[idxFamilia]);
    if (!key) continue;
    const valor = parseCurrencyCell(row[idxValor]);
    if (!result[nome]) result[nome] = {};
    if (!result[nome][key]) result[nome][key] = { valor: 0, cnpjs: [] };
    result[nome][key].valor += valor;
    rowsFound++;

    if (idxCnpjRaiz > -1) {
      const cnpjRaiz = String(row[idxCnpjRaiz] || '').trim();
      if (cnpjRaiz) {
        if (!cnpjSets[nome]) cnpjSets[nome] = {};
        if (!cnpjSets[nome][key]) cnpjSets[nome][key] = new Set();
        cnpjSets[nome][key].add(cnpjRaiz);
      }
    }

    if (idxCod > -1) {
      const cod = String(row[idxCod] || '').trim();
      if (cod) codigoMap[cod] = nome;
    }
    if (idxSupervisor > -1) {
      const sup = normalizeNome(row[idxSupervisor]);
      if (sup) supervisorMap[nome] = sup;
    }
  }

  // converte os Sets de CNPJ em arrays no resultado final
  Object.keys(cnpjSets).forEach(nome => {
    Object.keys(cnpjSets[nome]).forEach(key => {
      result[nome][key].cnpjs = Array.from(cnpjSets[nome][key]);
    });
  });

  return { data: result, codigoMap, supervisorMap, rowsFound };
}

// -----------------------------------------------------------------
// Base MDTR: PPP | Família | Ger. Demanda ("111199 - NOME")
// Usada só na campanha Geradores de Demanda. Sem Supervisor Nome (sem hierarquia).
// -----------------------------------------------------------------
export function parseRealizadoMDTR(workbook) {
  const result = {};
  const codigoMap = {};
  let rowsFound = 0;

  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
  if (!rows.length) return { data: {}, codigoMap: {}, supervisorMap: {}, rowsFound: 0, error: 'Planilha vazia' };

  const header = rows[0].map(h => String(h).toLowerCase());
  const idxPPP = header.findIndex(h => h.indexOf('ppp') > -1);
  const idxFamilia = header.findIndex(h => h.indexOf('fam') > -1);
  const idxGerDemanda = header.findIndex(h => h.indexOf('demanda') > -1 || h.indexOf('ger') > -1);

  if (idxPPP === -1 || idxFamilia === -1 || idxGerDemanda === -1) {
    return { data: {}, codigoMap: {}, supervisorMap: {}, rowsFound: 0, error: 'Não encontrei as colunas esperadas (PPP, Família, Ger. Demanda).' };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const { cod, nome } = extractCodeAndName(row[idxGerDemanda]);
    if (!nome) continue;
    const key = normalizeProdutoKey(row[idxFamilia]);
    if (!key) continue;
    const valor = parseCurrencyCell(row[idxPPP]);
    if (!result[nome]) result[nome] = {};
    if (!result[nome][key]) result[nome][key] = { valor: 0, cnpjs: [] };
    result[nome][key].valor += valor;
    rowsFound++;
    if (cod) codigoMap[cod] = nome;
  }
  return { data: result, codigoMap, supervisorMap: {}, rowsFound };
}
