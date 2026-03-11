import { useState, useCallback, useEffect, useRef } from "react";
import "@/App.css";
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
  Globe,
  Sparkles,
  X,
  Building,
  Navigation,
  Map
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster, toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Custom marker icon
const customIcon = new L.DivIcon({
  className: 'custom-marker',
  html: `
    <div style="
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #00d4ff, #6366f1);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid #0a0a0f;
      box-shadow: 0 0 20px rgba(0, 212, 255, 0.5);
      position: relative;
    ">
      <div style="
        width: 8px;
        height: 8px;
        background: #0a0a0f;
        border-radius: 50%;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      "></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24],
});

// Map updater
const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom, { duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
};

// Main Dashboard
const GeoHunterDashboard = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [searchZone, setSearchZone] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [history, setHistory] = useState([]);
  const [mapCenter, setMapCenter] = useState([20, 0]);
  const [mapZoom, setMapZoom] = useState(2);
  const [showResults, setShowResults] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await axios.get(`${API}/history`);
      setHistory(response.data);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const handleImageSelect = useCallback((event) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
        toast.error("Please upload a JPEG, PNG, or WEBP image");
        return;
      }
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
      setAnalysisResult(null);
      setShowResults(false);
    }
  }, []);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
      setAnalysisResult(null);
      setShowResults(false);
    } else {
      toast.error("Please upload a JPEG, PNG, or WEBP image");
    }
  }, []);

  const analyzeImage = async () => {
    if (!selectedImage) {
      toast.error("Please select an image first");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStep(1);
    setShowResults(true);

    const reader = new FileReader();
    reader.readAsDataURL(selectedImage);
    
    reader.onload = async () => {
      const base64 = reader.result.split(",")[1];
      
      setTimeout(() => setAnalysisStep(2), 800);
      setTimeout(() => setAnalysisStep(3), 2000);
      
      try {
        const response = await axios.post(`${API}/analyze`, {
          image_base64: base64,
          search_zone: searchZone || null,
        });
        
        setAnalysisStep(4);
        setTimeout(() => setAnalysisStep(5), 500);
        setAnalysisResult(response.data);
        
        if (response.data.consensus_coordinates) {
          setMapCenter([
            response.data.consensus_coordinates.lat,
            response.data.consensus_coordinates.lng,
          ]);
          setMapZoom(14);
        }
        
        fetchHistory();
        toast.success("Location identified successfully!");
        
      } catch (error) {
        console.error("Analysis error:", error);
        toast.error("Analysis failed. Please try again.");
        setAnalysisStep(0);
      } finally {
        setIsAnalyzing(false);
      }
    };
  };

  const loadHistoryItem = (item) => {
    setAnalysisResult(item);
    setShowResults(true);
    if (item.consensus_coordinates) {
      setMapCenter([item.consensus_coordinates.lat, item.consensus_coordinates.lng]);
      setMapZoom(14);
    }
  };

  const deleteHistoryItem = async (id, event) => {
    event.stopPropagation();
    try {
      await axios.delete(`${API}/history/${id}`);
      fetchHistory();
      toast.success("Deleted");
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setAnalysisResult(null);
    setShowResults(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getConfidenceClass = (c) => c >= 70 ? "confidence-high" : c >= 40 ? "confidence-medium" : "confidence-low";

  return (
    <div className="geohunter-app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <div className="logo-icon">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div className="logo-text">
              <h1>GeoHunter AI</h1>
              <p>Mega Brain Intelligence</p>
            </div>
          </div>
        </div>

        <div className="sidebar-content">
          {/* Upload Section */}
          <div className="sidebar-section">
            <div className="section-label">
              <Upload className="w-4 h-4" />
              <span>Upload Image</span>
            </div>
            
            <div
              className={`upload-zone ${imagePreview ? 'has-image' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              data-testid="upload-area"
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Selected" />
                  <button
                    onClick={(e) => { e.stopPropagation(); clearImage(); }}
                    className="clear-image-btn"
                    data-testid="clear-image-btn"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-lg">
                      <div className="scan-line" />
                    </div>
                  )}
                </>
              ) : (
                <div className="upload-placeholder">
                  <Globe className="w-10 h-10 text-zinc-600 mx-auto" />
                  <p>Drop image or click to upload</p>
                  <span>JPEG, PNG, WEBP supported</span>
                </div>
              )}
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelect}
              className="hidden"
              data-testid="file-input"
            />
          </div>

          {/* Search Zone */}
          <div className="sidebar-section">
            <div className="section-label">
              <Map className="w-4 h-4" />
              <span>Search Zone (Optional)</span>
            </div>
            
            <input
              type="text"
              placeholder="Country, city, or region..."
              value={searchZone}
              onChange={(e) => setSearchZone(e.target.value)}
              className="input-styled w-full h-11 px-4 rounded-lg"
              data-testid="search-zone-input"
            />
            
            <Button
              onClick={analyzeImage}
              disabled={!selectedImage || isAnalyzing}
              className="btn-primary w-full h-12 rounded-lg mt-4"
              data-testid="analyze-btn"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5 mr-2" />
                  Hunt Location
                </>
              )}
            </Button>
          </div>

          {/* History */}
          <div className="sidebar-section">
            <div className="section-label">
              <History className="w-4 h-4" />
              <span>Recent Hunts</span>
            </div>
            
            <ScrollArea className="h-[200px]">
              <div className="history-list">
                {history.length === 0 ? (
                  <p className="text-sm text-zinc-600 py-4 text-center">No history yet</p>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className="history-item"
                      onClick={() => loadHistoryItem(item)}
                      data-testid={`history-item-${item.id}`}
                    >
                      <div className="history-icon">
                        <MapPin className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div className="history-info">
                        <h4>{item.consensus_location || "Unknown"}</h4>
                        <p>{item.consensus_confidence}% confidence</p>
                      </div>
                      <button
                        onClick={(e) => deleteHistoryItem(item.id, e)}
                        className="history-delete"
                        data-testid={`delete-history-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="status-row">
            <div className="status-group">
              <div className="status-indicator status-online" />
              <span>Systems Online</span>
            </div>
            <div className="ai-status">
              <span className="gpt">GPT-5.2</span>
              <span className="gemini">Gemini</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Map */}
      <main className="map-stage">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: "100%", width: "100%", background: "#0a0a0f" }}
          zoomControl={true}
          data-testid="leaflet-map"
        >
          <TileLayer
            attribution='&copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapUpdater center={mapCenter} zoom={mapZoom} />
          {analysisResult?.consensus_coordinates && (
            <Marker 
              position={[
                analysisResult.consensus_coordinates.lat,
                analysisResult.consensus_coordinates.lng
              ]}
              icon={customIcon}
            >
              <Popup>
                <div className="p-2">
                  <p className="font-semibold text-gray-900">{analysisResult.consensus_location}</p>
                  <p className="text-sm text-gray-600">{analysisResult.consensus_confidence}% confidence</p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Results Panel */}
        {showResults && (
          <div className="results-panel glass-elevated fade-in" data-testid="results-panel">
            <div className="results-header">
              <h3 className="text-lg font-semibold" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                {isAnalyzing ? 'Analyzing...' : 'Analysis Results'}
              </h3>
              <button onClick={() => setShowResults(false)} className="close-btn" data-testid="close-results-btn">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress */}
            {isAnalyzing && (
              <div className="progress-steps">
                <ProgressStep step={1} current={analysisStep} label="Processing Image" />
                <ProgressStep step={2} current={analysisStep} label="GPT-5.2 Analysis" badge="gpt" />
                <ProgressStep step={3} current={analysisStep} label="Gemini Analysis" badge="gemini" />
                <ProgressStep step={4} current={analysisStep} label="Google Maps Enrichment" />
                <ProgressStep step={5} current={analysisStep} label="Calculating Consensus" />
              </div>
            )}

            {/* Results */}
            {analysisResult && !isAnalyzing && (
              <ScrollArea className="results-content">
                {/* Consensus */}
                <div className="p-5 border-b border-white/5">
                  <div className="consensus-card">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Consensus Location</p>
                        <h2 className="text-2xl font-bold text-glow-cyan" data-testid="consensus-location">
                          {analysisResult.consensus_location || "Unknown"}
                        </h2>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Confidence</p>
                        <p className="text-3xl font-light" data-testid="consensus-confidence">
                          {analysisResult.consensus_confidence}%
                        </p>
                      </div>
                    </div>
                    
                    <div className="confidence-bar-bg mb-4">
                      <div 
                        className={`confidence-bar-fill ${getConfidenceClass(analysisResult.consensus_confidence)}`}
                        style={{ width: `${analysisResult.consensus_confidence}%` }}
                      />
                    </div>
                    
                    {analysisResult.consensus_coordinates && (
                      <div className="coords-box" data-testid="coordinates">
                        <Navigation className="w-4 h-4" />
                        <span>{analysisResult.consensus_coordinates.lat.toFixed(6)}</span>
                        <span className="text-zinc-500">/</span>
                        <span>{analysisResult.consensus_coordinates.lng.toFixed(6)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Place Details from Google Maps */}
                {analysisResult.place_details && (
                  <div className="p-5 border-b border-white/5">
                    <div className="section-label mb-3">
                      <Map className="w-4 h-4" />
                      <span>Google Maps Data</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      {analysisResult.place_details.formatted_address && (
                        <p className="text-zinc-300">{analysisResult.place_details.formatted_address}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {analysisResult.place_details.country && (
                          <span className="landmark-tag">{analysisResult.place_details.country}</span>
                        )}
                        {analysisResult.place_details.administrative_area && (
                          <span className="landmark-tag">{analysisResult.place_details.administrative_area}</span>
                        )}
                        {analysisResult.place_details.locality && (
                          <span className="landmark-tag">{analysisResult.place_details.locality}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Nearby Places */}
                {analysisResult.nearby_places && analysisResult.nearby_places.length > 0 && (
                  <div className="p-5 border-b border-white/5">
                    <div className="section-label mb-3">
                      <Building className="w-4 h-4" />
                      <span>Nearby Places</span>
                    </div>
                    <div className="space-y-2">
                      {analysisResult.nearby_places.map((place, idx) => (
                        <div key={idx} className="nearby-item">
                          <div className="nearby-item-icon">
                            <MapPin className="w-4 h-4 text-cyan-400" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-white">{place.name}</p>
                            {place.vicinity && (
                              <p className="text-xs text-zinc-500">{place.vicinity}</p>
                            )}
                          </div>
                          {place.rating && (
                            <span className="text-xs text-amber-400">{place.rating}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* GPT Analysis */}
                {analysisResult.gpt_analysis && (
                  <div className="p-5 border-b border-white/5">
                    <AICard analysis={analysisResult.gpt_analysis} type="gpt" />
                  </div>
                )}

                {/* Gemini Analysis */}
                {analysisResult.gemini_analysis && (
                  <div className="p-5">
                    <AICard analysis={analysisResult.gemini_analysis} type="gemini" />
                  </div>
                )}
              </ScrollArea>
            )}
          </div>
        )}

        {/* Welcome */}
        {!showResults && !imagePreview && (
          <div className="welcome-overlay">
            <div className="welcome-content fade-in">
              <div className="welcome-icon">
                <Globe className="w-12 h-12 text-cyan-400" />
              </div>
              <h2 className="welcome-title">
                <span className="cyan">Geo</span><span className="purple">Hunter</span>
              </h2>
              <p className="welcome-subtitle">Upload an image to begin location analysis</p>
            </div>
          </div>
        )}
      </main>

      <Toaster 
        position="bottom-right" 
        theme="dark"
        toastOptions={{
          style: {
            background: '#1a1a24',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f8fafc',
            borderRadius: '12px',
          },
        }}
      />
    </div>
  );
};

// Progress Step
const ProgressStep = ({ step, current, label, badge }) => {
  const isActive = current === step;
  const isCompleted = current > step;

  return (
    <div className="progress-step">
      <div className={`step-icon ${isCompleted ? 'completed' : isActive ? 'active' : 'pending'}`}>
        {isCompleted ? <CheckCircle className="w-4 h-4" /> : isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : step}
      </div>
      <span className={`step-label ${isCompleted ? 'completed' : isActive ? 'active' : ''}`}>{label}</span>
      {badge && <span className={`ai-badge ai-badge-${badge} ml-auto`}>{badge === 'gpt' ? 'GPT-5.2' : 'Gemini'}</span>}
    </div>
  );
};

// AI Card
const AICard = ({ analysis, type }) => {
  const isGPT = type === "gpt";
  
  return (
    <div className={`analysis-card ${type}`} data-testid={`${type}-analysis-card`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`ai-badge ai-badge-${type}`}>
            <Sparkles className="w-3 h-3" />
            {analysis.provider} {analysis.model}
          </span>
        </div>
        <span className={`text-lg font-semibold ${isGPT ? 'text-indigo-400' : 'text-cyan-400'}`}>
          {analysis.confidence}%
        </span>
      </div>
      
      <div className="space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Location</p>
          <p className="text-white" data-testid={`${type}-location`}>{analysis.location_guess}</p>
        </div>
        
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Reasoning</p>
          <p className="text-sm text-zinc-400 leading-relaxed">{analysis.reasoning}</p>
        </div>
        
        {analysis.landmarks?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Landmarks</p>
            <div className="flex flex-wrap gap-2">
              {analysis.landmarks.map((l, i) => (
                <span key={i} className="landmark-tag">
                  <MapPin className="w-3 h-3" />
                  {l}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GeoHunterDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
