import sys, os
sys.path.append(os.path.abspath('.'))
from src.database.session import engine, SessionLocal
from src.models.models import EventType, ReportEvent

db = SessionLocal()

mapping = {
    "comida": ["comida", "comi", "comi", "comio", "comió"],
    "agua": ["agua", "tom agua", "tomó agua"],
    "pis": ["pis", "piso"],
    "caca": ["caca", "cag", "cagó"],
    "vomito": ["vomito", "vmito", "vómito"],
    "enfermedad": ["enfermedad", "diagnóstico", "diagnostico", "zarpullido", "cascarita", "infectacin", "infectación", "oreja", "lagrime", "rascarse"],
    "medicacion": ["medicacion", "medicación", "remedio", "inyeccin", "inyección"],
    "observacion": ["conducta", "estado de nimo", "estado de ánimo", "evolucion", "evolución", "visita", "veterinaria", "revisin", "revisión", "slida", "sólida"]
}

# Ensure base types exist
base_types = {}
for base in mapping.keys():
    base_name = base.capitalize()
    et = db.query(EventType).filter(EventType.name.ilike(base_name)).first()
    if not et:
        et = EventType(name=base_name)
        db.add(et)
        db.commit()
        db.refresh(et)
    base_types[base] = et.id

# Update all report events
events = db.query(ReportEvent).all()
for ev in events:
    et = db.query(EventType).filter(EventType.id == ev.event_type_id).first()
    if not et: continue
    et_name = et.name.lower()
    
    # Find new base
    new_base_id = None
    for base, variants in mapping.items():
        for v in variants:
            if v in et_name or et_name in v:
                new_base_id = base_types[base]
                break
        if new_base_id:
            break
            
    if new_base_id and ev.event_type_id != new_base_id:
        ev.event_type_id = new_base_id
        
db.commit()

# Delete unused event types
used_ids = {e.event_type_id for e in db.query(ReportEvent).all()}
all_types = db.query(EventType).all()
for t in all_types:
    if t.id not in used_ids:
        db.delete(t)
        
db.commit()
print("Normalization complete.")
