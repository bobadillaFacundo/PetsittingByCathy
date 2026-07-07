import { useEffect, useState } from "react";
import AnimalHistory from "./AnimalHistory";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAnimal, setSelectedAnimal] = useState(null);

  useEffect(() => {
    fetch(`/api/dashboard/`, {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse font-medium">Cargando tablero...</div>;
  if (!data) return <div className="p-8 text-center text-red-500 font-medium">Error al cargar datos del tablero.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      
      {/* SECCIÓN ALERTAS */}
      {data.alerts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-2xl shadow-sm">
          <h2 className="text-xl font-bold text-red-800 mb-4 flex items-center gap-2">
            ⚠️ Alertas Automáticas
          </h2>
          <div className="space-y-3">
            {data.alerts.map((alert, idx) => (
              <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-red-100">
                <div>
                  <span className="font-bold text-gray-900">{alert.animal_name}</span>
                  <p className="text-sm text-gray-600">{alert.message}</p>
                </div>
                <button 
                  onClick={() => setSelectedAnimal(alert.animal_id)}
                  className="px-4 py-2 bg-red-100 text-red-700 text-sm font-semibold rounded-lg hover:bg-red-200 transition"
                >
                  Ver Ficha
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECCIÓN EN OBSERVACIÓN */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          👀 En Observación
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.observation_animals.map(animal => (
            <AnimalCard key={animal.id} animal={animal} onSelect={setSelectedAnimal} type="obs" />
          ))}
          {data.observation_animals.length === 0 && <p className="text-gray-500 italic">No hay animales en observación.</p>}
        </div>
      </div>

      {/* SECCIÓN NORMALES */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" /> Animales Activos
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.normal_animals.map(animal => (
            <AnimalCard key={animal.id} animal={animal} onSelect={setSelectedAnimal} type="normal" />
          ))}
        </div>
      </div>

      {/* FICHA DETALLADA MODAL O VISTA ABAJO */}
      {selectedAnimal && (
        <div className="mt-12 pt-8 border-t-2 border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800">Ficha del Paciente</h3>
            <button onClick={() => setSelectedAnimal(null)} className="text-gray-500 hover:text-gray-800">Cerrar ✕</button>
          </div>
          <AnimalHistory animalId={selectedAnimal} />
        </div>
      )}
    </div>
  );
}

function AnimalCard({ animal, onSelect, type }) {
  const isObs = type === "obs";
  const speciesEmoji = {
    1: "🐶", 2: "🐱", 3: "🦜", 4: "🐰", 5: "🐢", 6: "🦔"
  };
  return (
    <div 
      onClick={() => onSelect(animal.id)}
      className={`p-5 rounded-2xl cursor-pointer transition-all border shadow-sm hover:shadow-md ${
        isObs ? "bg-amber-50 border-amber-200 hover:bg-amber-100" : "bg-white border-gray-100 hover:border-indigo-100"
      }`}
    >
      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <span>{speciesEmoji[animal.species_id] || "🐾"}</span>
        {animal.name}
      </h3>
      <span className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
        isObs ? "bg-amber-200 text-amber-800" : "bg-green-100 text-green-700"
      }`}>
        {isObs ? "En Observación" : "Normal"}
      </span>
    </div>
  );
}
