import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';
import { SidebarProvider } from '@/contexts/SidebarContext';

/**
 * Layout component that provides sidebar context and composes the admin sidebar with the main content area.
 *
 * @param children - Content to render inside the MainContent area
 * @returns The rendered layout element containing Sidebar and MainContent with `children` placed inside MainContent
 */
export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-white dark:bg-slate-900">
        <Sidebar />
        <MainContent>{children}</MainContent>
      </div>
    </SidebarProvider>
  );
}