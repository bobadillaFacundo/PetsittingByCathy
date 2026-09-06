import { useEffect, useState } from "react";
import AnimalHistory from "./AnimalHistory";
import AnimalProfileFacts from "../components/AnimalProfileFacts";
import { SPECIES_INFO } from "../lib/animalProfile";
import { API_BASE, apiUrl, mediaUrl } from '../lib/api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weatherData, setWeatherData] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null);

  const fetchData = () => {
    fetch(apiUrl(`/dashboard?t=${Date.now()}`), {
      headers: { 
        "Authorization": `Bearer ${localStorage.getItem("token")}`,
        "Cache-Control": "no-cache"
      }
    })
      .then(async (res) => {
        if (!res.ok) {
          setData(null);
          setLoading(false);
          return;
        }
        const d = await res.json();
        if (!d || !Array.isArray(d.observation_animals) || !Array.isArray(d.normal_animals)) {
          setData(null);
          setLoading(false);
          return;
        }
        setData(d);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setData(null);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchWeather = async () => {
    setLoadingWeather(true);
    try {
      const res = await fetch(`${API_BASE}/dashboard/weather`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) return;
      const d = await res.json();
      setWeatherData(d);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingWeather(false);
    }
  };

  const resolveCriticalAlert = async (alertId) => {
    try {
      await fetch(`${API_BASE}/dashboard/critical-alerts/${alertId}/resolve`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 animate-pulse font-medium">Cargando tablero...</div>;
  if (!data) return <div className="p-8 text-center text-red-500 font-medium">Error al cargar datos del tablero.</div>;

  const obsAnimals = selectedSpeciesId ? data.observation_animals.filter(a => a.species_id === selectedSpeciesId) : [];
  const normalAnimals = selectedSpeciesId ? data.normal_animals.filter(a => a.species_id === selectedSpeciesId) : [];

  const red_alerts = (data.critical_alerts || []).filter(a => a.severity === 'red');
  const yellow_alerts = (data.critical_alerts || []).filter(a => a.severity === 'yellow');
  const health_red_alerts = (data.alerts || []).filter(a => a.severity === 'high');
  const health_yellow_alerts = (data.alerts || []).filter(a => a.severity !== 'high');

  return (
    <div className="max-w-5xl mx-auto pet-section">

      {/* ALERTAS ROJAS (palabras clave rojas) — fijadas hasta resolver */}
      {red_alerts.length > 0 && (
        <div className="pet-alert-panel bg-red-600 border-2 border-red-700 animate-fade-in-up">
          <h2 className="text-xl font-black text-white flex items-center gap-2 mb-4">
            🚨 Alertas Rojas — Atención Inmediata
          </h2>
          <div className="space-y-3">
            {red_alerts.map((alert) => (
              <div key={alert.id} className="pet-alert-item flex items-start justify-between gap-4 border border-red-200">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔴</span>
                  <div>
                    <div className="font-black text-red-900 text-lg">{alert.animal_name}</div>
                    <div className="text-sm text-red-800 mt-1">{alert.message}</div>
                    <div className="text-xs text-red-600 mt-1 font-medium">
                      Palabra detectada: "{alert.keyword_detected}" · {new Date(alert.created_at).toLocaleString('es-ES')}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedAnimal(alert.animal_id)}
                    className="pet-btn pet-btn--ghost px-3 py-1.5 text-xs text-red-700 border-red-300 bg-red-50 hover:bg-red-100"
                  >
                    Ver Ficha
                  </button>
                  <button
                    onClick={() => resolveCriticalAlert(alert.id)}
                    className="pet-btn pet-btn--primary px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700"
                  >
                    ✓ Marcar Resuelta
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ALERTAS AMARILLAS (palabras clave amarillas) — fijadas hasta resolver */}
      {yellow_alerts.length > 0 && (
        <div className="pet-alert-panel bg-amber-500 border-2 border-amber-600 animate-fade-in-up">
          <h2 className="text-xl font-black text-white flex items-center gap-2 mb-4">
            🟡 Alertas Amarillas — Observación
          </h2>
          <div className="space-y-3">
            {yellow_alerts.map((alert) => (
              <div key={alert.id} className="pet-alert-item flex items-start justify-between gap-4 border border-amber-200">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <div className="font-black text-amber-900 text-lg">{alert.animal_name}</div>
                    <div className="text-sm text-amber-800 mt-1">{alert.message}</div>
                    <div className="text-xs text-amber-600 mt-1 font-medium">
                      Palabra detectada: "{alert.keyword_detected}" · {new Date(alert.created_at).toLocaleString('es-ES')}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedAnimal(alert.animal_id)}
                    className="pet-btn pet-btn--ghost px-3 py-1.5 text-xs text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
                  >
                    Ver Ficha
                  </button>
                  <button
                    onClick={() => resolveCriticalAlert(alert.id)}
                    className="pet-btn pet-btn--primary px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700"
                  >
                    ✓ Marcar Resuelta
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* ALERTAS DE SALUD (Vacunas y Desparasitación) */}
      {health_red_alerts.length > 0 && (
        <div className="pet-card bg-red-50 border-red-200 animate-fade-in-up">
          <h2 className="text-xl font-bold text-red-800 flex items-center gap-2 mb-4">
            🚨 Alertas de Salud Urgentes
          </h2>
          <div className="pet-animal-grid md:grid-cols-2 lg:grid-cols-3">
            {health_red_alerts.map((alert, idx) => (
              <div key={idx} className="pet-alert-item p-4 border flex items-start gap-3 border-red-200 text-red-900">
                <div className="text-2xl mt-0.5">🚨</div>
                <div>
                  <div className="font-bold leading-tight">{alert.animal_name}</div>
                  <div className="text-sm opacity-90 mt-1 leading-snug">{alert.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {health_yellow_alerts.length > 0 && (
        <div className="pet-card bg-yellow-50 border-yellow-200 animate-fade-in-up">
          <h2 className="text-xl font-bold text-yellow-800 flex items-center gap-2 mb-4">
            ⚠️ Alertas de Salud y Vacunación
          </h2>
          <div className="pet-animal-grid md:grid-cols-2 lg:grid-cols-3">
            {health_yellow_alerts.map((alert, idx) => (
              <div key={idx} className="pet-alert-item p-4 border flex items-start gap-3 border-yellow-200 text-yellow-900">
                <div className="text-2xl mt-0.5">💉</div>
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
      <div className="pet-card bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-100">
        <div className="flex justify-between items-start gap-4 mb-4">
          <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
            🌤️ El Clima de Hoy
          </h2>
          <button 
            onClick={fetchWeather}
            disabled={loadingWeather}
            className="pet-btn pet-btn--primary px-4 py-2 text-sm shrink-0"
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
                        className="pet-btn pet-btn--ghost px-3 py-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50 shrink-0"
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
          <div className="pet-species-grid">
            {Object.entries(SPECIES_INFO).map(([id, info]) => {
               const numId = parseInt(id);
               const count = data.observation_animals.filter(a => a.species_id === numId).length + 
                             data.normal_animals.filter(a => a.species_id === numId).length;
               
               return (
                 <button
                   key={id}
                   type="button"
                   onClick={() => setSelectedSpeciesId(numId)}
                   className="pet-species-tile"
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
              type="button"
              onClick={() => {
                setSelectedSpeciesId(null);
                setSelectedAnimal(null);
              }}
              className="pet-btn pet-btn--ghost p-2.5 rounded-full"
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
            <div className="pet-animal-grid">
              {obsAnimals.map(animal => (
                <AnimalCard key={animal.id} animal={animal} onSelect={setSelectedAnimal} type="obs" />
              ))}
              {obsAnimals.length === 0 && <p className="text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200 col-span-full">No hay animales en observación.</p>}
            </div>
          </div>

          {/* SECCIÓN NORMALES */}
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              🐾 Animales Activos
            </h2>
            <div className="pet-animal-grid">
              {normalAnimals.map(animal => (
                <AnimalCard key={animal.id} animal={animal} onSelect={setSelectedAnimal} type="normal" />
              ))}
              {normalAnimals.length === 0 && <p className="text-gray-500 italic bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200 col-span-full">No hay animales activos de esta especie.</p>}
            </div>
          </div>
        </div>
      )}

      {/* FICHA DETALLADA MODAL O VISTA ABAJO */}
      {selectedAnimal && (
        <div className="mt-12 pt-8 border-t-2 border-gray-100 animate-fade-in-up">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-800">Ficha del Paciente</h3>
            <button type="button" onClick={() => setSelectedAnimal(null)} className="pet-btn pet-btn--ghost px-4 py-2">
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
    <button
      type="button"
      onClick={() => onSelect(animal.id)}
      className={`pet-card pet-card--interactive p-5 text-left w-full ${
        isObs ? "bg-yellow-100 border-yellow-300 hover:bg-yellow-50" : ""
      }`}
    >
      <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <span>{SPECIES_INFO[animal.species_id]?.emoji || "🐾"}</span>
        {animal.name}
      </h3>
      <AnimalProfileFacts animal={animal} compact />
      <span className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
        isObs ? "bg-yellow-300 text-yellow-900" : "bg-green-100 text-green-700"
      }`}>
        {isObs ? "En Observación" : "Normal"}
      </span>
    </button>
  );
}
