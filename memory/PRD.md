# GeoHunter AI - Product Requirements Document

## Original Problem Statement
Desarrollar una app capaz de mapear, rastrear, identificar y localizar cualquier parte del mundo mediante fotos. El usuario puede especificar la zona de búsqueda (país, ciudad, barrio, condado, estado) para facilitar el trabajo de localización. Integración con mapa interactivo tipo Google Earth que muestre el proceso de mapeo y localización en tiempo real.

**User Choices**: 
- Usar GPT-5.2 + Gemini trabajando juntos como un "mega cerebro"
- Integrar Google Maps API para enriquecer los datos de geolocalización
- Diseño profesional

## What's Been Implemented ✅
**Date: 2026-01-11 - Update 2**

### Backend (FastAPI)
- POST /api/analyze - Análisis de imagen con GPT-5.2 + Gemini + Google Maps enrichment
- GET /api/history - Historial de análisis
- DELETE /api/history/{id} - Eliminar item del historial
- POST /api/geocode - Geocodificación

### Google Maps Integration
- **Geocoding API**: Convierte ubicaciones a coordenadas
- **Reverse Geocoding**: Obtiene dirección formateada de coordenadas
- **Place Details**: País, región administrativa, localidad, sublocalidad
- **Nearby Places Search**: Lugares cercanos con nombre, tipo, dirección y rating

### Frontend (React)
- Diseño profesional con tema oscuro moderno
- Logo con gradiente cyan-púrpura
- Panel de resultados con:
  - Ubicación de consenso + confianza
  - Datos de Google Maps (dirección, lugar, región)
  - Lugares cercanos identificados
  - Análisis detallado de GPT-5.2 y Gemini
- Mapa Leaflet con tiles CARTO dark
- Animaciones suaves y microinteracciones
- Barras de progreso durante análisis

## Next Tasks
1. Añadir Street View preview cuando esté disponible
2. Exportar resultados a PDF
3. Modo comparación lado a lado de IAs
