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
  Search, 
  Brain, 
  Crosshair, 
  History, 
  Trash2,
  ChevronDown,
  CheckCircle,
  Loader2,
  Target,
  Globe,
  Sparkles,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Toaster, toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Custom marker icon
const customIcon = new L.DivIcon({
  className: 'custom-marker',
  html: `
    <div style="
      width: 30px;
      height: 30px;
      background: linear-gradient(135deg, #00F0FF, #7000FF);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid #050505;
      box-shadow: 0 0 20px rgba(0, 240, 255, 0.6);
    ">
      <div style="
        width: 10px;
        height: 10px;
        background: #050505;
        border-radius: 50%;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      "></div>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
});

// Map updater component
const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom, { duration: 1.5 });
    }
  }, [center, zoom, map]);
  return null;
};

// Main Dashboard Component
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

  // Fetch history on mount
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
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
      setAnalysisResult(null);
      setShowResults(false);
    }
  }, []);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
      setAnalysisResult(null);
      setShowResults(false);
    } else {
      toast.error("Please upload a JPEG, PNG, or WEBP image");
    }
  }, []);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const analyzeImage = async () => {
    if (!selectedImage) {
      toast.error("Please select an image first");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStep(1);
    setShowResults(true);

    try {
      // Convert image to base64
      const reader = new FileReader();
      reader.readAsDataURL(selectedImage);
      
      reader.onload = async () => {
        const base64 = reader.result.split(",")[1];
        
        // Simulate step progression for UX
        setTimeout(() => setAnalysisStep(2), 500);
        setTimeout(() => setAnalysisStep(3), 1500);
        
        try {
          const response = await axios.post(`${API}/analyze`, {
            image_base64: base64,
            search_zone: searchZone || null,
          });
          
          setAnalysisStep(4);
          setAnalysisResult(response.data);
          
          // Update map if coordinates available
          if (response.data.consensus_coordinates) {
            setMapCenter([
              response.data.consensus_coordinates.lat,
              response.data.consensus_coordinates.lng,
            ]);
            setMapZoom(12);
          }
          
          // Refresh history
          fetchHistory();
          toast.success("Location analysis complete!");
          
        } catch (error) {
          console.error("Analysis error:", error);
          toast.error("Analysis failed. Please try again.");
          setAnalysisStep(0);
        } finally {
          setIsAnalyzing(false);
        }
      };
    } catch (error) {
      console.error("Image processing error:", error);
      toast.error("Failed to process image");
      setIsAnalyzing(false);
      setAnalysisStep(0);
    }
  };

  const loadHistoryItem = (item) => {
    setAnalysisResult(item);
    setShowResults(true);
    if (item.consensus_coordinates) {
      setMapCenter([
        item.consensus_coordinates.lat,
        item.consensus_coordinates.lng,
      ]);
      setMapZoom(12);
    }
  };

  const deleteHistoryItem = async (id, event) => {
    event.stopPropagation();
    try {
      await axios.delete(`${API}/history/${id}`);
      fetchHistory();
      toast.success("Item deleted");
    } catch (error) {
      toast.error("Failed to delete");
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setAnalysisResult(null);
    setShowResults(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getConfidenceClass = (confidence) => {
    if (confidence >= 70) return "confidence-high";
    if (confidence >= 40) return "confidence-medium";
    return "confidence-low";
  };

  return (
    <div className="geohunter-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-wider neon-cyan" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                GEOHUNTER
              </h1>
              <p className="text-[10px] text-zinc-500 tracking-widest uppercase">AI Mega Brain</p>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="p-6 space-y-4">
          <div className="section-header flex items-center gap-2">
            <Upload className="w-4 h-4" />
            <span>Upload Image</span>
          </div>
          
          <div
            className={`upload-area ${imagePreview ? 'has-image' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            data-testid="upload-area"
          >
            {imagePreview ? (
              <>
                <img src={imagePreview} alt="Selected" className="rounded" />
                <button
                  onClick={(e) => { e.stopPropagation(); clearImage(); }}
                  className="absolute top-2 right-2 p-1 bg-black/70 rounded-full hover:bg-red-500/50 transition-colors"
                  data-testid="clear-image-btn"
                >
                  <X className="w-4 h-4" />
                </button>
                {isAnalyzing && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="scan-line" />
                  </div>
                )}
              </>
            ) : (
              <>
                <Globe className="w-12 h-12 text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-400">Drop image or click to upload</p>
                <p className="text-xs text-zinc-600 mt-1">JPEG, PNG, WEBP</p>
              </>
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
        <div className="px-6 pb-6 space-y-4">
          <div className="section-header flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            <span>Search Zone (Optional)</span>
          </div>
          
          <input
            type="text"
            placeholder="Country, city, or region..."
            value={searchZone}
            onChange={(e) => setSearchZone(e.target.value)}
            className="input-cyber w-full"
            data-testid="search-zone-input"
          />
          
          <Button
            onClick={analyzeImage}
            disabled={!selectedImage || isAnalyzing}
            className="w-full h-12 bg-cyan-500 hover:bg-cyan-400 text-black font-bold uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="flex-1 px-6 pb-6 overflow-hidden flex flex-col">
          <div className="section-header flex items-center gap-2">
            <History className="w-4 h-4" />
            <span>Recent Hunts</span>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="space-y-2 pr-2">
              {history.length === 0 ? (
                <p className="text-sm text-zinc-600 py-4 text-center">No history yet</p>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="history-item group"
                    onClick={() => loadHistoryItem(item)}
                    data-testid={`history-item-${item.id}`}
                  >
                    <div className="w-10 h-10 bg-zinc-800 rounded flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-cyan-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {item.consensus_location || "Unknown"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {item.consensus_confidence}% confidence
                      </p>
                    </div>
                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
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

        {/* Status Bar */}
        <div className="p-4 border-t border-white/10 bg-black/30">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="status-dot status-active" />
              <span className="text-zinc-500">Systems Online</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-purple-400">GPT-5.2</span>
              <span className="text-cyan-400">Gemini</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Map Stage */}
      <main className="map-stage">
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: "100%", width: "100%", background: "#050505" }}
          zoomControl={true}
          data-testid="leaflet-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
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
                <div className="text-black font-semibold">
                  {analysisResult.consensus_location}
                </div>
                <div className="text-gray-600 text-sm">
                  Confidence: {analysisResult.consensus_confidence}%
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Results Panel */}
        {showResults && (
          <div className="results-panel glass-card rounded-xl overflow-hidden fade-in-up" data-testid="results-panel">
            {/* Analysis Progress */}
            {isAnalyzing && (
              <div className="p-6 border-b border-white/10">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-cyan-400 mb-4" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                  Analyzing Location...
                </h3>
                <div className="space-y-3">
                  <AnalysisStep step={1} current={analysisStep} label="Processing Image" />
                  <AnalysisStep step={2} current={analysisStep} label="GPT-5.2 Analysis" icon="gpt" />
                  <AnalysisStep step={3} current={analysisStep} label="Gemini Analysis" icon="gemini" />
                  <AnalysisStep step={4} current={analysisStep} label="Consensus Calculation" />
                </div>
              </div>
            )}

            {/* Results Content */}
            {analysisResult && !isAnalyzing && (
              <ScrollArea className="max-h-[calc(100vh-100px)]">
                {/* Consensus Result */}
                <div className="p-6 border-b border-white/10">
                  <div className="consensus-card">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Consensus Location</p>
                        <h2 className="text-2xl font-bold neon-cyan" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="consensus-location">
                          {analysisResult.consensus_location || "Unknown"}
                        </h2>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Confidence</p>
                        <p className="text-3xl font-light text-white" style={{ fontFamily: 'Rajdhani, sans-serif' }} data-testid="consensus-confidence">
                          {analysisResult.consensus_confidence}%
                        </p>
                      </div>
                    </div>
                    
                    <div className="confidence-bar">
                      <div 
                        className={`confidence-fill ${getConfidenceClass(analysisResult.consensus_confidence)}`}
                        style={{ width: `${analysisResult.consensus_confidence}%` }}
                      />
                    </div>
                    
                    {analysisResult.consensus_coordinates && (
                      <div className="mt-4">
                        <div className="coords-display" data-testid="coordinates">
                          <Crosshair className="w-4 h-4" />
                          <span>{analysisResult.consensus_coordinates.lat.toFixed(6)}</span>
                          <span>/</span>
                          <span>{analysisResult.consensus_coordinates.lng.toFixed(6)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* GPT Analysis */}
                {analysisResult.gpt_analysis && (
                  <div className="p-6 border-b border-white/10">
                    <AIAnalysisCard analysis={analysisResult.gpt_analysis} type="gpt" />
                  </div>
                )}

                {/* Gemini Analysis */}
                {analysisResult.gemini_analysis && (
                  <div className="p-6">
                    <AIAnalysisCard analysis={analysisResult.gemini_analysis} type="gemini" />
                  </div>
                )}
              </ScrollArea>
            )}

            {/* Close Button */}
            <button
              onClick={() => setShowResults(false)}
              className="absolute top-4 right-4 p-2 bg-black/50 rounded-full hover:bg-white/10 transition-colors"
              data-testid="close-results-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Welcome Overlay */}
        {!showResults && !imagePreview && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-center fade-in-up">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-600/20 flex items-center justify-center pulse-glow">
                <Globe className="w-12 h-12 text-cyan-500" />
              </div>
              <h2 className="text-4xl font-bold uppercase tracking-wider mb-2" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
                <span className="neon-cyan">GEO</span><span className="neon-purple">HUNTER</span>
              </h2>
              <p className="text-zinc-500 text-sm tracking-widest uppercase">
                Upload an image to begin location analysis
              </p>
            </div>
          </div>
        )}
      </main>

      <Toaster 
        position="bottom-right" 
        theme="dark"
        toastOptions={{
          style: {
            background: '#0A0A0A',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff',
          },
        }}
      />
    </div>
  );
};

// Analysis Step Component
const AnalysisStep = ({ step, current, label, icon }) => {
  const isActive = current === step;
  const isCompleted = current > step;
  const isPending = current < step;

  return (
    <div className={`progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isPending ? 'pending' : ''}`}>
      <div className="step-indicator">
        {isCompleted ? (
          <CheckCircle className="w-4 h-4" />
        ) : isActive ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          step
        )}
      </div>
      <span className={`text-sm ${isActive ? 'text-cyan-400' : isCompleted ? 'text-green-400' : 'text-zinc-600'}`}>
        {label}
      </span>
      {icon && (
        <span className={`ml-auto text-xs ${icon === 'gpt' ? 'text-purple-400' : 'text-cyan-400'}`}>
          {icon === 'gpt' ? 'GPT-5.2' : 'Gemini'}
        </span>
      )}
    </div>
  );
};

// AI Analysis Card Component
const AIAnalysisCard = ({ analysis, type }) => {
  const isGPT = type === "gpt";
  
  return (
    <div className={`ai-card ${type}`} data-testid={`${type}-analysis-card`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded flex items-center justify-center ${isGPT ? 'badge-gpt' : 'badge-gemini'}`}>
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-semibold uppercase tracking-wider" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
            {analysis.provider}
          </span>
          <span className="text-xs text-zinc-500">{analysis.model}</span>
        </div>
        <span className={`text-lg font-light ${isGPT ? 'text-purple-400' : 'text-cyan-400'}`}>
          {analysis.confidence}%
        </span>
      </div>
      
      <div className="space-y-3">
        <div>
          <p className="data-label">Location Guess</p>
          <p className="data-value" data-testid={`${type}-location`}>{analysis.location_guess}</p>
        </div>
        
        <div>
          <p className="data-label">Reasoning</p>
          <p className="text-sm text-zinc-400 leading-relaxed">{analysis.reasoning}</p>
        </div>
        
        {analysis.landmarks && analysis.landmarks.length > 0 && (
          <div>
            <p className="data-label">Identified Landmarks</p>
            <div className="flex flex-wrap gap-2 mt-1">
              {analysis.landmarks.map((landmark, idx) => (
                <span key={idx} className="landmark-tag">
                  <MapPin className="w-3 h-3" />
                  {landmark}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {analysis.coordinates && (
          <div>
            <p className="data-label">Coordinates</p>
            <div className="coords-display text-xs" style={{ background: isGPT ? 'rgba(112,0,255,0.1)' : 'rgba(0,240,255,0.1)', color: isGPT ? '#BC13FE' : '#00F0FF' }}>
              <span>{analysis.coordinates.lat?.toFixed(4)}</span>
              <span>/</span>
              <span>{analysis.coordinates.lng?.toFixed(4)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GeoHunterDashboard />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
