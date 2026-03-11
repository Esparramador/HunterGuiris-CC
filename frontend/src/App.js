import { useState, useCallback, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { 
  Upload, 
  MapPin, 
  Brain, 
  Crosshair, 
  History, 
  Trash2,
  CheckCircle,
  Loader2,
  Target,
  X,
  Building,
  Navigation,
  WifiOff,
  Download,
  Sparkles,
  Image,
  Video,
  Plus,
  Images
} from "lucide-react";
import { Toaster, toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Custom marker
const customIcon = new L.DivIcon({
  className: 'custom-marker',
  html: `<div style="
    width: 24px; height: 24px;
    background: linear-gradient(135deg, #00d4ff, #8b5cf6);
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 3px solid #08080c;
    box-shadow: 0 0 20px rgba(0,212,255,0.6);
  "><div style="
    width: 8px; height: 8px;
    background: #08080c;
    border-radius: 50%;
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
  "></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 1 });
  }, [center, zoom, map]);
  return null;
};

const HunterApp = () => {
  const [files, setFiles] = useState([]); // {file, preview, type: 'image'|'video'}
  const [zone, setZone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState([]);
  const [center, setCenter] = useState([20, 0]);
  const [zoom, setZoom] = useState(2);
  const [showResults, setShowResults] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showInstall, setShowInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    fetchHistory();
    
    const handleOnline = () => { setIsOnline(true); toast.success("Conexión restaurada"); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstall);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstall);
    };
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/history`);
      setHistory(res.data);
    } catch (e) { console.error(e); }
  };

  const handleFiles = useCallback((e) => {
    const newFiles = Array.from(e.target.files || []);
    
    newFiles.forEach(file => {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      
      if (!isVideo && !isImage) {
        toast.error(`${file.name}: Solo imágenes o videos`);
        return;
      }
      
      if (files.length >= 10) {
        toast.error("Máximo 10 archivos");
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFiles(prev => [...prev, {
          file,
          preview: ev.target.result,
          type: isVideo ? 'video' : 'image',
          name: file.name
        }]);
      };
      reader.readAsDataURL(file);
    });
    
    setResult(null);
    setShowResults(false);
  }, [files.length]);

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const analyze = async () => {
    if (files.length === 0) return toast.error("Sube al menos una imagen o video");
    
    if (!isOnline) {
      toast.warning("Sin conexión. Se procesará cuando vuelvas a tener internet.");
      return;
    }

    setLoading(true);
    setStep(1);
    setShowResults(true);
    setAnalysisProgress("Preparando archivos...");

    try {
      // Separate images and videos
      const images = files.filter(f => f.type === 'image');
      const videos = files.filter(f => f.type === 'video');
      
      let allImages = [];
      
      // Process images
      setAnalysisProgress(`Procesando ${images.length} imagen(es)...`);
      for (const img of images) {
        const base64 = img.preview.split(",")[1];
        allImages.push(base64);
      }
      
      setStep(2);
      
      // Process videos - extract frames on backend
      if (videos.length > 0) {
        setAnalysisProgress(`Extrayendo frames de ${videos.length} video(s)...`);
        for (const vid of videos) {
          const base64 = vid.preview.split(",")[1];
          try {
            const formData = new FormData();
            formData.append('video_base64', base64);
            if (zone) formData.append('search_zone', zone);
            
            // Video analysis returns complete result
            const res = await axios.post(`${API}/analyze-video`, formData);
            // If we have videos, we can use their result directly
            if (res.data && allImages.length === 0) {
              setStep(5);
              setResult(res.data);
              if (res.data.consensus_coordinates) {
                setCenter([res.data.consensus_coordinates.lat, res.data.consensus_coordinates.lng]);
                setZoom(15);
              }
              fetchHistory();
              toast.success(`¡Ubicación encontrada! ${res.data.frames_extracted} frames analizados`);
              setLoading(false);
              return;
            }
          } catch (e) {
            console.error("Video error:", e);
            toast.error("Error procesando video");
          }
        }
      }
      
      setStep(3);
      setAnalysisProgress("Analizando con GPT-5.2 + Gemini...");
      
      // Analyze all images
      if (allImages.length > 0) {
        const res = await axios.post(`${API}/analyze-multi`, {
          images: allImages,
          search_zone: zone || null,
        });
        
        setStep(4);
        setAnalysisProgress("Calculando consenso...");
        
        setTimeout(() => {
          setStep(5);
          setResult(res.data);
          
          if (res.data.consensus_coordinates) {
            setCenter([res.data.consensus_coordinates.lat, res.data.consensus_coordinates.lng]);
            setZoom(15);
          }
          
          fetchHistory();
          const msg = res.data.image_count > 1 
            ? `¡Ubicación encontrada! ${res.data.image_count} imágenes, ${res.data.analysis_count} análisis`
            : "¡Ubicación encontrada!";
          toast.success(msg);
        }, 500);
      }
      
    } catch (e) {
      console.error(e);
      toast.error("Error en análisis");
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = (item) => {
    setResult(item);
    setShowResults(true);
    if (item.consensus_coordinates) {
      setCenter([item.consensus_coordinates.lat, item.consensus_coordinates.lng]);
      setZoom(15);
    }
  };

  const deleteHistory = async (id, e) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/history/${id}`);
      fetchHistory();
      toast.success("Eliminado");
    } catch (e) {
      toast.error("Error");
    }
  };

  const installApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') toast.success("¡App instalada!");
      setDeferredPrompt(null);
      setShowInstall(false);
    }
  };

  const clearAll = () => {
    setFiles([]);
    setResult(null);
    setShowResults(false);
  };

  const getConfClass = (c) => c >= 70 ? "high" : c >= 40 ? "medium" : "low";

  return (
    <div className="app-layout">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="offline-banner">
          <WifiOff className="w-4 h-4 inline mr-2" />
          Sin conexión - Las búsquedas se guardarán para después
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <Target className="w-5 h-5 text-white" />
          </div>
          <h1>Hunter Guiris CC</h1>
        </div>
        <div className="status-pill">
          <div className="status-dot" />
          <span>Online</span>
        </div>
      </header>

      {/* Map */}
      <div className="map-container">
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution="CARTO"
          />
          <MapUpdater center={center} zoom={zoom} />
          {result?.consensus_coordinates && (
            <Marker 
              position={[result.consensus_coordinates.lat, result.consensus_coordinates.lng]}
              icon={customIcon}
            >
              <Popup>
                <div className="p-1 text-gray-900">
                  <p className="font-semibold">{result.consensus_location}</p>
                  <p className="text-sm text-gray-600">{result.consensus_confidence}%</p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Bottom Panel */}
      <div className="bottom-panel">
        {/* Multi-file Upload */}
        <div className="upload-section">
          <div className="upload-header">
            <span className="upload-title">
              <Images className="w-4 h-4" />
              {files.length === 0 ? "Subir imágenes/videos" : `${files.length} archivo(s)`}
            </span>
            {files.length > 0 && (
              <button onClick={clearAll} className="clear-btn">
                <X className="w-4 h-4" /> Limpiar
              </button>
            )}
          </div>
          
          {files.length === 0 ? (
            <div 
              className="upload-zone"
              onClick={() => fileRef.current?.click()}
              data-testid="upload-area"
            >
              <div className="upload-icons">
                <Image className="w-6 h-6" />
                <Plus className="w-4 h-4" />
                <Video className="w-6 h-6" />
              </div>
              <p>Toca para subir imágenes o videos</p>
              <span>Múltiples archivos = Mayor precisión</span>
            </div>
          ) : (
            <div className="files-grid">
              {files.map((f, i) => (
                <div key={i} className="file-thumb">
                  {f.type === 'video' ? (
                    <div className="video-thumb">
                      <Video className="w-6 h-6 text-cyan-400" />
                    </div>
                  ) : (
                    <img src={f.preview} alt={f.name} />
                  )}
                  <button onClick={() => removeFile(i)} className="remove-file">
                    <X className="w-3 h-3" />
                  </button>
                  {loading && i === 0 && (
                    <div className="scan-overlay">
                      <div className="scan-line" />
                    </div>
                  )}
                </div>
              ))}
              {files.length < 10 && (
                <div 
                  className="add-more"
                  onClick={() => fileRef.current?.click()}
                >
                  <Plus className="w-6 h-6" />
                </div>
              )}
            </div>
          )}
        </div>
        
        <input 
          ref={fileRef} 
          type="file" 
          accept="image/*,video/*" 
          onChange={handleFiles} 
          className="hidden" 
          multiple
        />

        {/* Search Zone */}
        <input
          type="text"
          placeholder="Zona de búsqueda (opcional)..."
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          className="search-input"
          data-testid="search-zone-input"
        />

        {/* Analyze Button */}
        <button 
          onClick={analyze} 
          disabled={files.length === 0 || loading}
          className="btn-analyze"
          data-testid="analyze-btn"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> {analysisProgress}</>
          ) : (
            <><Brain className="w-5 h-5" /> RASTREAR UBICACIÓN</>
          )}
        </button>

        {/* Accuracy Info */}
        {files.length > 1 && !loading && (
          <div className="accuracy-boost">
            <Sparkles className="w-4 h-4" />
            <span>{files.length} archivos = {Math.min(99, 60 + files.length * 5)}% precisión potencial</span>
          </div>
        )}

        {/* History */}
        {history.length > 0 && !showResults && files.length === 0 && (
          <div className="history-section">
            <div className="section-title">Historial reciente</div>
            {history.slice(0, 3).map((item) => (
              <div key={item.id} className="history-item" onClick={() => loadHistory(item)}>
                <div className="history-icon">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="history-info">
                  <div className="history-name">{item.consensus_location || "Desconocido"}</div>
                  <div className="history-conf">
                    {item.consensus_confidence}% • {item.image_count || 1} archivo(s)
                  </div>
                </div>
                <button onClick={(e) => deleteHistory(item.id, e)} className="p-2 text-gray-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Results Panel */}
      <div className={`results-panel ${showResults ? 'open' : ''}`}>
        <div className="results-handle" onClick={() => setShowResults(false)} />
        
        <div className="results-header">
          <h3 className="font-semibold">{loading ? 'Analizando...' : 'Resultados'}</h3>
          <button onClick={() => setShowResults(false)} className="p-2 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="progress-list">
            <Step n={1} current={step} label="Preparando archivos" />
            <Step n={2} current={step} label="Extrayendo frames" />
            <Step n={3} current={step} label="Análisis GPT-5.2 + Gemini" badge="dual" />
            <Step n={4} current={step} label="Google Maps + Consenso" />
            <Step n={5} current={step} label="Resultado final" />
          </div>
        )}

        {result && !loading && (
          <div className="results-content">
            {/* Stats */}
            {(result.image_count > 1 || result.analysis_count > 2) && (
              <div className="analysis-stats">
                <div className="stat">
                  <span className="stat-value">{result.image_count || 1}</span>
                  <span className="stat-label">Archivos</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{result.analysis_count || 2}</span>
                  <span className="stat-label">Análisis</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{result.landmarks?.length || 0}</span>
                  <span className="stat-label">Pistas</span>
                </div>
              </div>
            )}

            {/* Consensus */}
            <div className="consensus-card">
              <div className="consensus-location" data-testid="consensus-location">
                {result.consensus_location || "Ubicación desconocida"}
              </div>
              {result.place_details?.formatted_address && (
                <div className="consensus-address">{result.place_details.formatted_address}</div>
              )}
              <div className="confidence-row">
                <span className="confidence-label">Confianza</span>
                <span className="confidence-value" data-testid="consensus-confidence">
                  {result.consensus_confidence}%
                </span>
              </div>
              <div className="confidence-bar">
                <div 
                  className={`confidence-fill ${getConfClass(result.consensus_confidence)}`}
                  style={{ width: `${result.consensus_confidence}%` }}
                />
              </div>
              {result.consensus_coordinates && (
                <div className="coords-box" data-testid="coordinates">
                  <Navigation className="w-4 h-4" />
                  {result.consensus_coordinates.lat.toFixed(5)}, {result.consensus_coordinates.lng.toFixed(5)}
                </div>
              )}
            </div>

            {/* Landmarks */}
            {result.landmarks?.length > 0 && (
              <div className="landmarks-section">
                <div className="section-title">Pistas identificadas</div>
                <div className="landmarks-list">
                  {result.landmarks.slice(0, 8).map((l, i) => (
                    <span key={i} className="landmark-tag">{l}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Nearby Places */}
            {result.nearby_places?.length > 0 && (
              <div className="nearby-section">
                <div className="section-title">Lugares cercanos</div>
                <div className="nearby-list">
                  {result.nearby_places.slice(0, 3).map((p, i) => (
                    <div key={i} className="nearby-item">
                      <div className="nearby-icon">
                        <Building className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="nearby-info">
                        <div className="nearby-name">{p.name}</div>
                        {p.vicinity && <div className="nearby-address">{p.vicinity}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Analysis */}
            {result.gpt_analysis && (
              <div className="ai-card gpt" data-testid="gpt-analysis-card">
                <div className="ai-header">
                  <span className="ai-badge gpt"><Sparkles className="w-3 h-3" /> GPT-5.2</span>
                  <span className="ai-confidence gpt">{result.gpt_analysis.confidence}%</span>
                </div>
                <div className="ai-location">{result.gpt_analysis.location_guess}</div>
                <div className="ai-reasoning">{result.gpt_analysis.reasoning}</div>
              </div>
            )}

            {result.gemini_analysis && (
              <div className="ai-card gemini" data-testid="gemini-analysis-card">
                <div className="ai-header">
                  <span className="ai-badge gemini"><Sparkles className="w-3 h-3" /> Gemini</span>
                  <span className="ai-confidence gemini">{result.gemini_analysis.confidence}%</span>
                </div>
                <div className="ai-location">{result.gemini_analysis.location_guess}</div>
                <div className="ai-reasoning">{result.gemini_analysis.reasoning}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Install Prompt */}
      {showInstall && (
        <div className="install-prompt">
          <div className="install-content">
            <div className="logo-icon">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div className="install-text">
              <h4>Instalar Hunter Guiris CC</h4>
              <p>Añade la app a tu móvil</p>
            </div>
            <button onClick={installApp} className="install-btn">
              <Download className="w-4 h-4 inline mr-1" /> Instalar
            </button>
            <button onClick={() => setShowInstall(false)} className="install-close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <Toaster position="top-center" theme="dark" />
    </div>
  );
};

// Progress Step
const Step = ({ n, current, label, badge }) => {
  const done = current > n;
  const active = current === n;
  return (
    <div className="progress-step">
      <div className={`step-icon ${done ? 'done' : active ? 'active' : 'pending'}`}>
        {done ? <CheckCircle className="w-4 h-4" /> : active ? <Loader2 className="w-4 h-4 animate-spin" /> : n}
      </div>
      <span className={`step-label ${done ? 'done' : active ? 'active' : ''}`}>{label}</span>
      {badge === 'dual' && <span className="dual-badge">2 IAs</span>}
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HunterApp />} />
      </Routes>
    </BrowserRouter>
  );
}
