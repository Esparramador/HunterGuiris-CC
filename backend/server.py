from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import base64
import asyncio
import httpx
import cv2
import numpy as np
import tempfile
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
from PIL import Image
import io
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# API Keys
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
GOOGLE_MAPS_API_KEY = os.environ.get('GOOGLE_MAPS_API_KEY', '')

# AUTHORIZED EMAIL - Only this user can access the app
AUTHORIZED_EMAIL = "sadiagiljoan@gmail.com"

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ===================== AUTHENTICATION =====================

class UserModel(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime


async def get_current_user(request: Request) -> Optional[UserModel]:
    """Get current authenticated user from session token"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        return None
    
    # Find session in database
    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        return None
    
    # Check if session expired
    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    
    # Get user
    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        return None
    
    return UserModel(**user_doc)


async def require_auth(request: Request) -> UserModel:
    """Require authentication - raises 401 if not authenticated"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id from Emergent OAuth for session token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id requerido")
    
    # Call Emergent Auth to get session data
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Sesión inválida")
        
        auth_data = auth_response.json()
    
    email = auth_data.get("email")
    name = auth_data.get("name")
    picture = auth_data.get("picture")
    session_token = auth_data.get("session_token")
    
    # CHECK AUTHORIZATION - Only allow specific email
    if email.lower() != AUTHORIZED_EMAIL.lower():
        logger.warning(f"Unauthorized access attempt from: {email}")
        raise HTTPException(status_code=403, detail="Acceso denegado. Solo usuarios autorizados pueden acceder a esta aplicación.")
    
    # Find or create user
    user_doc = await db.users.find_one({"email": email}, {"_id": 0})
    
    if user_doc:
        user_id = user_doc["user_id"]
        # Update user info
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc)
        })
    
    # Create session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc)
    })
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 60 * 60,
        path="/"
    )
    
    return {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture
    }


@api_router.get("/auth/me")
async def get_me(request: Request):
    """Get current authenticated user"""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture
    }


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Sesión cerrada"}


def convert_to_jpeg_base64(image_base64: str) -> str:
    """Convert any image to JPEG format for API compatibility"""
    try:
        # Decode base64
        image_data = base64.b64decode(image_base64)
        
        # Open with PIL
        img = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if necessary (handles PNG with transparency, etc.)
        if img.mode in ('RGBA', 'P', 'LA'):
            # Create white background
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize if too large (max 2048px on longest side)
        max_size = 2048
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # Save to JPEG
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=90)
        buffer.seek(0)
        
        return base64.b64encode(buffer.read()).decode('utf-8')
    except Exception as e:
        logger.error(f"Image conversion error: {str(e)}")
        return image_base64  # Return original if conversion fails


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


class PhoneLookupRequest(BaseModel):
    phone_number: str
    country_code: Optional[str] = None


class ShareLocationRequest(BaseModel):
    target_phone: str
    requester_name: str
    message: Optional[str] = None


class IPGeolocationRequest(BaseModel):
    ip_address: str


class HistoryFilterRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    min_confidence: Optional[int] = None
    location_contains: Optional[str] = None
    limit: Optional[int] = 100


