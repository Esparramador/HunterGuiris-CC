#!/usr/bin/env python3

import requests
import sys
import json
import base64
from datetime import datetime
from io import BytesIO
from PIL import Image
import time

class GeoHunterAPITester:
    def __init__(self, base_url="https://visual-geo-mapper.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            
        result = {
            "test": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {name}")
        if details:
            print(f"   Details: {details}")

    def create_test_image(self):
        """Create a simple test image with visual features as base64"""
        try:
            # Create a test image with features (not blank)
            img = Image.new('RGB', (300, 200), color=(70, 130, 180))  # Steel blue background
            
            # Add some visual features to avoid blank image
            from PIL import ImageDraw, ImageFont
            draw = ImageDraw.Draw(img)
            
            # Draw some geometric shapes to create visual features
            draw.rectangle([50, 50, 150, 100], fill=(255, 255, 0), outline=(255, 0, 0), width=3)
            draw.ellipse([170, 60, 250, 120], fill=(0, 255, 0), outline=(0, 0, 255), width=2)
            draw.line([(20, 20), (280, 180)], fill=(255, 0, 255), width=3)
            
            # Add text
            try:
                draw.text((60, 140), "TEST IMAGE", fill=(255, 255, 255))
            except:
                pass  # If font loading fails, continue without text
            
            # Convert to base64
            buffered = BytesIO()
            img.save(buffered, format="JPEG", quality=85)
            img_data = base64.b64encode(buffered.getvalue()).decode()
            
            return img_data
        except Exception as e:
            print(f"Warning: Could not create test image: {e}")
            # Fallback: create minimal test data
            return base64.b64encode(b"fake_image_data").decode()

    def test_root_endpoint(self):
        """Test root API endpoint"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            if success:
                data = response.json()
                details = f"Status: {response.status_code}, Message: {data.get('message', 'No message')}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text[:100]}"
            
            self.log_test("Root Endpoint", success, details)
            return success
        except Exception as e:
            self.log_test("Root Endpoint", False, str(e))
            return False

    def test_status_endpoint(self):
        """Test status endpoints"""
        try:
            # Test POST status
            status_data = {"client_name": "test_client"}
            response = requests.post(f"{self.api_url}/status", json=status_data, timeout=10)
            post_success = response.status_code == 200
            
            if post_success:
                # Test GET status
                get_response = requests.get(f"{self.api_url}/status", timeout=10)
                get_success = get_response.status_code == 200
                success = post_success and get_success
                details = f"POST: {response.status_code}, GET: {get_response.status_code}"
            else:
                success = False
                details = f"POST failed: {response.status_code} - {response.text[:100]}"
                
            self.log_test("Status Endpoints", success, details)
            return success
        except Exception as e:
            self.log_test("Status Endpoints", False, str(e))
            return False

    def test_maps_key_endpoint(self):
        """Test maps key endpoint"""
        try:
            response = requests.get(f"{self.api_url}/maps-key", timeout=10)
            success = response.status_code == 200
            if success:
                data = response.json()
                has_key = "key" in data and data["key"]
                success = has_key
                details = f"Status: {response.status_code}, Has key: {has_key}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text[:100]}"
                
            self.log_test("Maps Key Endpoint", success, details)
            return success
        except Exception as e:
            self.log_test("Maps Key Endpoint", False, str(e))
            return False

    def test_geocode_endpoint(self):
        """Test geocoding endpoint"""
        try:
            geocode_data = {"location": "Paris, France"}
            response = requests.post(f"{self.api_url}/geocode", json=geocode_data, timeout=15)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                has_coords = "lat" in data and "lng" in data
                success = has_coords
                details = f"Status: {response.status_code}, Has coordinates: {has_coords}"
                if has_coords:
                    details += f", Lat: {data['lat']}, Lng: {data['lng']}"
            else:
                details = f"Status: {response.status_code}, Error: {response.text[:100]}"
                
            self.log_test("Geocode Endpoint", success, details)
            return success
        except Exception as e:
            self.log_test("Geocode Endpoint", False, str(e))
            return False

    def test_analyze_endpoint(self):
        """Test main image analysis endpoint with GPT + Gemini"""
        print("\n🧠 Testing AI Analysis (GPT-5.2 + Gemini) - This may take 30-60 seconds...")
        try:
            # Create test image
            image_base64 = self.create_test_image()
            
            analyze_data = {
                "image_base64": image_base64,
                "search_zone": "Europe"
            }
            
            # This endpoint takes time due to AI processing
            response = requests.post(f"{self.api_url}/analyze", json=analyze_data, timeout=90)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                has_gpt = "gpt_analysis" in data and data["gpt_analysis"] is not None
                has_gemini = "gemini_analysis" in data and data["gemini_analysis"] is not None
                has_consensus = "consensus_location" in data and data["consensus_location"] is not None
                
                analysis_success = has_gpt and has_gemini and has_consensus
                
                details = f"Status: {response.status_code}"
                details += f", GPT Analysis: {has_gpt}"
                details += f", Gemini Analysis: {has_gemini}" 
                details += f", Consensus: {has_consensus}"
                
                if analysis_success:
                    gpt_conf = data["gpt_analysis"].get("confidence", 0) if has_gpt else 0
                    gemini_conf = data["gemini_analysis"].get("confidence", 0) if has_gemini else 0
                    consensus_conf = data.get("consensus_confidence", 0)
                    details += f", GPT Confidence: {gpt_conf}%, Gemini Confidence: {gemini_conf}%, Consensus: {consensus_conf}%"
                    details += f", Location: {data.get('consensus_location', 'Unknown')}"
                
                success = analysis_success
            else:
                details = f"Status: {response.status_code}, Error: {response.text[:200]}"
                
            self.log_test("Image Analysis (AI Mega Brain)", success, details)
            return success, data if success else None
            
        except Exception as e:
            self.log_test("Image Analysis (AI Mega Brain)", False, str(e))
            return False, None

    def test_analyze_multi_endpoint(self):
        """Test multi-image analysis endpoint (NEW FEATURE)"""
        print("\n🔥 Testing Multi-Image Analysis - This may take 60-90 seconds...")
        try:
            # Create multiple test images
            image1 = self.create_test_image()
            image2 = self.create_test_image()
            image3 = self.create_test_image()
            
            analyze_data = {
                "images": [image1, image2, image3],
                "search_zone": "Europe"
            }
            
            response = requests.post(f"{self.api_url}/analyze-multi", json=analyze_data, timeout=120)
            success = response.status_code == 200
            
            if success:
                data = response.json()
                has_consensus = "consensus_location" in data
                has_image_count = "image_count" in data and data["image_count"] >= 3
                has_analysis_count = "analysis_count" in data and data["analysis_count"] >= 6  # 3 images * 2 AIs
                has_gpt_results = "gpt_results" in data and len(data["gpt_results"]) > 0
                has_gemini_results = "gemini_results" in data and len(data["gemini_results"]) > 0
                
                multi_success = has_consensus and has_image_count and has_analysis_count
                
                details = f"Status: {response.status_code}"
                details += f", Images: {data.get('image_count', 0)}"
                details += f", Analyses: {data.get('analysis_count', 0)}"
                details += f", Consensus: {data.get('consensus_location', 'None')[:50]}"
                details += f", Confidence: {data.get('consensus_confidence', 0)}%"
                
                success = multi_success
            else:
                details = f"Status: {response.status_code}, Error: {response.text[:200]}"
                
            self.log_test("Multi-Image Analysis", success, details)
            return success, data if success else None
            
        except Exception as e:
            self.log_test("Multi-Image Analysis", False, str(e))
            return False, None

    def test_analyze_video_endpoint(self):
        """Test video analysis endpoint (NEW FEATURE)"""
        print("\n🎬 Testing Video Analysis - This may take 60-90 seconds...")
        try:
            # Create a fake video base64 (minimal test)
            fake_video_data = b"fake_video_binary_data" * 100  # Simulate video data
            video_base64 = base64.b64encode(fake_video_data).decode()
            
            # Use form data as expected by the endpoint
            form_data = {
                "video_base64": video_base64,
                "search_zone": "Europe"
            }
            
            response = requests.post(f"{self.api_url}/analyze-video", data=form_data, timeout=120)
            
            # Since we're using fake video data, we expect it might fail
            # But let's check if the endpoint exists and responds properly
            if response.status_code == 400:
                # Expected failure due to fake video data
                success = "Could not extract frames" in response.text
                details = f"Status: {response.status_code}, Expected error for fake video: {success}"
            elif response.status_code == 200:
                # Unexpected success - check if it has video analysis structure
                data = response.json()
                has_frames = "frames_extracted" in data
                has_source = "source" in data and data["source"] == "video"
                success = has_frames and has_source
                details = f"Status: {response.status_code}, Frames: {data.get('frames_extracted', 0)}, Source: {data.get('source')}"
            else:
                success = False
                details = f"Status: {response.status_code}, Error: {response.text[:200]}"
                
            self.log_test("Video Analysis Endpoint", success, details)
            return success
            
        except Exception as e:
            self.log_test("Video Analysis Endpoint", False, str(e))
            return False

    def test_history_endpoints(self, analysis_id=None):
        """Test history management endpoints"""
        try:
            # Test GET history
            response = requests.get(f"{self.api_url}/history", timeout=15)
            get_success = response.status_code == 200
            
            if get_success:
                data = response.json()
                is_list = isinstance(data, list)
                details = f"GET Status: {response.status_code}, Is list: {is_list}, Count: {len(data) if is_list else 0}"
                
                # Test DELETE if we have an analysis ID
                delete_success = True
                if analysis_id and is_list and len(data) > 0:
                    try:
                        delete_response = requests.delete(f"{self.api_url}/history/{analysis_id}", timeout=10)
                        delete_success = delete_response.status_code == 200
                        details += f", DELETE Status: {delete_response.status_code}"
                    except Exception as e:
                        delete_success = False
                        details += f", DELETE Error: {str(e)}"
                
                success = get_success and delete_success
            else:
                success = False
                details = f"GET failed: {response.status_code} - {response.text[:100]}"
                
            self.log_test("History Endpoints", success, details)
            return success
            
        except Exception as e:
            self.log_test("History Endpoints", False, str(e))
            return False

    def run_all_tests(self):
        """Run comprehensive API test suite"""
        print("🚀 Starting GeoHunter API Test Suite")
        print(f"📍 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Basic connectivity tests
        print("\n📡 Testing Basic Connectivity...")
        self.test_root_endpoint()
        self.test_status_endpoint()
        self.test_maps_key_endpoint()
        
        # Geocoding test
        print("\n🌍 Testing Geocoding...")
        self.test_geocode_endpoint()
        
        # AI Analysis test (most important)
        print("\n🤖 Testing AI Analysis Integration...")
        analysis_success, analysis_data = self.test_analyze_endpoint()
        
        # NEW FEATURES - Multi-image and Video Analysis  
        print("\n🔥 Testing NEW Multi-Image Features...")
        multi_success, multi_data = self.test_analyze_multi_endpoint()
        
        print("\n🎬 Testing NEW Video Analysis Features...")
        video_success = self.test_analyze_video_endpoint()
        
        # History management
        print("\n📚 Testing History Management...")
        analysis_id = analysis_data.get("id") if analysis_data else None
        self.test_history_endpoints(analysis_id)
        
        # Results summary
        print("\n" + "=" * 60)
        print(f"📊 TEST RESULTS SUMMARY")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        # Critical failures
        critical_failures = []
        for result in self.test_results:
            if not result["success"]:
                if "Analysis" in result["test"] or "Root" in result["test"]:
                    critical_failures.append(result["test"])
        
        if critical_failures:
            print(f"\n⚠️  CRITICAL FAILURES: {', '.join(critical_failures)}")
        
        return self.tests_passed == self.tests_run, self.test_results

def main():
    """Main test execution"""
    print("🎯 GeoHunter Backend API Testing")
    print("Testing AI-powered geolocation with GPT-5.2 + Gemini")
    
    tester = GeoHunterAPITester()
    success, results = tester.run_all_tests()
    
    # Save detailed results
    try:
        with open("/app/backend_test_results.json", "w") as f:
            json.dump({
                "summary": {
                    "total_tests": tester.tests_run,
                    "passed_tests": tester.tests_passed,
                    "success_rate": (tester.tests_passed/tester.tests_run)*100 if tester.tests_run > 0 else 0,
                    "timestamp": datetime.now().isoformat()
                },
                "detailed_results": results
            }, f, indent=2)
        print(f"\n📄 Detailed results saved to /app/backend_test_results.json")
    except Exception as e:
        print(f"Warning: Could not save detailed results: {e}")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())