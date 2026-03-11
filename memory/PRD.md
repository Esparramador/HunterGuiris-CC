# Hunter Guiris CC - Product Requirements Document

## App Info
- **Nombre**: Hunter Guiris CC
- **Tipo**: PWA (Progressive Web App) instalable en móvil
- **Propósito**: Geolocalización inteligente mediante fotos usando IA

## Funcionalidades Implementadas ✅

### Core Features
- **Análisis de imágenes** con GPT-5.2 + Gemini trabajando en paralelo
- **Google Maps API** para enriquecer datos (geocoding, places, nearby)
- **Mapa interactivo** Leaflet con tema oscuro
- **Historial de búsquedas** persistente
- **Zona de búsqueda opcional** para acotar la localización

### PWA Features
- **Instalable** como app nativa en Android/iOS
- **Service Worker** para caché de archivos
- **Modo offline**: Guarda búsquedas en cola cuando no hay internet
- **Tiles del mapa cacheados** para navegación offline
- **Manifest.json** con iconos y configuración

### Diseño
- **Mobile-first** responsive
- **Tema oscuro** profesional
- **Panel slide-up** para resultados
- **Indicador de estado** online/offline

## Cómo Instalar en Móvil
1. Abrir la web en Chrome/Safari
2. Tocar "Añadir a pantalla de inicio" o "Instalar app"
3. La app se instalará como aplicación nativa

## Limitaciones
- **Requiere internet** para análisis de IA (GPT y Gemini están en la nube)
- Sin internet: Las búsquedas se guardan y procesan cuando vuelve la conexión

## APIs Integradas
- OpenAI GPT-5.2
- Google Gemini 2.5 Flash
- Google Maps Geocoding API
- Google Maps Places API

## Next Steps
- Integrar Google Street View
- Exportar resultados a PDF
- Modo batch para múltiples imágenes
