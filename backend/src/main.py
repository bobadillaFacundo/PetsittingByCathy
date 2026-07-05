from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.routes import animal_routes, report_routes, chat_routes, dashboard_routes

app = FastAPI(title="Asistente Veterinario API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(animal_routes.router)
app.include_router(report_routes.router)
app.include_router(chat_routes.router)
app.include_router(dashboard_routes.router)

@app.get("/")
def read_root():
    return {"message": "Bienvenido a la API del Asistente Veterinario"}
