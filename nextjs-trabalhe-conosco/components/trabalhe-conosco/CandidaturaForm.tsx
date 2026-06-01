'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { candidaturaSchema, type CandidaturaInput } from '@/lib/trabalhe-conosco/schemas';

type Vaga = { id: string; titulo: string };

export function CandidaturaForm({ vagas, vagaInicial }: { vagas: Vaga[]; vagaInicial?: string }) {
  const [status, setStatus] = useState('');
  const form = useForm<CandidaturaInput>({
    resolver: zodResolver(candidaturaSchema),
    defaultValues: { vaga_id: vagaInicial || vagas[0]?.id, endereco: { uf: 'SP' } },
  });

  async function onSubmit(values: CandidaturaInput) {
    const file = (document.querySelector<HTMLInputElement>('#curriculo')?.files || [])[0];
    if (!file) return setStatus('Anexe seu currículo.');
    if (file.size > 10 * 1024 * 1024) return setStatus('Currículo deve ter no máximo 10MB.');

    const payload = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (key === 'endereco') {
        Object.entries(value as Record<string, string>).forEach(([k, v]) => payload.append(k, v || ''));
      } else {
        payload.append(key, String(value || ''));
      }
    });
    payload.append('curriculo', file);

    setStatus('Enviando candidatura...');
    const res = await fetch('/api/candidaturas', { method: 'POST', body: payload });
    setStatus(res.ok ? 'Candidatura enviada com sucesso. Boa sorte!' : 'Nao foi possivel enviar. Tente novamente.');
    if (res.ok) form.reset();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <input className="input" placeholder="Nome completo" {...form.register('nome_completo')} />
        <input className="input" placeholder="CPF" {...form.register('cpf')} />
        <input className="input" placeholder="E-mail" {...form.register('email')} />
        <input className="input" placeholder="Celular" {...form.register('celular')} />
        <select className="input" {...form.register('vaga_id')}>
          {vagas.map((vaga) => <option key={vaga.id} value={vaga.id}>{vaga.titulo}</option>)}
        </select>
        <input id="curriculo" className="input" type="file" accept=".pdf,.doc,.docx" />
        <input className="input" placeholder="CEP" {...form.register('endereco.cep')} />
        <input className="input" placeholder="Endereço" {...form.register('endereco.logradouro')} />
        <input className="input" placeholder="Número" {...form.register('endereco.numero')} />
        <input className="input" placeholder="Bairro" {...form.register('endereco.bairro')} />
        <input className="input" placeholder="Cidade" {...form.register('endereco.cidade')} />
        <input className="input" placeholder="UF" maxLength={2} {...form.register('endereco.uf')} />
      </div>
      <textarea className="input min-h-24" placeholder="Observações" {...form.register('observacoes')} />
      <button className="rounded-full bg-orange-500 px-5 py-3 font-bold text-white">Enviar candidatura</button>
      {status && <p className="text-sm text-white/70">{status}</p>}
    </form>
  );
}
