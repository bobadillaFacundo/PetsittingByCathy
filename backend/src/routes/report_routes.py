from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from src.database.session import get_db
from src.services.audio_service import AudioService, NLPService
from src.services.report_helpers import (
    calculate_severity_from_inserts,
    create_critical_alerts_for_report,
)
from src.services.tag_helpers import (
    load_tag_sets, add_tag_variant, parse_csv_values,
    load_color_rules, color_rule_to_dict, set_color_keywords,
    set_tag_variants, tag_set_to_dict,
)
from src.models.models import Animal, Report, ReportEvent, EventType, User, DataDictionary, Attachment, TagSet
from sqlalchemy.orm import joinedload

router = APIRouter(prefix="/reports", tags=["Reports"])

from datetime import datetime, timedelta
from src.timezone_ar import now_ar, today_ar
from pydantic import BaseModel
from typing import List, Optional, Any
import os
import uuid

# Modelos Pydantic para el Endpoint /confirm
class ReportConfirmRequest(BaseModel):
    user_id: int
    transcript: str
    extracted_data: List[Any]

class TextAnalyzeRequest(BaseModel):
    animal_name: str
    text: str

class EditReportRequest(BaseModel):
    transcript: str

from src.auth import get_current_user

@router.post("/analyze-and-confirm-batch")
async def analyze_and_confirm_batch(
    animal_name: str = Form(...),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    # 1. Analizar el audio (reutilizando la lógica existente)
    analysis_result = await analyze_voice_report(animal_name, audio_file, db, current_user)
    
    # 2. Construir el payload para confirmar (auto-confirmación)
    confirm_request = ReportConfirmRequest(
        user_id=current_user.id,
        transcript=analysis_result["transcript"],
        extracted_data=analysis_result["extracted_data"]
    )
    
    # 3. Confirmar y guardar en BD
    return confirm_report(confirm_request, db, current_user)

@router.post("/recalculate-alerts")
def recalculate_alerts(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # 1. Obtener reportes de las últimas 48 hs
    yesterday = now_ar() - timedelta(hours=48)
    recent_reports = db.query(Report).filter(Report.created_at >= yesterday).all()

    # 2. Borrar alertas críticas no resueltas de los últimos 2 días (para no duplicar)
    from src.models.models import CriticalAlert
    db.query(CriticalAlert).filter(
        CriticalAlert.created_at >= yesterday,
        CriticalAlert.is_resolved == False
    ).delete(synchronize_session=False)
    
    # 3. Regenerar alertas para cada reporte
    from src.services.report_helpers import create_critical_alerts_for_report
    for r in recent_reports:
        animal = db.query(Animal).filter(Animal.id == r.animal_id).first()
        if not animal: continue
        
        # Extraer los valores de los eventos de este reporte
        events = db.query(ReportEvent).filter(ReportEvent.report_id == r.id).all()
        event_values = [e.value for e in events if e.value]
        
        create_critical_alerts_for_report(db, animal, r.id, r.audio_transcript, event_values)
        
    db.commit()
    return {"status": "ok", "message": "Alertas recalculadas exitosamente."}

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
    tag_sets = load_tag_sets(db)
    nlp_result = NLPService.extract_events_from_transcript(transcript, dictionaries, animal_name, tag_sets)
    
    extracted_data = nlp_result.get("data", []) if isinstance(nlp_result, dict) else []
    cleaned_transcript = nlp_result.get("cleaned_text", transcript) if isinstance(nlp_result, dict) else transcript
    
    mapped_extracted_data = _map_nlp_to_extracted_data(nlp_result, animal_name, db)
    db.commit()
    
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
    tag_sets = load_tag_sets(db)
    
    nlp_result = NLPService.extract_events_from_transcript(transcript, dictionaries, animal_name, tag_sets)
    
    cleaned_transcript = nlp_result.get("cleaned_text", transcript) if isinstance(nlp_result, dict) else transcript
    mapped_extracted_data = _map_nlp_to_extracted_data(nlp_result, animal_name, db)
    db.commit()
        
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
        
        # Auto-calculate immediate severity based on inserts
        calculated_severity = calculate_severity_from_inserts(animal_data.get("inserts", []))
                        
        # Update severity if provided by NLP or fallback to calculation
        severity_from_nlp = animal_data.get("severity")
        if severity_from_nlp in ["normal", "observation", "critical"]:
            animal.severity = severity_from_nlp
        else:
            animal.severity = calculated_severity
        
        # Crear Reporte general
        report = Report(
            user_id=current_user.id,
            animal_id=animal.id,
            audio_transcript=request.transcript
        )
        db.add(report)
        db.flush()
        
        event_values = []
        # Procesar inserts según table_name
        for insert in animal_data.get("inserts", []):
            table_name = insert.get("table_name")
            fields = insert.get("fields", {})
            
            if table_name == "ReportEvent":
                event_type_name = fields.get("event_type_name")
                if not event_type_name: continue
                val = fields.get("value")
                # Campos rutinarios vacíos: no se guardan (opcionales)
                if val is None or str(val).strip() == "":
                    continue
                event_type = _get_or_create_event_type(db, event_type_name)
                event_values.append(str(val))
                _upsert_report_event(db, report.id, event_type.id, val)
                
            elif table_name == "AnimalDiagnosis":
                diag_name = fields.get("diagnosis_name")
                if not diag_name: continue
                catalog = db.query(DiagnosisCatalog).filter(DiagnosisCatalog.name.ilike(f"%{diag_name}%")).first()
                if not catalog:
                    catalog = DiagnosisCatalog(name=diag_name)
                    db.add(catalog)
                    db.flush()
                animal_diag = AnimalDiagnosis(animal_id=animal.id, diagnosis_id=catalog.id, date_diagnosed=today_ar())
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

        # Crear alertas críticas si se detectan palabras clave rojas
        create_critical_alerts_for_report(
            db, animal, report.id, request.transcript, event_values
        )
                
        db.commit()
        saved_reports.append({"animal": animal_name, "report_id": report.id, "animal_id": animal.id, "severity_assigned": animal.severity})
        
    return {"status": "success", "message": "Reportes guardados correctamente", "saved_reports": saved_reports}

def _get_or_create_event_type(db, event_type_name: str) -> EventType:
    event_type = db.query(EventType).filter(EventType.name.ilike(f"%{event_type_name}%")).first()
    if not event_type:
        event_type = EventType(name=event_type_name)
        db.add(event_type)
        db.flush()
    return event_type


def _upsert_report_event(db, report_id: int, event_type_id: int, value: str) -> None:
    existing = db.query(ReportEvent).filter(
        ReportEvent.report_id == report_id,
        ReportEvent.event_type_id == event_type_id,
    ).first()
    if existing:
        existing.value = value
    else:
        db.add(ReportEvent(report_id=report_id, event_type_id=event_type_id, value=value))
        db.flush()


def _map_nlp_to_extracted_data(nlp_result, animal_name, db):
    """Mapea resultado NLP al formato legacy del frontend."""
    extracted_data = nlp_result.get("data", []) if isinstance(nlp_result, dict) else []
    if isinstance(extracted_data, dict):
        extracted_data = [extracted_data]
        
    mapped_extracted_data = []
    for animal_d in extracted_data:
        mapped_inserts = []
        for item in animal_d.get("inserts", []):
            std_set = item.get("standard_set")
            spk_var = item.get("spoken_variant", "").lower().strip()
            val = item.get("value")
            if not std_set:
                continue
            tag_record = db.query(TagSet).options(joinedload(TagSet.variants_rel)).filter(
                TagSet.name.ilike(std_set)
            ).first()
            if tag_record and spk_var:
                add_tag_variant(db, tag_record, spk_var)
            if std_set.lower() in ["enfermedad", "diagnóstico", "diagnostico"]:
                mapped_inserts.append({
                    "table_name": "AnimalDiagnosis",
                    "fields": {"diagnosis_name": val, "spoken_variant": spk_var}
                })
            elif std_set.lower() in ["medicacion", "medicación", "remedio"]:
                mapped_inserts.append({
                    "table_name": "AnimalMedication",
                    "fields": {"medication_name": val, "spoken_variant": spk_var, "dosage": "No especificada"}
                })
            else:
                mapped_inserts.append({
                    "table_name": "ReportEvent",
                    "fields": {"event_type_name": std_set, "value": val, "spoken_variant": spk_var}
                })
        mapped_extracted_data.append({
            "animal": animal_d.get("animal", animal_d.get("animal_name", animal_name)),
            "inserts": mapped_inserts,
            "severity": animal_d.get("severity"),
        })
    return mapped_extracted_data

def _apply_inserts_to_report(db, report, animal, inserts):
    """Aplica inserts a un reporte existente (solo ReportEvents)."""
    from src.models.models import DiagnosisCatalog, MedicationCatalog, AnimalDiagnosis, AnimalMedication, AnimalObservation
    event_values = []
    for insert in inserts:
        table_name = insert.get("table_name")
        fields = insert.get("fields", {})
        if table_name == "ReportEvent":
            event_type_name = fields.get("event_type_name")
            if not event_type_name:
                continue
            event_type = _get_or_create_event_type(db, event_type_name)
            val = fields.get("value")
            if val:
                event_values.append(str(val))
            _upsert_report_event(db, report.id, event_type.id, val)
        elif table_name == "AnimalDiagnosis":
            diag_name = fields.get("diagnosis_name")
            if not diag_name:
                continue
            catalog = db.query(DiagnosisCatalog).filter(DiagnosisCatalog.name.ilike(f"%{diag_name}%")).first()
            if not catalog:
                catalog = DiagnosisCatalog(name=diag_name)
                db.add(catalog)
                db.flush()
            db.add(AnimalDiagnosis(animal_id=animal.id, diagnosis_id=catalog.id, date_diagnosed=today_ar()))
        elif table_name == "AnimalMedication":
            med_name = fields.get("medication_name")
            if not med_name:
                continue
            catalog = db.query(MedicationCatalog).filter(MedicationCatalog.name.ilike(f"%{med_name}%")).first()
            if not catalog:
                catalog = MedicationCatalog(name=med_name)
                db.add(catalog)
                db.flush()
            db.add(AnimalMedication(
                animal_id=animal.id, medication_id=catalog.id,
                dosage=fields.get("dosage") or "No especificada", frequency="Según indicación"
            ))
        elif table_name == "AnimalObservation":
            text = fields.get("observation")
            if text:
                db.add(AnimalObservation(animal_id=animal.id, observation=text))
    return event_values

@router.put("/{report_id}/edit")
def edit_report_transcript(
    report_id: int,
    request: EditReportRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Edita la transcripción de un reporte y recalcula eventos/colores."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    animal = db.query(Animal).filter(Animal.id == report.animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")

    report.audio_transcript = request.transcript

    # Eliminar eventos anteriores del reporte
    db.query(ReportEvent).filter(ReportEvent.report_id == report_id).delete()

    # Re-analizar con NLP
    dictionaries = db.query(DataDictionary).all()
    from src.models.models import TagSet
    tag_sets = load_tag_sets(db)
    nlp_result = NLPService.extract_events_from_transcript(
        request.transcript, dictionaries, animal.name, tag_sets
    )
    mapped_data = _map_nlp_to_extracted_data(nlp_result, animal.name, db)
    db.commit()

    inserts = mapped_data[0].get("inserts", []) if mapped_data else []
    event_values = _apply_inserts_to_report(db, report, animal, inserts)

    # Recalcular severidad
    severity = calculate_severity_from_inserts(inserts)
    nlp_severity = mapped_data[0].get("severity") if mapped_data else None
    animal.severity = nlp_severity if nlp_severity in ["normal", "observation", "critical"] else severity

    # Crear alertas críticas si aplica
    create_critical_alerts_for_report(db, animal, report.id, request.transcript, event_values)

    db.commit()

    from src.dtos.animal_dto import EventDTO
    events = db.query(ReportEvent).filter(ReportEvent.report_id == report_id).all()
    event_dtos = []
    for e in events:
        etype = db.query(EventType).filter(EventType.id == e.event_type_id).first()
        event_dtos.append({"type": etype.name if etype else "Desconocido", "value": e.value})

    return {
        "status": "success",
        "report_id": report.id,
        "transcript": report.audio_transcript,
        "events": event_dtos,
        "severity": animal.severity,
    }


@router.delete("/{report_id}", status_code=204)
def delete_report_physically(
    report_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Borra el reporte de la BD (físico), con eventos, adjuntos y alertas asociadas."""
    from src.models.models import ReportMedication, CriticalAlert
    from src.services.storage_service import delete_by_url

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    attachments = db.query(Attachment).filter(Attachment.report_id == report_id).all()
    for att in attachments:
        delete_by_url(att.file_url)
        db.delete(att)

    db.query(ReportEvent).filter(ReportEvent.report_id == report_id).delete(synchronize_session=False)
    db.query(ReportMedication).filter(ReportMedication.report_id == report_id).delete(synchronize_session=False)
    db.query(CriticalAlert).filter(CriticalAlert.report_id == report_id).delete(synchronize_session=False)

    db.delete(report)
    db.commit()
    return None


@router.post("/{report_id}/attach-photo")
async def attach_photo_to_report(
    report_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Adjunta una foto a un reporte existente."""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    ext = os.path.splitext(photo.filename or "photo.jpg")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Formato de imagen no soportado")

    from src.services.storage_service import upload_bytes
    content = await photo.read()
    file_url = upload_bytes(
        content,
        folder="photos",
        original_filename=photo.filename or f"photo{ext}",
        content_type=photo.content_type,
    )

    attachment = Attachment(
        animal_id=report.animal_id,
        report_id=report_id,
        file_type="image",
        file_url=file_url,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    return {
        "id": attachment.id,
        "file_url": file_url,
        "report_id": report_id,
        "animal_id": report.animal_id,
    }

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

from fastapi.responses import FileResponse
from fpdf import FPDF
import tempfile

@router.get("/export-pdf/{animal_id}")
def export_pdf(
    animal_id: int,
    range: str = "1month",
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    from datetime import datetime, timedelta
    
    animal = db.query(Animal).filter(Animal.id == animal_id).first()
    if not animal:
        raise HTTPException(status_code=404, detail="Animal no encontrado")
        
    days = 30
    if range == "3months": days = 90
    if range == "6months": days = 180
    if range == "9months": days = 270
    if range == "1year": days = 365
    
    threshold_date = now_ar() - timedelta(days=days)
    
    reports = db.query(Report).filter(Report.animal_id == animal_id, Report.created_at >= threshold_date).order_by(Report.created_at.asc()).all()
    
    reports_data = []
    for r in reports:
        dt = r.created_at.strftime("%Y-%m-%d %H:%M")
        reports_data.append(f"[{dt}] {r.audio_transcript}")
        
    if not reports_data:
        reports_data.append("No hay reportes en este período.")

    from src.models.models import LabResult
    from sqlalchemy.orm import joinedload
    import pypdf

    labs = db.query(LabResult).options(joinedload(LabResult.laboratory)).filter(
        LabResult.animal_id == animal_id, 
        LabResult.date >= threshold_date.date()
    ).all()

    lab_results_data = []
    from src.services.storage_service import resolve_local_path_or_download
    for lab in labs:
        doc_url = lab.document_url
        if not doc_url: continue

        file_path = resolve_local_path_or_download(doc_url)
        extracted_text = ""
        if file_path and file_path.lower().endswith(".pdf"):
            try:
                reader = pypdf.PdfReader(file_path)
                text_pages = [page.extract_text() for page in reader.pages if page.extract_text()]
                extracted_text = "\n".join(text_pages)
            except Exception as e:
                extracted_text = f"[Error leyendo PDF: {e}]"
            finally:
                # Limpiar temporales descargados de Supabase
                if doc_url.startswith("http") and file_path and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass
                
        if extracted_text:
            lab_results_data.append(f"Estudio: {lab.laboratory.name if lab.laboratory else 'Laboratorio'} - Fecha: {lab.date}\nContenido PDF:\n{extracted_text}\n---")
        
    history_text = NLPService.generate_clinical_history(animal.name, reports_data, lab_results_data)
    
    # Construir PDF
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    
    pdf.set_font("Helvetica", 'B', 16)
    pdf.cell(200, 10, text=f"Historia Clinica: {animal.name}", new_x="LMARGIN", new_y="NEXT", align='C')
    pdf.set_font("Helvetica", size=10)
    pdf.cell(200, 10, text=f"Generado el {today_ar().strftime('%Y-%m-%d')} - Periodo evaluado: ultimos {days} dias", new_x="LMARGIN", new_y="NEXT", align='C')
    pdf.ln(10)
    
    pdf.set_font("Helvetica", size=12)
    
    # fpdf2 text rendering
    # Para evitar problemas con caracteres especiales que la fuente por defecto no soporte
    safe_text = history_text.encode('latin-1', 'replace').decode('latin-1')
    pdf.multi_cell(0, 10, text=safe_text)
    
    fd, path = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    
    pdf.output(path)
    
    return FileResponse(path, media_type='application/pdf', filename=f"historia_{animal.name}.pdf")
