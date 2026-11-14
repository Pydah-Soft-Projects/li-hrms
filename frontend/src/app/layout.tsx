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
  title: {
    default: "Campo HRMS",
    template: "%s | Campo HRMS",
  },
  description: "Campo HRMS — Smart Institutional Human Resource Management System",
  applicationName: "Campo HRMS",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/campo-logos/favicon.ico" },
      { url: "/campo-logos/favicon.svg", type: "image/svg+xml" },
      { url: "/campo-logos/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/campo-logos/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/campo-logos/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/campo-logos/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/campo-logos/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/campo-logos/favicon.ico"],
  },
  openGraph: {
    title: "Campo HRMS — Human Resource Management System",
    description: "Campo HRMS — Smart Institutional Human Resource Management System for Attendance, Leaves, Payroll and Staff Administration.",
    siteName: "Campo HRMS",
    images: [
      {
        url: "/campo-logos/og-image.png",
        width: 800,
        height: 800,
        alt: "Campo HRMS",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Campo HRMS",
    description: "Campo HRMS — Smart Institutional Human Resource Management System",
    images: ["/campo-logos/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Campo HRMS",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#1E3150",
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
        <link rel="icon" href="/campo-logos/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/campo-logos/favicon.svg" />
        <link rel="icon" type="image/png" sizes="16x16" href="/campo-logos/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/campo-logos/favicon-32x32.png" />
        <link rel="shortcut icon" href="/campo-logos/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/campo-logos/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-title" content="Campo HRMS" />
        <meta name="application-name" content="Campo HRMS" />
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
