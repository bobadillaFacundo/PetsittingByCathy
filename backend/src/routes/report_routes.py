from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.services.audio_service import AudioService, NLPService
from src.models.models import Animal, Report, ReportEvent, EventType, User, DataDictionary

router = APIRouter(prefix="/reports", tags=["Reports"])

from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional, Any

# Modelos Pydantic para el Endpoint /confirm
class ReportConfirmRequest(BaseModel):
    user_id: int
    transcript: str
    extracted_data: List[Any]

class TextAnalyzeRequest(BaseModel):
    animal_name: str
    text: str

from src.auth import get_current_user, get_current_user

@router.post("/analyze-voice")
async def analyze_voice_report(
    animal_name: str = Form(...),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # 1. Guardar Audio
    file_path = await AudioService.save_audio(audio_file)
    
    # 2. Transcribir (Whisper)
    transcript = AudioService.transcribe_audio(file_path)
    
    # 3. Extraer info NLP
    dictionaries = db.query(DataDictionary).all()
    from src.models.models import TagSet
    tag_sets = db.query(TagSet).all()
    nlp_result = NLPService.extract_events_from_transcript(transcript, dictionaries, animal_name, tag_sets)
    
    extracted_data = nlp_result.get("data", []) if isinstance(nlp_result, dict) else []
    cleaned_transcript = nlp_result.get("cleaned_text", transcript) if isinstance(nlp_result, dict) else transcript
    
    # 4. Auto-Aprendizaje y Mapeo a Formato Legacy
    mapped_extracted_data = []
    for animal_d in extracted_data:
        mapped_inserts = []
        for item in animal_d.get("inserts", []):
            std_set = item.get("standard_set")
            spk_var = item.get("spoken_variant", "").lower().strip()
            val = item.get("value")
            
            if not std_set: continue
            
            # Auto-incremento: Buscar el TagSet y añadir la variante si no existe
            tag_record = db.query(TagSet).filter(TagSet.name.ilike(std_set)).first()
            if tag_record and spk_var:
                current_variants = [v.strip().lower() for v in tag_record.variants.split(",")]
                if spk_var not in current_variants:
                    tag_record.variants += f", {spk_var}"
                    db.commit() # Guardar aprendizaje
            
            # Mapeo a legacy para el Frontend
            if std_set.lower() in ["enfermedad", "diagnóstico", "diagnostico"]:
                mapped_inserts.append({
                    "table_name": "AnimalDiagnosis",
                    "fields": {
                        "diagnosis_name": val,
                        "spoken_variant": spk_var
                    }
                })
            elif std_set.lower() in ["medicacion", "medicación", "remedio"]:
                mapped_inserts.append({
                    "table_name": "AnimalMedication",
                    "fields": {
                        "medication_name": val,
                        "spoken_variant": spk_var,
                        "dosage": "No especificada"
                    }
                })
            else:
                # Por defecto, cualquier otro conjunto se considera un evento de rutina (Comida, Pis, Vomito, etc)
                mapped_inserts.append({
                    "table_name": "ReportEvent",
                    "fields": {
                        "event_type_name": std_set,
                        "value": val,
                        "spoken_variant": spk_var
                    }
                })
                
        mapped_extracted_data.append({
            "animal": animal_d.get("animal", animal_d.get("animal_name", animal_name)),
            "inserts": mapped_inserts
        })
    
    return {
        "transcript": cleaned_transcript,
        "extracted_data": mapped_extracted_data
    }

@router.post("/analyze-text")
def analyze_text_report(
    req: TextAnalyzeRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    transcript = req.text
    animal_name = req.animal_name

    dictionaries = db.query(DataDictionary).all()
    from src.models.models import TagSet
    tag_sets = db.query(TagSet).all()
    
    nlp_result = NLPService.extract_events_from_transcript(transcript, dictionaries, animal_name, tag_sets)
    
    extracted_data = nlp_result.get("data", []) if isinstance(nlp_result, dict) else []
    cleaned_transcript = nlp_result.get("cleaned_text", transcript) if isinstance(nlp_result, dict) else transcript
    
    mapped_extracted_data = []
    for animal_d in extracted_data:
        mapped_inserts = []
        for item in animal_d.get("inserts", []):
            std_set = item.get("standard_set")
            spk_var = item.get("spoken_variant", "").lower().strip()
            val = item.get("value")
            
            if not std_set: continue
            
            tag_record = db.query(TagSet).filter(TagSet.name.ilike(std_set)).first()
            if tag_record and spk_var:
                current_variants = [v.strip().lower() for v in tag_record.variants.split(",")]
                if spk_var not in current_variants:
                    tag_record.variants += f", {spk_var}"
                    db.commit()
            
            if std_set.lower() in ["enfermedad", "diagnóstico", "diagnostico"]:
                mapped_inserts.append({
                    "table_name": "AnimalDiagnosis",
                    "fields": {
                        "diagnosis_name": val,
                        "spoken_variant": spk_var
                    }
                })
            elif std_set.lower() in ["medicacion", "medicación", "remedio"]:
                mapped_inserts.append({
                    "table_name": "AnimalMedication",
                    "fields": {
                        "medication_name": val,
                        "spoken_variant": spk_var,
                        "dosage": "No especificada"
                    }
                })
            else:
                mapped_inserts.append({
                    "table_name": "ReportEvent",
                    "fields": {
                        "event_type_name": std_set,
                        "value": val,
                        "spoken_variant": spk_var
                    }
                })
            
        mapped_extracted_data.append({
            "animal": animal_d.get("animal", animal_d.get("animal_name", animal_name)),
            "inserts": mapped_inserts
        })
        
    return {
        "transcript": cleaned_transcript,
        "extracted_data": mapped_extracted_data
    }

@router.post("/confirm")
def confirm_report(
    request: ReportConfirmRequest,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from src.models.models import DiagnosisCatalog, MedicationCatalog, AnimalDiagnosis, AnimalMedication, AnimalObservation
    saved_reports = []
    
    # Guardar en Base de Datos
    for animal_data in request.extracted_data:
        animal_name = animal_data.get("animal")
        if not animal_name: continue
        
        # Buscar animal en BD
        animal = db.query(Animal).filter(Animal.name.ilike(f"%{animal_name}%")).first()
        if not animal:
            continue
        
        # Update severity if provided by NLP
        severity_from_nlp = animal_data.get("severity")
        if severity_from_nlp in ["normal", "observation", "critical"]:
            animal.severity = severity_from_nlp
        
        # Crear Reporte general
        report = Report(
            user_id=current_user.id,
            animal_id=animal.id,
            audio_transcript=request.transcript
        )
        db.add(report)
        db.flush()
        
        # Procesar inserts según table_name
        for insert in animal_data.get("inserts", []):
            table_name = insert.get("table_name")
            fields = insert.get("fields", {})
            
            if table_name == "ReportEvent":
                event_type_name = fields.get("event_type_name")
                if not event_type_name: continue
                event_type = db.query(EventType).filter(EventType.name.ilike(f"%{event_type_name}%")).first()
                if not event_type:
                    event_type = EventType(name=event_type_name)
                    db.add(event_type)
                    db.flush()
                report_event = ReportEvent(report_id=report.id, event_type_id=event_type.id, value=fields.get("value"))
                db.add(report_event)
                
            elif table_name == "AnimalDiagnosis":
                diag_name = fields.get("diagnosis_name")
                if not diag_name: continue
                catalog = db.query(DiagnosisCatalog).filter(DiagnosisCatalog.name.ilike(f"%{diag_name}%")).first()
                if not catalog:
                    catalog = DiagnosisCatalog(name=diag_name)
                    db.add(catalog)
                    db.flush()
                animal_diag = AnimalDiagnosis(animal_id=animal.id, diagnosis_id=catalog.id, date_diagnosed=datetime.utcnow())
                db.add(animal_diag)
                
            elif table_name == "AnimalMedication":
                med_name = fields.get("medication_name")
                if not med_name: continue
                catalog = db.query(MedicationCatalog).filter(MedicationCatalog.name.ilike(f"%{med_name}%")).first()
                if not catalog:
                    catalog = MedicationCatalog(name=med_name)
                    db.add(catalog)
                    db.flush()
                dosage = fields.get("dosage") or "No especificada"
                animal_med = AnimalMedication(animal_id=animal.id, medication_id=catalog.id, dosage=dosage, frequency="Según indicación")
                db.add(animal_med)
                
            elif table_name == "AnimalObservation":
                text = fields.get("observation")
                if not text: continue
                animal_obs = AnimalObservation(animal_id=animal.id, observation=text)
                db.add(animal_obs)
                
        db.commit()
        saved_reports.append({"animal": animal_name, "report_id": report.id, "severity_assigned": severity_from_nlp})
        
    return {"status": "success", "message": "Reportes guardados correctamente"}

@router.get("/all")
def get_all_reports(limit: int = 100, db: Session = Depends(get_db), current_admin = Depends(get_current_user)):
    from src.dtos.animal_dto import ReportHistoryDTO, EventDTO
    from sqlalchemy.orm import joinedload
    
    reports = db.query(Report).options(
        joinedload(Report.user),
        joinedload(Report.animal),
        joinedload(Report.events).joinedload(ReportEvent.event_type)
    ).order_by(Report.created_at.desc()).limit(limit).all()
    
    history = []
    for r in reports:
        event_dtos = []
        for e in r.events:
            event_dtos.append(EventDTO(type=e.event_type.name if e.event_type else "Desconocido", value=e.value))
            
        history.append({
            "id": r.id,
            "created_at": r.created_at,
            "transcript": r.audio_transcript,
            "user_name": r.user.name if r.user else "Desconocido",
            "animal_name": r.animal.name if r.animal else "Desconocido",
            "events": event_dtos
        })
        
    return history
