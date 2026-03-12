# Hunter Guiris CC - Product Requirements Document

## App Info
- **Nombre**: Hunter Guiris CC
- **Tipo**: PWA (Progressive Web App) instalable en móvil
- **Propósito**: Geolocalización inteligente mediante fotos usando IA
- **URL**: https://hunter-geoloc.preview.emergentagent.com

## Estado Actual del Proyecto

### Funcional
- Análisis de geolocalización con Gemini 2.5 Flash (Google AI)
- Google Maps API (geocoding, places, nearby search)
- Mapa interactivo Leaflet con 3 estilos (oscuro, satélite, calles)
- Autenticación Google OAuth (Emergent Auth)
- Historial de búsquedas con estadísticas
- Herramientas: consulta teléfono, geolocalización IP, compartir ubicación
- Subida de múltiples archivos (imágenes/videos)
- PWA instalable con service worker

### Parcialmente Funcional
- OpenAI GPT-4o: La clave del usuario no tiene créditos (error 429). Se activará automáticamente cuando recargue. El sistema falla gracefully y usa solo Gemini.

## Arquitectura
```
/app/
├── backend/
│   ├── server.py        # FastAPI - toda la lógica
│   ├── .env             # MONGO_URL, API keys
│   ├── requirements.txt
│   └── tests/
│       └── test_hunter_api.py
├── frontend/
│   ├── src/App.js       # React SPA - toda la UI
│   ├── src/index.css    # Estilos completos
│   ├── public/manifest.json
│   └── .env             # REACT_APP_BACKEND_URL, GOOGLE_MAPS_KEY
└── memory/PRD.md
```

## APIs Integradas
- Google Gemini 2.5 Flash (via google-genai SDK) - Clave directa del usuario
- OpenAI GPT-4o (via openai SDK) - Clave del usuario (sin créditos actualmente)
- Google Maps Geocoding API
- Google Maps Places API

## Endpoints Clave
- POST /api/analyze - Análisis de imagen individual
- POST /api/analyze-multi - Análisis de múltiples imágenes
- POST /api/analyze-video - Extracción de frames y análisis
- GET /api/history - Historial de búsquedas
- GET /api/statistics - Estadísticas
- POST /api/auth/session - Auth con Google OAuth
- POST /api/geocode - Geocodificación

## Tareas Completadas (Marzo 2026)
- Migración de Emergent LLM Key a claves directas de API
- Actualización de Gemini 2.0 Flash a Gemini 2.5 Flash (google-genai SDK)
- Manejo graceful de fallos de OpenAI (sin créditos)
- Eliminación de reintentos innecesarios para mejor velocidad
- Verificación completa: 100% tests backend + frontend

## Próximas Tareas
- P0: Generación de APK (Capacitor/PWABuilder) para Android
- P1: Mejoras offline (cola de análisis sin conexión)
- P2: Street View integration mejorada
- P2: Exportar resultados a PDF
- P2: Modo batch para múltiples imágenes

## Credenciales
- Email autorizado: sadiagiljoan@gmail.com
- Google Auth: Emergent-managed OAuth
