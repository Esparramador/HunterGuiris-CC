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
import cv2
import numpy as np
import tempfile
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
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Models
class AIAnalysis(BaseModel):
    model: str
    provider: str
    location_guess: str
    confidence: int
    landmarks: List[str]
    reasoning: str
    coordinates: Optional[dict] = None


class MultiAnalysisRequest(BaseModel):
    images: List[str]  # List of base64 images
    search_zone: Optional[str] = None


class SearchRequest(BaseModel):
    image_base64: str
    search_zone: Optional[str] = None


class GeocodeRequest(BaseModel):
    location: str


# Video frame extraction
def extract_video_frames(video_base64: str, max_frames: int = 5) -> List[str]:
    """Extract key frames from a video"""
    frames = []
    try:
        # Decode base64 video
        video_data = base64.b64decode(video_base64)
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
            tmp.write(video_data)
            tmp_path = tmp.name
        
        # Open video
        cap = cv2.VideoCapture(tmp_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        if total_frames == 0:
            return frames
        
        # Calculate frame intervals
        interval = max(1, total_frames // max_frames)
        
        for i in range(0, min(total_frames, max_frames * interval), interval):
            cap.set(cv2.CAP_PROP_POS_FRAMES, i)
            ret, frame = cap.read()
            if ret:
                # Convert to JPEG
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frame_base64 = base64.b64encode(buffer).decode('utf-8')
                frames.append(frame_base64)
        
        cap.release()
        os.unlink(tmp_path)
        
    except Exception as e:
        logger.error(f"Video extraction error: {str(e)}")
    
    return frames


async def analyze_single_image(image_base64: str, search_zone: Optional[str], provider: str) -> AIAnalysis:
    """Analyze a single image with specified provider"""
    try:
        if provider == "openai":
            api_key = OPENAI_API_KEY
            model = "gpt-5.2"
            model_name = ("openai", "gpt-5.2")
        else:
            api_key = GEMINI_API_KEY
            model = "gemini-2.5-flash"
            model_name = ("gemini", "gemini-2.5-flash")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"geo-{provider}-{uuid.uuid4()}",
            system_message="""You are an expert geolocation analyst. Analyze images to identify locations based on:
- Architecture, building styles, materials
- Signs, text, language, scripts
- Vegetation, landscape, terrain
- Infrastructure, roads, vehicles, traffic signs
- Weather, lighting, shadows
- Cultural indicators, clothing, advertisements
- Street furniture, utilities, mailboxes

CRITICAL: Be as specific as possible. Look for ANY text, signs, or unique landmarks.
Respond ONLY in valid JSON:
{
    "location_guess": "Specific location (Street/Neighborhood, City, Country)",
    "confidence": 0-100,
    "landmarks": ["specific identifiable elements"],
    "reasoning": "detailed analysis of visual clues",
    "coordinates": {"lat": 0.0, "lng": 0.0} or null
}"""
        ).with_model(*model_name)

        zone_hint = f"SEARCH ZONE: {search_zone}. Focus analysis on this region. " if search_zone else ""
        
        image_content = ImageContent(image_base64=image_base64)
        user_message = UserMessage(
            text=f"{zone_hint}Analyze this image for geolocation. Be specific. Respond ONLY with valid JSON.",
            file_contents=[image_content]
        )

        response = await chat.send_message(user_message)
        
        import json
        clean_response = response.strip()
        if clean_response.startswith("```"):
            clean_response = clean_response.split("```")[1]
            if clean_response.startswith("json"):
                clean_response = clean_response[4:]
        clean_response = clean_response.strip()
        
        data = json.loads(clean_response)
        return AIAnalysis(
            model=model,
            provider="OpenAI" if provider == "openai" else "Google",
            location_guess=data.get("location_guess", "Unknown"),
            confidence=data.get("confidence", 0),
            landmarks=data.get("landmarks", []),
            reasoning=data.get("reasoning", ""),
            coordinates=data.get("coordinates")
        )
    except Exception as e:
        logger.error(f"{provider} analysis error: {str(e)}")
        return AIAnalysis(
            model=model if 'model' in locals() else "unknown",
            provider="OpenAI" if provider == "openai" else "Google",
            location_guess="Error",
            confidence=0,
            landmarks=[],
            reasoning=str(e),
            coordinates=None
        )


async def analyze_multiple_images(images: List[str], search_zone: Optional[str]) -> dict:
    """Analyze multiple images and combine results for higher accuracy"""
    all_results = []
    
    # Analyze each image with both AIs
    tasks = []
    for i, img in enumerate(images[:10]):  # Max 10 images
        tasks.append(analyze_single_image(img, search_zone, "openai"))
        tasks.append(analyze_single_image(img, search_zone, "gemini"))
    
    results = await asyncio.gather(*tasks)
    
    # Separate by provider
    gpt_results = [r for r in results if r.provider == "OpenAI"]
    gemini_results = [r for r in results if r.provider == "Google"]
    
    # Aggregate locations and confidence
    location_votes = {}
    all_landmarks = []
    all_reasoning = []
    all_coords = []
    
    for r in results:
        if r.confidence > 20 and r.location_guess != "Error":
            loc = r.location_guess.lower().strip()
            if loc not in location_votes:
                location_votes[loc] = {"count": 0, "confidence_sum": 0, "original": r.location_guess}
            location_votes[loc]["count"] += 1
            location_votes[loc]["confidence_sum"] += r.confidence
            
            all_landmarks.extend(r.landmarks)
            all_reasoning.append(f"[{r.provider}] {r.reasoning}")
            
            if r.coordinates:
                all_coords.append(r.coordinates)
    
    # Find consensus location
    best_location = "Unknown Location"
    best_confidence = 0
    
    if location_votes:
        # Sort by vote count, then by total confidence
        sorted_locations = sorted(
            location_votes.items(),
            key=lambda x: (x[1]["count"], x[1]["confidence_sum"]),
            reverse=True
        )
        
        top = sorted_locations[0]
        best_location = top[1]["original"]
        
        # Calculate confidence based on agreement
        total_analyses = len(results)
        agreement_ratio = top[1]["count"] / total_analyses
        avg_confidence = top[1]["confidence_sum"] / top[1]["count"]
        
        # Boost confidence for multi-image agreement
        multi_image_boost = min(20, len(images) * 3)  # Up to 20% boost
        agreement_boost = agreement_ratio * 30  # Up to 30% boost for agreement
        
        best_confidence = min(99, int(avg_confidence * 0.6 + agreement_boost + multi_image_boost))
    
    # Average coordinates
    consensus_coords = None
    if all_coords:
        avg_lat = sum(c["lat"] for c in all_coords) / len(all_coords)
        avg_lng = sum(c["lng"] for c in all_coords) / len(all_coords)
        consensus_coords = {"lat": avg_lat, "lng": avg_lng}
    
    # Unique landmarks
    unique_landmarks = list(set(all_landmarks))[:15]
    
    return {
        "consensus_location": best_location,
        "consensus_confidence": best_confidence,
        "consensus_coordinates": consensus_coords,
        "landmarks": unique_landmarks,
        "analysis_count": len(results),
        "image_count": len(images),
        "gpt_results": [r.model_dump() for r in gpt_results[:3]],  # Top 3
        "gemini_results": [r.model_dump() for r in gemini_results[:3]],
        "combined_reasoning": "\n\n".join(all_reasoning[:6])
    }


async def geocode_location(location: str) -> Optional[dict]:
    """Get coordinates for a location using Google Maps Geocoding API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": location, "key": GOOGLE_MAPS_API_KEY}
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
    """Get detailed place info using Google Maps reverse geocoding"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY}
            )
            data = response.json()
            
            if data.get("status") == "OK" and data.get("results"):
                result = data["results"][0]
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
                }
    except Exception as e:
        logger.error(f"Place details error: {str(e)}")
    return None


