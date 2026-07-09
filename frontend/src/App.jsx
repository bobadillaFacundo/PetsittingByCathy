import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import VoiceRecorder from './components/VoiceRecorder';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import InstallPrompt from './components/InstallPrompt';

// Rutas protegidas genéricas (cualquier usuario autenticado)
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

// Rutas exclusivas de administrador
function AdminRoute({ children }) {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return children;
}

import { useState } from 'react';

import CalendarioPanel from './pages/admin/CalendarioPanel';

function MainApp() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const role = localStorage.getItem('role');

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <nav className="bg-white shadow-sm px-8 py-4 mb-8 sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" /> Gestor Guarderia
        </h1>
        <div className="flex gap-4">
          {role === 'admin' && (
            <button 
              onClick={() => window.location.href = '/admin'}
              className="px-4 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-lg hover:bg-indigo-200 transition-colors"
            >
              Ajustes / Panel
            </button>
          )}
          <button 
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('role');
              window.location.href = '/login';
            }}
            className="px-4 py-2 bg-red-50 text-red-600 font-bold rounded-lg hover:bg-red-100 transition-colors"
          >
            Salir
          </button>
        </div>
      </nav>
      <main className="px-4 pb-12 max-w-6xl mx-auto space-y-8">
        
        {/* Navegación por Pestañas */}
        <div className="flex justify-center gap-4 border-b border-gray-200 pb-4">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-6 py-2 font-bold rounded-full transition-colors ${
              activeTab === 'dashboard' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            📊 Tablero
          </button>
          <button 
            onClick={() => setActiveTab('report')}
            className={`px-6 py-2 font-bold rounded-full transition-colors flex items-center gap-2 ${
              activeTab === 'report' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            🎙️ Nuevo Reporte
          </button>
          <button 
            onClick={() => setActiveTab('calendario')}
            className={`px-6 py-2 font-bold rounded-full transition-colors flex items-center gap-2 ${
              activeTab === 'calendario' 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            📅 Calendario
          </button>
        </div>

        {activeTab === 'report' && (
          <section className="flex justify-center animate-fade-in-up">
            <div className="w-full max-w-2xl">
              <VoiceRecorder onSave={() => setActiveTab('dashboard')} />
            </div>
          </section>
        )}

        {activeTab === 'dashboard' && (
          <section className="animate-fade-in-up">
            <Dashboard />
          </section>
        )}

        {activeTab === 'calendario' && (
          <section className="animate-fade-in-up">
            <CalendarioPanel />
          </section>
        )}

      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <InstallPrompt />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <MainApp />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/admin/*" 
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          } 
        />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
