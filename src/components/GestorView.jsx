// src/components/GestorView.jsx
import { useState, Fragment } from 'react';
import { computeGestorStats, computeRanking, computeGestorRanking, formatBRL, formatPct } from '../lib/stats';

export default function GestorView({ camp, gestorNome }) {
  const stats = computeGestorStats(camp, gestorNome);
  const ranking = camp.rankingVisible ? computeRanking(camp) : null;
  const gestorRanking = camp.rankingVisibleGestores ? computeGestorRanking(camp) : null;
  const memberNames = stats.members;
  const hasSelfAccount = stats.memberStats.some(ms => ms.isSelfAccount);
  const [expandido, setExpandido] = useState(null); // nome do consultor com detalhe aberto
  const showPositivacao = camp.id === 'varejo';

  return (
    <div className="wrap">
      <div className="card">
        <h2>{gestorNome}</h2>
        <h3>{camp.label} · Visão de equipe ({memberNames.length} {memberNames.length === 1 ? 'consultor' : 'consultores'})</h3>
      </div>

      <div className="stat-row">
        <div className="stat-box"><div className="label">OBJ da equipe</div><div className="value">{formatBRL(stats.totalObj)}</div></div>
        <div className="stat-box"><div className="label">Realizado da equipe</div><div className="value">{formatBRL(stats.totalRealizado)}</div></div>
        {showPositivacao && <div className="stat-box"><div className="label">Positivação da equipe</div><div className="value">{stats.positivacaoTotal}</div></div>}
        <div className="stat-box accent"><div className="label">Cobertura da equipe</div><div className="value">{formatPct(stats.totalCob)}</div></div>
        <div className="stat-box"><div className="label">Produtos 100%</div><div className="value">{stats.count100}/{stats.coreCount}</div></div>
      </div>

      <div className="card">
        <h2>Produtos da campanha (soma da equipe)</h2>
        <div className="table-scroll-sticky">
        <table>
          <thead><tr><th>Produto</th><th className="num">OBJ</th><th className="num">Realizado</th>{showPositivacao && <th className="num">Positivação</th>}<th className="num">Cob. %</th><th>Status</th></tr></thead>
          <tbody>
            {stats.produtos.length ? stats.produtos.map(p => {
              let pillClass = 'pill-bad', pillLabel = 'Abaixo';
              if (p.cob >= 100) { pillClass = 'pill-ok'; pillLabel = 'Atingido'; }
              else if (p.cob >= 70) { pillClass = 'pill-warn'; pillLabel = 'Próximo'; }
              return (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  <td className="num">{formatBRL(p.obj)}</td>
                  <td className="num">{formatBRL(p.realizado)}</td>
                  {showPositivacao && <td className="num">{p.positivacao}</td>}
                  <td className="num">{formatPct(p.cob)}</td>
                  <td><span className={`pill ${pillClass}`}>{pillLabel}</span></td>
                </tr>
              );
            }) : <tr><td colSpan={showPositivacao ? 6 : 5} className="empty">Nenhum produto encontrado para esta equipe.</td></tr>}
          </tbody>
        </table>
        </div>
        <div style={{ marginTop: 16 }} className="no-print">
          <button className="btn btn-small btn-secondary" style={{ width: 'auto' }} onClick={() => window.print()}>
            Imprimir / salvar PDF
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Consultores da equipe</h2>
        {hasSelfAccount && <h3>Inclui o atendimento direto do próprio gestor, já somado no total acima.</h3>}
        <div className="hint" style={{ marginTop: -6 }}>Clique num consultor para ver o realizado por família dele.</div>
        <div className="table-scroll">
        <table>
          <thead><tr><th>Nome</th><th className="num">OBJ</th><th className="num">Realizado</th>{showPositivacao && <th className="num">Positivação</th>}<th className="num">Cob. %</th><th className="num">Produtos 100%</th></tr></thead>
          <tbody>
            {stats.memberStats.length ? stats.memberStats.map(ms => {
              const isOpen = expandido === ms.nome;
              return (
                <Fragment key={ms.nome}>
                  <tr
                    onClick={() => setExpandido(isOpen ? null : ms.nome)}
                    style={{ cursor: 'pointer', ...(ms.isSelfAccount ? { background: 'var(--rosa)' } : {}) }}
                  >
                    <td>{isOpen ? '▾' : '▸'} {ms.nome}{ms.isSelfAccount && <span className="pill pill-warn" style={{ marginLeft: 8 }}>Atendimento direto</span>}</td>
                    <td className="num">{formatBRL(ms.totalObj)}</td>
                    <td className="num">{formatBRL(ms.totalRealizado)}</td>
                    {showPositivacao && <td className="num">{ms.positivacaoTotal}</td>}
                    <td className="num">{formatPct(ms.totalCob)}</td>
                    <td className="num">{ms.count100}/{ms.coreCount}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={showPositivacao ? 6 : 5} style={{ background: '#F7FAFA', padding: '10px 12px 16px' }}>
                        <div className="table-scroll-sticky">
                        <table>
                          <thead><tr><th>Produto</th><th className="num">OBJ</th><th className="num">Realizado</th>{showPositivacao && <th className="num">Positivação</th>}<th className="num">Cob. %</th></tr></thead>
                          <tbody>
                            {ms.produtos.length ? ms.produtos.map(p => (
                              <tr key={p.key}>
                                <td>{p.label}</td>
                                <td className="num">{formatBRL(p.obj)}</td>
                                <td className="num">{formatBRL(p.realizado)}</td>
                                {showPositivacao && <td className="num">{p.positivacao}</td>}
                                <td className="num">{formatPct(p.cob)}</td>
                              </tr>
                            )) : <tr><td colSpan={showPositivacao ? 5 : 4} className="empty">Nenhum produto com OBJ carregado para essa pessoa.</td></tr>}
                          </tbody>
                        </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            }) : <tr><td colSpan={showPositivacao ? 6 : 5} className="empty">Nenhum consultor com OBJ carregado para esta equipe.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      {gestorRanking ? (
        <div className="card no-print">
          <h2>🏆 Ranking de Gestores · {camp.label}</h2>
          <h3>Critério: quantidade de produtos com 100% da meta (equipe) · desempate pela cobertura total da equipe</h3>
          {gestorRanking.map((r, i) => {
            const pos = i + 1;
            const isMe = r.gestorNome === gestorNome;
            return (
              <div key={r.gestorNome} className={`rank-item ${isMe ? 'me' : ''} ${pos <= 3 ? 'top3' : ''}`}>
                <div className="rank-pos">{pos}</div>
                <div style={{ flex: 1 }}>
                  <div className="rank-name">{r.gestorNome}{isMe ? ' (você)' : ''}</div>
                  <div className="rank-meta">{r.count100} de {r.coreCount} produtos na meta · {r.members.length} consultores</div>
                </div>
                <div className="rank-cov">{formatPct(r.totalCob)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card no-print"><div className="empty">O ranking de gestores desta campanha ainda não foi liberado pelo administrador.</div></div>
      )}

      {ranking ? (
        <div className="card no-print">
          <h2>Ranking de Consultores · {camp.label}</h2>
          <h3>Sua equipe destacada · gestores não entram nesse ranking, competem no ranking de gestores acima</h3>
          {ranking.map((r, i) => {
            const pos = i + 1;
            const isMyTeam = memberNames.indexOf(r.nome) > -1;
            return (
              <div key={r.nome} className={`rank-item ${isMyTeam ? 'me' : ''} ${pos <= 3 ? 'top3' : ''}`}>
                <div className="rank-pos">{pos}</div>
                <div style={{ flex: 1 }}>
                  <div className="rank-name">{r.nome}{isMyTeam ? ' (minha equipe)' : ''}</div>
                  <div className="rank-meta">{r.count100} de {r.coreCount} produtos na meta</div>
                </div>
                <div className="rank-cov">{formatPct(r.totalCob)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card no-print"><div className="empty">O ranking de consultores desta campanha ainda não foi liberado pelo administrador.</div></div>
      )}
    </div>
  );
}
