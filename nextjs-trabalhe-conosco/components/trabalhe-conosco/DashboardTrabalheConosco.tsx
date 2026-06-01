'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ExportCandidaturasButton } from './ExportCandidaturasButton';

const COLORS = ['#ff6b00', '#00aeef', '#10b981', '#f59e0b', '#ef4444'];

export function DashboardTrabalheConosco({ candidaturas, vagas }: { candidaturas: any[]; vagas: any[] }) {
  const [vaga, setVaga] = useState('');
  const [status, setStatus] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');

  const rows = useMemo(() => candidaturas.filter((item) => {
    const date = item.created_at.slice(0, 10);
    return (!vaga || item.vaga_id === vaga)
      && (!status || item.status === status)
      && (!inicio || date >= inicio)
      && (!fim || date <= fim);
  }), [candidaturas, vaga, status, inicio, fim]);

  const metrics = {
    total: rows.length,
    mes: rows.filter((r) => r.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
    ano: rows.filter((r) => r.created_at.slice(0, 4) === String(new Date().getFullYear())).length,
    contratacao: rows.length ? Math.round((rows.filter((r) => r.status === 'contratada').length / rows.length) * 100) : 0,
    ativas: vagas.filter((v) => v.status === 'ativa').length,
  };

  const porMes = Object.values(rows.reduce((acc, item) => {
    const key = item.created_at.slice(0, 7);
    acc[key] = acc[key] || { mes: key, total: 0 };
    acc[key].total += 1;
    return acc;
  }, {}));

  const porVaga = vagas.map((v) => ({ vaga: v.titulo, total: rows.filter((r) => r.vaga_id === v.id).length }));
  const porStatus = Object.values(rows.reduce((acc, item) => {
    acc[item.status] = acc[item.status] || { name: item.status, value: 0 };
    acc[item.status].value += 1;
    return acc;
  }, {}));
  const porModalidade = vagas.map((v) => ({ modalidade: v.localizacao, total: rows.filter((r) => r.vaga_id === v.id).length }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-5">
        {[
          ['Total', metrics.total],
          ['Este mês', metrics.mes],
          ['Este ano', metrics.ano],
          ['Taxa contratação', `${metrics.contratacao}%`],
          ['Vagas ativas', metrics.ativas],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">{label}</p>
            <strong className="text-2xl">{value}</strong>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Chart title="Evolução por mês"><LineChart data={porMes as any[]}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis /><Tooltip /><Line dataKey="total" stroke="#00aeef" /></LineChart></Chart>
        <Chart title="Candidaturas por vaga"><BarChart data={porVaga}><XAxis dataKey="vaga" /><YAxis /><Tooltip /><Bar dataKey="total" fill="#ff6b00" /></BarChart></Chart>
        <Chart title="Distribuição por status"><PieChart><Pie data={porStatus as any[]} dataKey="value" nameKey="name" outerRadius={90}>{(porStatus as any[]).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart></Chart>
        <Chart title="Candidaturas por modalidade"><BarChart data={porModalidade}><XAxis dataKey="modalidade" /><YAxis /><Tooltip /><Bar dataKey="total" fill="#10b981" /></BarChart></Chart>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <select value={vaga} onChange={(e) => setVaga(e.target.value)} className="rounded border p-2"><option value="">Todas as vagas</option>{vagas.map((v) => <option key={v.id} value={v.id}>{v.titulo}</option>)}</select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border p-2"><option value="">Todos status</option>{['recebida','em_analise','entrevista','reprovada','contratada'].map((s) => <option key={s}>{s}</option>)}</select>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="rounded border p-2" />
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="rounded border p-2" />
          </div>
          <ExportCandidaturasButton rows={rows} />
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th>Nome</th><th>Vaga</th><th>E-mail</th><th>Celular</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className="border-t"><td>{r.nome_completo}</td><td>{r.vagas?.titulo}</td><td>{r.email}</td><td>{r.celular}</td><td>{r.status}</td><td>{new Date(r.created_at).toLocaleDateString('pt-BR')}</td><td><a className="text-sky-600" href={r.curriculo_url}>Currículo</a></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return <div className="h-80 rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">{title}</h3><ResponsiveContainer width="100%" height="85%">{children}</ResponsiveContainer></div>;
}
