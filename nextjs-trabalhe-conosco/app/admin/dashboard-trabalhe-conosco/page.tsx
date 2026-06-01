import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DashboardTrabalheConosco } from '@/components/trabalhe-conosco/DashboardTrabalheConosco';

export default async function DashboardTrabalheConoscoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: vagas }, { data: candidaturas }] = await Promise.all([
    supabase.from('vagas').select('*').order('created_at', { ascending: false }),
    supabase.from('candidaturas').select('*, vagas(titulo, localizacao)').order('created_at', { ascending: false }),
  ]);

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <h1 className="mb-6 text-3xl font-black">Dashboard Trabalhe Conosco</h1>
      <DashboardTrabalheConosco vagas={vagas || []} candidaturas={candidaturas || []} />
    </main>
  );
}
