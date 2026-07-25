import { useEffect, useState } from "react";
import { API_BASE, mediaUrl } from '../lib/api';

export default function AnimalList() {
  const [animals, setAnimals] = useState([]);

  useEffect(() => {
    // Aquí luego integraremos la llamada a la API real
    // fetch(`${API_BASE}/animals/`)
    setAnimals([
      { id: 1, name: "Theo", species_id: 1, is_active: true },
      { id: 2, name: "Cleopatra", species_id: 1, is_active: true }
    ]);
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Tus Animales</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {animals.map((animal) => (
          <div key={animal.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer">
            <h2 className="text-xl font-semibold text-gray-900">{animal.name}</h2>
            <span className="inline-block mt-3 px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
              {animal.is_active ? 'Normal' : 'Inactivo'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
