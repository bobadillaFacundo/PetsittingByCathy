import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Activity, BookOpen, LogOut, Settings, 
  Menu, X, Home, Database, HeartPulse
} from 'lucide-react';
import MascotasCRUD from './MascotasCRUD';
import AuditoriaPanel from './AuditoriaPanel';
import AnalisisPanel from './AnalisisPanel';
import DiccionarioPanel from './DiccionarioPanel';
import CatalogsPanel from './CatalogsPanel';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('diccionario');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const role = localStorage.getItem('role');
    if (role !== 'admin') {
      navigate('/login');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    navigate('/login');
  };

  const navItems = [
    { id: 'diccionario', label: 'Diccionario IA', icon: BookOpen },
    { id: 'analisis', label: 'Análisis IA', icon: Activity },
    { id: 'pacientes', label: 'Mascotas', icon: HeartPulse },
    { id: 'catalogos', label: 'Gestión de Catálogos', icon: Settings },
    { id: 'reportes', label: 'Auditoría Reportes', icon: Database },
    { id: 'usuarios', label: 'Usuarios', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
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
        
        <nav className="p-4 space-y-2 mt-4">
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
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden pb-16 md:pb-0 relative">
        {/* Topbar */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-xl object-contain md:hidden" />
            <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tight flex items-center gap-2">
              Panel Admin
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors bg-gray-100 px-4 py-2 rounded-xl"
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
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {activeTab === 'diccionario' && (
              <DiccionarioPanel />
            )}

            {activeTab === 'pacientes' && (
              <MascotasCRUD />
            )}

            {activeTab === 'catalogos' && (
              <CatalogsPanel />
            )}

            {activeTab === 'analisis' && (
              <AnalisisPanel />
            )}

            {activeTab === 'reportes' && (
              <AuditoriaPanel />
            )}
            
            {activeTab === 'usuarios' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
                  <Users className="text-indigo-600" /> Usuarios
                </h3>
                <p className="text-sm text-gray-500 mb-6">Cuidadores y Administradores.</p>
                
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
                  Próximamente: Gestión de cuentas.
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white/90 backdrop-blur-xl border-t border-gray-200 pb-safe z-50 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="flex justify-around items-center px-2 py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-2xl transition-all duration-300 ${
                  isActive 
                    ? 'text-indigo-600 scale-110' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-indigo-100' : ''}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] font-bold ${isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
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
