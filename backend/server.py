from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import base64
import asyncio
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# API Keys
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class AIAnalysis(BaseModel):
    model: str
    provider: str
    location_guess: str
    confidence: int
    landmarks: List[str]
    reasoning: str
    coordinates: Optional[dict] = None


class AnalysisResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    image_preview: str
    search_zone: Optional[str] = None
    gpt_analysis: Optional[AIAnalysis] = None
    gemini_analysis: Optional[AIAnalysis] = None
    consensus_location: Optional[str] = None
    consensus_coordinates: Optional[dict] = None
    consensus_confidence: int = 0
    status: str = "pending"


class SearchRequest(BaseModel):
    image_base64: str
    search_zone: Optional[str] = None


class GeocodeRequest(BaseModel):
    location: str


# Helper functions
async def analyze_with_gpt(image_base64: str, search_zone: Optional[str] = None) -> AIAnalysis:
    """Analyze image with GPT-5.2 for geolocation"""
    try:
        chat = LlmChat(
            api_key=OPENAI_API_KEY,
            session_id=f"geo-gpt-{uuid.uuid4()}",
            system_message="""You are GeoHunter GPT, an expert at identifying locations from photographs. 
            Analyze images to determine their geographic location based on:
            - Architecture and building styles
            - Signs, text, and language
            - Vegetation and landscape
            - Infrastructure (roads, utilities, vehicles)
            - Weather and lighting conditions
            - Cultural indicators
            
            Always respond in JSON format with these fields:
            {
                "location_guess": "Most likely location (City, Country)",
                "confidence": 0-100,
                "landmarks": ["list of identifiable landmarks or features"],
                "reasoning": "Brief explanation of your analysis",
                "coordinates": {"lat": 0.0, "lng": 0.0} or null if uncertain
            }"""
        ).with_model("openai", "gpt-5.2")

        zone_hint = f"Search zone hint: {search_zone}. " if search_zone else ""
        
        image_content = ImageContent(image_base64=image_base64)
        user_message = UserMessage(
            text=f"{zone_hint}Analyze this image and identify the location. Respond ONLY with valid JSON.",
            file_contents=[image_content]
        )

        response = await chat.send_message(user_message)
        
        # Parse JSON response
        import json
        try:
            # Clean response - remove markdown code blocks if present
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            clean_response = clean_response.strip()
            
            data = json.loads(clean_response)
            return AIAnalysis(
                model="gpt-5.2",
                provider="OpenAI",
                location_guess=data.get("location_guess", "Unknown"),
                confidence=data.get("confidence", 0),
                landmarks=data.get("landmarks", []),
                reasoning=data.get("reasoning", ""),
                coordinates=data.get("coordinates")
            )
        except json.JSONDecodeError:
            logger.error(f"Failed to parse GPT response: {response}")
            return AIAnalysis(
                model="gpt-5.2",
                provider="OpenAI",
                location_guess="Analysis failed",
                confidence=0,
                landmarks=[],
                reasoning=f"Raw response: {response[:200]}",
                coordinates=None
            )
    except Exception as e:
        logger.error(f"GPT analysis error: {str(e)}")
        return AIAnalysis(
            model="gpt-5.2",
            provider="OpenAI",
            location_guess="Error",
            confidence=0,
            landmarks=[],
            reasoning=str(e),
            coordinates=None
        )


