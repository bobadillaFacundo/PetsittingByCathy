import { useState, useEffect } from 'react';
import { BookOpen, RefreshCw, AlertCircle } from 'lucide-react';

export default function DiccionarioPanel() {
  const [dictionary, setDictionary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const token = localStorage.getItem('token');

  const fetchDictionary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('https://petsittingbycathy.onrender.com/dashboard/dictionary', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar el diccionario');
      const data = await res.json();
      setDictionary(data);
    } catch (err) {
      console.error(err);
      setError('No se pudo cargar el diccionario de palabras.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDictionary();
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600">
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Diccionario de la IA</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">Palabras y frases que el sistema ha aprendido automáticamente</p>
          </div>
        </div>
        <button 
          onClick={fetchDictionary}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 rounded-xl font-medium transition-all shadow-sm"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <RefreshCw size={32} className="animate-spin mb-4 text-indigo-300" />
            <p className="font-medium text-sm">Cargando vocabulario...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 font-medium border border-red-100">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        ) : dictionary.length === 0 ? (
          <div className="text-center py-12 text-gray-400 font-medium">
            No hay palabras registradas en el diccionario.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {dictionary.map(tag => (
              <div key={tag.id} className="border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-200 transition-colors shadow-sm">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="font-bold text-gray-800 text-lg">{tag.name}</h3>
                  <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                    {tag.variants.length} variantes
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap gap-2">
                    {tag.variants.map((variant, index) => (
                      <span 
                        key={index} 
                        className="bg-white border border-gray-200 text-gray-600 text-sm px-3 py-1.5 rounded-lg shadow-sm hover:border-indigo-300 hover:text-indigo-600 cursor-default transition-colors"
                      >
                        {variant}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
