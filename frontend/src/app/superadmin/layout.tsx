import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';
import { SidebarProvider } from '@/contexts/SidebarContext';

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-white dark:bg-slate-900">
        <Sidebar />
        <MainContent className="pt-16 sm:pt-0">{children}</MainContent>
      </div>
    </SidebarProvider>
  );
}