async def analyze_with_gemini(image_base64: str, search_zone: Optional[str] = None) -> AIAnalysis:
    """Analyze image with Gemini for geolocation"""
    try:
        chat = LlmChat(
            api_key=GEMINI_API_KEY,
            session_id=f"geo-gemini-{uuid.uuid4()}",
            system_message="""You are GeoHunter Gemini, an expert at identifying locations from photographs.
            Analyze images to determine their geographic location based on:
            - Architecture and building styles
            - Signs, text, and language
            - Vegetation and landscape
            - Infrastructure (roads, utilities, vehicles)
            - Weather and lighting conditions
            - Cultural indicators
            
            Always respond in JSON format with these fields:
            {
                "location_guess": "Most likely location (City, Country)",
                "confidence": 0-100,
                "landmarks": ["list of identifiable landmarks or features"],
                "reasoning": "Brief explanation of your analysis",
                "coordinates": {"lat": 0.0, "lng": 0.0} or null if uncertain
            }"""
        ).with_model("gemini", "gemini-2.5-flash")

        zone_hint = f"Search zone hint: {search_zone}. " if search_zone else ""
        
        image_content = ImageContent(image_base64=image_base64)
        user_message = UserMessage(
            text=f"{zone_hint}Analyze this image and identify the location. Respond ONLY with valid JSON.",
            file_contents=[image_content]
        )

        response = await chat.send_message(user_message)
        
        # Parse JSON response
        import json
        try:
            clean_response = response.strip()
            if clean_response.startswith("```"):
                clean_response = clean_response.split("```")[1]
                if clean_response.startswith("json"):
                    clean_response = clean_response[4:]
            clean_response = clean_response.strip()
            
            data = json.loads(clean_response)
            return AIAnalysis(
                model="gemini-2.5-flash",
                provider="Google",
                location_guess=data.get("location_guess", "Unknown"),
                confidence=data.get("confidence", 0),
                landmarks=data.get("landmarks", []),
                reasoning=data.get("reasoning", ""),
                coordinates=data.get("coordinates")
            )
        except json.JSONDecodeError:
            logger.error(f"Failed to parse Gemini response: {response}")
            return AIAnalysis(
                model="gemini-2.5-flash",
                provider="Google",
                location_guess="Analysis failed",
                confidence=0,
                landmarks=[],
                reasoning=f"Raw response: {response[:200]}",
                coordinates=None
            )
    except Exception as e:
        logger.error(f"Gemini analysis error: {str(e)}")
        return AIAnalysis(
            model="gemini-2.5-flash",
            provider="Google",
            location_guess="Error",
            confidence=0,
            landmarks=[],
            reasoning=str(e),
            coordinates=None
        )


async def geocode_location(location: str) -> Optional[dict]:
    """Get coordinates for a location using Google Maps Geocoding API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={
                    "address": location,
                    "key": GOOGLE_MAPS_API_KEY
                }
            )
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                result = data["results"][0]
                location_data = result["geometry"]["location"]
                return {
                    "lat": location_data["lat"],
                    "lng": location_data["lng"],
                    "formatted_address": result.get("formatted_address", location),
                    "place_id": result.get("place_id"),
                    "types": result.get("types", [])
                }
    except Exception as e:
        logger.error(f"Geocoding error: {str(e)}")
    return None


async def get_place_details(lat: float, lng: float) -> Optional[dict]:
    """Get detailed place info using Google Maps reverse geocoding and Places API"""
    try:
        async with httpx.AsyncClient() as client:
            # Reverse geocoding
            response = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={
                    "latlng": f"{lat},{lng}",
                    "key": GOOGLE_MAPS_API_KEY
                }
            )
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                result = data["results"][0]
                
                # Extract components
                components = {}
                for comp in result.get("address_components", []):
                    for type_ in comp.get("types", []):
                        components[type_] = comp.get("long_name")
                
                return {
                    "formatted_address": result.get("formatted_address"),
                    "place_id": result.get("place_id"),
                    "country": components.get("country"),
                    "administrative_area": components.get("administrative_area_level_1"),
                    "locality": components.get("locality"),
                    "sublocality": components.get("sublocality"),
                    "route": components.get("route"),
                    "types": result.get("types", [])
                }
    except Exception as e:
        logger.error(f"Place details error: {str(e)}")
    return None


async def search_nearby_places(lat: float, lng: float, radius: int = 1000) -> List[dict]:
    """Search for nearby places using Google Places API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params={
                    "location": f"{lat},{lng}",
                    "radius": radius,
                    "key": GOOGLE_MAPS_API_KEY
                }
            )
            data = response.json()
            
            if data.get("status") == "OK":
                places = []
                for place in data.get("results", [])[:5]:  # Top 5 places
                    places.append({
                        "name": place.get("name"),
                        "types": place.get("types", []),
                        "vicinity": place.get("vicinity"),
                        "rating": place.get("rating")
                    })
                return places
    except Exception as e:
        logger.error(f"Nearby search error: {str(e)}")
    return []