class AlternativeLocation(BaseModel):
    location: str
    confidence: int
    coordinates: Optional[dict] = None
    source: str  # "gpt", "gemini", "consensus"
    reasoning: str


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
    model = "gpt-5.2" if provider == "openai" else "gemini-2.5-flash"
    provider_name = "openai" if provider == "openai" else "gemini"
    
    # Convert image to JPEG for API compatibility
    converted_image = convert_to_jpeg_base64(image_base64)
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"geo-{provider}-{uuid.uuid4()}",
            system_message="""You are an ELITE forensic geolocation analyst. Your mission is to identify WHERE THE PHOTOGRAPHER IS STANDING - not what they're looking at.

## CRITICAL UNDERSTANDING
- The image shows what the photographer SEES from their position
- You must identify THE PHOTOGRAPHER'S EXACT LOCATION
- If they're photographing a building across the street, identify WHERE THEY ARE STANDING, not the building
- Small details around the camera position are MORE valuable than distant landmarks

## EXHAUSTIVE ANALYSIS PROTOCOL - Examine EVERY pixel:

### 1. IMMEDIATE FOREGROUND (HIGHEST PRIORITY - where the photographer stands)
- Railings, fences, balcony styles: material, paint color, rust patterns, design style
- Floor/ground beneath camera: tile patterns, paving stones, concrete type, wear marks
- Window frames visible at edges: style, material, age
- Plants nearby: pot styles, species, arrangement
- Cables, wires, antennas in frame edges

### 2. ARCHITECTURAL FORENSICS
- Window styles: French, sash, casement - each country has distinct patterns
- Shutters: louvered, solid, colors typical of Mediterranean/Northern Europe
- Building materials: brick bonds, render colors, stone types
- Roof tiles: terracotta (Spain/Italy), slate (France/UK), concrete (modern)
- Balcony ironwork: Art Nouveau, Colonial, Modern - very region-specific
- Door styles, entry systems, mailbox designs, intercom panels

### 3. TEXT & SIGNAGE (CRITICAL - read EVERYTHING)
- ANY visible text - even partial letters, reversed text in reflections
- Shop names, even partially visible
- Street signs, building numbers
- Graffiti, stickers, posters
- License plate formats and colors (even blurry)
- Menu boards, price formats (€, £, $), language

### 4. INFRASTRUCTURE SIGNATURES
- Street light designs: each city has unique patterns
- Traffic sign shapes and colors (triangular warning signs vary by country)
- Road marking styles: yellow lines (UK/US), white lines (Europe)
- Utility poles, transformer boxes, fire hydrant styles
- Trash bin designs, bench styles, bus stop shelters

### 5. ENVIRONMENTAL CLUES
- Shadow angles (estimate time of day and latitude)
- Vegetation type: Mediterranean, temperate, tropical
- Weather indicators: wet surfaces, fog, snow
- Sun position relative to buildings

### 6. CULTURAL MARKERS
- Vehicle types parked nearby (European small cars vs American)
- Driving side visible in reflections
- Clothing styles on any people
- Shop types: pharmacies (green cross = Europe), convenience store brands

## OUTPUT FORMAT (JSON only):
{
    "location_guess": "EXACT location - Street if possible, then Neighborhood, City, Country",
    "confidence": 0-100 (only high if you have TEXT evidence or UNIQUE landmarks),
    "landmarks": ["SPECIFIC elements found - not generic descriptions"],
    "reasoning": "Step-by-step: 'I see X which indicates Y, combined with Z this suggests...'",
    "coordinates": {"lat": float, "lng": float} or null,
    "photographer_position": "Description of where camera is positioned"
}

BE HONEST about confidence. Only claim high confidence if you have STRONG evidence (readable text, unique landmarks)."""
        ).with_model(provider_name, model)

        zone_hint = ""
        if search_zone:
            zone_hint = f"""SEARCH ZONE PROVIDED: '{search_zone}'
PRIORITIZE this region in your analysis. Look for features matching this area.
Cross-reference architectural styles, language on signs, infrastructure patterns with this zone.
If evidence supports this zone, be more confident. If it clearly contradicts, note the discrepancy.

"""
        
        image_content = ImageContent(image_base64=converted_image)
        user_message = UserMessage(
            text=f"""{zone_hint}ANALYZE THIS IMAGE EXHAUSTIVELY FOR GEOLOCATION.

Focus on:
1. WHERE IS THE PHOTOGRAPHER STANDING? (not what they're looking at)
2. Every small detail: railings, tiles, windows, cables, signs
3. Any readable text, even partial
4. Architectural style matches with the search zone

Be SPECIFIC. Not "Europe" but "Barcelona, Eixample district" if evidence supports it.

Respond ONLY with valid JSON.""",
            file_contents=[image_content]
        )

        response = await chat.send_message(user_message)
        
        clean_response = response.strip()
        
        # Clean markdown code blocks if present
        if "```json" in clean_response:
            clean_response = clean_response.split("```json")[1].split("```")[0]
        elif "```" in clean_response:
            parts = clean_response.split("```")
            if len(parts) >= 2:
                clean_response = parts[1]
        
        clean_response = clean_response.strip()
        
        data = json.loads(clean_response)
        
        # Validate coordinates if present
        coords = data.get("coordinates")
        if coords and isinstance(coords, dict):
            if "lat" in coords and "lng" in coords:
                try:
                    coords = {"lat": float(coords["lat"]), "lng": float(coords["lng"])}
                except:
                    coords = None
            else:
                coords = None
        else:
            coords = None
            
        return AIAnalysis(
            model=model,
            provider="OpenAI" if provider == "openai" else "Google",
            location_guess=data.get("location_guess", "Unknown"),
            confidence=min(100, max(0, int(data.get("confidence", 0)))),
            landmarks=data.get("landmarks", [])[:10],
            reasoning=data.get("reasoning", ""),
            coordinates=coords
        )
    except json.JSONDecodeError as e:
        logger.error(f"{provider} JSON parse error: {str(e)}, response: {response[:500] if 'response' in locals() else 'N/A'}")
        return AIAnalysis(
            model=model,
            provider="OpenAI" if provider == "openai" else "Google",
            location_guess="Parse Error",
            confidence=0,
            landmarks=[],
            reasoning=f"Failed to parse AI response: {str(e)}",
            coordinates=None
        )
    except Exception as e:
        logger.error(f"{provider} analysis error: {str(e)}")
        return AIAnalysis(
            model=model,
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
    
    # Add alternative locations when there's uncertainty
    if result["consensus_confidence"] < 80:
        gpt_analysis = result["gpt_results"][0] if result["gpt_results"] else {}
        gemini_analysis = result["gemini_results"][0] if result["gemini_results"] else {}
        alternatives = await get_alternative_locations(gpt_analysis, gemini_analysis, request.search_zone)
        final_result["alternative_locations"] = alternatives
    else:
        final_result["alternative_locations"] = []
    
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


# ===================== REPOSITORIO DE BÚSQUEDAS =====================

@api_router.post("/history/search")
async def search_history(filters: HistoryFilterRequest):
    """Search history with advanced filters"""
    query = {}
    
    if filters.start_date:
        query["timestamp"] = {"$gte": filters.start_date}
    if filters.end_date:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = filters.end_date
        else:
            query["timestamp"] = {"$lte": filters.end_date}
    if filters.min_confidence:
        query["consensus_confidence"] = {"$gte": filters.min_confidence}
    if filters.location_contains:
        query["consensus_location"] = {"$regex": filters.location_contains, "$options": "i"}
    
    history = await db.analysis_history.find(query, {"_id": 0}).sort("timestamp", -1).to_list(filters.limit or 100)
    
    # Calculate statistics
    total_searches = len(history)
    avg_confidence = sum(h.get("consensus_confidence", 0) for h in history) / max(1, total_searches)
    successful = sum(1 for h in history if h.get("consensus_confidence", 0) > 50)
    
    return {
        "results": history,
        "statistics": {
            "total_searches": total_searches,
            "average_confidence": round(avg_confidence, 1),
            "successful_identifications": successful,
            "success_rate": round(successful / max(1, total_searches) * 100, 1)
        }
    }


@api_router.get("/history/{analysis_id}")
async def get_history_detail(analysis_id: str):
    """Get detailed history item with all data"""
    item = await db.analysis_history.find_one({"id": analysis_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@api_router.get("/history/export/json")
async def export_history_json():
    """Export all history as JSON"""
    history = await db.analysis_history.find({}, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return {"data": history, "exported_at": datetime.now(timezone.utc).isoformat(), "total": len(history)}


@api_router.get("/statistics")
async def get_statistics():
    """Get overall statistics"""
    total = await db.analysis_history.count_documents({})
    high_conf = await db.analysis_history.count_documents({"consensus_confidence": {"$gte": 70}})
    medium_conf = await db.analysis_history.count_documents({"consensus_confidence": {"$gte": 40, "$lt": 70}})
    low_conf = await db.analysis_history.count_documents({"consensus_confidence": {"$lt": 40}})
    
    # Get most common locations
    pipeline = [
        {"$group": {"_id": "$consensus_location", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    common_locations = await db.analysis_history.aggregate(pipeline).to_list(10)
    
    return {
        "total_searches": total,
        "high_confidence": high_conf,
        "medium_confidence": medium_conf,
        "low_confidence": low_conf,
        "success_rate": round(high_conf / max(1, total) * 100, 1),
        "common_locations": [{"location": l["_id"], "count": l["count"]} for l in common_locations if l["_id"]]
    }


# ===================== UBICACIONES ALTERNATIVAS =====================

async def get_alternative_locations(gpt_analysis, gemini_analysis, search_zone: Optional[str]) -> List[dict]:
    """Generate alternative location suggestions when there's uncertainty"""
    alternatives = []
    
    # Helper function to get attribute from dict or object
    def get_attr(obj, key, default=None):
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)
    
    # Add GPT suggestion if valid
    gpt_location = get_attr(gpt_analysis, 'location_guess', '')
    if gpt_location and gpt_location not in ["Unknown", "Error", "Parse Error", "Unknown Location", ""]:
        gpt_reasoning = get_attr(gpt_analysis, 'reasoning', '') or ''
        gpt_landmarks = get_attr(gpt_analysis, 'landmarks', []) or []
        alternatives.append({
            "location": gpt_location,
            "confidence": get_attr(gpt_analysis, 'confidence', 0),
            "coordinates": get_attr(gpt_analysis, 'coordinates'),
            "source": "GPT-5.2",
            "reasoning": gpt_reasoning[:300] if gpt_reasoning else "",
            "landmarks": gpt_landmarks[:5] if gpt_landmarks else []
        })
    
    # Add Gemini suggestion if valid and different
    gemini_location = get_attr(gemini_analysis, 'location_guess', '')
    if gemini_location and gemini_location not in ["Unknown", "Error", "Parse Error", "Unknown Location", ""]:
        if not alternatives or gemini_location.lower() != alternatives[0]["location"].lower():
            gemini_reasoning = get_attr(gemini_analysis, 'reasoning', '') or ''
            gemini_landmarks = get_attr(gemini_analysis, 'landmarks', []) or []
            alternatives.append({
                "location": gemini_location,
                "confidence": get_attr(gemini_analysis, 'confidence', 0),
                "coordinates": get_attr(gemini_analysis, 'coordinates'),
                "source": "Gemini",
                "reasoning": gemini_reasoning[:300] if gemini_reasoning else "",
                "landmarks": gemini_landmarks[:5] if gemini_landmarks else []
            })
    
    # If search zone provided, try to find additional alternatives
    if search_zone and len(alternatives) < 3:
        try:
            geocode_result = await geocode_location(search_zone)
            if geocode_result:
                alternatives.append({
                    "location": geocode_result.get("formatted_address", search_zone),
                    "confidence": 30,
                    "coordinates": geocode_result.get("coordinates"),
                    "source": "Zona de búsqueda sugerida",
                    "reasoning": f"Ubicación basada en la zona de búsqueda proporcionada: {search_zone}",
                    "landmarks": []
                })
        except:
            pass
    
    # Sort by confidence
    alternatives.sort(key=lambda x: x["confidence"], reverse=True)
    
    return alternatives[:5]  # Return top 5 alternatives


# ===================== GEOLOCALIZACIÓN POR IP =====================

@api_router.post("/geolocate/ip")
async def geolocate_by_ip(request: IPGeolocationRequest):
    """Geolocate an IP address - useful for approximate location"""
    try:
        async with httpx.AsyncClient() as client:
            # Use ip-api.com (free, no key required)
            response = await client.get(f"http://ip-api.com/json/{request.ip_address}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query")
            data = response.json()
            
            if data.get("status") == "success":
                return {
                    "success": True,
                    "ip": data.get("query"),
                    "location": {
                        "country": data.get("country"),
                        "country_code": data.get("countryCode"),
                        "region": data.get("regionName"),
                        "city": data.get("city"),
                        "postal_code": data.get("zip"),
                        "coordinates": {
                            "lat": data.get("lat"),
                            "lng": data.get("lon")
                        },
                        "timezone": data.get("timezone")
                    },
                    "provider": {
                        "isp": data.get("isp"),
                        "organization": data.get("org"),
                        "as": data.get("as")
                    },
                    "accuracy": "city-level (approximate)"
                }
            else:
                return {"success": False, "error": data.get("message", "IP not found")}
    except Exception as e:
        logger.error(f"IP geolocation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== VALIDACIÓN DE NÚMEROS DE TELÉFONO =====================

@api_router.post("/phone/lookup")
async def phone_lookup(request: PhoneLookupRequest):
    """Lookup phone number information - country, carrier, type"""
    try:
        phone = request.phone_number.replace(" ", "").replace("-", "")
        
        # Basic validation and info extraction
        info = {
            "number": phone,
            "valid_format": len(phone) >= 8 and phone.replace("+", "").isdigit(),
            "type": "unknown",
            "country": None,
            "carrier": None
        }
        
        # Detect country by prefix
        country_prefixes = {
            "+1": {"country": "Estados Unidos/Canadá", "code": "US/CA"},
            "+34": {"country": "España", "code": "ES"},
            "+44": {"country": "Reino Unido", "code": "GB"},
            "+33": {"country": "Francia", "code": "FR"},
            "+49": {"country": "Alemania", "code": "DE"},
            "+39": {"country": "Italia", "code": "IT"},
            "+52": {"country": "México", "code": "MX"},
            "+54": {"country": "Argentina", "code": "AR"},
            "+55": {"country": "Brasil", "code": "BR"},
            "+56": {"country": "Chile", "code": "CL"},
            "+57": {"country": "Colombia", "code": "CO"},
            "+58": {"country": "Venezuela", "code": "VE"},
            "+51": {"country": "Perú", "code": "PE"},
            "+593": {"country": "Ecuador", "code": "EC"},
            "+86": {"country": "China", "code": "CN"},
            "+81": {"country": "Japón", "code": "JP"},
            "+82": {"country": "Corea del Sur", "code": "KR"},
            "+91": {"country": "India", "code": "IN"},
            "+7": {"country": "Rusia", "code": "RU"},
            "+380": {"country": "Ucrania", "code": "UA"},
            "+48": {"country": "Polonia", "code": "PL"},
            "+351": {"country": "Portugal", "code": "PT"},
            "+31": {"country": "Países Bajos", "code": "NL"},
            "+32": {"country": "Bélgica", "code": "BE"},
            "+41": {"country": "Suiza", "code": "CH"},
            "+43": {"country": "Austria", "code": "AT"},
            "+46": {"country": "Suecia", "code": "SE"},
            "+47": {"country": "Noruega", "code": "NO"},
            "+45": {"country": "Dinamarca", "code": "DK"},
            "+358": {"country": "Finlandia", "code": "FI"},
            "+353": {"country": "Irlanda", "code": "IE"},
            "+30": {"country": "Grecia", "code": "GR"},
            "+90": {"country": "Turquía", "code": "TR"},
            "+972": {"country": "Israel", "code": "IL"},
            "+971": {"country": "Emiratos Árabes", "code": "AE"},
            "+966": {"country": "Arabia Saudita", "code": "SA"},
            "+20": {"country": "Egipto", "code": "EG"},
            "+27": {"country": "Sudáfrica", "code": "ZA"},
            "+61": {"country": "Australia", "code": "AU"},
            "+64": {"country": "Nueva Zelanda", "code": "NZ"},
            "+65": {"country": "Singapur", "code": "SG"},
            "+66": {"country": "Tailandia", "code": "TH"},
            "+84": {"country": "Vietnam", "code": "VN"},
            "+62": {"country": "Indonesia", "code": "ID"},
            "+63": {"country": "Filipinas", "code": "PH"},
            "+60": {"country": "Malasia", "code": "MY"},
        }
        
        for prefix, country_info in sorted(country_prefixes.items(), key=lambda x: len(x[0]), reverse=True):
            if phone.startswith(prefix):
                info["country"] = country_info["country"]
                info["country_code"] = country_info["code"]
                break
        
        # Detect mobile vs landline (basic heuristic)
        if info["country_code"] == "ES":
            if phone.startswith("+346") or phone.startswith("+347"):
                info["type"] = "móvil"
            elif phone.startswith("+349"):
                info["type"] = "fijo"
        elif info["country_code"] == "US/CA":
            info["type"] = "móvil/fijo"  # US doesn't separate mobile prefixes
        
        return {
            "success": True,
            "phone_info": info,
            "note": "Para rastreo de ubicación en tiempo real se requiere autorización judicial y cooperación del operador"
        }
    except Exception as e:
        logger.error(f"Phone lookup error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ===================== COMPARTIR UBICACIÓN VOLUNTARIA =====================

@api_router.post("/location/share/create")
async def create_share_link(request: ShareLocationRequest):
    """Create a location sharing request link"""
    from datetime import timedelta
    share_id = str(uuid.uuid4())[:8]
    
    share_data = {
        "id": share_id,
        "target_phone": request.target_phone,
        "requester_name": request.requester_name,
        "message": request.message or f"{request.requester_name} solicita que compartas tu ubicación",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        "status": "pending",
        "location": None
    }
    
    await db.location_shares.insert_one(share_data)
    
    # Generate shareable link
    base_url = os.environ.get("REACT_APP_BACKEND_URL", "https://5d859b9f-9bda-4ec3-ae57-f0bf5ee53237.preview.emergentagent.com")
    share_link = f"{base_url}/share/{share_id}"
    
    return {
        "success": True,
        "share_id": share_id,
        "share_link": share_link,
        "message": f"Envía este enlace a {request.target_phone}. Cuando la persona lo abra y acepte, podrás ver su ubicación.",
        "sms_template": f"{request.requester_name} te solicita compartir tu ubicación: {share_link}"
    }


@api_router.get("/location/share/{share_id}")
async def get_share_status(share_id: str):
    """Get the status of a location share request"""
    share = await db.location_shares.find_one({"id": share_id}, {"_id": 0})
    if not share:
        raise HTTPException(status_code=404, detail="Share request not found")
    return share


@api_router.post("/location/share/{share_id}/accept")
async def accept_share_location(share_id: str, lat: float, lng: float):
    """Accept a location share request and provide location"""
    share = await db.location_shares.find_one({"id": share_id})
    if not share:
        raise HTTPException(status_code=404, detail="Share request not found")
    
    # Reverse geocode the location
    location_name = "Ubicación compartida"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://maps.googleapis.com/maps/api/geocode/json",
                params={"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY}
            )
            data = response.json()
            if data.get("results"):
                location_name = data["results"][0].get("formatted_address", location_name)
    except:
        pass
    
    await db.location_shares.update_one(
        {"id": share_id},
        {"$set": {
            "status": "accepted",
            "location": {
                "coordinates": {"lat": lat, "lng": lng},
                "address": location_name,
                "shared_at": datetime.now(timezone.utc).isoformat()
            }
        }}
    )
    
    return {"success": True, "message": "Ubicación compartida exitosamente"}


@api_router.get("/location/shares")
async def get_all_shares():
    """Get all location share requests"""
    shares = await db.location_shares.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return shares


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
