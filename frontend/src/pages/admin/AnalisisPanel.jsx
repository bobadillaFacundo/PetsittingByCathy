import { useState, useEffect } from 'react';
import { Activity, Play, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../../services/api';

export default function AnalisisPanel() {
  const [animals, setAnimals] = useState([]);
  const [loadingAnimals, setLoadingAnimals] = useState(true);
  const [analyses, setAnalyses] = useState({}); // { animal_id: { loading: boolean, data: string, error: string } }
  
  useEffect(() => {
    fetchAnimals();
  }, []);

  const fetchAnimals = async () => {
    try {
      setLoadingAnimals(true);
      const res = await api.get('/animals/');
      const activeAnimals = res.data.filter(a => a.is_active);
      setAnimals(activeAnimals);
      // Generar análisis automáticamente de todos al cargar
      generateAll(activeAnimals);
    } catch (error) {
      console.error("Error al cargar mascotas:", error);
    } finally {
      setLoadingAnimals(false);
    }
  };

  const generateAnalysis = async (animalId, currentAnalyses) => {
    // Usamos el estado actual si se provee, o una función de actualización funcional
    setAnalyses(prev => ({
      ...prev,
      [animalId]: { loading: true, data: null, error: null }
    }));

    try {
      const res = await api.get(`/animals/${animalId}/evolution-analysis`);
      setAnalyses(prev => ({
        ...prev,
        [animalId]: { loading: false, data: res.data.analysis, error: null }
      }));
    } catch (error) {
      console.error(`Error generando análisis para ${animalId}:`, error);
      setAnalyses(prev => ({
        ...prev,
        [animalId]: { loading: false, data: null, error: 'Ocurrió un error al generar el análisis. Revisa la consola.' }
      }));
    }
  };

  const generateAll = async (animalList = animals) => {
    // Lanzar todas las peticiones en paralelo para que sea más rápido
    const promises = animalList.map(animal => {
      // Solo lanzamos si no está cargando ni tiene datos
      return generateAnalysis(animal.id);
    });
    await Promise.all(promises);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="text-indigo-600" /> Análisis de Evolución IA
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Genera un reporte del estado de cada mascota basado en sus últimos reportes usando Inteligencia Artificial.
          </p>
        </div>
        <button
          onClick={generateAll}
          disabled={loadingAnimals || animals.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          <Play size={16} /> Generar Todos
        </button>
      </div>

      {loadingAnimals ? (
        <div className="flex justify-center items-center py-12">
          <RefreshCw className="animate-spin text-indigo-500" size={32} />
        </div>
      ) : animals.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
          No hay mascotas activas para analizar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {animals.map((animal) => {
            const state = analyses[animal.id] || { loading: false, data: null, error: null };
            
            return (
              <div key={animal.id} className="border border-gray-200 rounded-xl p-5 hover:border-indigo-200 transition-colors bg-gray-50/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg shrink-0">
                      {animal.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 leading-tight">{animal.name}</h4>
                      <span className="text-xs text-gray-500 font-medium">ID: {animal.id}</span>
                    </div>
                  </div>
                  
                  {!state.data && !state.loading && (
                    <button
                      onClick={() => generateAnalysis(animal.id)}
                      className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                    >
                      Analizar
                    </button>
                  )}
                </div>

                <div className="mt-2 min-h-[60px]">
                  {state.loading ? (
                    <div className="flex items-center gap-2 text-indigo-600 text-sm font-medium py-3">
                      <RefreshCw className="animate-spin" size={16} />
                      <span className="animate-pulse">Analizando historial con IA...</span>
                    </div>
                  ) : state.error ? (
                    <div className="flex gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <p>{state.error}</p>
                    </div>
                  ) : state.data ? (
                    <div className="text-sm text-gray-700 bg-white p-4 rounded-lg border border-indigo-100 shadow-sm relative">
                      <CheckCircle2 size={16} className="text-emerald-500 absolute top-3 right-3" />
                      <p className="pr-6 whitespace-pre-wrap">{state.data}</p>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 italic text-center py-3">
                      Haz clic en Analizar para evaluar su evolución.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
