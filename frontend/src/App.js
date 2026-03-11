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
  ChevronUp
} from "lucide-react";
import { Toaster, toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Custom marker
const customIcon = new L.DivIcon({
  className: 'custom-marker',
  html: `<div style="
    width: 20px; height: 20px;
    background: linear-gradient(135deg, #00d4ff, #8b5cf6);
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 2px solid #08080c;
    box-shadow: 0 0 15px rgba(0,212,255,0.6);
  "><div style="
    width: 6px; height: 6px;
    background: #08080c;
    border-radius: 50%;
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
  "></div></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 20],
});

const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 1 });
  }, [center, zoom, map]);
  return null;
};

const HunterApp = () => {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
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
  const fileRef = useRef(null);

  useEffect(() => {
    fetchHistory();
    
    // Online/Offline detection
    const handleOnline = () => { setIsOnline(true); toast.success("Conexión restaurada"); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // PWA Install prompt
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

  const handleImage = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file && file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setImage(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(file);
      setResult(null);
      setShowResults(false);
    } else {
      toast.error("Solo JPEG, PNG o WEBP");
    }
  }, []);

  const analyze = async () => {
    if (!image) return toast.error("Sube una imagen primero");
    
    if (!isOnline) {
      toast.warning("Sin conexión. Se procesará cuando vuelvas a tener internet.");
      return;
    }

    setLoading(true);
    setStep(1);
    setShowResults(true);

    const reader = new FileReader();
    reader.readAsDataURL(image);
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
      
      setTimeout(() => setStep(2), 600);
      setTimeout(() => setStep(3), 1500);
      
      try {
        const res = await axios.post(`${API}/analyze`, {
          image_base64: base64,
          search_zone: zone || null,
        });
        
        setStep(4);
        setTimeout(() => setStep(5), 400);
        setResult(res.data);
        
        if (res.data.consensus_coordinates) {
          setCenter([res.data.consensus_coordinates.lat, res.data.consensus_coordinates.lng]);
          setZoom(15);
        }
        
        fetchHistory();
        toast.success("¡Ubicación encontrada!");
      } catch (e) {
        console.error(e);
        toast.error("Error en análisis");
        setStep(0);
      } finally {
        setLoading(false);
      }
    };
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
        {/* Upload */}
        <div 
          className={`upload-zone ${preview ? 'has-image' : ''}`}
          onClick={() => fileRef.current?.click()}
          data-testid="upload-area"
        >
          {preview ? (
            <div className="relative">
              <img src={preview} alt="Preview" />
              {loading && (
                <div className="scan-overlay">
                  <div className="scan-line" />
                </div>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); setImage(null); setPreview(null); }}
                className="absolute top-1 right-1 p-1 bg-black/70 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="upload-text">
              <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Toca para subir imagen</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />

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
          disabled={!image || loading}
          className="btn-analyze"
          data-testid="analyze-btn"
        >
          {loading ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Rastreando...</>
          ) : (
            <><Brain className="w-5 h-5" /> RASTREAR UBICACIÓN</>
          )}
        </button>

        {/* History */}
        {history.length > 0 && !showResults && (
          <div className="history-section">
            <div className="section-title">Historial reciente</div>
            {history.slice(0, 3).map((item) => (
              <div key={item.id} className="history-item" onClick={() => loadHistory(item)}>
                <div className="history-icon">
                  <MapPin className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="history-info">
                  <div className="history-name">{item.consensus_location || "Desconocido"}</div>
                  <div className="history-conf">{item.consensus_confidence}% confianza</div>
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
            <Step n={1} current={step} label="Procesando imagen" />
            <Step n={2} current={step} label="Análisis GPT-5.2" badge="gpt" />
            <Step n={3} current={step} label="Análisis Gemini" badge="gemini" />
            <Step n={4} current={step} label="Google Maps" />
            <Step n={5} current={step} label="Calculando consenso" />
          </div>
        )}

        {result && !loading && (
          <div className="results-content">
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
      {badge && <span className={`ai-badge ${badge} ml-auto`}>{badge === 'gpt' ? 'GPT' : 'Gemini'}</span>}
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
