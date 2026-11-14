import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import InstallPrompt from "@/components/InstallPrompt";
import PushNotificationRegistrar from "@/components/PushNotificationRegistrar";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import PortalSwitcher from "@/components/PortalSwitcher";

export const metadata: Metadata = {
  title: "HRMS Application",
  description: "Human Resource Management System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LI-HRMS",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        {/* Dynamic client-side theme loader fallback: executes ONLY for authenticated after-login routes */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var p = window.location.pathname;
                  var isBeforeLogin = !p || p === '/' || p === '/login' || p.indexOf('/login') === 0 || p === '/forgot-password' || p.indexOf('/outpass') === 0;
                  if (isBeforeLogin) return; // Do not apply centralized theme on landing or login pages

                  var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                  var srv = isLocal ? 'http://localhost:7000' : 'https://ui-theme.pydah.edu.in';
                  if (!document.getElementById('app-theme-preload')) {
                    var l = document.createElement('link');
                    l.rel = 'stylesheet';
                    l.id = 'app-theme-preload';
                    l.href = srv + '/themes/theme.css';
                    document.head.appendChild(l);
                  }
                  if (!document.getElementById('app-theme-loader-runtime')) {
                    var sc = document.createElement('script');
                    sc.id = 'app-theme-loader-runtime';
                    sc.src = srv + '/themes/theme-loader.js';
                    sc.setAttribute('data-theme-server', srv);
                    sc.setAttribute('data-poll-interval', isLocal ? '10' : '30');
                    document.head.appendChild(sc);
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className="antialiased font-sans"
        suppressHydrationWarning
      >
        <AuthProvider>
          <PortalSwitcher />
          <PushNotificationRegistrar />
          <PushNotificationPrompt />
          <WorkspaceProvider>
            <SocketProvider>
              {children}
            </SocketProvider>
          </WorkspaceProvider>
        </AuthProvider>
        <ToastContainer />
        <InstallPrompt />
      </body>
    </html>
  );
}
