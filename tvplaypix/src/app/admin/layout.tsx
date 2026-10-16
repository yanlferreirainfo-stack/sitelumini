import { requireAdminPage } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();

  return (
    <div className="min-h-screen">
      <Sidebar user={{ email: admin.email, role: admin.role, name: admin.full_name }} signOut={signOut} />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
