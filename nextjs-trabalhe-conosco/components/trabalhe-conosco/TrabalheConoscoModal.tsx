'use client';

import { useState } from 'react';
import { Briefcase, X } from 'lucide-react';
import { CandidaturaForm } from './CandidaturaForm';

type Vaga = {
  id: string;
  titulo: string;
  departamento: string;
  localizacao: string;
  tipo_contrato: string;
  faixa_salarial?: string | null;
  descricao: string;
  requisitos: string[];
  beneficios: string[];
};

export function TrabalheConoscoModal({ vagas }: { vagas: Vaga[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'vagas' | 'form'>('vagas');
  const [vagaInicial, setVagaInicial] = useState<string | undefined>();

  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 font-semibold text-white/85 hover:text-sky-400">
        <Briefcase size={18} /> Trabalhe Conosco
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 backdrop-blur">
          <section className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 text-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-white/10 p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-sky-400">Carreiras Renostter</p>
                <h2 className="text-3xl font-black">Trabalhe Conosco</h2>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-full border border-white/10 p-2"><X /></button>
            </header>
            <div className="flex gap-2 px-6 pt-4">
              <button onClick={() => setTab('vagas')} className={`rounded-full px-4 py-2 font-bold ${tab === 'vagas' ? 'bg-orange-500' : 'bg-white/10'}`}>Vagas Disponíveis</button>
              <button onClick={() => setTab('form')} className={`rounded-full px-4 py-2 font-bold ${tab === 'form' ? 'bg-orange-500' : 'bg-white/10'}`}>Enviar Candidatura</button>
            </div>
            <div className="max-h-[65vh] overflow-auto p-6">
              {tab === 'vagas' ? (
                <div className="grid gap-4">
                  {vagas.map((vaga) => (
                    <article key={vaga.id} className="rounded-xl border border-white/10 bg-white/[.04] p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-bold">{vaga.titulo}</h3>
                          <p className="text-sm text-white/60">{vaga.departamento} · {vaga.localizacao} · {vaga.tipo_contrato}</p>
                        </div>
                        <span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-300">{vaga.faixa_salarial || 'A combinar'}</span>
                      </div>
                      <p className="mt-3 text-white/75">{vaga.descricao}</p>
                      <button onClick={() => { setVagaInicial(vaga.id); setTab('form'); }} className="mt-4 rounded-full bg-orange-500 px-4 py-2 font-bold">Candidatar-se</button>
                    </article>
                  ))}
                </div>
              ) : (
                <CandidaturaForm vagas={vagas} vagaInicial={vagaInicial} />
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
