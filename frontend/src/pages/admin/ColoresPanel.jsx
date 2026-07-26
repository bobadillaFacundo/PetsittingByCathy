import { useState, useEffect } from 'react';
import { Save, RefreshCw, Palette } from 'lucide-react';
import { API_BASE, mediaUrl } from '../../lib/api';

export default function ColoresPanel() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/catalogs/color-rules`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleUpdate = async (id, newKeywords) => {
    setSavingId(id);
    try {
      const res = await fetch(`${API_BASE}/catalogs/color-rules/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ keywords: newKeywords })
      });
      if (res.ok) {
        setRules(rules.map(r => r.id === id ? { ...r, keywords: newKeywords } : r));
        
        // Recalcular alertas
        try {
          await fetch(`${API_BASE}/reports/recalculate-alerts`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          });
        } catch (e) {
          console.error("Error al recalcular alertas", e);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500 font-bold animate-pulse">Cargando configuración...</div>;

  return (
    <div className="max-w-4xl mx-auto pet-section animate-fade-in-up">
      <div className="pet-panel p-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-gray-800 flex items-center gap-2">
            <Palette className="text-indigo-500" /> Configuración de Colores
          </h2>
          <p className="text-gray-500 font-medium mt-1">
            Modifica las palabras clave que pintan las etiquetas de los reportes. Las palabras deben estar separadas por comas.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rules.map(rule => (
          <RuleCard 
            key={rule.id} 
            rule={rule} 
            onSave={(newKeywords) => handleUpdate(rule.id, newKeywords)}
            isSaving={savingId === rule.id}
          />
        ))}
      </div>
    </div>
  );
}

function RuleCard({ rule, onSave, isSaving }) {
  const [value, setValue] = useState(rule.keywords);

  let bgColor = 'bg-gray-50 border-gray-200';
  let textColor = 'text-gray-800';
  let title = 'Regla';

  if (rule.color === 'red') {
    bgColor = 'bg-red-50 border-red-200';
    textColor = 'text-red-800';
    title = rule.match_type === 'exact' ? '🔴 Alertas Rojas (Match Exacto)' : '🔴 Alertas Rojas (Match Parcial)';
  } else if (rule.color === 'yellow') {
    bgColor = 'bg-amber-50 border-amber-200';
    textColor = 'text-amber-800';
    title = rule.match_type === 'exact' ? '🟡 Alertas Amarillas (Match Exacto)' : '🟡 Alertas Amarillas (Match Parcial)';
  }

  return (
    <div className={`p-5 rounded-2xl border shadow-sm ${bgColor} flex flex-col h-full`}>
      <h3 className={`font-bold text-lg mb-2 ${textColor}`}>{title}</h3>
      <p className="text-sm opacity-80 mb-4 h-10">
        {rule.match_type === 'exact' 
          ? 'La palabra en el reporte debe ser exactamente igual a alguna de estas (ej: "no").'
          : 'La palabra en el reporte debe contener alguna de estas (ej: "sangre" dentro de "con sangre").'
        }
      </p>
      
      <textarea
        className="w-full p-3 rounded-xl border border-white/50 bg-white/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-gray-700 resize-none h-32 mb-4"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ej: palabra1, palabra2, palabra3"
      ></textarea>

      <div className="mt-auto flex justify-end">
        <button
          onClick={() => onSave(value)}
          disabled={isSaving || value === rule.keywords}
          className="pet-btn pet-btn--primary px-4 py-2 disabled:bg-gray-400"
        >
          {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
          {isSaving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
