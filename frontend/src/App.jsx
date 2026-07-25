import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router';
import VoiceRecorder from './components/VoiceRecorder';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import InstallPrompt from './components/InstallPrompt';
import CalendarioPanel from './pages/admin/CalendarioPanel';
import { clearSession, isAuthenticated } from './lib/auth';

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    clearSession();
    return <Navigate to="/login" replace />;
  }
  return children;
}

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const role = localStorage.getItem('role');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen min-h-dvh bg-gray-50 font-sans text-gray-900 pt-safe">
      <nav className="bg-white shadow-sm px-3 sm:px-6 md:px-8 py-3 sm:py-4 mb-4 sm:mb-8 sticky top-0 z-10 flex justify-between items-center gap-2">
        <h1 className="text-base sm:text-xl md:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-2 min-w-0">
          <img src="/logo.png" alt="Logo" className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" />
          <span className="truncate">Gestor Guarderia</span>
        </h1>
        <div className="flex gap-2 sm:gap-4 shrink-0">
          {role === 'admin' && (
            <button 
              onClick={() => navigate('/admin')}
              className="px-2.5 sm:px-4 py-2 bg-indigo-100 text-indigo-700 text-xs sm:text-sm font-bold rounded-lg hover:bg-indigo-200 transition-colors"
            >
              <span className="sm:hidden">Admin</span>
              <span className="hidden sm:inline">Ajustes / Panel</span>
            </button>
          )}
          <button 
            onClick={() => {
              clearSession();
              navigate('/login');
            }}
            className="px-2.5 sm:px-4 py-2 bg-red-50 text-red-600 text-xs sm:text-sm font-bold rounded-lg hover:bg-red-100 transition-colors"
          >
            Salir
          </button>
        </div>
      </nav>
      <main className="px-3 sm:px-4 pb-8 sm:pb-12 max-w-6xl mx-auto space-y-6 sm:space-y-8 pb-safe">
        
        <div className="flex gap-2 sm:gap-4 border-b border-gray-200 pb-3 sm:pb-4 overflow-x-auto scroll-touch -mx-3 px-3 sm:mx-0 sm:px-0 justify-start sm:justify-center">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 sm:px-6 py-2.5 font-bold rounded-full transition-colors whitespace-nowrap text-sm sm:text-base shrink-0 ${
              activeTab === 'dashboard' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            📊 Tablero
          </button>
          <button 
            onClick={() => setActiveTab('report')}
            className={`px-4 sm:px-6 py-2.5 font-bold rounded-full transition-colors flex items-center gap-2 whitespace-nowrap text-sm sm:text-base shrink-0 ${
              activeTab === 'report' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            🎙️ Nuevo Reporte
          </button>
          <button 
            onClick={() => setActiveTab('calendario')}
            className={`px-4 sm:px-6 py-2.5 font-bold rounded-full transition-colors flex items-center gap-2 whitespace-nowrap text-sm sm:text-base shrink-0 ${
              activeTab === 'calendario' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            📅 Calendario
          </button>
        </div>

        {activeTab === 'report' && (
          <section className="flex justify-center">
            <div className="w-full max-w-2xl">
              <VoiceRecorder onSave={() => setActiveTab('dashboard')} />
            </div>
          </section>
        )}

        {activeTab === 'dashboard' && (
          <section>
            <Dashboard />
          </section>
        )}

        {activeTab === 'calendario' && (
          <section>
            <CalendarioPanel />
          </section>
        )}

      </main>
    </div>
  );
}

/**
 * Mantiene App y Admin montados tras la primera visita a cada una,
 * para que el cambio casita ↔ panel sea instantáneo (sin remount ni refetch).
 */
function AuthenticatedShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const role = localStorage.getItem('role');
  const isAdminRoute = pathname.startsWith('/admin');
  const [homeMounted, setHomeMounted] = useState(!isAdminRoute);
  const [adminMounted, setAdminMounted] = useState(isAdminRoute);

  useEffect(() => {
    const ensureAuth = () => {
      if (!isAuthenticated()) {
        clearSession();
        navigate('/login', { replace: true });
      }
    };
    ensureAuth();
    const onFocus = () => ensureAuth();
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(ensureAuth, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [navigate]);

  useEffect(() => {
    if (isAdminRoute) {
      setAdminMounted(true);
    } else {
      setHomeMounted(true);
    }
  }, [isAdminRoute]);

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdminRoute && pathname !== '/') {
    return <Navigate to="/" replace />;
  }

  if (isAdminRoute && role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      {homeMounted && (
        <div className={isAdminRoute ? 'hidden' : undefined} aria-hidden={isAdminRoute}>
          <MainApp />
        </div>
      )}
      {adminMounted && role === 'admin' && (
        <div className={!isAdminRoute ? 'hidden' : undefined} aria-hidden={!isAdminRoute}>
          <AdminDashboard />
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <InstallPrompt />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <AuthenticatedShell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