async def search_nearby_places(lat: float, lng: float, radius: int = 500) -> List[dict]:
    """Search for nearby places using Google Places API"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                params={"location": f"{lat},{lng}", "radius": radius, "key": GOOGLE_MAPS_API_KEY}
            )
            data = response.json()
            
            if data.get("status") == "OK":
                return [
                    {"name": p.get("name"), "types": p.get("types", []), "vicinity": p.get("vicinity"), "rating": p.get("rating")}
                    for p in data.get("results", [])[:5]
                ]
    except Exception as e:
        logger.error(f"Nearby search error: {str(e)}")
    return []


# Routes
@api_router.get("/")
async def root():
    return {"message": "Hunter Guiris CC - Multi-AI Geolocation System"}


@api_router.post("/analyze")
async def analyze_image(request: SearchRequest):
    """Analyze a single image (backward compatible)"""
    result = await analyze_multiple_images([request.image_base64], request.search_zone)
    
    # Enrich with Google Maps
    if result["consensus_coordinates"]:
        place_details = await get_place_details(
            result["consensus_coordinates"]["lat"],
            result["consensus_coordinates"]["lng"]
        )
        nearby_places = await search_nearby_places(
            result["consensus_coordinates"]["lat"],
            result["consensus_coordinates"]["lng"]
        )
        result["place_details"] = place_details
        result["nearby_places"] = nearby_places
    elif result["consensus_location"] != "Unknown Location":
        geocode = await geocode_location(result["consensus_location"])
        if geocode:
            result["consensus_coordinates"] = {"lat": geocode["lat"], "lng": geocode["lng"]}
            result["place_details"] = await get_place_details(geocode["lat"], geocode["lng"])
            result["nearby_places"] = await search_nearby_places(geocode["lat"], geocode["lng"])
    
    # Format for frontend compatibility
    final_result = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "image_count": result["image_count"],
        "analysis_count": result["analysis_count"],
        "consensus_location": result["consensus_location"],
        "consensus_coordinates": result["consensus_coordinates"],
        "consensus_confidence": result["consensus_confidence"],
        "landmarks": result["landmarks"],
        "place_details": result.get("place_details"),
        "nearby_places": result.get("nearby_places", []),
        "gpt_analysis": result["gpt_results"][0] if result["gpt_results"] else None,
        "gemini_analysis": result["gemini_results"][0] if result["gemini_results"] else None,
        "all_gpt_results": result["gpt_results"],
        "all_gemini_results": result["gemini_results"],
        "combined_reasoning": result["combined_reasoning"],
        "status": "completed"
    }
    
    # Save to history
    await db.analysis_history.insert_one({**final_result, "_id": final_result["id"]})
    
    return final_result


@api_router.post("/analyze-multi")
async def analyze_multiple(request: MultiAnalysisRequest):
    """Analyze multiple images for higher accuracy"""
    if len(request.images) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 images allowed")
    
    result = await analyze_multiple_images(request.images, request.search_zone)
    
    # Enrich with Google Maps
    if result["consensus_coordinates"]:
        result["place_details"] = await get_place_details(
            result["consensus_coordinates"]["lat"],
            result["consensus_coordinates"]["lng"]
        )
        result["nearby_places"] = await search_nearby_places(
            result["consensus_coordinates"]["lat"],
            result["consensus_coordinates"]["lng"]
        )
    elif result["consensus_location"] != "Unknown Location":
        geocode = await geocode_location(result["consensus_location"])
        if geocode:
            result["consensus_coordinates"] = {"lat": geocode["lat"], "lng": geocode["lng"]}
            result["place_details"] = await get_place_details(geocode["lat"], geocode["lng"])
            result["nearby_places"] = await search_nearby_places(geocode["lat"], geocode["lng"])
    
    final_result = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **result,
        "status": "completed"
    }
    
    await db.analysis_history.insert_one({**final_result, "_id": final_result["id"]})
    
    return final_result


@api_router.post("/analyze-video")
async def analyze_video(video_base64: str = Form(...), search_zone: Optional[str] = Form(None)):
    """Extract frames from video and analyze"""
    frames = extract_video_frames(video_base64, max_frames=5)
    
    if not frames:
        raise HTTPException(status_code=400, detail="Could not extract frames from video")
    
    result = await analyze_multiple_images(frames, search_zone)
    
    # Enrich with Google Maps
    if result["consensus_coordinates"]:
        result["place_details"] = await get_place_details(
            result["consensus_coordinates"]["lat"],
            result["consensus_coordinates"]["lng"]
        )
        result["nearby_places"] = await search_nearby_places(
            result["consensus_coordinates"]["lat"],
            result["consensus_coordinates"]["lng"]
        )
    
    final_result = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "video",
        "frames_extracted": len(frames),
        **result,
        "status": "completed"
    }
    
    await db.analysis_history.insert_one({**final_result, "_id": final_result["id"]})
    
    return final_result


@api_router.post("/geocode")
async def geocode(request: GeocodeRequest):
    """Geocode a location string"""
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
    return {"message": "Deleted"}


@api_router.get("/maps-key")
async def get_maps_key():
    """Get Google Maps API key"""
    return {"key": GOOGLE_MAPS_API_KEY}


# Include router
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
