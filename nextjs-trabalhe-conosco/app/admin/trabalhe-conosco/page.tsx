import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { VagasAdminClient } from '@/components/trabalhe-conosco/VagasAdminClient';

export default async function AdminTrabalheConoscoPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: vagas } = await supabase
    .from('vagas')
    .select('*')
    .order('created_at', { ascending: false });

  return (
    <main className="min-h-screen bg-zinc-50 p-6">
      <h1 className="mb-6 text-3xl font-black">CRUD de Vagas</h1>
      <VagasAdminClient initialVagas={vagas || []} />
    </main>
  );
}