def calculate_consensus(gpt: AIAnalysis, gemini: AIAnalysis) -> tuple:
    """Calculate consensus between GPT and Gemini analyses"""
    # Weighted average based on confidence
    total_confidence = gpt.confidence + gemini.confidence
    
    if total_confidence == 0:
        return "Unknown Location", None, 0
    
    # If both agree on general location, boost confidence
    gpt_location = gpt.location_guess.lower()
    gemini_location = gemini.location_guess.lower()
    
    # Check for overlap in location names
    gpt_words = set(gpt_location.replace(",", " ").split())
    gemini_words = set(gemini_location.replace(",", " ").split())
    common_words = gpt_words.intersection(gemini_words)
    
    agreement_bonus = len(common_words) * 5  # 5% bonus per matching word
    
    # Choose the location with higher confidence
    if gpt.confidence >= gemini.confidence:
        consensus_location = gpt.location_guess
        consensus_coords = gpt.coordinates
    else:
        consensus_location = gemini.location_guess
        consensus_coords = gemini.coordinates
    
    # Calculate consensus confidence
    base_confidence = (gpt.confidence + gemini.confidence) / 2
    consensus_confidence = min(100, int(base_confidence + agreement_bonus))
    
    return consensus_location, consensus_coords, consensus_confidence


# Routes
@api_router.get("/")
async def root():
    return {"message": "GeoHunter AI - Mega Brain Active"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


@api_router.post("/analyze")
async def analyze_image(request: SearchRequest):
    """Analyze an image with both GPT and Gemini to identify location"""
    try:
        # Create result object
        result_id = str(uuid.uuid4())
        
        # Run both AI analyses in parallel
        gpt_task = analyze_with_gpt(request.image_base64, request.search_zone)
        gemini_task = analyze_with_gemini(request.image_base64, request.search_zone)
        
        gpt_result, gemini_result = await asyncio.gather(gpt_task, gemini_task)
        
        # Calculate consensus
        consensus_location, consensus_coords, consensus_confidence = calculate_consensus(
            gpt_result, gemini_result
        )
        
        # If no coordinates from AI, try geocoding the consensus location
        if not consensus_coords and consensus_location and consensus_location != "Unknown Location":
            geocode_result = await geocode_location(consensus_location)
            if geocode_result:
                consensus_coords = {
                    "lat": geocode_result["lat"],
                    "lng": geocode_result["lng"]
                }
        
        # Enrich with Google Maps data if we have coordinates
        place_details = None
        nearby_places = []
        if consensus_coords:
            place_details = await get_place_details(consensus_coords["lat"], consensus_coords["lng"])
            nearby_places = await search_nearby_places(consensus_coords["lat"], consensus_coords["lng"])
        
        # Store in database
        result = {
            "id": result_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "image_preview": request.image_base64[:100] + "...",
            "search_zone": request.search_zone,
            "gpt_analysis": gpt_result.model_dump(),
            "gemini_analysis": gemini_result.model_dump(),
            "consensus_location": consensus_location,
            "consensus_coordinates": consensus_coords,
            "consensus_confidence": consensus_confidence,
            "place_details": place_details,
            "nearby_places": nearby_places,
            "status": "completed"
        }
        
        await db.analysis_history.insert_one({**result, "_id": result_id})
        
        return result
        
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/geocode")
async def geocode(request: GeocodeRequest):
    """Geocode a location string to coordinates"""
    result = await geocode_location(request.location)
    if result:
        return result
    raise HTTPException(status_code=404, detail="Location not found")


@api_router.get("/history")
async def get_history():
    """Get analysis history"""
    history = await db.analysis_history.find({}, {"_id": 0}).sort("timestamp", -1).to_list(50)
    return history


@api_router.delete("/history/{analysis_id}")
async def delete_history_item(analysis_id: str):
    """Delete a history item"""
    result = await db.analysis_history.delete_one({"id": analysis_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Deleted successfully"}


@api_router.get("/maps-key")
async def get_maps_key():
    """Get Google Maps API key for frontend"""
    return {"key": GOOGLE_MAPS_API_KEY}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
