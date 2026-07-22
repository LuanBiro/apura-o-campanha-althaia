// src/components/ComercialView.jsx
import { computeConsultorStats, computeRanking, formatBRL, formatPct } from '../lib/stats';

export default function ComercialView({ camp, nome }) {
  const stats = computeConsultorStats(camp, nome);
  const ranking = camp.rankingVisible ? computeRanking(camp) : null;
  const myPos = ranking ? ranking.findIndex(r => r.nome === nome) + 1 : null;
  const showPositivacao = camp.id === 'varejo';
  const rankingDisplay = ranking && camp.id === 'varejo' ? ranking.slice(0, 20) : ranking;

  return (
    <div className="wrap">
      <div className="card">
        <h2>{nome}</h2>
        <h3>{camp.label} · {camp.campaignName || camp.label}</h3>
      </div>

      <div className="stat-row">
        <div className="stat-box"><div className="label">Objetivo total</div><div className="value">{formatBRL(stats.totalObj)}</div></div>
        <div className="stat-box"><div className="label">Realizado total</div><div className="value">{formatBRL(stats.totalRealizado)}</div></div>
        {showPositivacao && <div className="stat-box"><div className="label">Positivação total</div><div className="value">{stats.positivacaoTotal}</div></div>}
        <div className="stat-box accent"><div className="label">Cobertura total</div><div className="value">{formatPct(stats.totalCob)}</div></div>
        {myPos ? <div className="stat-box"><div className="label">Posição no ranking</div><div className="value">{myPos}º</div></div> : null}
      </div>

      <div className="card">
        <h2>Produtos da campanha</h2>
        <div className="table-scroll-sticky">
        <table>
          <thead><tr><th>Produto</th><th className="num">OBJ</th><th className="num">Realizado</th>{showPositivacao && <th className="num">Positivação</th>}<th className="num">Cob. %</th><th>Status</th></tr></thead>
          <tbody>
            {stats.produtos.length ? stats.produtos.map(p => {
              if (p.isUnclassified) {
                return (
                  <tr key={p.key} style={{ fontStyle: 'italic', color: 'var(--muted)' }}>
                    <td>{p.label}</td>
                    <td className="num">—</td>
                    <td className="num">{formatBRL(p.realizado)}</td>
                    {showPositivacao && <td className="num">{p.positivacao}</td>}
                    <td className="num">—</td>
                    <td><span className="pill pill-warn">Verificar dosagem</span></td>
                  </tr>
                );
              }
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
            }) : <tr><td colSpan={showPositivacao ? 6 : 5} className="empty">Nenhum produto encontrado para este nome.</td></tr>}
          </tbody>
        </table>
        </div>
        <div style={{ marginTop: 16 }} className="no-print">
          <button className="btn btn-small btn-secondary" style={{ width: 'auto' }} onClick={() => window.print()}>
            Imprimir / salvar PDF
          </button>
        </div>
      </div>

      {ranking ? (
        <div className="card no-print">
          <h2>🏆 Ranking · {camp.label}</h2>
          <h3>Critério: quantidade de produtos com 100% da meta · desempate pela cobertura total{rankingDisplay.length < ranking.length ? ` · exibindo os ${rankingDisplay.length} primeiros de ${ranking.length}` : ''}</h3>
          {rankingDisplay.map((r, i) => {
            const pos = i + 1;
            const isMe = r.nome === nome;
            return (
              <div key={r.nome} className={`rank-item ${isMe ? 'me' : ''} ${pos <= 3 ? 'top3' : ''}`}>
                <div className="rank-pos">{pos}</div>
                <div style={{ flex: 1 }}>
                  <div className="rank-name">{r.nome}{isMe ? ' (você)' : ''}</div>
                  <div className="rank-meta">{r.count100} de {r.coreCount} produtos na meta</div>
                </div>
                <div className="rank-cov">{formatPct(r.totalCob)}</div>
              </div>
            );
          })}
          {myPos > rankingDisplay.length && (
            <div className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              Sua posição atual é {myPos}º — fora dos {rankingDisplay.length} primeiros exibidos aqui.
            </div>
          )}
        </div>
      ) : (
        <div className="card no-print"><div className="empty">O ranking desta campanha ainda não foi liberado pelo administrador.</div></div>
      )}
    </div>
  );
}
