import { useState, useRef, useEffect } from "react";
import { redirectToLogin } from "../lib/auth";

const SPECIES_INFO = {
  1: { name: "Perros", emoji: "🐶" },
  2: { name: "Gatos", emoji: "🐱" },
  3: { name: "Loros", emoji: "🦜" },
  4: { name: "Conejos", emoji: "🐰" },
  5: { name: "Tortugas", emoji: "🐢" },
  6: { name: "Erizos", emoji: "🦔" }
};

const ROUTINE_EVENTS = ["Comida", "Agua", "Pis", "Caca"];

function isRoutineEvent(insert) {
  if (!insert || insert.table_name !== "ReportEvent") return false;
  const name = (insert.fields?.event_type_name || "").toLowerCase();
  return ROUTINE_EVENTS.some(r => r.toLowerCase() === name);
}

function ensureRoutineFields(extractedData, fallbackAnimalName) {
  let data = Array.isArray(extractedData) ? extractedData.map(a => ({
    ...a,
    inserts: Array.isArray(a.inserts) ? [...a.inserts] : [],
  })) : [];

  if (data.length === 0) {
    data = [{ animal: fallbackAnimalName || "", inserts: [], severity: "normal" }];
  }

  return data.map(animalData => {
    const inserts = [...(animalData.inserts || [])];
    const otherInserts = inserts.filter(ins => !isRoutineEvent(ins));
    const routineInserts = ROUTINE_EVENTS.map(name => {
      const existing = inserts.find(
        ins =>
          ins.table_name === "ReportEvent" &&
          (ins.fields?.event_type_name || "").toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        return {
          ...existing,
          fields: {
            event_type_name: name,
            value: existing.fields?.value ?? "",
          },
        };
      }
      return {
        table_name: "ReportEvent",
        fields: { event_type_name: name, value: "" },
      };
    });
    return {
      ...animalData,
      inserts: [...routineInserts, ...otherInserts],
    };
  });
}

function cleanExtractedDataForSave(extractedData) {
  return (extractedData || []).map(animalData => ({
    ...animalData,
    inserts: (animalData.inserts || []).filter(ins => {
      if (ins.table_name !== "ReportEvent") return true;
      const val = ins.fields?.value;
      return val !== null && val !== undefined && String(val).trim() !== "";
    }),
  }));
}

