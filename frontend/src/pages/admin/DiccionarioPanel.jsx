import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen, RefreshCw, AlertCircle, Plus, X, Save, Search, Pencil,
} from 'lucide-react';
import { API_BASE } from '../../lib/api';

const PREVIEW_COUNT = 4;

export default function DiccionarioPanel() {
  const [dictionary, setDictionary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [activeTagId, setActiveTagId] = useState(null);
  const [draftWords, setDraftWords] = useState([]);
  const [modalQuery, setModalQuery] = useState('');
  const [newWord, setNewWord] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [modalError, setModalError] = useState('');

  const token = localStorage.getItem('token');
  const activeTag = dictionary.find((t) => t.id === activeTagId) || null;

  const fetchDictionary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${API_BASE}/dashboard/dictionary`, {
        headers: { Authorization: `Bearer ${token}` },
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

  useEffect(() => {
    if (!activeTagId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activeTagId]);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dictionary;
    return dictionary.filter((tag) => {
      if (tag.name.toLowerCase().includes(q)) return true;
      return (tag.variants || []).some((v) => v.toLowerCase().includes(q));
    });
  }, [dictionary, query]);

  const filteredDraftWords = useMemo(() => {
    const q = modalQuery.trim().toLowerCase();
    if (!q) return draftWords;
    return draftWords.filter((v) => v.toLowerCase().includes(q));
  }, [draftWords, modalQuery]);

  const isDirty = useMemo(() => {
    if (!activeTag) return false;
    const original = activeTag.variants || [];
    if (draftWords.length !== original.length) return true;
    const a = [...draftWords].map((v) => v.toLowerCase()).sort();
    const b = [...original].map((v) => v.toLowerCase()).sort();
    return a.some((v, i) => v !== b[i]);
  }, [activeTag, draftWords]);

  const openModal = (tag) => {
    setActiveTagId(tag.id);
    setDraftWords([...(tag.variants || [])]);
    setModalQuery('');
    setNewWord('');
    setModalError('');
    setFeedback('');
  };

  const closeModal = () => {
    if (isDirty && !window.confirm('Hay cambios sin guardar. ¿Cerrar igual?')) return;
    setActiveTagId(null);
    setDraftWords([]);
    setModalQuery('');
    setNewWord('');
    setModalError('');
  };

  const addWord = () => {
    const raw = newWord.trim().toLowerCase();
    if (!raw) return;
    if (draftWords.some((v) => v.toLowerCase() === raw)) {
      setModalError(`"${raw}" ya está en este diccionario.`);
      return;
    }
    setDraftWords((prev) => [...prev, raw].sort((x, y) => x.localeCompare(y, 'es')));
    setNewWord('');
    setModalError('');
  };

  const removeWord = (word) => {
    setDraftWords((prev) => prev.filter((v) => v !== word));
    setModalError('');
  };

  const saveTag = async () => {
    if (!activeTag) return;
    setSaving(true);
    setModalError('');
    try {
      const res = await fetch(`${API_BASE}/catalogs/tagsets/${activeTag.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ variants: draftWords.join(', ') }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || 'No se pudo guardar');
      }
      const updated = await res.json();
      setDictionary((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setDraftWords([...(updated.variants || [])]);
      setFeedback(
        `Guardado: ${updated.name} (${updated.variants.length} variantes). El análisis ya las usará.`
      );
      setActiveTagId(null);
    } catch (err) {
      console.error(err);
      setModalError(err.message || 'Error al guardar el diccionario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pet-panel overflow-hidden animate-fade-in-up">
      <div className="pet-panel-header">
        <div className="flex items-center gap-3 min-w-0">
          <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600 shrink-0">
            <BookOpen size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-gray-800">Diccionario de la IA</h2>
            <p className="text-sm text-gray-500 font-medium mt-1">
              Tocá un conjunto para editarlo. Ej: agregá <span className="font-semibold text-gray-700">kaka</span> en Caca.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchDictionary}
          disabled={loading}
          className="pet-btn pet-btn--secondary px-4 py-2 text-sm shrink-0"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="pet-panel-body space-y-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            className="pet-input w-full pl-9 text-sm"
            placeholder="Buscar conjunto o palabra (ej: caca, kaka, morfó)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {feedback && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 font-medium">
            {feedback}
          </div>
        )}

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
        ) : filteredTags.length === 0 ? (
          <div className="text-center py-12 text-gray-400 font-medium">
            {query ? 'No hay coincidencias para esa búsqueda.' : 'No hay palabras registradas.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredTags.map((tag) => {
              const words = tag.variants || [];
              const preview = words.slice(0, PREVIEW_COUNT);
              const extra = Math.max(0, words.length - preview.length);
              const q = query.trim().toLowerCase();
              const matchedWord =
                q && !tag.name.toLowerCase().includes(q)
                  ? words.find((v) => v.toLowerCase().includes(q))
                  : null;

              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => openModal(tag)}
                  className="text-left rounded-2xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md transition-all p-4 group"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900 truncate">{tag.name}</h3>
                        {tag.is_required && (
                          <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                            Obligatorio
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {words.length} variante{words.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="p-1.5 rounded-lg text-gray-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 shrink-0">
                      <Pencil size={15} />
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {preview.length === 0 ? (
                      <span className="text-xs text-gray-400">Sin variantes</span>
                    ) : (
                      preview.map((v) => (
                        <span
                          key={v}
                          className="text-xs bg-gray-50 border border-gray-100 text-gray-600 px-2 py-0.5 rounded-md truncate max-w-[7rem]"
                        >
                          {v}
                        </span>
                      ))
                    )}
                    {extra > 0 && (
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        +{extra} más
                      </span>
                    )}
                  </div>

                  {matchedWord && (
                    <p className="mt-2 text-xs text-indigo-700 font-medium truncate">
                      Coincide: “{matchedWord}”
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {activeTag &&
        createPortal(
          <div
            className="modal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div className="modal-overlay-inner">
              <div className="modal-sheet max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
                <div className="pet-modal-header">
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg text-gray-800 truncate">
                      {activeTag.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {draftWords.length} variante{draftWords.length === 1 ? '' : 's'}
                      {isDirty ? ' · cambios sin guardar' : ''}
                    </p>
                  </div>
                  <button type="button" onClick={closeModal} className="pet-modal-close">
                    <X size={20} />
                  </button>
                </div>

                <div className="flex flex-col max-h-[75vh]">
                  <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 pt-4 pb-3 space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">
                      Buscador
                    </label>
                    <div className="relative">
                      <Search
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500"
                      />
                      <input
                        type="search"
                        className="pet-input w-full text-sm"
                        style={{ paddingLeft: '2.5rem' }}
                        placeholder={`Buscar en ${activeTag.name}…`}
                        value={modalQuery}
                        onChange={(e) => setModalQuery(e.target.value)}
                        autoFocus
                      />
                      {modalQuery && (
                        <button
                          type="button"
                          onClick={() => setModalQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-700"
                          title="Limpiar búsqueda"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Mostrando {filteredDraftWords.length} de {draftWords.length}
                    </p>
                  </div>

                  <div className="px-5 py-4 space-y-4 overflow-y-auto scroll-touch flex-1">
                  <div className="flex flex-wrap gap-2 min-h-[3rem] p-3 rounded-xl bg-gray-50 border border-gray-100">
                    {filteredDraftWords.length === 0 ? (
                      <span className="text-sm text-gray-400">
                        {modalQuery ? 'Sin coincidencias.' : 'Sin variantes todavía.'}
                      </span>
                    ) : (
                      filteredDraftWords.map((variant) => (
                        <span
                          key={variant}
                          className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 text-sm pl-3 pr-1.5 py-1 rounded-lg shadow-sm"
                        >
                          {variant}
                          <button
                            type="button"
                            onClick={() => removeWord(variant)}
                            className="p-0.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title={`Quitar "${variant}"`}
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="pet-input flex-1 text-sm"
                      placeholder={`Agregar palabra a ${activeTag.name} (ej: kaka)`}
                      value={newWord}
                      onChange={(e) => setNewWord(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addWord();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={addWord}
                      className="pet-btn pet-btn--secondary px-3 py-2"
                      title="Agregar palabra"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {modalError && (
                    <div className="text-sm text-red-600 font-medium">{modalError}</div>
                  )}
                  </div>

                  <div className="px-5 py-4 border-t border-gray-100 flex gap-3 bg-white">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="pet-btn pet-btn--ghost flex-1 px-4 py-3 font-bold"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={saveTag}
                      disabled={!isDirty || saving}
                      className="pet-btn pet-btn--primary flex-1 px-4 py-3 font-bold disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}
                      {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
