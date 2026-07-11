"""
migrate_qdrant.py
=================
Migra colecciones de Qdrant local (100.82.178.56:6333)
a Qdrant Cloud.

Colecciones a migrar: veterinary_reports
(Las colecciones SICSM, simpsons_* son de otros proyectos y se omiten)

Uso:
  cd backend
  python migrate_qdrant.py
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()

SRC_URL = os.getenv("SOURCE_QDRANT_URL", "")
DST_URL = os.getenv("QDRANT_URL", "")
DST_KEY = os.getenv("QDRANT_API_KEY", "")

if not SRC_URL:
    print("ERROR: SOURCE_QDRANT_URL no está definida en el .env")
    print("       Agregá: SOURCE_QDRANT_URL=http://host:6333")
    sys.exit(1)

# Solo migrar estas colecciones (las demás son de otros proyectos)
COLLECTIONS_TO_MIGRATE = ["veterinary_reports"]
BATCH_SIZE = 100  # puntos por lote

if not DST_URL or not DST_KEY:
    print("ERROR: QDRANT_URL o QDRANT_API_KEY no definidos en el .env")
    sys.exit(1)

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

print(f"[ORIGEN]  {SRC_URL}")
print(f"[DESTINO] {DST_URL[:60]}...")
print()

src = QdrantClient(url=SRC_URL, check_compatibility=False, timeout=30)
dst = QdrantClient(url=DST_URL, api_key=DST_KEY, timeout=60)

# ── Verificar conexión destino ───────────────────────────────────────────────
try:
    dst.get_collections()
    print("✓ Conexión a Qdrant Cloud OK\n")
except Exception as e:
    print(f"✗ No se pudo conectar a Qdrant Cloud: {e}")
    sys.exit(1)

# ── Migrar colecciones ───────────────────────────────────────────────────────
for col_name in COLLECTIONS_TO_MIGRATE:
    print("=" * 60)
    print(f"Migrando colección: {col_name}")
    print("=" * 60)

    # Obtener info de la colección origen
    try:
        src_info = src.get_collection(col_name)
    except Exception as e:
        print(f"  ! Colección '{col_name}' no existe en origen: {e}\n")
        continue

    vectors_config = src_info.config.params.vectors
    total = src.count(col_name).count
    print(f"  Vectores a migrar: {total}")
    print(f"  Dimensión: {vectors_config.size}")
    print(f"  Distancia: {vectors_config.distance}")

    # Recrear colección en destino
    existing = [c.name for c in dst.get_collections().collections]
    if col_name in existing:
        print(f"  ! Colección ya existe en destino, se elimina y recrea...")
        dst.delete_collection(col_name)

    dst.create_collection(
        collection_name=col_name,
        vectors_config=VectorParams(
            size=vectors_config.size,
            distance=vectors_config.distance,
        ),
    )
    print(f"  ✓ Colección creada en Qdrant Cloud")

    if total == 0:
        print(f"  ○ Sin vectores que migrar.\n")
        continue

    # Migrar puntos en lotes
    migrated = 0
    offset = None

    while True:
        results, next_offset = src.scroll(
            collection_name=col_name,
            offset=offset,
            limit=BATCH_SIZE,
            with_vectors=True,
            with_payload=True,
        )

        if not results:
            break

        points = [
            PointStruct(
                id=p.id,
                vector=p.vector,
                payload=p.payload,
            )
            for p in results
        ]

        dst.upsert(collection_name=col_name, points=points)
        migrated += len(points)
        print(f"  ... {migrated}/{total} vectores copiados")

        if next_offset is None:
            break
        offset = next_offset

    # Verificar
    dst_count = dst.count(col_name).count
    if dst_count == total:
        print(f"  ✓ Verificado: {dst_count} vectores en Qdrant Cloud\n")
    else:
        print(f"  ⚠ Discrepancia: origen={total}, destino={dst_count}\n")

print("=" * 60)
print("Migracion a Qdrant Cloud completada.")
print("=" * 60)
