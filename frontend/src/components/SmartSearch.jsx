import { useState } from "react";
import { API_BASE, mediaUrl } from '../lib/api';

export default function SmartSearch() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setResponse("");

    try {
      const res = await fetch(`${API_BASE}/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      setResponse(data.response);
    } catch (error) {
      console.error("Error en la búsqueda:", error);
      setResponse("Hubo un error al conectar con la IA.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-8 rounded-3xl shadow-lg mb-8 text-white max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-2">Búsqueda Inteligente ✨</h2>
      <p className="text-indigo-100 mb-6 font-medium">Hacéle una pregunta al asistente sobre tus animales.</p>
      
      <form onSubmit={handleSearch} className="flex gap-3">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Ej: "¿Cuándo fue la última vez que vomitó Theo?" o "Analizá a Theo"'
          className="flex-1 px-5 py-3 rounded-xl text-gray-900 focus:outline-none focus:ring-4 focus:ring-purple-300 shadow-sm"
        />
        <button 
          type="submit" 
          disabled={loading}
          className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-75"
        >
          {loading ? "Pensando..." : "Preguntar"}
        </button>
      </form>

      {response && (
        <div className="mt-6 p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
          <p className="text-lg leading-relaxed">{response}</p>
        </div>
      )}
    </div>
  );
}
