import { z } from 'zod';

export const vagaSchema = z.object({
  titulo: z.string().min(3),
  departamento: z.string().min(2),
  localizacao: z.string().min(2),
  tipo_contrato: z.string().min(2),
  faixa_salarial: z.string().optional(),
  descricao: z.string().min(10),
  requisitos: z.array(z.string().min(2)).default([]),
  beneficios: z.array(z.string().min(2)).default([]),
  status: z.enum(['rascunho', 'ativa', 'pausada', 'encerrada']).default('ativa'),
  data_publicacao: z.string().optional(),
  data_expiracao: z.string().optional().nullable(),
});

export const candidaturaSchema = z.object({
  vaga_id: z.string().uuid(),
  nome_completo: z.string().min(5),
  cpf: z.string().min(11),
  email: z.string().email(),
  celular: z.string().min(10),
  endereco: z.object({
    cep: z.string().min(8),
    logradouro: z.string().min(3),
    numero: z.string().min(1),
    complemento: z.string().optional(),
    bairro: z.string().min(2),
    cidade: z.string().min(2),
    uf: z.string().length(2),
  }),
  observacoes: z.string().optional(),
});

export type VagaInput = z.infer<typeof vagaSchema>;
export type CandidaturaInput = z.infer<typeof candidaturaSchema>;
