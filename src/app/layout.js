import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata = {
  title: "Property Visualizer — Management & Tenant Hub",
  description: "Interactive low-poly 3D building view for property management",
  icons: {
    icon: "/branding/favicon.png",
    shortcut: "/branding/favicon.png",
    apple: "/branding/building-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="icon" href="/branding/favicon.png" type="image/png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/branding/building-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b3860" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="PropViz" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              function isIgnoredError(msg) {
                if (!msg || typeof msg !== 'string') return false;
                var lower = msg.toLowerCase();
                return (
                  lower.includes('database connection is closing') ||
                  lower.includes('database is closing') ||
                  lower.includes('connection is closed') ||
                  lower.includes('client is offline') ||
                  lower.includes('resizeobserver') ||
                  lower.includes('aborterror') ||
                  lower.includes('webglcontextlost') ||
                  lower.includes('context lost')
                );
              }
              function showErrBanner(msg, loc) {
                if (isIgnoredError(msg) || (loc && isIgnoredError(loc))) return;
                var el = document.getElementById('debug-err-banner');
                if (!el) {
                  el = document.createElement('div');
                  el.id = 'debug-err-banner';
                  el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999999;background:#b91c1c;color:#fff;padding:10px 14px;font-size:12px;font-family:monospace;word-break:break-all;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:space-between;gap:8px;';
                  document.documentElement.appendChild(el);
                }
                el.innerHTML = '<div style="flex:1;"><strong>App Error:</strong> ' + msg + (loc ? '<br><small>' + loc + '</small>' : '') + '</div>' +
                  '<button onclick="document.getElementById(\\'debug-err-banner\\').style.display=\\'none\\'" style="background:rgba(255,255,255,0.2);border:none;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">✕</button>';
                el.style.display = 'flex';
              }
              window.addEventListener('error', function(e) {
                var msg = e.message || (e.target && (e.target.src || e.target.href) ? 'Failed to load: ' + (e.target.src || e.target.href) : e.toString());
                var loc = e.filename ? e.filename + ':' + e.lineno : '';
                showErrBanner(msg, loc);
              }, true);
              window.addEventListener('unhandledrejection', function(e) {
                var reason = e.reason;
                var msg = reason ? (reason.message || reason.stack || String(reason)) : 'Unhandled Promise Rejection';
                showErrBanner('Promise Rejection: ' + msg);
              });
              document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'visible') {
                  var el = document.getElementById('debug-err-banner');
                  if (el && isIgnoredError(el.innerText)) {
                    el.style.display = 'none';
                  }
                }
              });
            `,
          }}
        />
      </head>
      <body className="min-h-full">
        <ErrorBoundary>
          <AuthProvider>{children}</AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

