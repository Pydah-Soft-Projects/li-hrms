import Sidebar from '@/components/Sidebar';
import MainContent from '@/components/MainContent';
import { SidebarProvider } from '@/contexts/SidebarContext';

/**
 * Composes the super-admin layout by providing sidebar context and rendering a sidebar with the given content in the main area.
 *
 * @param children - Content to render inside the layout's main content area.
 * @returns The React element tree for the super-admin layout.
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