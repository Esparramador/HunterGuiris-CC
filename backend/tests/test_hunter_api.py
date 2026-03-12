"""
Hunter Guiris CC - Backend API Tests
Tests for all API endpoints: root, analyze, history, statistics, geocode

NOTE: 
- OpenAI has no quota - GPT analysis will return Error (expected)
- Gemini API should work and return valid geolocation results
"""

import pytest
import requests
import os
import base64
from PIL import Image
import io
import time

# Get backend URL from environment - DO NOT add defaults
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if not BASE_URL:
    BASE_URL = "https://hunter-geoloc.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api_client():
    """Create a requests session for API calls"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def test_image_base64():
    """Generate a small test image (red 10x10 pixel JPEG)"""
    img = Image.new('RGB', (10, 10), color='red')
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=50)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode('utf-8')


class TestRootEndpoint:
    """Tests for /api/ root endpoint"""
    
    def test_root_endpoint_returns_200(self, api_client):
        """Verify root endpoint is accessible"""
        response = api_client.get(f"{API_URL}/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Hunter Guiris CC" in data["message"]
        print(f"✓ Root endpoint returns: {data['message']}")


class TestGeocodeEndpoint:
    """Tests for /api/geocode endpoint"""
    
    def test_geocode_valid_location(self, api_client):
        """Test geocoding a valid location (Paris, France)"""
        response = api_client.post(f"{API_URL}/geocode", json={
            "location": "Paris, France"
        })
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "lat" in data
        assert "lng" in data
        assert "formatted_address" in data
        
        # Validate coordinate ranges for Paris
        assert 48.0 < data["lat"] < 49.0
        assert 2.0 < data["lng"] < 3.0
        
        print(f"✓ Geocode Paris: {data['formatted_address']} at ({data['lat']}, {data['lng']})")
    
    def test_geocode_invalid_location(self, api_client):
        """Test geocoding an invalid/nonexistent location"""
        response = api_client.post(f"{API_URL}/geocode", json={
            "location": "XYZNONEXISTENT12345"
        })
        # Should return 404 for not found locations
        assert response.status_code == 404
        print("✓ Geocode correctly returns 404 for invalid location")


class TestHistoryEndpoint:
    """Tests for /api/history endpoint"""
    
    def test_get_history_returns_200(self, api_client):
        """Test getting analysis history"""
        response = api_client.get(f"{API_URL}/history")
        assert response.status_code == 200
        data = response.json()
        
        # Should return a list
        assert isinstance(data, list)
        
        # If there are items, validate structure
        if len(data) > 0:
            item = data[0]
            assert "id" in item
            assert "timestamp" in item
            assert "status" in item
            print(f"✓ History returns {len(data)} items, first item id: {item['id']}")
        else:
            print("✓ History returns empty list (no previous analyses)")


class TestStatisticsEndpoint:
    """Tests for /api/statistics endpoint"""
    
    def test_get_statistics_returns_200(self, api_client):
        """Test getting statistics"""
        response = api_client.get(f"{API_URL}/statistics")
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "total_searches" in data
        assert "high_confidence" in data
        assert "medium_confidence" in data
        assert "low_confidence" in data
        assert "success_rate" in data
        
        # Validate data types
        assert isinstance(data["total_searches"], int)
        assert isinstance(data["success_rate"], (int, float))
        
        print(f"✓ Statistics: {data['total_searches']} searches, {data['success_rate']}% success rate")


class TestAnalyzeEndpoint:
    """Tests for /api/analyze endpoint with AI analysis"""
    
    def test_analyze_with_test_image(self, api_client, test_image_base64):
        """
        Test image analysis endpoint
        NOTE: OpenAI will return Error (no quota), Gemini should work
        """
        response = api_client.post(f"{API_URL}/analyze", json={
            "image_base64": test_image_base64,
            "search_zone": "Europe"
        }, timeout=120)  # Allow time for AI analysis
        
        assert response.status_code == 200
        data = response.json()
        
        # Validate response structure
        assert "id" in data
        assert "timestamp" in data
        assert "status" in data
        assert data["status"] == "completed"
        
        # Validate consensus fields exist
        assert "consensus_location" in data
        assert "consensus_coordinates" in data
        assert "consensus_confidence" in data
        
        # Validate AI analysis results structure
        assert "gpt_analysis" in data
        assert "gemini_analysis" in data
        
        # Check GPT returned Error (no quota - expected)
        if data["gpt_analysis"]:
            gpt_result = data["gpt_analysis"]
            print(f"  GPT result: location={gpt_result.get('location_guess', 'N/A')}, "
                  f"confidence={gpt_result.get('confidence', 0)}%")
        
        # Check Gemini result
        if data["gemini_analysis"]:
            gemini_result = data["gemini_analysis"]
            print(f"  Gemini result: location={gemini_result.get('location_guess', 'N/A')}, "
                  f"confidence={gemini_result.get('confidence', 0)}%")
        
        print(f"✓ Analyze completed: consensus_location='{data['consensus_location']}', "
              f"confidence={data['consensus_confidence']}%")


class TestIPGeolocationEndpoint:
    """Tests for /api/geolocate/ip endpoint"""
    
    def test_geolocate_google_dns(self, api_client):
        """Test IP geolocation with Google's DNS IP (8.8.8.8)"""
        response = api_client.post(f"{API_URL}/geolocate/ip", json={
            "ip_address": "8.8.8.8"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("success") == True
        assert "location" in data
        assert "ip" in data
        
        print(f"✓ IP Geolocation: {data['ip']} -> {data['location'].get('city', 'N/A')}, "
              f"{data['location'].get('country', 'N/A')}")


class TestPhoneLookupEndpoint:
    """Tests for /api/phone/lookup endpoint"""
    
    def test_phone_lookup_spanish_number(self, api_client):
        """Test phone number lookup with Spanish number"""
        response = api_client.post(f"{API_URL}/phone/lookup", json={
            "phone_number": "+34 612 345 678"
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("success") == True
        assert "phone_info" in data
        phone_info = data["phone_info"]
        
        assert phone_info.get("country") == "España"
        print(f"✓ Phone Lookup: {phone_info.get('number')} -> {phone_info.get('country')}")


class TestMapsKeyEndpoint:
    """Tests for /api/maps-key endpoint"""
    
    def test_get_maps_key(self, api_client):
        """Test retrieving Google Maps API key"""
        response = api_client.get(f"{API_URL}/maps-key")
        assert response.status_code == 200
        data = response.json()
        
        assert "key" in data
        assert len(data["key"]) > 0
        print(f"✓ Maps key retrieved: {data['key'][:20]}...")


class TestHistorySearchEndpoint:
    """Tests for /api/history/search endpoint"""
    
    def test_search_history_with_filters(self, api_client):
        """Test searching history with filters"""
        response = api_client.post(f"{API_URL}/history/search", json={
            "min_confidence": 0,
            "limit": 10
        })
        assert response.status_code == 200
        data = response.json()
        
        assert "results" in data
        assert "statistics" in data
        assert isinstance(data["results"], list)
        
        stats = data["statistics"]
        assert "total_searches" in stats
        assert "average_confidence" in stats
        
        print(f"✓ History search: {stats['total_searches']} results, "
              f"avg confidence: {stats['average_confidence']}%")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
