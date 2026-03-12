import { useState, useCallback, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams, useLocation, Navigate } from "react-router-dom";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { 
  Upload, 
  MapPin, 
  Brain, 
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
  Images,
  Eye,
  Map,
  Layers,
  Globe,
  Camera,
  Compass,
  Phone,
  Share2,
  Search,
  Filter,
  ChevronRight,
  BarChart3,
  Clock,
  MapPinned,
  Wifi,
  Send,
  Copy,
  Check,
  AlertTriangle,
  List,
  Grid,
  LogOut,
  User,
  Shield,
  Lock
} from "lucide-react";
import { Toaster, toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const GOOGLE_MAPS_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

// Configure axios to send cookies
axios.defaults.withCredentials = true;

// Custom markers
const createCustomIcon = (color = '#00d4ff') => new L.DivIcon({
  className: 'custom-marker',
  html: `<div class="marker-pulse" style="background: ${color}40"></div><div class="marker-pin" style="background: linear-gradient(135deg, ${color}, ${color}aa)"></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
});

const alternativeIcon = createCustomIcon('#f59e0b');
const mainIcon = createCustomIcon('#00d4ff');

// Auth Context
const AuthContext = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // CRITICAL: If returning from OAuth callback, skip the /me check
    // AuthCallback will exchange the session_id and establish the session first
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      setUser(null);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="auth-loading">
        <Loader2 className="w-12 h-12 animate-spin" />
        <span>Verificando autenticación...</span>
      </div>
    );
  }

  return children({ user, setUser, checkAuth });
};

// Login Page
const LoginPage = () => {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-icon-large">
            <Target className="w-12 h-12" />
          </div>
          <h1>Hunter Guiris CC</h1>
          <p>Multi-AI Geolocation System</p>
        </div>
        
        <div className="login-security">
          <Shield className="w-6 h-6" />
          <div>
            <h3>Acceso Restringido</h3>
            <p>Solo usuarios autorizados pueden acceder a esta herramienta de geolocalización.</p>
          </div>
        </div>

        <button onClick={handleLogin} className="login-btn">
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          <span>Iniciar sesión con Google</span>
        </button>

        <p className="login-note">
          <Lock className="w-4 h-4" />
          Herramienta exclusiva para uso policial autorizado
        </p>
      </div>
    </div>
  );
};

// Auth Callback Component
const AuthCallback = ({ setUser }) => {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      const hash = window.location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (sessionIdMatch) {
        const sessionId = sessionIdMatch[1];
        
        try {
          const response = await axios.post(`${API}/auth/session`, {
            session_id: sessionId
          });
          
          setUser(response.data);
          toast.success(`Bienvenido, ${response.data.name}`);
          navigate('/', { replace: true, state: { user: response.data } });
        } catch (error) {
          console.error('Auth error:', error);
          if (error.response?.status === 403) {
            toast.error('Acceso denegado. No tienes autorización para usar esta aplicación.');
          } else {
            toast.error('Error de autenticación');
          }
          navigate('/login', { replace: true });
        }
      } else {
        navigate('/login', { replace: true });
      }
    };

    processAuth();
  }, [navigate, setUser]);

  return (
    <div className="auth-loading">
      <Loader2 className="w-12 h-12 animate-spin" />
      <span>Autenticando...</span>
    </div>
  );
};

// Protected Route
const ProtectedRoute = ({ user, children }) => {
  const location = useLocation();
  
  // If user data passed from AuthCallback, render children
  if (location.state?.user || user) {
    return children;
  }
  
  return <Navigate to="/login" replace />;
};

const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
};

// Street View Component
const StreetViewPanel = ({ lat, lng, onClose }) => {
  const streetViewRef = useRef(null);
  
  useEffect(() => {
    if (!lat || !lng || !window.google) return;
    
    const panorama = new window.google.maps.StreetViewPanorama(
      streetViewRef.current,
      {
        position: { lat, lng },
        pov: { heading: 0, pitch: 0 },
        zoom: 1,
        addressControl: true,
        fullscreenControl: true,
        motionTracking: false,
        motionTrackingControl: false,
        showRoadLabels: true,
      }
    );
    
    const sv = new window.google.maps.StreetViewService();
    sv.getPanorama({ location: { lat, lng }, radius: 100 }, (data, status) => {
      if (status !== 'OK') {
        toast.error('Street View no disponible en esta ubicación');
      }
    });
  }, [lat, lng]);
  
  return (
    <div className="street-view-panel">
      <div className="street-view-header">
        <div className="street-view-title">
          <Eye className="w-5 h-5" />
          <span>Street View 3D</span>
        </div>
        <button onClick={onClose} className="close-street-view">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div ref={streetViewRef} className="street-view-container" />
    </div>
  );
};

// Repository/History Page Component
const RepositoryPage = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    minConfidence: 0,
    searchText: ''
  });
  const [viewMode, setViewMode] = useState('grid');
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [historyRes, statsRes] = await Promise.all([
        axios.post(`${API}/history/search`, {
          min_confidence: filters.minConfidence || null,
          location_contains: filters.searchText || null,
          limit: 100
        }),
        axios.get(`${API}/statistics`)
      ]);
      setHistory(historyRes.data.results || []);
      setStatistics(statsRes.data);
    } catch (e) {
      console.error(e);
      try {
        const res = await axios.get(`${API}/history`);
        setHistory(res.data);
      } catch (e2) {
        console.error(e2);
      }
    }
    setLoading(false);
  };

  const deleteItem = async (id, e) => {
    e.stopPropagation();
    try {
      await axios.delete(`${API}/history/${id}`);
      setHistory(prev => prev.filter(h => h.id !== id));
      toast.success("Eliminado");
    } catch (e) {
      toast.error("Error al eliminar");
    }
  };

  const exportJSON = async () => {
    try {
      const res = await axios.get(`${API}/history/export/json`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hunter-guiris-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast.success("Exportado correctamente");
    } catch (e) {
      toast.error("Error al exportar");
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      setUser(null);
      navigate('/login');
      toast.success("Sesión cerrada");
    } catch (e) {
      console.error(e);
    }
  };

  const filteredHistory = history.filter(item => {
    if (filters.minConfidence && item.consensus_confidence < filters.minConfidence) return false;
    if (filters.searchText && !item.consensus_location?.toLowerCase().includes(filters.searchText.toLowerCase())) return false;
    return true;
  });

  const getConfClass = (c) => c >= 70 ? "high" : c >= 40 ? "medium" : "low";

  return (
    <div className="repository-page">
      <header className="repo-header">
        <button onClick={() => navigate('/')} className="back-btn">
          <ChevronRight className="w-5 h-5 rotate-180" />
          <span>Volver</span>
        </button>
        <h1>Repositorio de Búsquedas</h1>
        <div className="header-actions">
          <button onClick={exportJSON} className="export-btn">
            <Download className="w-4 h-4" />
            <span>Exportar JSON</span>
          </button>
          <div className="user-menu">
            <User className="w-4 h-4" />
            <span>{user?.name}</span>
            <button onClick={handleLogout} className="logout-btn" title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Statistics Cards */}
      {statistics && (
        <div className="stats-grid">
          <div className="stat-card">
            <BarChart3 className="w-6 h-6" />
            <div className="stat-content">
              <span className="stat-value">{statistics.total_searches}</span>
              <span className="stat-label">Total Búsquedas</span>
            </div>
          </div>
          <div className="stat-card success">
            <CheckCircle className="w-6 h-6" />
            <div className="stat-content">
              <span className="stat-value">{statistics.success_rate}%</span>
              <span className="stat-label">Tasa de Éxito</span>
            </div>
          </div>
          <div className="stat-card">
            <Target className="w-6 h-6" />
            <div className="stat-content">
              <span className="stat-value">{statistics.high_confidence}</span>
              <span className="stat-label">Alta Confianza</span>
            </div>
          </div>
          <div className="stat-card warning">
            <AlertTriangle className="w-6 h-6" />
            <div className="stat-content">
              <span className="stat-value">{statistics.low_confidence}</span>
              <span className="stat-label">Baja Confianza</span>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box">
          <Search className="w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar ubicación..."
            value={filters.searchText}
            onChange={e => setFilters(prev => ({ ...prev, searchText: e.target.value }))}
          />
        </div>
        <div className="filter-group">
          <Filter className="w-4 h-4" />
          <select 
            value={filters.minConfidence} 
            onChange={e => setFilters(prev => ({ ...prev, minConfidence: parseInt(e.target.value) }))}
          >
            <option value={0}>Todas</option>
            <option value={70}>Alta confianza (≥70%)</option>
            <option value={40}>Media+ (≥40%)</option>
          </select>
        </div>
        <div className="view-toggle">
          <button className={viewMode === 'grid' ? 'active' : ''} onClick={() => setViewMode('grid')}>
            <Grid className="w-4 h-4" />
          </button>
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="loading-state">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span>Cargando historial...</span>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="empty-state">
          <History className="w-12 h-12" />
          <h3>No hay búsquedas</h3>
          <p>Las búsquedas realizadas aparecerán aquí</p>
        </div>
      ) : (
        <div className={`history-grid ${viewMode}`}>
          {filteredHistory.map(item => (
            <div 
              key={item.id} 
              className="history-card"
              onClick={() => setSelectedItem(item)}
            >
              <div className={`confidence-indicator ${getConfClass(item.consensus_confidence)}`}>
                {item.consensus_confidence}%
              </div>
              <div className="card-content">
                <h3>{item.consensus_location || "Ubicación desconocida"}</h3>
                <div className="card-meta">
                  <span><Clock className="w-3 h-3" /> {new Date(item.timestamp).toLocaleDateString()}</span>
                  <span><Images className="w-3 h-3" /> {item.image_count || 1} archivo(s)</span>
                </div>
                {item.landmarks?.length > 0 && (
                  <div className="card-landmarks">
                    {item.landmarks.slice(0, 3).map((l, i) => (
                      <span key={i} className="landmark-tag">{l}</span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={(e) => deleteItem(item.id, e)} className="delete-btn">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal with ALL ADDRESSES */}
      {selectedItem && (
        <div className="detail-modal" onClick={() => setSelectedItem(null)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedItem(null)}>
              <X className="w-5 h-5" />
            </button>
            <div className="modal-header">
              <div className={`confidence-badge ${getConfClass(selectedItem.consensus_confidence)}`}>
                {selectedItem.consensus_confidence}%
              </div>
              <h2>{selectedItem.consensus_location || "Ubicación desconocida"}</h2>
              {selectedItem.place_details?.formatted_address && (
                <p className="address">{selectedItem.place_details.formatted_address}</p>
              )}
            </div>
            
            <div className="modal-body">
              {selectedItem.consensus_coordinates && (
                <div className="coords-box">
                  <Navigation className="w-4 h-4" />
                  <span>{selectedItem.consensus_coordinates.lat.toFixed(6)}, {selectedItem.consensus_coordinates.lng.toFixed(6)}</span>
                </div>
              )}

              {/* ALL POSSIBLE ADDRESSES - GPT Analysis */}
              <div className="all-addresses-section">
                <h4><MapPinned className="w-4 h-4" /> TODAS LAS DIRECCIONES POSIBLES</h4>
                
                {/* Main consensus result */}
                <div className="address-card main">
                  <div className="address-header">
                    <span className="address-source">RESULTADO PRINCIPAL (Consenso)</span>
                    <span className="address-confidence">{selectedItem.consensus_confidence}%</span>
                  </div>
                  <p className="address-location">{selectedItem.consensus_location}</p>
                  {selectedItem.place_details?.formatted_address && (
                    <p className="address-detail">{selectedItem.place_details.formatted_address}</p>
                  )}
                  {selectedItem.consensus_coordinates && (
                    <p className="address-coords">📍 {selectedItem.consensus_coordinates.lat.toFixed(6)}, {selectedItem.consensus_coordinates.lng.toFixed(6)}</p>
                  )}
                </div>

                {/* GPT Analysis */}
                {selectedItem.gpt_analysis && selectedItem.gpt_analysis.location_guess && 
                 selectedItem.gpt_analysis.location_guess !== "Error" && (
                  <div className="address-card gpt">
                    <div className="address-header">
                      <span className="address-source"><Sparkles className="w-3 h-3" /> GPT-5.2</span>
                      <span className="address-confidence">{selectedItem.gpt_analysis.confidence}%</span>
                    </div>
                    <p className="address-location">{selectedItem.gpt_analysis.location_guess}</p>
                    {selectedItem.gpt_analysis.coordinates && (
                      <p className="address-coords">📍 {selectedItem.gpt_analysis.coordinates.lat?.toFixed(6)}, {selectedItem.gpt_analysis.coordinates.lng?.toFixed(6)}</p>
                    )}
                    {selectedItem.gpt_analysis.reasoning && (
                      <p className="address-reasoning">{selectedItem.gpt_analysis.reasoning}</p>
                    )}
                    {selectedItem.gpt_analysis.landmarks?.length > 0 && (
                      <div className="address-landmarks">
                        {selectedItem.gpt_analysis.landmarks.map((l, i) => (
                          <span key={i}>{l}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Gemini Analysis */}
                {selectedItem.gemini_analysis && selectedItem.gemini_analysis.location_guess && 
                 selectedItem.gemini_analysis.location_guess !== "Error" && (
                  <div className="address-card gemini">
                    <div className="address-header">
                      <span className="address-source"><Sparkles className="w-3 h-3" /> Gemini</span>
                      <span className="address-confidence">{selectedItem.gemini_analysis.confidence}%</span>
                    </div>
                    <p className="address-location">{selectedItem.gemini_analysis.location_guess}</p>
                    {selectedItem.gemini_analysis.coordinates && (
                      <p className="address-coords">📍 {selectedItem.gemini_analysis.coordinates.lat?.toFixed(6)}, {selectedItem.gemini_analysis.coordinates.lng?.toFixed(6)}</p>
                    )}
                    {selectedItem.gemini_analysis.reasoning && (
                      <p className="address-reasoning">{selectedItem.gemini_analysis.reasoning}</p>
                    )}
                    {selectedItem.gemini_analysis.landmarks?.length > 0 && (
                      <div className="address-landmarks">
                        {selectedItem.gemini_analysis.landmarks.map((l, i) => (
                          <span key={i}>{l}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Alternative Locations */}
                {selectedItem.alternative_locations?.map((alt, i) => (
                  <div key={i} className="address-card alternative">
                    <div className="address-header">
                      <span className="address-source">{alt.source}</span>
                      <span className="address-confidence">{alt.confidence}%</span>
                    </div>
                    <p className="address-location">{alt.location}</p>
                    {alt.coordinates && (
                      <p className="address-coords">📍 {alt.coordinates.lat?.toFixed(6)}, {alt.coordinates.lng?.toFixed(6)}</p>
                    )}
                    {alt.reasoning && (
                      <p className="address-reasoning">{alt.reasoning}</p>
                    )}
                  </div>
                ))}
              </div>

              {selectedItem.landmarks?.length > 0 && (
                <div className="landmarks-section">
                  <h4>Elementos Identificados</h4>
                  <div className="landmarks-list">
                    {selectedItem.landmarks.map((l, i) => (
                      <span key={i} className="landmark-chip">{l}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedItem.nearby_places?.length > 0 && (
                <div className="nearby-section">
                  <h4>Lugares Cercanos</h4>
                  {selectedItem.nearby_places.slice(0, 5).map((p, i) => (
                    <div key={i} className="nearby-item">
                      <Building className="w-4 h-4" />
                      <span>{p.name} {p.vicinity && `- ${p.vicinity}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
};

// Phone/IP Tools Page
const ToolsPage = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [phoneResult, setPhoneResult] = useState(null);
  const [ipResult, setIpResult] = useState(null);
  const [sharePhone, setSharePhone] = useState('');
  const [shareName, setShareName] = useState('');
  const [shareResult, setShareResult] = useState(null);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchShares();
  }, []);

  const fetchShares = async () => {
    try {
      const res = await axios.get(`${API}/location/shares`);
      setShares(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const lookupPhone = async () => {
    if (!phoneNumber) return toast.error("Introduce un número de teléfono");
    setLoading(true);
    try {
      const res = await axios.post(`${API}/phone/lookup`, { phone_number: phoneNumber });
      setPhoneResult(res.data);
    } catch (e) {
      toast.error("Error en la consulta");
    }
    setLoading(false);
  };

  const lookupIP = async () => {
    if (!ipAddress) return toast.error("Introduce una dirección IP");
    setLoading(true);
    try {
      const res = await axios.post(`${API}/geolocate/ip`, { ip_address: ipAddress });
      setIpResult(res.data);
    } catch (e) {
      toast.error("Error en la consulta");
    }
    setLoading(false);
  };

  const createShareLink = async () => {
    if (!sharePhone || !shareName) return toast.error("Completa todos los campos");
    setLoading(true);
    try {
      const res = await axios.post(`${API}/location/share/create`, {
        target_phone: sharePhone,
        requester_name: shareName
      });
      setShareResult(res.data);
      fetchShares();
      toast.success("Enlace creado");
    } catch (e) {
      toast.error("Error al crear enlace");
    }
    setLoading(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copiado al portapapeles");
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      setUser(null);
      navigate('/login');
      toast.success("Sesión cerrada");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="tools-page">
      <header className="tools-header">
        <button onClick={() => navigate('/')} className="back-btn">
          <ChevronRight className="w-5 h-5 rotate-180" />
          <span>Volver</span>
        </button>
        <h1>Herramientas de Localización</h1>
        <div className="user-menu">
          <User className="w-4 h-4" />
          <span>{user?.name}</span>
          <button onClick={handleLogout} className="logout-btn" title="Cerrar sesión">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="tools-tabs">
        <button className={activeTab === 'phone' ? 'active' : ''} onClick={() => setActiveTab('phone')}>
          <Phone className="w-4 h-4" />
          <span>Consulta Teléfono</span>
        </button>
        <button className={activeTab === 'ip' ? 'active' : ''} onClick={() => setActiveTab('ip')}>
          <Wifi className="w-4 h-4" />
          <span>Geolocalización IP</span>
        </button>
        <button className={activeTab === 'share' ? 'active' : ''} onClick={() => setActiveTab('share')}>
          <Share2 className="w-4 h-4" />
          <span>Compartir Ubicación</span>
        </button>
      </div>

      <div className="tools-content">
        {activeTab === 'phone' && (
          <div className="tool-section">
            <div className="tool-card">
              <h3><Phone className="w-5 h-5" /> Consulta de Número de Teléfono</h3>
              <p className="tool-desc">Obtén información sobre el país, operador y tipo de línea de un número telefónico.</p>
              
              <div className="input-group">
                <input
                  type="tel"
                  placeholder="+34 612 345 678"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                />
                <button onClick={lookupPhone} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  <span>Consultar</span>
                </button>
              </div>

              {phoneResult && (
                <div className="result-card">
                  <div className="result-header">
                    <Phone className="w-5 h-5" />
                    <span>{phoneResult.phone_info?.number}</span>
                  </div>
                  <div className="result-body">
                    <div className="result-row">
                      <span>País</span>
                      <strong>{phoneResult.phone_info?.country || "Desconocido"}</strong>
                    </div>
                    <div className="result-row">
                      <span>Código</span>
                      <strong>{phoneResult.phone_info?.country_code || "-"}</strong>
                    </div>
                    <div className="result-row">
                      <span>Tipo</span>
                      <strong>{phoneResult.phone_info?.type || "Desconocido"}</strong>
                    </div>
                    <div className="result-row">
                      <span>Formato válido</span>
                      <strong>{phoneResult.phone_info?.valid_format ? "✓ Sí" : "✗ No"}</strong>
                    </div>
                  </div>
                  <p className="result-note">{phoneResult.note}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ip' && (
          <div className="tool-section">
            <div className="tool-card">
              <h3><Wifi className="w-5 h-5" /> Geolocalización por IP</h3>
              <p className="tool-desc">Obtén la ubicación aproximada (ciudad/región) de una dirección IP.</p>
              
              <div className="input-group">
                <input
                  type="text"
                  placeholder="8.8.8.8"
                  value={ipAddress}
                  onChange={e => setIpAddress(e.target.value)}
                />
                <button onClick={lookupIP} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                  <span>Localizar</span>
                </button>
              </div>

              {ipResult && ipResult.success && (
                <div className="result-card">
                  <div className="result-header success">
                    <MapPin className="w-5 h-5" />
                    <span>{ipResult.location?.city}, {ipResult.location?.country}</span>
                  </div>
                  <div className="result-body">
                    <div className="result-row">
                      <span>IP</span>
                      <strong>{ipResult.ip}</strong>
                    </div>
                    <div className="result-row">
                      <span>País</span>
                      <strong>{ipResult.location?.country}</strong>
                    </div>
                    <div className="result-row">
                      <span>Región</span>
                      <strong>{ipResult.location?.region}</strong>
                    </div>
                    <div className="result-row">
                      <span>Ciudad</span>
                      <strong>{ipResult.location?.city}</strong>
                    </div>
                    <div className="result-row">
                      <span>Coordenadas</span>
                      <strong>{ipResult.location?.coordinates?.lat}, {ipResult.location?.coordinates?.lng}</strong>
                    </div>
                    <div className="result-row">
                      <span>ISP</span>
                      <strong>{ipResult.provider?.isp}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'share' && (
          <div className="tool-section">
            <div className="tool-card">
              <h3><Share2 className="w-5 h-5" /> Solicitar Ubicación</h3>
              <p className="tool-desc">Crea un enlace para que alguien comparta voluntariamente su ubicación contigo.</p>
              
              <div className="form-group">
                <label>Tu nombre</label>
                <input
                  type="text"
                  placeholder="Agente García"
                  value={shareName}
                  onChange={e => setShareName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Teléfono del destinatario</label>
                <input
                  type="tel"
                  placeholder="+34 612 345 678"
                  value={sharePhone}
                  onChange={e => setSharePhone(e.target.value)}
                />
              </div>
              <button onClick={createShareLink} disabled={loading} className="create-btn">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Crear Enlace</span>
              </button>

              {shareResult && (
                <div className="share-result">
                  <h4>Enlace Creado</h4>
                  <div className="share-link-box">
                    <input type="text" value={shareResult.share_link} readOnly />
                    <button onClick={() => copyToClipboard(shareResult.share_link)}>
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="sms-template">
                    <label>Plantilla SMS</label>
                    <textarea readOnly value={shareResult.sms_template} />
                    <button onClick={() => copyToClipboard(shareResult.sms_template)}>
                      <Copy className="w-4 h-4" /> Copiar SMS
                    </button>
                  </div>
                </div>
              )}
            </div>

            {shares.length > 0 && (
              <div className="shares-list">
                <h4>Solicitudes Activas</h4>
                {shares.map(share => (
                  <div key={share.id} className={`share-item ${share.status}`}>
                    <div className="share-info">
                      <span className="share-phone">{share.target_phone}</span>
                      <span className="share-date">{new Date(share.created_at).toLocaleString()}</span>
                    </div>
                    <div className={`share-status ${share.status}`}>
                      {share.status === 'accepted' ? (
                        <>
                          <MapPin className="w-4 h-4" />
                          <span>{share.location?.address || "Ubicación recibida"}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4" />
                          <span>Pendiente</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
};

// Share Accept Page (public - no auth required)
const ShareAcceptPage = () => {
  const { shareId } = useParams();
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    fetchShare();
  }, [shareId]);

  const fetchShare = async () => {
    try {
      const res = await axios.get(`${API}/location/share/${shareId}`);
      setShare(res.data);
    } catch (e) {
      toast.error("Solicitud no encontrada");
    }
    setLoading(false);
  };

  const acceptAndShare = async () => {
    setSharing(true);
    try {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            await axios.post(`${API}/location/share/${shareId}/accept?lat=${position.coords.latitude}&lng=${position.coords.longitude}`);
            setShared(true);
            toast.success("Ubicación compartida");
          },
          () => {
            toast.error("No se pudo obtener tu ubicación");
            setSharing(false);
          },
          { enableHighAccuracy: true }
        );
      } else {
        toast.error("Geolocalización no soportada");
        setSharing(false);
      }
    } catch (e) {
      toast.error("Error al compartir");
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="share-accept-page loading">
        <Loader2 className="w-12 h-12 animate-spin" />
      </div>
    );
  }

  if (!share) {
    return (
      <div className="share-accept-page error">
        <X className="w-12 h-12" />
        <h2>Solicitud no encontrada</h2>
      </div>
    );
  }

  if (shared || share.status === 'accepted') {
    return (
      <div className="share-accept-page success">
        <CheckCircle className="w-16 h-16" />
        <h2>¡Ubicación Compartida!</h2>
        <p>Tu ubicación ha sido enviada a {share.requester_name}</p>
      </div>
    );
  }

  return (
    <div className="share-accept-page">
      <div className="share-card">
        <Share2 className="w-12 h-12" />
        <h2>Solicitud de Ubicación</h2>
        <p className="requester">{share.requester_name} te solicita compartir tu ubicación</p>
        {share.message && <p className="message">"{share.message}"</p>}
        
        <button onClick={acceptAndShare} disabled={sharing} className="accept-btn">
          {sharing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Obteniendo ubicación...</span>
            </>
          ) : (
            <>
              <MapPin className="w-5 h-5" />
              <span>Compartir Mi Ubicación</span>
            </>
          )}
        </button>
        
        <p className="privacy-note">Tu ubicación solo se compartirá una vez y de forma segura.</p>
      </div>
      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
};

// Main Hunter App Component
const HunterApp = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [zone, setZone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [step, setStep] = useState(0);
  const [history, setHistory] = useState([]);
  const [center, setCenter] = useState([20, 0]);
  const [zoom, setZoom] = useState(2);
  const [showResults, setShowResults] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [analysisProgress, setAnalysisProgress] = useState("");
  const [showStreetView, setShowStreetView] = useState(false);
  const [mapStyle, setMapStyle] = useState('dark');
  const [dragOver, setDragOver] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const fileRef = useRef(null);

  const mapStyles = {
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  };

  useEffect(() => {
    fetchHistory();
    
    if (!window.google) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`;
      script.async = true;
      document.head.appendChild(script);
    }
    
    const handleOnline = () => { setIsOnline(true); toast.success("Conexión restaurada"); };
    const handleOffline = () => { setIsOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API}/history`);
      setHistory(res.data);
    } catch (e) { console.error(e); }
  };

  const handleFiles = useCallback((newFiles) => {
    Array.from(newFiles).forEach(file => {
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

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const analyze = async () => {
    if (files.length === 0) return toast.error("Sube al menos una imagen o video");
    
    if (!isOnline) {
      toast.warning("Sin conexión");
      return;
    }

    setLoading(true);
    setStep(1);
    setShowResults(true);
    setAnalysisProgress("Preparando archivos...");

    try {
      const images = files.filter(f => f.type === 'image');
      const videos = files.filter(f => f.type === 'video');
      
      let allImages = [];
      
      setAnalysisProgress(`Procesando ${images.length} imagen(es)...`);
      for (const img of images) {
        const base64 = img.preview.split(",")[1];
        allImages.push(base64);
      }
      
      setStep(2);
      
      if (videos.length > 0) {
        setAnalysisProgress(`Extrayendo frames de ${videos.length} video(s)...`);
        for (const vid of videos) {
          const base64 = vid.preview.split(",")[1];
          try {
            const formData = new FormData();
            formData.append('video_base64', base64);
            if (zone) formData.append('search_zone', zone);
            
            const res = await axios.post(`${API}/analyze-video`, formData);
            if (res.data && allImages.length === 0) {
              setStep(5);
              setResult(res.data);
              if (res.data.consensus_coordinates) {
                setCenter([res.data.consensus_coordinates.lat, res.data.consensus_coordinates.lng]);
                setZoom(17);
              }
              fetchHistory();
              toast.success(`¡Ubicación encontrada!`);
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
      
      if (allImages.length > 0) {
        const res = await axios.post(`${API}/analyze-multi`, {
          images: allImages,
          search_zone: zone || null,
        }, { timeout: 120000 });
        
        setStep(4);
        setAnalysisProgress("Validando con Google Maps...");
        
        setTimeout(() => {
          setStep(5);
          setResult(res.data);
          
          if (res.data.consensus_coordinates) {
            setCenter([res.data.consensus_coordinates.lat, res.data.consensus_coordinates.lng]);
            setZoom(17);
          }
          
          fetchHistory();
          const conf = res.data.consensus_confidence;
          if (conf >= 70) {
            toast.success(`¡Ubicación identificada con ${conf}% de confianza!`);
          } else if (conf >= 40) {
            toast.success(`Ubicación probable encontrada (${conf}%)`);
          } else if (conf > 0) {
            toast.info(`Resultado parcial (${conf}% confianza)`);
          } else {
            toast.warning("No se pudo identificar la ubicación");
          }
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
      setZoom(17);
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

  const clearAll = () => {
    setFiles([]);
    setResult(null);
    setShowResults(false);
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
      setUser(null);
      navigate('/login');
      toast.success("Sesión cerrada");
    } catch (e) {
      console.error(e);
    }
  };

  const getConfClass = (c) => c >= 70 ? "high" : c >= 40 ? "medium" : "low";
  const getConfLabel = (c) => c >= 70 ? "Alta" : c >= 40 ? "Media" : "Baja";

  return (
    <div className="hunter-app">
      {!isOnline && (
        <div className="offline-banner">
          <WifiOff className="w-4 h-4" />
          Sin conexión
        </div>
      )}

      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <Target className="w-6 h-6" />
          </div>
          <div className="logo-text">
            <h1>Hunter Guiris CC</h1>
            <span>Multi-AI Geolocation</span>
          </div>
        </div>
        <div className="header-controls">
          <button className="nav-btn" onClick={() => navigate('/repository')}>
            <History className="w-4 h-4" />
            <span>Repositorio</span>
          </button>
          <button className="nav-btn" onClick={() => navigate('/tools')}>
            <Phone className="w-4 h-4" />
            <span>Herramientas</span>
          </button>
          <div className="map-style-toggle">
            <button className={mapStyle === 'dark' ? 'active' : ''} onClick={() => setMapStyle('dark')} title="Mapa oscuro">
              <Map className="w-4 h-4" />
            </button>
            <button className={mapStyle === 'satellite' ? 'active' : ''} onClick={() => setMapStyle('satellite')} title="Satélite">
              <Globe className="w-4 h-4" />
            </button>
            <button className={mapStyle === 'streets' ? 'active' : ''} onClick={() => setMapStyle('streets')} title="Calles">
              <Layers className="w-4 h-4" />
            </button>
          </div>
          <div className="user-menu">
            <User className="w-4 h-4" />
            <span>{user?.name}</span>
            <button onClick={handleLogout} className="logout-btn" title="Cerrar sesión">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="map-section">
          <MapContainer
            center={center}
            zoom={zoom}
            style={{ height: "100%", width: "100%" }}
            zoomControl={true}
          >
            <TileLayer
              url={mapStyles[mapStyle]}
              attribution={mapStyle === 'satellite' ? 'Esri' : mapStyle === 'streets' ? 'OSM' : 'CARTO'}
            />
            <MapUpdater center={center} zoom={zoom} />
            {result?.consensus_coordinates && (
              <Marker 
                position={[result.consensus_coordinates.lat, result.consensus_coordinates.lng]}
                icon={mainIcon}
              >
                <Popup>
                  <div className="marker-popup">
                    <h4>{result.consensus_location}</h4>
                    <p>{result.consensus_confidence}% confianza</p>
                  </div>
                </Popup>
              </Marker>
            )}
            {showAlternatives && result?.alternative_locations?.map((alt, i) => (
              alt.coordinates && (
                <Marker 
                  key={i}
                  position={[alt.coordinates.lat, alt.coordinates.lng]}
                  icon={alternativeIcon}
                >
                  <Popup>
                    <div className="marker-popup">
                      <h4>{alt.location}</h4>
                      <p>{alt.confidence}% - {alt.source}</p>
                    </div>
                  </Popup>
                </Marker>
              )
            ))}
          </MapContainer>
          
          {result?.consensus_coordinates && (
            <button 
              className="street-view-btn"
              onClick={() => setShowStreetView(true)}
              data-testid="street-view-btn"
            >
              <Camera className="w-5 h-5" />
              <span>Ver Street View 3D</span>
            </button>
          )}

          {result?.alternative_locations?.length > 0 && (
            <button 
              className={`alternatives-btn ${showAlternatives ? 'active' : ''}`}
              onClick={() => setShowAlternatives(!showAlternatives)}
            >
              <MapPinned className="w-5 h-5" />
              <span>{showAlternatives ? 'Ocultar' : 'Mostrar'} Alternativas ({result.alternative_locations.length})</span>
            </button>
          )}
        </div>

        <div className="side-panel">
          <div className="upload-card">
            <div className="card-header">
              <div className="card-title">
                <Upload className="w-5 h-5" />
                <span>Subir Archivos</span>
              </div>
              {files.length > 0 && (
                <button onClick={clearAll} className="clear-btn">
                  <X className="w-4 h-4" />
                  Limpiar
                </button>
              )}
            </div>
            
            {files.length === 0 ? (
              <div 
                className={`upload-dropzone ${dragOver ? 'drag-over' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                data-testid="upload-area"
              >
                <div className="dropzone-content">
                  <div className="dropzone-icons">
                    <Image className="w-8 h-8" />
                    <div className="plus-circle">
                      <Plus className="w-4 h-4" />
                    </div>
                    <Video className="w-8 h-8" />
                  </div>
                  <h3>Arrastra imágenes o videos aquí</h3>
                  <p>o haz clic para seleccionar</p>
                  <div className="upload-hint">
                    <Sparkles className="w-4 h-4" />
                    <span>Más archivos = Mayor precisión</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="files-preview">
                <div className="files-grid">
                  {files.map((f, i) => (
                    <div key={i} className="file-item">
                      {f.type === 'video' ? (
                        <div className="video-preview">
                          <Video className="w-8 h-8" />
                        </div>
                      ) : (
                        <img src={f.preview} alt={f.name} />
                      )}
                      <button onClick={() => removeFile(i)} className="remove-btn">
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
                    <div className="add-more-btn" onClick={() => fileRef.current?.click()}>
                      <Plus className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="files-count">
                  <Images className="w-4 h-4" />
                  <span>{files.length} archivo(s) seleccionado(s)</span>
                </div>
              </div>
            )}
          </div>
          
          <input 
            ref={fileRef} 
            type="file" 
            accept="image/*,video/*" 
            onChange={(e) => handleFiles(e.target.files)} 
            className="hidden-input" 
            multiple
          />

          <div className="search-zone-card">
            <div className="card-title">
              <Compass className="w-5 h-5" />
              <span>Zona de búsqueda (opcional)</span>
            </div>
            <input
              type="text"
              placeholder="Ej: Barcelona, España / París, Francia..."
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="zone-input"
              data-testid="search-zone-input"
            />
            <p className="zone-hint">Ayuda a las IAs a buscar en una región específica</p>
          </div>

          <button 
            onClick={analyze} 
            disabled={files.length === 0 || loading}
            className="analyze-btn"
            data-testid="analyze-btn"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{analysisProgress}</span>
              </>
            ) : (
              <>
                <Brain className="w-5 h-5" />
                <span>RASTREAR UBICACIÓN</span>
              </>
            )}
          </button>

          <div className="ai-info">
            <div className="ai-badge gpt">
              <Sparkles className="w-3 h-3" />
              GPT-5.2
            </div>
            <span className="ai-plus">+</span>
            <div className="ai-badge gemini">
              <Sparkles className="w-3 h-3" />
              Gemini
            </div>
            <span className="ai-plus">+</span>
            <div className="ai-badge maps">
              <MapPin className="w-3 h-3" />
              Maps
            </div>
          </div>

          {history.length > 0 && !showResults && files.length === 0 && (
            <div className="history-card">
              <div className="card-header">
                <div className="card-title">
                  <History className="w-5 h-5" />
                  <span>Historial reciente</span>
                </div>
                <button className="view-all-btn" onClick={() => navigate('/repository')}>
                  Ver todo <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="history-list">
                {history.slice(0, 5).map((item) => (
                  <div key={item.id} className="history-item" onClick={() => loadHistory(item)}>
                    <div className="history-icon">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div className="history-info">
                      <span className="history-location">{item.consensus_location || "Desconocido"}</span>
                      <span className="history-meta">
                        {item.consensus_confidence}% • {item.image_count || 1} archivo(s)
                      </span>
                    </div>
                    <button onClick={(e) => deleteHistory(item.id, e)} className="delete-btn">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results Panel */}
      <div className={`results-overlay ${showResults ? 'open' : ''}`}>
        <div className="results-panel">
          <div className="results-header">
            <h2>{loading ? 'Analizando...' : 'Resultados'}</h2>
            <button onClick={() => setShowResults(false)} className="close-results">
              <X className="w-5 h-5" />
            </button>
          </div>

          {loading && (
            <div className="progress-section">
              <Step n={1} current={step} label="Preparando archivos" />
              <Step n={2} current={step} label="Extrayendo datos" />
              <Step n={3} current={step} label="Análisis GPT-5.2 + Gemini" />
              <Step n={4} current={step} label="Validación Google Maps" />
              <Step n={5} current={step} label="Resultado final" />
            </div>
          )}

          {result && !loading && (
            <div className="results-body">
              <div className="result-main">
                <div className={`confidence-badge ${getConfClass(result.consensus_confidence)}`}>
                  {result.consensus_confidence}% {getConfLabel(result.consensus_confidence)}
                </div>
                <h3 className="result-location" data-testid="consensus-location">
                  {result.consensus_location || "Ubicación desconocida"}
                </h3>
                {result.place_details?.formatted_address && (
                  <p className="result-address">{result.place_details.formatted_address}</p>
                )}
                
                {result.consensus_coordinates && (
                  <div className="result-coords" data-testid="coordinates">
                    <Navigation className="w-4 h-4" />
                    <span>
                      {result.consensus_coordinates.lat.toFixed(6)}, {result.consensus_coordinates.lng.toFixed(6)}
                    </span>
                    <button onClick={() => setShowStreetView(true)} className="view-3d-btn">
                      <Eye className="w-4 h-4" />
                      Ver en 3D
                    </button>
                  </div>
                )}
              </div>

              {/* ALL ADDRESSES Section */}
              <div className="all-addresses-section">
                <h4><MapPinned className="w-4 h-4" /> TODAS LAS DIRECCIONES POSIBLES</h4>
                
                {result.gpt_analysis && result.gpt_analysis.location_guess && 
                 result.gpt_analysis.location_guess !== "Error" && (
                  <div className="address-card gpt">
                    <div className="address-header">
                      <span className="address-source"><Sparkles className="w-3 h-3" /> GPT-5.2</span>
                      <span className="address-confidence">{result.gpt_analysis.confidence}%</span>
                    </div>
                    <p className="address-location">{result.gpt_analysis.location_guess}</p>
                    {result.gpt_analysis.reasoning && (
                      <p className="address-reasoning">{result.gpt_analysis.reasoning}</p>
                    )}
                  </div>
                )}

                {result.gemini_analysis && result.gemini_analysis.location_guess && 
                 result.gemini_analysis.location_guess !== "Error" && (
                  <div className="address-card gemini">
                    <div className="address-header">
                      <span className="address-source"><Sparkles className="w-3 h-3" /> Gemini</span>
                      <span className="address-confidence">{result.gemini_analysis.confidence}%</span>
                    </div>
                    <p className="address-location">{result.gemini_analysis.location_guess}</p>
                    {result.gemini_analysis.reasoning && (
                      <p className="address-reasoning">{result.gemini_analysis.reasoning}</p>
                    )}
                  </div>
                )}

                {result.alternative_locations?.map((alt, i) => (
                  <div key={i} className="address-card alternative">
                    <div className="address-header">
                      <span className="address-source">{alt.source}</span>
                      <span className="address-confidence">{alt.confidence}%</span>
                    </div>
                    <p className="address-location">{alt.location}</p>
                    {alt.reasoning && (
                      <p className="address-reasoning">{alt.reasoning}</p>
                    )}
                  </div>
                ))}
              </div>

              {result.landmarks?.length > 0 && (
                <div className="landmarks-section">
                  <h4>Elementos identificados</h4>
                  <div className="landmarks-grid">
                    {result.landmarks.slice(0, 10).map((l, i) => (
                      <span key={i} className="landmark-chip">{l}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.nearby_places?.length > 0 && (
                <div className="nearby-section">
                  <h4>Lugares cercanos</h4>
                  <div className="nearby-list">
                    {result.nearby_places.slice(0, 4).map((p, i) => (
                      <div key={i} className="nearby-item">
                        <Building className="w-4 h-4" />
                        <div className="nearby-info">
                          <span className="nearby-name">{p.name}</span>
                          {p.vicinity && <span className="nearby-address">{p.vicinity}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showStreetView && result?.consensus_coordinates && (
        <StreetViewPanel 
          lat={result.consensus_coordinates.lat}
          lng={result.consensus_coordinates.lng}
          onClose={() => setShowStreetView(false)}
        />
      )}

      <Toaster position="top-center" theme="dark" richColors />
    </div>
  );
};

// Progress Step Component
const Step = ({ n, current, label }) => {
  const done = current > n;
  const active = current === n;
  return (
    <div className={`progress-step ${done ? 'done' : active ? 'active' : 'pending'}`}>
      <div className="step-indicator">
        {done ? <CheckCircle className="w-5 h-5" /> : active ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>{n}</span>}
      </div>
      <span className="step-label">{label}</span>
    </div>
  );
};

// App Router
function AppRouter() {
  const location = useLocation();
  
  // Check URL fragment for session_id - must be synchronous during render
  if (location.hash?.includes('session_id=')) {
    return (
      <AuthContext>
        {({ setUser }) => <AuthCallback setUser={setUser} />}
      </AuthContext>
    );
  }
  
  return (
    <AuthContext>
      {({ user, setUser, checkAuth }) => (
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/share/:shareId" element={<ShareAcceptPage />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute user={user}>
                <HunterApp user={user} setUser={setUser} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/repository" 
            element={
              <ProtectedRoute user={user}>
                <RepositoryPage user={user} setUser={setUser} />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/tools" 
            element={
              <ProtectedRoute user={user}>
                <ToolsPage user={user} setUser={setUser} />
              </ProtectedRoute>
            } 
          />
        </Routes>
      )}
    </AuthContext>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}
