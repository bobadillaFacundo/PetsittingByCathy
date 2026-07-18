import React, { useState, useEffect } from 'react';
import AnimalHistory from '../AnimalHistory';

export default function ExportacionPanel() {
  const [animals, setAnimals] = useState([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnimals();
  }, []);

  const fetchAnimals = async () => {
    try {
      const res = await fetch('https://petsittingbycathy.onrender.com/animals/', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnimals(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 animate-fade-in-up">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          📄 Exportación de Historias Clínicas (IA)
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Selecciona una mascota para ver su historial y generar un reporte PDF inteligente de la fecha que desees.
        </p>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-bold text-gray-700 mb-2">Seleccionar Paciente</label>
        <select 
          className="w-full md:w-1/2 border border-gray-300 rounded-xl p-3 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none"
          value={selectedAnimalId}
          onChange={(e) => setSelectedAnimalId(e.target.value)}
          disabled={loading}
        >
          <option value="">-- Elige una mascota --</option>
          {animals.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.is_active ? 'Activo' : 'Inactivo'})</option>
          ))}
        </select>
      </div>

      {selectedAnimalId && (
        <div className="border-t border-gray-200 pt-6">
          <AnimalHistory animalId={parseInt(selectedAnimalId)} />
        </div>
      )}
    </div>
  );
}
