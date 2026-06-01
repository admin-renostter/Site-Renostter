'use client';

import { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { createClient } from '@/lib/supabase/client';

type Vaga = {
  id: string;
  titulo: string;
  departamento: string;
  localizacao: string;
  tipo_contrato: string;
  faixa_salarial: string | null;
  descricao: string;
  requisitos: string[];
  beneficios: string[];
  status: string;
};

const empty = {
  titulo: '',
  departamento: '',
  localizacao: 'São Paulo/SP',
  tipo_contrato: 'CLT',
  faixa_salarial: '',
  descricao: '',
  requisitos: [],
  beneficios: [],
  status: 'ativa',
};

export function VagasAdminClient({ initialVagas }: { initialVagas: Vaga[] }) {
  const supabase = createClient();
  const [vagas, setVagas] = useState(initialVagas);
  const [editing, setEditing] = useState<Vaga | null>(null);
  const [form, setForm] = useState<any>(empty);
  const editor = useEditor({ extensions: [StarterKit], content: form.descricao || '' });

  function edit(vaga: Vaga) {
    setEditing(vaga);
    setForm(vaga);
    editor?.commands.setContent(vaga.descricao || '');
  }

  async function save() {
    const payload = {
      ...form,
      descricao: editor?.getHTML() || form.descricao,
      requisitos: String(form.requisitos || '').split('\n').filter(Boolean),
      beneficios: String(form.beneficios || '').split('\n').filter(Boolean),
    };

    const query = editing
      ? supabase.from('vagas').update(payload).eq('id', editing.id).select().single()
      : supabase.from('vagas').insert(payload).select().single();

    const { data, error } = await query;
    if (error) return alert(error.message);
    setVagas((current) => editing ? current.map((v) => (v.id === data.id ? data : v)) : [data, ...current]);
    setEditing(null);
    setForm(empty);
    editor?.commands.clearContent();
  }

  async function remove(id: string) {
    if (!confirm('Excluir esta vaga?')) return;
    const { error } = await supabase.from('vagas').delete().eq('id', id);
    if (error) return alert(error.message);
    setVagas((current) => current.filter((v) => v.id !== id));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">{editing ? 'Editar vaga' : 'Nova vaga'}</h2>
        <div className="grid gap-3">
          {['titulo', 'departamento', 'localizacao', 'tipo_contrato', 'faixa_salarial'].map((field) => (
            <input key={field} className="rounded border p-2" placeholder={field} value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
          ))}
          <select className="rounded border p-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {['rascunho', 'ativa', 'pausada', 'encerrada'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <div className="min-h-40 rounded border p-3">
            <EditorContent editor={editor} />
          </div>
          <textarea className="rounded border p-2" placeholder="Requisitos, um por linha" value={Array.isArray(form.requisitos) ? form.requisitos.join('\n') : form.requisitos} onChange={(e) => setForm({ ...form, requisitos: e.target.value })} />
          <textarea className="rounded border p-2" placeholder="Benefícios, um por linha" value={Array.isArray(form.beneficios) ? form.beneficios.join('\n') : form.beneficios} onChange={(e) => setForm({ ...form, beneficios: e.target.value })} />
          <button onClick={save} className="rounded bg-orange-500 px-4 py-2 font-bold text-white">Salvar vaga</button>
        </div>
      </section>
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">Vagas cadastradas</h2>
        <div className="grid gap-3">
          {vagas.map((vaga) => (
            <article key={vaga.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <h3 className="font-bold">{vaga.titulo}</h3>
                  <p className="text-sm text-zinc-500">{vaga.departamento} · {vaga.localizacao} · {vaga.status}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(vaga)} className="rounded border px-3 py-1">Editar</button>
                  <button onClick={() => remove(vaga.id)} className="rounded bg-red-600 px-3 py-1 text-white">Excluir</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