export default function VoiceRecorder({ onSave }) {
  const [animals, setAnimals] = useState([]);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [editableData, setEditableData] = useState(null);
  const [editableTranscript, setEditableTranscript] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pendingReports, setPendingReports] = useState(0);
  const [attachedMedia, setAttachedMedia] = useState([]);
  const [observationDraft, setObservationDraft] = useState("");
  const galleryInputRef = useRef(null);
  const cameraPhotoRef = useRef(null);
  const cameraVideoRef = useRef(null);
  
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  useEffect(() => {
    checkPending();
    window.addEventListener('online', checkPending);
    
    fetch(`https://petsittingbycathy.onrender.com/animals/?t=${Date.now()}`, {
      headers: { 
        "Authorization": `Bearer ${localStorage.getItem("token")}`,
        "Cache-Control": "no-cache"
      }
    })
      .then(res => res.json())
      .then(data => setAnimals(data))
      .catch(err => console.error("Error fetching animals:", err));
      
    return () => window.removeEventListener('online', checkPending);
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = sendAudioForAnalysis;
      
      mediaRecorder.current.start();
      setIsRecording(true);
      setSaveSuccess(false);
    } catch (err) {
      console.error("Error accediendo al micrófono:", err);
      alert("No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      // Apagar el hardware del micrófono
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const sendAudioForAnalysis = async () => {
    if (!selectedAnimal) {
      alert("Por favor, selecciona un paciente primero.");
      return;
    }
    const audioBlob = new Blob(audioChunks.current);
    const formData = new FormData();
    formData.append("audio_file", audioBlob, "reporte.webm");
    formData.append("animal_name", selectedAnimal.name);
    
    try {
      const response = await fetch(`https://petsittingbycathy.onrender.com/reports/analyze-voice`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: formData,
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          alert("Tu sesión ha expirado o no tienes permisos. Por favor, inicia sesión nuevamente.");
          redirectToLogin();
          return;
        }
        throw new Error("Error en el servidor al analizar el audio.");
      }

      const data = await response.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setAnalysisResult(data);
      setEditableData(ensureRoutineFields(data.extracted_data, selectedAnimal?.name));
      setEditableTranscript(data.transcript);
      setObservationDraft(data.transcript || "");
      setCurrentStep(0);
    } catch (error) {
      console.error("Error analizando el audio:", error);
      if (!navigator.onLine || error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
        // Save offline
        try {
          const { set } = await import('idb-keyval');
          const key = `offline_report_${Date.now()}`;
          await set(key, { animal_name: selectedAnimal.name, audioBlob });
          alert("Estás sin conexión o hubo un error de red. El reporte se ha guardado en el celular y podrás sincronizarlo luego.");
          checkPending();
          setSaveSuccess(true);
          setSelectedAnimal(null);
        } catch(idbErr) {
          console.error("No se pudo guardar localmente:", idbErr);
          alert("Error crítico: no hay conexión y el dispositivo no permite guardar el reporte localmente.");
        }
      } else {
        alert("Hubo un error procesando el reporte. Por favor, intenta de nuevo.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const checkPending = async () => {
    try {
      const { keys } = await import('idb-keyval');
      const k = await keys();
      const pending = k.filter(key => key.toString().startsWith('offline_report_')).length;
      setPendingReports(pending);
    } catch (err) {
      console.error("Error checking pending reports", err);
    }
  };

  const syncOfflineReports = async () => {
    if (!navigator.onLine) {
      alert("Sigues sin conexión. Conéctate a una red primero.");
      return;
    }
    
    setIsProcessing(true);
    try {
      const { keys, get, del } = await import('idb-keyval');
      const allKeys = await keys();
      const offlineKeys = allKeys.filter(k => k.toString().startsWith('offline_report_'));
      
      let successCount = 0;
      
      for (const key of offlineKeys) {
        const item = await get(key);
        const formData = new FormData();
        formData.append("audio_file", item.audioBlob, "reporte_offline.webm");
        formData.append("animal_name", item.animal_name);
        
        try {
          const response = await fetch(`https://petsittingbycathy.onrender.com/reports/analyze-and-confirm-batch`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
            body: formData,
          });
          
          if (response.ok) {
            await del(key);
            successCount++;
          } else {
            console.error(`Failed to sync ${key}`);
          }
        } catch (err) {
          console.error(`Network error syncing ${key}`, err);
        }
      }
      
      if (successCount > 0) {
        alert(`¡Se sincronizaron ${successCount} reportes correctamente!`);
      } else {
        alert("No se pudo sincronizar ningún reporte. Revisa la conexión o contacta a soporte.");
      }
      
      checkPending();
      if (onSave) onSave();
    } catch (err) {
      console.error("Error en sincronización", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmAndSave = async () => {
    setIsProcessing(true);
    const payload = {
      user_id: 1,
      transcript: editableTranscript,
      extracted_data: cleanExtractedDataForSave(editableData)
    };

    try {
      const response = await fetch(`https://petsittingbycathy.onrender.com/reports/confirm`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        const result = await response.json();
        const savedReports = result.saved_reports || [];

        // Subir fotos/videos adjuntos a cada reporte guardado
        if (attachedMedia.length > 0 && savedReports.length > 0) {
          for (const saved of savedReports) {
            const formData = new FormData();
            attachedMedia.forEach((file) => formData.append("files", file));
            const obsId = saved.observation_ids?.[0];
            const params = obsId ? `?observation_id=${obsId}` : "";
            const uploadRes = await fetch(
              `https://petsittingbycathy.onrender.com/reports/${saved.report_id}/attach-media${params}`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                body: formData,
              }
            );
            if (!uploadRes.ok) {
              console.error("Error subiendo media al reporte", saved.report_id);
            }
          }
        }

        setAnalysisResult(null);
        setEditableData(null);
        setAttachedMedia([]);
        setSaveSuccess(true);
        setSelectedAnimal(null);
        if (onSave) onSave();
      } else {
        alert("Error al confirmar el guardado.");
      }
    } catch (error) {
      console.error("Error guardando:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMediaSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (valid.length > 0) {
      setAttachedMedia((prev) => [...prev, ...valid]);
    }
    e.target.value = "";
  };

  const removeMedia = (index) => {
    setAttachedMedia((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 flex flex-col items-center relative">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Reporte Diario Dinámico</h2>
      
      {pendingReports > 0 && (
        <div className="bg-yellow-50 w-full p-4 mb-6 rounded-xl border border-yellow-200 flex flex-col sm:flex-row justify-between items-center gap-4 animate-fade-in-up">
          <div className="flex items-center gap-3 text-yellow-800">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-bold text-sm">Modo Sin Conexión Activo</p>
              <p className="text-xs">Tienes {pendingReports} {pendingReports === 1 ? 'reporte pendiente' : 'reportes pendientes'} de enviar a la IA.</p>
            </div>
          </div>
          <button 
            onClick={syncOfflineReports} 
            disabled={isProcessing}
            className="w-full sm:w-auto bg-yellow-500 text-white px-5 py-2 rounded-lg hover:bg-yellow-600 font-bold transition disabled:opacity-50"
          >
            {isProcessing ? "Enviando..." : "Sincronizar Ahora"}
          </button>
        </div>
      )}
      
      {!selectedAnimal ? (
        <div className="w-full">
          {!selectedSpeciesId ? (
             <div className="animate-fade-in-up">
               <p className="text-center text-gray-600 font-medium mb-4">Paso 1: Selecciona la especie</p>
               <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                 {Object.entries(SPECIES_INFO).map(([id, info]) => {
                   const numId = parseInt(id);
                   const count = animals.filter(a => a.species_id === numId).length;
                   return (
                     <button
                       key={id}
                       onClick={() => setSelectedSpeciesId(numId)}
                       className="p-4 bg-white border border-gray-200 rounded-xl hover:border-indigo-400 hover:shadow-md transition-all flex flex-col items-center gap-2"
                     >
                       <span className="text-4xl">{info.emoji}</span>
                       <span className="font-bold text-gray-800">{info.name}</span>
                       <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{count} pacientes</span>
                     </button>
                   );
                 })}
               </div>
             </div>
          ) : (
             <div className="animate-fade-in-up">
               <div className="flex items-center gap-3 mb-4 justify-center relative">
                 <button 
                   onClick={() => setSelectedSpeciesId(null)}
                   className="absolute left-0 p-1.5 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition"
                   title="Volver"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                   </svg>
                 </button>
                 <p className="text-center text-gray-600 font-medium m-0">Paso 2: Selecciona el paciente</p>
               </div>
               
               <div className="flex flex-wrap justify-center gap-3 max-h-64 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-indigo-200">
                 {animals.filter(a => a.species_id === selectedSpeciesId).map((animal) => (
                   <button
                     key={animal.id}
                     onClick={() => {
                       setSelectedAnimal(animal);
                       setSaveSuccess(false);
                       setAnalysisResult(null);
                     }}
                     className="px-5 py-3 bg-white border-2 border-indigo-50 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3 w-[45%] sm:w-[30%] min-w-[140px]"
                   >
                     <span className="text-2xl">{SPECIES_INFO[animal.species_id]?.emoji || "🐾"}</span>
                     <span className="font-bold text-gray-800 text-base truncate">{animal.name}</span>
                   </button>
                 ))}
                 {animals.filter(a => a.species_id === selectedSpeciesId).length === 0 && <p className="text-sm text-gray-500 text-center w-full mt-3">No hay pacientes registrados de esta especie.</p>}
               </div>
             </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center w-full animate-fadeIn">
          <div className="flex items-center gap-4 mb-6 bg-indigo-50 px-6 py-3 rounded-full border border-indigo-100">
            <span className="text-indigo-800 font-semibold">Paciente seleccionado: <span className="font-bold text-xl ml-1">{selectedAnimal.name}</span></span>
            <button 
              onClick={() => setSelectedAnimal(null)}
              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-medium"
            >
              Cambiar
            </button>
          </div>

          <p className="text-center text-gray-600 font-medium mb-4">Paso 2: Toca para grabar, toca para detener</p>
          <button 
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-lg ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 scale-110 shadow-red-200 animate-pulse' 
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
            }`}
          >
            <span className="text-4xl mb-2">🎙️</span>
            <span className="text-white font-medium text-sm">
              {isRecording ? "Detener" : "Grabar"}
            </span>
          </button>

          {/* Adjuntar fotos y videos */}
          <div className="mt-6 w-full max-w-sm space-y-2">
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleMediaSelect}
            />
            <input
              ref={cameraPhotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleMediaSelect}
            />
            <input
              ref={cameraVideoRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={handleMediaSelect}
            />
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => cameraPhotoRef.current?.click()}
                className="w-full py-3 px-4 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 text-gray-700 font-medium"
              >
                <span className="text-2xl">📸</span>
                Tomar foto
              </button>
              <button
                type="button"
                onClick={() => cameraVideoRef.current?.click()}
                className="w-full py-3 px-4 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 text-gray-700 font-medium"
              >
                <span className="text-2xl">🎥</span>
                Grabar video
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="w-full py-3 px-4 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 text-gray-700 font-medium"
              >
                <span className="text-2xl">🖼️</span>
                Subir desde galería (varios)
              </button>
            </div>
            {attachedMedia.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {attachedMedia.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="relative group">
                    {file.type.startsWith("video/") ? (
                      <video
                        src={URL.createObjectURL(file)}
                        className="w-20 h-20 object-cover rounded-lg border border-gray-200 shadow-sm bg-black"
                      />
                    ) : (
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Adjunto ${idx + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border border-gray-200 shadow-sm"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMedia(idx)}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {attachedMedia.length > 0 && (
              <p className="text-xs text-gray-500 text-center mt-2">
                {attachedMedia.length}{" "}
                {attachedMedia.length === 1 ? "archivo adjunto" : "archivos adjuntos"} — se guardarán con el reporte
              </p>
            )}
          </div>
        </div>
      )}

      {isProcessing && (
        <p className="mt-4 text-indigo-600 font-medium animate-pulse">
          Procesando...
        </p>
      )}

      {saveSuccess && (
        <div className="mt-6 p-4 bg-green-50 rounded-lg w-full max-w-md border border-green-100 text-center text-green-700 font-medium">
          ✅ ¡Reporte guardado con éxito!
        </div>
      )}

      {/* Modal de Confirmación */}
      {analysisResult && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90dvh] pb-safe sm:pb-0">
            <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex flex-col gap-2">
              <h3 className="text-xl font-bold text-indigo-900">Verificar Datos Extraídos</h3>
              <label className="text-xs font-semibold text-indigo-700 uppercase">Texto interpretado del audio (Editable):</label>
              <textarea 
                className="w-full bg-white border border-indigo-200 rounded-lg p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm resize-y"
                rows="3"
                value={editableTranscript}
                onChange={(e) => setEditableTranscript(e.target.value)}
              />
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {(() => {
                if (!editableData || editableData.length === 0) {
                  return <p className="text-gray-500 italic text-sm">No hay datos para confirmar.</p>;
                }

                const i = Math.min(currentStep, editableData.length - 1);
                const animalData = editableData[i];
                const inserts = animalData.inserts || [];
                const routineInserts = ROUTINE_EVENTS.map(name => {
                  const idx = inserts.findIndex(
                    ins =>
                      ins.table_name === "ReportEvent" &&
                      (ins.fields?.event_type_name || "").toLowerCase() === name.toLowerCase()
                  );
                  return { name, idx, insert: idx >= 0 ? inserts[idx] : null };
                });
                const otherInserts = inserts
                  .map((ins, idx) => ({ ins, idx }))
                  .filter(({ ins }) => !isRoutineEvent(ins));

                const updateRoutineValue = (eventName, value) => {
                  const newData = [...editableData];
                  const list = [...(newData[i].inserts || [])];
                  const found = list.findIndex(
                    ins =>
                      ins.table_name === "ReportEvent" &&
                      (ins.fields?.event_type_name || "").toLowerCase() === eventName.toLowerCase()
                  );
                  if (found >= 0) {
                    list[found] = {
                      ...list[found],
                      fields: { ...list[found].fields, event_type_name: eventName, value },
                    };
                  } else {
                    list.push({
                      table_name: "ReportEvent",
                      fields: { event_type_name: eventName, value },
                    });
                  }
                  newData[i] = { ...newData[i], inserts: list };
                  setEditableData(newData);
                };

                return (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">
                        Paciente {i + 1} de {editableData.length}
                      </span>
                    </div>

                    <div className="mb-6 space-y-5">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <span className="text-xl">{SPECIES_INFO[selectedAnimal?.species_id]?.emoji || "🐾"}</span>
                        <input
                          type="text"
                          className="font-bold text-lg text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-500 focus:outline-none transition-colors w-full"
                          value={animalData.animal}
                          onChange={(e) => {
                            const newData = [...editableData];
                            newData[i].animal = e.target.value;
                            setEditableData(newData);
                          }}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-bold text-gray-800">Rutina diaria</h4>
                          <span className="text-[11px] font-medium text-gray-400">Opcional</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {routineInserts.map(({ name, insert }) => (
                            <label key={name} className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 flex flex-col gap-1.5">
                              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">{name}</span>
                              <input
                                type="text"
                                className="w-full bg-white border border-indigo-100 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                value={insert?.fields?.value ?? ""}
                                placeholder="Ej. todo, normal, no..."
                                onChange={(e) => updateRoutineValue(name, e.target.value)}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      {otherInserts.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-sm font-bold text-gray-800">Otros hallazgos</h4>
                          {otherInserts.map(({ ins, idx }) => {
                            const entityName =
                              ins.table_name === "ReportEvent"
                                ? ins.fields?.event_type_name || "Evento"
                                : ins.table_name === "AnimalDiagnosis"
                                  ? "Diagnóstico"
                                  : ins.table_name === "AnimalObservation"
                                    ? "Observación"
                                    : ins.table_name;
                            const fields = ins.fields || {};
                            const keys = Object.keys(fields).filter(k => k !== "event_type_name");

                            return (
                              <div key={idx} className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-sm">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-bold text-indigo-600 uppercase text-xs tracking-wide">
                                    {entityName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newData = [...editableData];
                                      newData[i].inserts.splice(idx, 1);
                                      setEditableData(newData);
                                    }}
                                    className="text-xs text-red-500 hover:text-red-700 font-bold px-2 py-1 bg-red-50 rounded"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                                <ul className="space-y-2">
                                  {keys.map((key) => {
                                    const val = fields[key] || "";
                                    const formattedKey = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
                                    return (
                                      <li key={key} className="flex gap-2 items-center bg-white p-1.5 rounded border border-gray-100">
                                        <span className="font-medium text-gray-600 w-28 shrink-0 text-xs">{formattedKey}:</span>
                                        <input
                                          type="text"
                                          className="w-full bg-transparent border-b border-gray-200 focus:border-indigo-500 focus:outline-none text-gray-900 py-1"
                                          value={String(val)}
                                          onChange={(e) => {
                                            const newData = [...editableData];
                                            if (!newData[i].inserts[idx].fields) {
                                              newData[i].inserts[idx].fields = {};
                                            }
                                            newData[i].inserts[idx].fields[key] = e.target.value;
                                            setEditableData(newData);
                                          }}
                                        />
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3">
                        <p className="text-amber-900 text-sm font-medium">
                          ¿Querés agregar el texto como <b>observación</b>? (queda en amarillo)
                        </p>
                        <textarea
                          className="w-full bg-white border border-amber-200 rounded-lg p-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
                          rows={3}
                          value={observationDraft}
                          onChange={(e) => setObservationDraft(e.target.value)}
                          placeholder="Escribí la observación..."
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const text = (observationDraft || editableTranscript || "").trim();
                            if (!text) {
                              alert("Escribí una observación antes de agregarla.");
                              return;
                            }
                            const newData = [...editableData];
                            const list = [...(newData[i].inserts || [])];
                            const already = list.some(
                              ins =>
                                ins.table_name === "ReportEvent" &&
                                (ins.fields?.event_type_name || "").toLowerCase() === "observación"
                            );
                            if (!already) {
                              list.push({
                                table_name: "ReportEvent",
                                fields: { event_type_name: "Observación", value: text },
                              });
                              list.push({
                                table_name: "AnimalObservation",
                                fields: { observation: text },
                              });
                            }
                            newData[i] = { ...newData[i], inserts: list, severity: "observation" };
                            setEditableData(newData);
                          }}
                          className="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition-colors"
                        >
                          Agregar como observación
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-100">
                      <button
                        onClick={() => {
                          setEditableData(null);
                          setAnalysisResult(null);
                        }}
                        className="px-6 py-2 bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 rounded-lg font-medium shadow-sm transition-all"
                      >
                        Cancelar Reporte
                      </button>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                          disabled={i === 0}
                          className={`px-6 py-2 rounded-lg font-medium transition-all ${
                            i === 0
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                              : "bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 shadow-sm"
                          }`}
                        >
                          Anterior
                        </button>

                        {i < editableData.length - 1 ? (
                          <button
                            onClick={() => setCurrentStep(prev => prev + 1)}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
                          >
                            Siguiente
                          </button>
                        ) : (
                          <button
                            onClick={confirmAndSave}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium shadow-md hover:shadow-lg transition-all flex items-center gap-2"
                          >
                            <span className="text-xl">✅</span>
                            Confirmar e Insertar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
