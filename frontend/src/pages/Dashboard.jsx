import { useEffect, useState } from "react";
import AnimalHistory from "./AnimalHistory";

const SPECIES_INFO = {
  1: { name: "Perros", emoji: "🐶" },
  2: { name: "Gatos", emoji: "🐱" },
  3: { name: "Conejos", emoji: "🐰" },
  4: { name: "Loros", emoji: "🦜" },
  5: { name: "Tortugas", emoji: "🐢" },
  6: { name: "Erizos", emoji: "🦔" }
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weatherData, setWeatherData] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null);

  const fetchData = () => {
    fetch(`/api/dashboard/?t=${Date.now()}`, {
      headers: { 
        "Authorization": `Bearer ${localStorage.getItem("token")}`,
        "Cache-Control": "no-cache"
      }
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
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchWeather = async () => {
    setLoadingWeather(true);
    try {
      const res = await fetch(`/api/dashboard/weather`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      const d = await res.json();
      setWeatherData(d);
      // Refresh the dashboard data so animals change visually from green to yellow/red
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingWeather(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse font-medium">Cargando tablero...</div>;
  if (!data) return <div className="p-8 text-center text-red-500 font-medium">Error al cargar datos del tablero.</div>;

  const obsAnimals = selectedSpeciesId ? data.observation_animals.filter(a => a.species_id === selectedSpeciesId) : [];
  const normalAnimals = selectedSpeciesId ? data.normal_animals.filter(a => a.species_id === selectedSpeciesId) : [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      
      {/* ALERTAS DE SALUD (Vacunas y Desparasitación) */}
      {data.alerts && data.alerts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-2xl shadow-sm animate-fade-in-up">
          <h2 className="text-xl font-bold text-yellow-800 flex items-center gap-2 mb-4">
            ⚠️ Alertas de Salud y Vacunación
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.alerts.map((alert, idx) => (
              <div key={idx} className={`p-4 rounded-xl border flex items-start gap-3 ${alert.severity === 'high' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-white border-yellow-200 text-yellow-900'}`}>
                <div className="text-2xl mt-0.5">{alert.severity === 'high' ? '🚨' : '💉'}</div>
                <div>
                  <div className="font-bold leading-tight">{alert.animal_name}</div>
                  <div className="text-sm opacity-90 mt-1 leading-snug">{alert.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EL CLIMA GLOBAL */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 p-6 rounded-2xl shadow-sm">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
            🌤️ El Clima de Hoy
          </h2>
          <button 
            onClick={fetchWeather}
            disabled={loadingWeather}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold text-sm rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            {loadingWeather ? "Analizando reportes..." : "Analizar Clima"}
          </button>
        </div>
        
        {loadingWeather ? (
          <div className="animate-pulse text-indigo-600 bg-white/60 p-4 rounded-xl border border-indigo-50 text-sm font-medium">
            La Inteligencia Artificial está leyendo los reportes de las últimas 48 horas...
          </div>
        ) : weatherData ? (
          <div className="space-y-4">
            <div className="text-gray-800 font-medium bg-white/60 p-4 rounded-xl border border-indigo-50">
              {weatherData.weather}
            </div>
            {weatherData.alerts && weatherData.alerts.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="font-bold text-red-800 text-sm flex items-center gap-1">⚠️ Alertas Inteligentes Detectadas</h3>
                {weatherData.alerts.map((alert, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-red-50 p-3 rounded-lg border border-red-100">
                    <div>
                      <span className="font-bold text-gray-900">{alert.animal_name}</span>
                      <p className="text-sm text-gray-600">{alert.message}</p>
                    </div>
                    {alert.animal_id && (
                      <button 
                        onClick={() => setSelectedAnimal(alert.animal_id)}
                        className="px-3 py-1.5 bg-white text-red-600 text-xs font-bold rounded-lg border border-red-200 hover:bg-red-50 transition"
                      >
                        Ficha
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-indigo-400 text-sm font-medium italic">
            Presiona "Analizar Clima" para obtener un resumen inteligente.
          </div>
        )}
      </div>


      {!selectedSpeciesId ? (
        /* VISTA 1: SELECCIÓN DE ESPECIE */
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2 mb-6">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" /> Selecciona una Especie
          </h1>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(SPECIES_INFO).map(([id, info]) => {
               const numId = parseInt(id);
               const count = data.observation_animals.filter(a => a.species_id === numId).length + 
                             data.normal_animals.filter(a => a.species_id === numId).length;
               
               return (
                 <button
                   key={id}
                   onClick={() => setSelectedSpeciesId(numId)}
                   className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-indigo-400 hover:shadow-md transition-all flex flex-col items-center gap-3"
                 >
                   <span className="text-5xl">{info.emoji}</span>
                   <span className="text-xl font-bold text-gray-800">{info.name}</span>
                   <span className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{count} pacientes</span>
                 </button>
               )
            })}
          </div>
        </div>
      ) : (
        /* VISTA 2: ANIMALES DE LA ESPECIE SELECCIONADA */
        <div className="animate-fade-in-up">
          <div className="flex items-center gap-4 mb-8">
            <button 
              onClick={() => {
                setSelectedSpeciesId(null);
                setSelectedAnimal(null);
              }}
              className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition flex items-center justify-center"
              title="Volver a especies"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
              <span className="text-4xl">{SPECIES_INFO[selectedSpeciesId].emoji}</span> 
              {SPECIES_INFO[selectedSpeciesId].name}
            </h1>
          </div>

          {/* SECCIÓN EN OBSERVACIÓN */}
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              👀 En Observación
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {obsAnimals.map(animal => (
                <AnimalCard key={animal.id} animal={animal} onSelect={setSelectedAnimal} type="obs" />
              ))}
              {obsAnimals.length === 0 && <p className="text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200">No hay animales en observación.</p>}
            </div>
          </div>

          {/* SECCIÓN NORMALES */}
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              🐾 Animales Activos
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {normalAnimals.map(animal => (
                <AnimalCard key={animal.id} animal={animal} onSelect={setSelectedAnimal} type="normal" />
              ))}
              {normalAnimals.length === 0 && <p className="text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200">No hay animales activos de esta especie.</p>}
            </div>
          </div>
        </div>
      )}

      {/* FICHA DETALLADA MODAL O VISTA ABAJO */}
      {selectedAnimal && (
        <div className="mt-12 pt-8 border-t-2 border-gray-100 animate-fade-in-up">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800">Ficha del Paciente</h3>
            <button onClick={() => setSelectedAnimal(null)} className="text-gray-600 hover:text-gray-900 font-bold bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg transition-colors">
              Cerrar ✕
            </button>
          </div>
          <AnimalHistory animalId={selectedAnimal} />
        </div>
      )}
    </div>
  );
}

function AnimalCard({ animal, onSelect, type }) {
  const isObs = type === "obs";
  return (
    <div 
      onClick={() => onSelect(animal.id)}
      className={`p-5 rounded-2xl cursor-pointer transition-all border shadow-sm hover:shadow-md ${
        isObs ? "bg-amber-50 border-amber-200 hover:bg-amber-100" : "bg-white border-gray-100 hover:border-indigo-100 hover:-translate-y-1"
      }`}
    >
      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <span>{SPECIES_INFO[animal.species_id]?.emoji || "🐾"}</span>
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
