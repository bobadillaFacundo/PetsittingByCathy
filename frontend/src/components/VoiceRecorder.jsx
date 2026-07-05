import { useState, useRef, useEffect } from "react";

export default function VoiceRecorder() {
  const [animals, setAnimals] = useState([]);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [editableData, setEditableData] = useState(null);
  const [editableTranscript, setEditableTranscript] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  useEffect(() => {
    fetch("http://localhost:8000/animals/")
      .then(res => res.json())
      .then(data => setAnimals(data))
      .catch(err => console.error("Error fetching animals:", err));
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
    const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append("audio_file", audioBlob, "reporte.webm");
    formData.append("animal_name", selectedAnimal.name);
    
    try {
      const response = await fetch(`http://localhost:8000/reports/analyze-voice`, {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      setAnalysisResult(data);
      setEditableData(data.extracted_data);
      setEditableTranscript(data.transcript);
      setCurrentStep(0);
    } catch (error) {
      console.error("Error analizando el audio:", error);
      alert("Hubo un error procesando el reporte.");
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmAndSave = async () => {
    setIsProcessing(true);
    const payload = {
      user_id: 1, // Hardcodeado por ahora
      transcript: editableTranscript,
      extracted_data: editableData
    };

    try {
      const response = await fetch(`http://localhost:8000/reports/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        setAnalysisResult(null);
        setEditableData(null);
        setSaveSuccess(true);
        setSelectedAnimal(null); // Reset selection
      } else {
        alert("Error al confirmar el guardado.");
      }
    } catch (error) {
      console.error("Error guardando:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 flex flex-col items-center relative">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Reporte Diario Dinámico</h2>
      
      {!selectedAnimal ? (
        <div className="w-full">
          <p className="text-center text-gray-600 font-medium mb-4">Paso 1: Selecciona el paciente</p>
          <div className="flex flex-wrap justify-center gap-4">
            {animals.map((animal) => (
              <button
                key={animal.id}
                onClick={() => {
                  setSelectedAnimal(animal);
                  setSaveSuccess(false);
                  setAnalysisResult(null);
                }}
                className="px-6 py-4 bg-white border-2 border-indigo-100 rounded-xl hover:border-indigo-500 hover:shadow-md transition-all flex items-center gap-3"
              >
                <span className="text-2xl">🐶</span>
                <span className="font-bold text-gray-800 text-lg">{animal.name}</span>
              </button>
            ))}
            {animals.length === 0 && <p className="text-sm text-gray-500">Cargando pacientes...</p>}
          </div>
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

          <p className="text-center text-gray-600 font-medium mb-4">Paso 2: Mantén presionado para hablar</p>
          <button 
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-lg ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 scale-110 shadow-red-200' 
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
            }`}
          >
            <span className="text-4xl mb-2">🎙️</span>
            <span className="text-white font-medium text-sm">
              {isRecording ? "Grabando..." : "Mantener"}
            </span>
          </button>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
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
                if (!editableData) return null;
                const steps = [];
                editableData.forEach((animalData, i) => {
                  if (animalData.inserts && animalData.inserts.length > 0) {
                    animalData.inserts.forEach((insert, j) => {
                      steps.push({ animalIndex: i, insertIndex: j, animal: animalData.animal, insert });
                    });
                  } else {
                    steps.push({ animalIndex: i, insertIndex: null, animal: animalData.animal, insert: null });
                  }
                });
                
                if (steps.length === 0) return <p className="text-gray-500 italic text-sm">No se extrajeron registros.</p>;
                
                const step = steps[currentStep];
                const i = step.animalIndex;
                const j = step.insertIndex;
                const animalData = editableData[i];
                const insert = step.insert;

                return (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide">
                        Paso {currentStep + 1} de {steps.length}
                      </span>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-center gap-2 border-b pb-2 mb-3">
                        <span className="text-xl">🐾</span>
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
                      
                      {insert ? (
                        <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg text-sm">
                          {(() => {
                            const tableSchema = analysisResult.schema_map[insert.table_name] || { entity_name: insert.table_name, fields: [] };
                            return (
                              <>
                                <span className="font-bold text-indigo-600 uppercase text-xs tracking-wide">
                                  Categoría: {tableSchema.entity_name}
                                </span>
                                <ul className="mt-2 space-y-2">
                                  {tableSchema.fields.map((field) => {
                                    const key = field.name;
                                    const val = insert.fields?.[key] || "";
                                    const isMissing = !val;
                                    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                    
                                    return (
                                      <li key={key} className="flex gap-2 items-center bg-white p-1.5 rounded border border-gray-100">
                                        <span className="font-medium text-gray-600 w-32 shrink-0">{formattedKey}:</span>
                                        <input 
                                          type="text" 
                                          className={`w-full bg-transparent border-b focus:outline-none text-gray-900 py-1 transition-colors ${
                                            isMissing ? 'border-red-300 focus:border-red-500 bg-red-50/30' : 'border-gray-200 focus:border-indigo-500'
                                          }`}
                                          value={String(val)}
                                          placeholder={isMissing ? 'Falta completar...' : ''}
                                          onChange={(e) => {
                                            const newData = [...editableData];
                                            if (!newData[i].inserts[j].fields) {
                                              newData[i].inserts[j].fields = {};
                                            }
                                            newData[i].inserts[j].fields[key] = e.target.value;
                                            setEditableData(newData);
                                          }}
                                        />
                                        {isMissing && (
                                          <span title="Dato no encontrado en el audio. Por favor, completar a mano." className="text-red-500 text-lg cursor-help">⚠️</span>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <p className="text-gray-500 italic text-sm">No hay registros extraídos para este paciente.</p>
                      )}
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
                          disabled={currentStep === 0}
                          className={`px-6 py-2 rounded-lg font-medium transition-all ${
                            currentStep === 0 
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                            : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 shadow-sm'
                          }`}
                        >
                          Anterior
                        </button>
                        
                        {currentStep < steps.length - 1 ? (
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
