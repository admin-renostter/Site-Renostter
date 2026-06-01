'use client';

import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';

type Row = {
  created_at: string;
  nome_completo: string;
  cpf: string;
  email: string;
  celular: string;
  curriculo_url: string;
  status: string;
  observacoes?: string | null;
  vagas?: { titulo?: string | null; localizacao?: string | null } | null;
};

export function ExportCandidaturasButton({ rows }: { rows: Row[] }) {
  function exportExcel() {
    const data = rows.map((row) => ({
      'Data da Candidatura': new Date(row.created_at).toLocaleString('pt-BR'),
      'Nome Completo': row.nome_completo,
      CPF: row.cpf,
      'E-mail': row.email,
      Celular: row.celular,
      Vaga: row.vagas?.titulo || '',
      'Localização da Vaga': row.vagas?.localizacao || '',
      Status: row.status,
      'Link do Currículo': row.curriculo_url,
      Observações: row.observacoes || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Candidaturas');
    worksheet['!cols'] = Object.keys(data[0] || {}).map(() => ({ wch: 24 }));

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `candidaturas-renostter_${date}.xlsx`, { compression: true });
  }

  return (
    <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white">
      <Download size={18} /> Exportar para Excel
    </button>
  );
}
