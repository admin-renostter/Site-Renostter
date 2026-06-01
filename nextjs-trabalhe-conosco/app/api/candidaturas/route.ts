import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { candidaturaSchema } from '@/lib/trabalhe-conosco/schemas';
import { createServiceClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: Request) {
  const formData = await request.formData();
  const curriculo = formData.get('curriculo');

  if (!(curriculo instanceof File)) {
    return NextResponse.json({ error: 'Curriculo obrigatorio.' }, { status: 400 });
  }
  if (curriculo.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Curriculo deve ter ate 10MB.' }, { status: 400 });
  }

  const raw = {
    vaga_id: String(formData.get('vaga_id') || ''),
    nome_completo: String(formData.get('nome_completo') || ''),
    cpf: String(formData.get('cpf') || ''),
    email: String(formData.get('email') || ''),
    celular: String(formData.get('celular') || ''),
    observacoes: String(formData.get('observacoes') || ''),
    endereco: {
      cep: String(formData.get('cep') || ''),
      logradouro: String(formData.get('logradouro') || ''),
      numero: String(formData.get('numero') || ''),
      complemento: String(formData.get('complemento') || ''),
      bairro: String(formData.get('bairro') || ''),
      cidade: String(formData.get('cidade') || ''),
      uf: String(formData.get('uf') || '').toUpperCase(),
    },
  };

  const parsed = candidaturaSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = createServiceClient();
  const ext = curriculo.name.split('.').pop() || 'pdf';
  const storagePath = `${parsed.data.vaga_id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('curriculos')
    .upload(storagePath, curriculo, { contentType: curriculo.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('candidaturas')
    .insert({
      ...parsed.data,
      curriculo_url: storagePath,
      status: 'recebida',
    })
    .select('*, vagas(titulo, localizacao)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await Promise.allSettled([
    resend?.emails.send({
      from: 'Renostter <onboarding@resend.dev>',
      to: process.env.RH_EMAIL!,
      subject: `Nova candidatura: ${parsed.data.nome_completo}`,
      html: `<p>Nova candidatura recebida para <strong>${data.vagas?.titulo ?? 'vaga'}</strong>.</p><p>${parsed.data.email} · ${parsed.data.celular}</p>`,
    }),
    process.env.N8N_CANDIDATURA_WEBHOOK_URL
      ? fetch(process.env.N8N_CANDIDATURA_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      : undefined,
  ]);

  return NextResponse.json({ ok: true, id: data.id });
}
