import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Activity, BookOpen, LogOut, Settings, 
  Menu, X, Home, Database, HeartPulse
} from 'lucide-react';
import MascotasCRUD from './MascotasCRUD';
import AuditoriaPanel from './AuditoriaPanel';

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
    { id: 'pacientes', label: 'Mascotas', icon: HeartPulse },
    { id: 'reportes', label: 'Auditoría Reportes', icon: Database },
    { id: 'usuarios', label: 'Usuarios', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar Desktop */}
      <aside className={`bg-indigo-900 text-white w-64 flex-shrink-0 transition-all duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full hidden md:block md:w-20'}`}>
        <div className="p-4 flex items-center justify-between border-b border-indigo-800">
          <div className={`flex items-center gap-3 ${!isSidebarOpen && 'md:hidden'}`}>
            <span className="text-2xl">🐾</span>
            <span className="font-bold text-lg tracking-wide">Admin Panel</span>
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-indigo-800 rounded-lg md:block hidden">
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
                title={item.label}
              >
                <Icon size={20} />
                <span className={`font-medium ${!isSidebarOpen && 'md:hidden'}`}>{item.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              <Menu size={20} />
            </button>
            <h2 className="text-xl font-bold text-gray-800 hidden sm:block">Panel de Administración</h2>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors bg-gray-100 px-4 py-2 rounded-lg"
            >
              <Home size={16} />
              <span className="hidden sm:inline">Ir a la App</span>
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-bold text-red-600 hover:text-red-800 transition-colors bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-auto p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            
            {activeTab === 'diccionario' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <BookOpen className="text-indigo-600" /> Diccionario IA (TagSets)
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Modismos y palabras aprendidas por el sistema.</p>
                  </div>
                  <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 shadow-sm transition-all">
                    + Nuevo Conjunto
                  </button>
                </div>
                
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
                  El módulo de gestión de diccionario se implementará pronto.
                  <br/>Actualmente la IA está aprendiendo y registrando en la base de datos automáticamente.
                </div>
              </div>
            )}

            {activeTab === 'pacientes' && (
              <MascotasCRUD />
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
    </div>
  );
}
