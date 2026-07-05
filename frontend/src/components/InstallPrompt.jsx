import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Para Android/Chrome
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    });

    // Detectar iOS Safari (donde no funciona beforeinstallprompt)
    const isIos = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };
    const isStandalone = () => {
      return ('standalone' in window.navigator) && (window.navigator.standalone);
    };

    if (isIos() && !isStandalone()) {
      setShowIOSPrompt(true);
      setIsVisible(true);
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsVisible(false);
      }
      setDeferredPrompt(null);
    }
  };

  const dismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 p-4 md:p-6 pb-8 bg-gradient-to-t from-gray-900 via-gray-900 to-transparent flex justify-center animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 max-w-sm w-full relative">
        <button 
          onClick={dismiss}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full p-1"
        >
          <X size={18} />
        </button>
        
        <div className="flex items-start gap-4">
          <div className="bg-indigo-100 p-3 rounded-xl shrink-0">
            <Smartphone className="text-indigo-600" size={24} />
          </div>
          <div>
            <h4 className="text-lg font-bold text-gray-900 leading-tight">Instalar App</h4>
            <p className="text-sm text-gray-500 mt-1 mb-4 leading-relaxed">
              Agrega la app a tu pantalla de inicio para acceder rápidamente.
            </p>
            
            {showIOSPrompt ? (
              <div className="bg-blue-50 text-blue-800 text-xs rounded-lg p-3 border border-blue-100 shadow-sm">
                Toca el ícono de <b>Compartir</b> <span className="inline-block border border-blue-200 rounded px-1 bg-white mx-1 shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> en Safari y selecciona <br/><b>"Agregar a Inicio"</b>.
              </div>
            ) : (
              <button 
                onClick={handleInstallClick}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
              >
                <Download size={18} /> Instalar Ahora
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
