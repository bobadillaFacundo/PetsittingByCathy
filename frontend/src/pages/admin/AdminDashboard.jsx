import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { 
  Users, Activity, BookOpen, LogOut, Settings, 
  Menu, Home, Database, HeartPulse, FileText, PawPrint, Palette
} from 'lucide-react';
import MascotasCRUD from './MascotasCRUD';
import AuditoriaPanel from './AuditoriaPanel';
import AnalisisPanel from './AnalisisPanel';
import DiccionarioPanel from './DiccionarioPanel';
import CatalogsPanel from './CatalogsPanel';
import UsuariosPanel from './UsuariosPanel';
import ExportacionPanel from './ExportacionPanel';
import ColoresPanel from './ColoresPanel';
import { clearSession, isAuthenticated } from '../../lib/auth';

export default function AdminDashboard() {
  const username = localStorage.getItem('username');
  const isSuperAdmin = username === 'cathy';
  const [activeTab, setActiveTab] = useState(isSuperAdmin ? 'diccionario' : 'guarderia');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated()) {
      clearSession();
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const handleLogout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  const navItems = [
    ...(isSuperAdmin ? [
      { id: 'diccionario', label: 'Diccionario IA', icon: BookOpen },
      { id: 'colores', label: 'Colores de Reporte', icon: Palette },
      { id: 'analisis', label: 'Análisis IA', icon: Activity },
    ] : []),
    { id: 'guarderia', label: 'Guardería Externa', icon: PawPrint },
    { id: 'pacientes', label: 'Internas', icon: HeartPulse },
    { id: 'catalogos', label: 'Gestión de Catálogos', icon: Settings },
    { id: 'exportar', label: 'Exportar Historias', icon: FileText },
    ...(isSuperAdmin ? [
      { id: 'reportes', label: 'Auditoría Reportes', icon: Database },
      { id: 'usuarios', label: 'Usuarios', icon: Users },
    ] : []),
  ];

  return (
    <div className="min-h-screen min-h-dvh bg-gray-50 flex">
      {/* Sidebar Desktop (Hidden on mobile) */}
      <aside className={`hidden md:block bg-indigo-900 text-white flex-shrink-0 transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="p-4 flex items-center justify-between border-b border-indigo-800">
          <div className={`flex items-center gap-3 ${!isSidebarOpen && 'hidden'}`}>
            <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-xl object-contain bg-white/10" />
            <span className="font-bold text-lg tracking-wide">Admin</span>
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-indigo-800 rounded-lg">
            <Menu size={20} />
          </button>
        </div>
        
        <nav className="p-4 space-y-2 mt-4 overflow-y-auto scroll-touch max-h-[calc(100dvh-5rem)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                }`}
              >
                <Icon size={20} className="shrink-0" />
                <span className={`font-medium ${!isSidebarOpen && 'hidden'}`}>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen h-dvh overflow-hidden relative pb-[calc(4.5rem+var(--safe-bottom))] md:pb-0">
        {/* Topbar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-3 sm:px-4 md:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-10 pt-[max(0.75rem,var(--safe-top))] md:pt-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-xl object-contain md:hidden shrink-0" />
            <h2 className="text-lg sm:text-xl md:text-2xl font-black text-gray-800 tracking-tight truncate">
              Panel Admin
            </h2>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <button 
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors bg-gray-100 px-3 sm:px-4 py-2 rounded-xl"
              title="Ir a la App"
            >
              <Home size={16} />
              <span className="hidden sm:inline">Ir a la App</span>
            </button>
            <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors">
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto scroll-touch p-3 sm:p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
            {activeTab === 'diccionario' && (
              <DiccionarioPanel />
            )}

            {activeTab === 'colores' && (
              <ColoresPanel />
            )}

            {activeTab === 'guarderia' && (
              <MascotasCRUD daycareOnly={true} />
            )}

            {activeTab === 'pacientes' && (
              <MascotasCRUD daycareOnly={false} />
            )}

            {activeTab === 'catalogos' && (
              <CatalogsPanel />
            )}

            {activeTab === 'exportar' && (
              <ExportacionPanel />
            )}

            {activeTab === 'analisis' && (
              <AnalisisPanel />
            )}

            {activeTab === 'reportes' && (
              <AuditoriaPanel />
            )}
            
            {activeTab === 'usuarios' && (
              <UsuariosPanel />
            )}

          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-xl border-t border-gray-200 pb-safe z-50 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="flex items-stretch gap-0.5 px-1 py-2 overflow-x-auto scroll-touch">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[3.25rem] flex-1 rounded-2xl transition-all duration-300 ${
                  isActive 
                    ? 'text-indigo-600' 
                    : 'text-gray-400'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-indigo-100' : ''}`}>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[9px] font-bold leading-tight text-center max-w-[4.5rem] truncate ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                  {item.label.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
