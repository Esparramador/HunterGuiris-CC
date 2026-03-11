# GeoHunter AI - Product Requirements Document

## Original Problem Statement
Desarrollar una app capaz de mapear, rastrear, identificar y localizar cualquier parte del mundo mediante fotos. El usuario puede especificar la zona de búsqueda (país, ciudad, barrio, condado, estado) para facilitar el trabajo de localización. Integración con mapa interactivo tipo Google Earth que muestre el proceso de mapeo y localización en tiempo real.

**User Choice**: Usar GPT-5.2 + Gemini trabajando juntos como un "mega cerebro" para mayor precisión en la geolocalización.

## User Personas
1. **Investigadores/OSINT**: Profesionales que necesitan identificar ubicaciones a partir de imágenes para investigaciones.
2. **Viajeros Curiosos**: Personas que quieren identificar lugares de fotos que encuentran online.
3. **Geógrafos/Estudiantes**: Para estudios de geografía y reconocimiento de paisajes.

## Core Requirements (Static)
- Upload de imágenes (JPEG, PNG, WEBP)
- Análisis de imágenes con IA para detectar ubicaciones
- Especificación opcional de zona de búsqueda
- Visualización de resultados en mapa interactivo
- Historial de búsquedas

## What's Been Implemented ✅
**Date: 2026-01-11**

### Backend (FastAPI)
- POST /api/analyze - Análisis de imagen con GPT-5.2 y Gemini en paralelo
- POST /api/geocode - Geocodificación de ubicaciones
- GET /api/history - Historial de análisis
- DELETE /api/history/{id} - Eliminar item del historial
- GET /api/maps-key - Obtener API key de Google Maps

### Frontend (React)
- Dashboard estilo "Command Center" con tema oscuro cyberpunk
- Panel lateral con upload de imágenes (drag & drop)
- Input de zona de búsqueda opcional
- Mapa interactivo Leaflet con tiles CARTO dark
- Panel de resultados flotante con:
  - Ubicación de consenso
  - Nivel de confianza
  - Coordenadas
  - Análisis detallado de GPT-5.2 (púrpura)
  - Análisis detallado de Gemini (cyan)
  - Landmarks identificados
- Historial de búsquedas en sidebar
- Animaciones de escaneo durante análisis
- Sistema de notificaciones toast

### Integrations
- OpenAI GPT-5.2 (via emergentintegrations)
- Google Gemini 2.5 Flash (via emergentintegrations)
- Google Maps Geocoding API
- Leaflet + CARTO dark tiles

## Prioritized Backlog

### P0 (Critical - Done ✅)
- [x] Multi-AI análisis de imágenes
- [x] Mapa interactivo
- [x] Historial de búsquedas

### P1 (High Priority - Next)
- [ ] Exportar resultados a PDF/JSON
- [ ] Comparación lado a lado de análisis
- [ ] Mejorar precisión con Street View hints

### P2 (Medium Priority)
- [ ] Modo batch para múltiples imágenes
- [ ] Integración con reverse image search
- [ ] Filtros de confianza mínima

### P3 (Nice to Have)
- [ ] Vista 3D del globo terráqueo
- [ ] Compartir resultados por link
- [ ] Notificaciones push cuando termina análisis largo

## Next Tasks
1. Agregar exportación de resultados
2. Mejorar UI del panel de resultados
3. Añadir más detalles en el análisis (clima, hora del día estimada)
