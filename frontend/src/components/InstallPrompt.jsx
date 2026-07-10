import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

function isIos() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isAndroid() {
  return /android/i.test(window.navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [showAndroidManual, setShowAndroidManual] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowAndroidManual(false);
      setIsVisible(true);
    };

    const onInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    if (isIos()) {
      setShowIOSPrompt(true);
      setIsVisible(true);
    } else if (isAndroid()) {
      // Si Chrome no dispara el evento (HTTP, SW viejo, etc.), mostrar guía manual
      const timer = setTimeout(() => {
        setDeferredPrompt((current) => {
          if (!current) {
            setShowAndroidManual(true);
            setIsVisible(true);
          }
          return current;
        });
      }, 2500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
        window.removeEventListener('appinstalled', onInstalled);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 p-4 md:p-6 pb-[max(2rem,calc(0.5rem+var(--safe-bottom)))] bg-gradient-to-t from-gray-900 via-gray-900 to-transparent flex justify-center px-safe">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 max-w-sm w-full relative">
        <button
          onClick={() => setIsVisible(false)}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-4">
          <div className="bg-indigo-100 p-3 rounded-xl shrink-0">
            <Smartphone className="text-indigo-600" size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-lg font-bold text-gray-900 leading-tight">Instalar App</h4>
            <p className="text-sm text-gray-500 mt-1 mb-4 leading-relaxed">
              Agrega Petsitting a tu pantalla de inicio.
            </p>

            {showIOSPrompt ? (
              <div className="bg-blue-50 text-blue-800 text-xs rounded-lg p-3 border border-blue-100 shadow-sm">
                Toca <b>Compartir</b> en Safari y elegí <b>&quot;Agregar a Inicio&quot;</b>.
              </div>
            ) : deferredPrompt ? (
              <button
                onClick={handleInstallClick}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
              >
                <Download size={18} /> Instalar Ahora
              </button>
            ) : showAndroidManual ? (
              <div className="bg-amber-50 text-amber-900 text-xs rounded-lg p-3 border border-amber-200 space-y-2">
                <p>
                  En Chrome: menú <b>⋮</b> → <b>Instalar app</b> o <b>Agregar a la pantalla de inicio</b>.
                </p>
                <p>
                  Abrí la app con <b>https://</b> (no http). En la PC corré{' '}
                  <code className="bg-white px-1 rounded">npm run dev</code> y usá la URL HTTPS que muestra Vite.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
