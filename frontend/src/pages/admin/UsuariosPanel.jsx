import { useState, useEffect } from 'react';
import { Pencil, UserPlus, X, Save, Lock, UserX, UserCheck } from 'lucide-react';
import { API_BASE, apiUrl, mediaUrl } from '../../lib/api';

export default function UsuariosPanel() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'password'
  const [editingUser, setEditingUser] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    role: 'user'
  });

  const [passwordData, setPasswordData] = useState({
    new_password: ''
  });

  const token = localStorage.getItem('token');
  const currentUsername = localStorage.getItem('username');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(apiUrl('/users'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({ name: '', password: '', role: 'user' });
    setIsModalOpen(true);
  };

  const openPasswordModal = (user) => {
    setModalMode('password');
    setEditingUser(user);
    setPasswordData({ new_password: '' });
    setIsModalOpen(true);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(apiUrl('/users'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        const error = await res.json();
        alert(`Error al crear usuario: ${error.detail}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/users/${editingUser.id}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(passwordData)
      });

      if (res.ok) {
        setIsModalOpen(false);
        alert("Contraseña actualizada correctamente");
      } else {
        const error = await res.json();
        alert(`Error: ${error.detail}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión");
    }
  };

  const handleToggleStatus = async (user) => {
    if (user.name === currentUsername) {
      alert("No puedes desactivar tu propia sesión activa.");
      return;
    }
    
    const action = user.is_active ? 'desactivar (dar de baja)' : 'reactivar';
    if (window.confirm(`¿Seguro que deseas ${action} al usuario ${user.name}?`)) {
      try {
        const res = await fetch(`${API_BASE}/users/${user.id}/toggle_status`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (res.ok) {
          fetchUsers();
        } else {
          const error = await res.json();
          alert(`Error: ${error.detail}`);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (isLoading) return <div className="text-center p-8 text-gray-500">Cargando usuarios...</div>;

  return (
    <div className="pet-panel">
      {/* Encabezado */}
      <div className="pet-panel-header">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">Gestión de Usuarios</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">Alta, baja y cambio de contraseña de cuidadores</p>
        </div>
        <button 
          type="button"
          onClick={openCreateModal}
          className="pet-btn pet-btn--primary p-2.5 sm:px-4 sm:py-2 shrink-0"
        >
          <UserPlus size={20} /> <span className="hidden sm:inline">Nuevo Usuario</span>
        </button>
      </div>

      <div className="p-4 md:p-6">
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                <th className="px-6 py-4 font-medium">Nombre de Usuario</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900 flex items-center gap-2">
                    {user.name} 
                    {user.name === 'cathy' && <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">Admin</span>}
                  </td>
                  <td className="px-6 py-4">
                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-green-700 font-bold bg-green-50 px-2 py-1 rounded-full border border-green-100">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-red-700 font-bold bg-red-50 px-2 py-1 rounded-full border border-red-100">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span> Inactivo / Baja
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 flex justify-end gap-2">
                    <button 
                      type="button"
                      onClick={() => openPasswordModal(user)}
                      className="pet-icon-btn pet-icon-btn--indigo p-2"
                      title="Cambiar Contraseña"
                    >
                      <Lock size={18} />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleToggleStatus(user)}
                      className={`pet-icon-btn p-2 ${
                        user.is_active 
                          ? 'pet-icon-btn--red' 
                          : 'pet-icon-btn--green'
                      }`}
                      title={user.is_active ? "Dar de baja" : "Reactivar"}
                      disabled={user.name === 'cathy'}
                    >
                      {user.is_active ? <UserX size={18} /> : <UserCheck size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="modal-overlay flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div className="modal-sheet max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="pet-modal-header">
              <h3 className="text-lg font-bold text-gray-800">
                {modalMode === 'create' ? 'Crear Nuevo Usuario' : `Cambiar Contraseña: ${editingUser?.name}`}
              </h3>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="pet-modal-close"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={modalMode === 'create' ? handleCreateUser : handleChangePassword} className="p-6 space-y-4">
              
              {modalMode === 'create' && (
                <>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre de Usuario (Login)</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value.toLowerCase()})}
                      className="pet-input"
                      placeholder="Ej: juan"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Contraseña Inicial</label>
                    <input
                      type="text"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      className="pet-input"
                      placeholder="Contraseña"
                    />
                  </div>
                </>
              )}

              {modalMode === 'password' && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Nueva Contraseña</label>
                  <input
                    type="text"
                    required
                    value={passwordData.new_password}
                    onChange={(e) => setPasswordData({new_password: e.target.value})}
                    className="pet-input"
                    placeholder="Escriba la nueva contraseña"
                  />
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="pet-btn pet-btn--ghost px-4 py-2 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="pet-btn pet-btn--primary px-4 py-2 font-medium"
                >
                  <Save size={18} /> {modalMode === 'create' ? 'Crear' : 'Actualizar'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}
