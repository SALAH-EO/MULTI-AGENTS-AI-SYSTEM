import requests
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, status
from fastapi.middleware.cors import CORSMiddleware
import os
from pydantic import BaseModel, EmailStr
from typing import List, Dict, Any, Optional
import redis.asyncio as redis
import json
import asyncio
import logging
import uuid # Added for generating UUIDs
from collections import defaultdict
from pymongo import MongoClient
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from cryptography.fernet import Fernet
import base64
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv, find_dotenv
import re
from bson import ObjectId

# --- Email Sending Imports ---
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
# --- End Email Sending Imports ---

# Configure logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s [%(process)d] %(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# Log the current working directory for debugging
current_working_directory = os.getcwd()
logger.info(f"Current working directory: {current_working_directory}")

# Load environment variables from .env file
dotenv_path = find_dotenv()
if not dotenv_path:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    potential_dotenv_path = os.path.join(script_dir, '.env')
    if os.path.exists(potential_dotenv_path):
        dotenv_path = potential_dotenv_path
        logger.info(f"Using fallback: Found .env in script directory: {dotenv_path}")
    else:
        logger.warning(f"No .env file found by find_dotenv() or in script directory: {script_dir}")

if dotenv_path:
    load_dotenv(dotenv_path)
    logger.info(f"Loaded .env file from: {dotenv_path}")
else:
    logger.warning("No .env file found. Ensure it exists in the backend directory or a parent directory.")

app = FastAPI()

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "http://127.0.0.1:3002", "http://0.0.0.0:3002", "http://localhost:5678", "http://127.0.0.1:5678", "http://0.0.0.0:5678", "http://n8n:5678", "http://app:3000"], # Ensure n8n and app service names are allowed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
N8N_BASE_URL = os.getenv("N8N_BASE_URL", "http://n8n:5678/api/v1")
N8N_API_KEY = os.getenv("N8N_API_KEY")

logger.info(f"N8N_BASE_URL from env: {N8N_BASE_URL}")
logger.info(f"N8N_API_KEY from env: {'<SET>' if N8N_API_KEY else '<NOT SET>'}")

if not N8N_API_KEY:
    logger.error("N8N_API_KEY not found in environment variables. Please set it in your .env file.")
    N8N_API_KEY = "dummy_n8n_api_key_if_not_set"

headers = {
    "Authorization": f"Bearer {N8N_API_KEY}",
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
}

# Redis connection for webhook publishing
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
redis_client = None # Initialize as None, will be set in startup event

# MongoDB Connection
MONGO_CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING", "mongodb://mongodb:27017/")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "n8n-data")
MONGO_WORKFLOWS_COLLECTION = os.getenv("MONGO_WORKFLOWS_COLLECTION", "workflows")
MONGO_USERS_COLLECTION = os.getenv("MONGO_USERS_COLLECTION", "users")

logger.info(f"MONGO_CONNECTION_STRING from env: {MONGO_CONNECTION_STRING}")

try:
    mongo_client = MongoClient(MONGO_CONNECTION_STRING)
    db = mongo_client[MONGO_DB_NAME]
    workflows_collection = db[MONGO_WORKFLOWS_COLLECTION]
    users_collection = db[MONGO_USERS_COLLECTION]
    logger.info(f"Successfully connected to MongoDB: {MONGO_DB_NAME}. Collections: {MONGO_WORKFLOWS_COLLECTION}, {MONGO_USERS_COLLECTION}")
except Exception as e:
    logger.error(f"Failed to connect to MongoDB: {e}")
    exit(1)

# Password Hashing (Bcrypt)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
logger.info(f"JWT_SECRET_KEY from env: {'<SET>' if SECRET_KEY else '<NOT SET>'}")

if not SECRET_KEY:
    logger.error("JWT_SECRET_KEY not found in environment variables. Please set it in your .env file.")
    SECRET_KEY = "super-secret-jwt-key-fallback"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 # This is for the regular access token

# --- NEW: One-time login token expiration ---
ONE_TIME_LOGIN_TOKEN_EXPIRE_MINUTES = 1440 # 24 hours * 60 minutes/hour
# --- End NEW ---

# AES-256 Encryption Key (for encrypting secret key in JWT payload)
AES_KEY = os.getenv("AES_ENCRYPTION_KEY")
logger.info(f"AES_ENCRYPTION_KEY from env: {'<SET>' if AES_KEY else '<NOT SET>'}")

if not AES_KEY:
    logger.error("AES_ENCRYPTION_KEY not found in environment variables. Please set it in your .env file.")
    try:
        AES_KEY = Fernet.generate_key().decode()
        logger.warning(f"Generated a new AES_ENCRYPTION_KEY. Please add it to your .env file: {AES_KEY}")
    except Exception as e:
        logger.critical(f"Failed to generate Fernet key: {e}. Exiting.")
        exit(1)

try:
    cipher_suite = Fernet(AES_KEY.encode())
    logger.info("Fernet cipher suite initialized successfully.")
except Exception as e:
    logger.critical(f"Failed to initialize Fernet cipher with provided AES_KEY: {e}. Ensure the key is valid and base64url-encoded. Exiting.")
    exit(1)

# OAuth2PasswordBearer for token extraction from Authorization header
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/login")

# Helper functions for security
def hash_password(password: str) -> str:
    """Hashes a plain-text password using bcrypt."""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain-text password against a hashed password."""
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Creates a JWT access token.
    The 'secret_key_payload' is encrypted before being added to the JWT.
    """
    to_encode = data.copy()
    
    if "secret_key_payload" in to_encode:
        try:
            encrypted_secret = cipher_suite.encrypt(to_encode["secret_key_payload"].encode()).decode()
            to_encode["secret_key_payload"] = encrypted_secret
        except Exception as e:
            logger.error(f"Error encrypting secret_key_payload: {e}")
            raise HTTPException(status_code=500, detail="Internal server error during token creation.")

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    """
    Decodes a JWT access token.
    Decrypts the 'secret_key_payload' if it exists.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        if "secret_key_payload" in payload:
            try:
                decrypted_secret = cipher_suite.decrypt(payload["secret_key_payload"].encode()).decode()
                payload["secret_key_payload"] = decrypted_secret
            except Exception as e:
                logger.error(f"Error decrypting secret_key_payload: {e}")
                return None
            
        return payload
    except JWTError as e:
        logger.error(f"JWT decoding error: {e}")
        return None

# --- Email Sending Configuration and Function ---
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "salaheddine.ouirra-etu@etu.univh2c.ma")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD") # IMPORTANT: Set this in your .env file!
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com") # Example for Gmail
SMTP_PORT = int(os.getenv("SMTP_PORT", 587)) # Example for TLS

async def send_welcome_email(recipient_email: str, one_time_login_link: str):
    """Sends a welcome email to a new user with a one-time login link."""
    if not SENDER_PASSWORD:
        logger.error("SENDER_PASSWORD is not set. Cannot send welcome email.")
        return

    msg = MIMEMultipart()
    msg['From'] = SENDER_EMAIL
    msg['To'] = recipient_email
    msg['Subject'] = "Welcome to OFFZONE AI SYSTEM - Your Account Access"

    body = f"""
    Welcome to OFFZONE AI SYSTEM!

    An account has been created for you by the admin. To set up your password and log in for the first time, please use the following one-time link:

    {one_time_login_link}

    This link is valid for {ONE_TIME_LOGIN_TOKEN_EXPIRE_MINUTES // 60} hours. 

    Best regards.
    """
    msg.attach(MIMEText(body, 'plain'))

    try:
        # Run SMTP operations in a separate thread to avoid blocking the event loop
        await asyncio.to_thread(
            lambda: _send_email_sync(msg, SENDER_EMAIL, recipient_email, SENDER_PASSWORD, SMTP_SERVER, SMTP_PORT)
        )
        logger.info(f"Welcome email with one-time login link sent successfully to {recipient_email}")
    except Exception as e:
        logger.error(f"Failed to send welcome email to {recipient_email}: {e}")

def _send_email_sync(msg, sender, recipient, password, smtp_server, smtp_port):
    """Synchronous helper for email sending, to be run in a thread."""
    server = smtplib.SMTP(smtp_server, smtp_port)
    server.starttls()  # Secure the connection
    server.login(sender, password)
    server.sendmail(sender, recipient, msg.as_string())
    server.quit()

# --- End Email Sending Configuration and Function ---

# Pydantic models for request bodies
class UserCreate(BaseModel):
    username: EmailStr # Ensure username is an email
    password: str # Admin still provides an initial password (will be hashed and stored, but not emailed)
    role: Optional[str] = "user" # Allow setting role during creation
    workflow_ids: Optional[List[str]] = [] # Allow setting initial workflow access

# Pydantic model for user data returned from API
class UserInDB(BaseModel):
    username: EmailStr
    role: str = "user" # Default role
    workflow_access: List[str] = [] # List of workflow IDs
    # New fields for one-time login token
    one_time_login_token: Optional[str] = None
    one_time_login_token_expires_at: Optional[datetime] = None
    
    class Config:
        json_encoders = {
            ObjectId: str # Convert ObjectId to string for JSON serialization
        }

class UserLogin(BaseModel):
    username: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    username: EmailStr # Added username to response
    role: str
    workflow_access: List[str]

# New model for one-time token validation response
class OneTimeTokenValidationResponse(BaseModel):
    username: EmailStr
    role: str

# New model for setting password with token request
class SetPasswordWithTokenRequest(BaseModel):
    token: str
    new_password: str

class Node(BaseModel):
    id: str
    name: str
    type: str
    typeVersion: int
    position: List[int]
    parameters: Optional[Dict[str, Any]] = {}
    credentials: Optional[Dict[str, Any]] = {}
    disabled: Optional[bool] = False
    webhookId: Optional[str] = None

class WorkflowUpdate(BaseModel):
    name: str
    nodes: List[Node]
    connections: Dict[str, Any]
    settings: Dict[str, Any]

class N8nExecutionData(BaseModel):
    auditId: str
    workflowId: str
    nodeName: str
    executionId: str
    timestamp: str
    input: Any
    output: Any
    status: str
    finished: bool

class WorkflowAccessUpdate(BaseModel):
    workflow_ids: List[str]

# Dependency to get the current authenticated user
async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    user = await asyncio.to_thread(users_collection.find_one, {"username": username})
    if user is None:
        raise credentials_exception
    
    # Add user's role and workflow_access to the returned user object
    user_obj = UserInDB(
        username=user["username"],
        role=user.get("role", "user"),
        workflow_access=user.get("workflow_access", []),
        one_time_login_token=user.get("one_time_login_token"),
        one_time_login_token_expires_at=user.get("one_time_login_token_expires_at")
    )
    return user_obj

# Dependency to get the current authenticated ADMIN user
async def get_current_admin_user(current_user: UserInDB = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation forbidden: Not an admin user"
        )
    return current_user

# Track active WebSocket clients (useful for server-side diagnostics/management)
active_websockets: Dict[str, List[WebSocket]] = defaultdict(list)

# Function to connect to Redis with retry logic
async def connect_to_redis():
    global redis_client
    retries = 10 # Increased retries
    delay = 1 # Start with a shorter delay
    for i in range(retries):
        try:
            logger.info(f"Attempting to connect to Redis at {REDIS_URL} (attempt {i+1}/{retries})...")
            # Create a new client instance
            temp_redis_client = redis.from_url(REDIS_URL, decode_responses=True)
            # Use a short timeout for ping to avoid hanging indefinitely if Redis is truly unresponsive
            await asyncio.wait_for(temp_redis_client.ping(), timeout=2) # Increased ping timeout
            redis_client = temp_redis_client # Assign to global only if successful
            logger.info("Successfully connected to global Redis client!")
            return True
        except (redis.exceptions.ConnectionError, asyncio.TimeoutError) as e:
            logger.warning(f"Redis global client connection failed: {e}. Retrying in {delay} seconds...")
            if 'temp_redis_client' in locals() and temp_redis_client:
                await temp_redis_client.close() # Ensure temporary client is closed
            await asyncio.sleep(delay)
            delay *= 2 # Exponential backoff
        except Exception as e:
            logger.error(f"An unexpected error occurred during global Redis connection: {e}")
            if 'temp_redis_client' in locals() and temp_redis_client:
                await temp_redis_client.close()
            break # Break on unexpected errors
    logger.critical("Failed to connect to global Redis client after multiple retries. Redis-dependent features will not be active.")
    redis_client = None # Explicitly set to None if all retries fail
    return False

# Periodic cleanup task for stale Redis channels (not related to client disconnections)
async def cleanup_stale_subscriptions():
    global redis_client
    while True:
        try:
            if redis_client is None:
                logger.warning("Redis client is None in cleanup_stale_subscriptions. Attempting to reconnect...")
                if not await connect_to_redis():
                    logger.error("Failed to reconnect to Redis in cleanup_stale_subscriptions. Skipping cleanup cycle.")
                    await asyncio.sleep(5)
                    continue

            # Ensure the client is actually connected before proceeding
            try:
                await redis_client.ping()
            except redis.exceptions.ConnectionError:
                logger.warning("Redis client disconnected during cleanup_stale_subscriptions. Attempting reconnection.")
                if not await connect_to_redis():
                    logger.error("Failed to re-establish Redis connection for cleanup. Skipping cleanup cycle.")
                    await asyncio.sleep(5)
                    continue

            channels = await redis_client.pubsub_channels("workflow_updates:*")
            active_workflows = set()
            
            # Fetch active workflows from n8n
            try:
                response = requests.get(f"{N8N_BASE_URL}/workflows", headers=headers)
                response.raise_for_status()
                workflows = response.json().get("data", [])
                active_workflows = {f"workflow_updates:{wf['id']}" for wf in workflows if wf.get("active", False)}
            except requests.exceptions.RequestException as e:
                logger.error(f"Error fetching active workflows from n8n for cleanup: {e}")
                # Continue with cleanup based on current channels if n8n is unreachable

            # Create a *new* pubsub for cleanup to avoid interfering with active WebSocket pubsubs
            cleanup_pubsub = redis_client.pubsub() 
            for channel in channels:
                if channel not in active_workflows:
                    logger.info(f"Cleaning up stale channel (from n8n perspective): {channel}")
                    await cleanup_pubsub.unsubscribe(channel)
            await cleanup_pubsub.close() 
        except redis.exceptions.ConnectionError as e:
            logger.error(f"Redis connection error in cleanup_stale_subscriptions: {e}. Resetting client for reconnection.")
            redis_client = None # Force reconnection on next loop
            await asyncio.sleep(5)
        except Exception as e:
            logger.error(f"Error cleaning up stale subscriptions: {str(e)}")
        await asyncio.sleep(60)

@app.on_event("startup")
async def startup_event():
    # Connect to Redis at startup. If it fails, log and continue, but Redis-dependent features will be impacted.
    await connect_to_redis()
    asyncio.create_task(cleanup_stale_subscriptions())

    # --- Automatic Admin User Creation ---
    admin_username = 'admin@example.com'
    admin_password_hash = '$2b$12$WNLUEfcMa.gDjDxqSaQPWejBjTMvmXMKcD8MT18HL8kilb4j1GqVa' # Hashed password for 'password123'
    admin_secret_key = 'nnaxRwGXXfmdCW_C-w2caCCKy5H6H15u9C2K8FxmkWk='

    try:
        # Check if the admin user already exists
        existing_admin = await asyncio.to_thread(users_collection.find_one, {"username": admin_username})

        if not existing_admin:
            # If not, insert the admin user
            admin_user_doc = {
                "username": admin_username,
                "hashed_password": admin_password_hash,
                "secret_key": admin_secret_key,
                "role": "admin",
                "workflow_access": [] # Admin user initially has no specific workflow access, can manage all
            }
            # For automatic creation, it's generally better to let MongoDB generate the _id
            # If you *must* use the exact ObjectId, uncomment the line below and ensure ObjectId is imported from bson
            # admin_user_doc["_id"] = ObjectId('6883ee83e0218625c412405a') 
            
            await asyncio.to_thread(users_collection.insert_one, admin_user_doc)
            logger.info(f"Admin user '{admin_username}' created successfully during startup.")
        else:
            logger.info(f"Admin user '{admin_username}' already exists. Skipping creation.")
    except Exception as e:
        logger.error(f"Error during automatic admin user creation: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("FastAPI application shutting down.")
    # Close the global Redis client gracefully
    if redis_client:
        try:
            await redis_client.close()
            logger.info("Global Redis client closed.")
        except Exception as e:
            logger.error(f"Error closing global Redis client: {e}")

    # Clean up active WebSocket connections
    for workflow_id in list(active_websockets.keys()):
        for ws in list(active_websockets[workflow_id]):
            try:
                await ws.close()
            except Exception as e:
                logger.error(f"Error closing websocket during shutdown for workflow {workflow_id}: {e}")
        active_websockets.pop(workflow_id, None) # Remove the workflow entry

    logger.info("Cleaned up active WebSocket connections.")


# Root route for health check
@app.get("/")
async def root():
    logger.info("Received request on root route '/'")
    return {"message": "API is running"}



@app.post("/api/login", response_model=LoginResponse)
async def login_for_access_token(user: UserLogin):
    logger.info(f"Login request for user: {user.username}")
    user_in_db = await asyncio.to_thread(users_collection.find_one, {"username": user.username})
    if not user_in_db or not verify_password(user.password, user_in_db["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_secret_key = user_in_db.get("secret_key")
    if not user_secret_key:
        logger.error(f"User {user.username} found without a secret_key.")
        user_secret_key = Fernet.generate_key().decode()
        await asyncio.to_thread(
            users_collection.update_one,
            {"username": user.username},
            {"$set": {"secret_key": user_secret_key}}
        )
        logger.info(f"New secret_key generated and saved for user: {user.username}")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "secret_key_payload": user_secret_key},
        expires_delta=access_token_expires
    )
    
    # Return LoginResponse with role and workflow_access
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": user_in_db["username"], # Include username in response
        "role": user_in_db.get("role", "user"), # Ensure role is returned
        "workflow_access": user_in_db.get("workflow_access", []) # Ensure workflow_access is returned
    }

# --- NEW: One-time token validation endpoint (does not log in or invalidate) ---
@app.get("/api/auth/validate-one-time-token", response_model=OneTimeTokenValidationResponse)
async def validate_one_time_token(token: str):
    """
    Validates a one-time login token and returns basic user info without logging in.
    """
    logger.info(f"Validate one-time token request received with token: {token[:8]}...")
    
    user_in_db = await asyncio.to_thread(
        users_collection.find_one,
        {"one_time_login_token": token}
    )

    if not user_in_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid one-time login link."
        )
    
    # Check token expiration
    expires_at = user_in_db.get("one_time_login_token_expires_at")
    if not expires_at or datetime.utcnow() > expires_at:
        # Invalidate token if expired
        await asyncio.to_thread(
            users_collection.update_one,
            {"_id": user_in_db["_id"]},
            {"$unset": {"one_time_login_token": "", "one_time_login_token_expires_at": ""}}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One-time login link has expired."
        )
    
    return OneTimeTokenValidationResponse(
        username=user_in_db["username"],
        role=user_in_db.get("role", "user")
    )

# --- NEW: Set password with one-time token endpoint ---
@app.post("/api/auth/set-password-with-token")
async def set_password_with_token(request: SetPasswordWithTokenRequest):
    """
    Allows a user to set their password using a valid one-time token.
    Invalidates the token after use.
    """
    logger.info(f"Set password with token request received for token: {request.token[:8]}...")

    user_in_db = await asyncio.to_thread(
        users_collection.find_one,
        {"one_time_login_token": request.token}
    )

    if not user_in_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already used one-time login link."
        )
    
    # Check token expiration
    expires_at = user_in_db.get("one_time_login_token_expires_at")
    if not expires_at or datetime.utcnow() > expires_at:
        # Invalidate token if expired
        await asyncio.to_thread(
            users_collection.update_one,
            {"_id": user_in_db["_id"]},
            {"$unset": {"one_time_login_token": "", "one_time_login_token_expires_at": ""}}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One-time login link has expired."
        )

    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long."
        )
    
    hashed_new_password = hash_password(request.new_password)

    # Update password and invalidate the one-time token
    await asyncio.to_thread(
        users_collection.update_one,
        {"_id": user_in_db["_id"]},
        {"$set": {"hashed_password": hashed_new_password},
         "$unset": {"one_time_login_token": "", "one_time_login_token_expires_at": ""}}
    )
    logger.info(f"Password updated and one-time token invalidated for user: {user_in_db['username']}")

    return {"message": "Password set successfully. You can now log in."}
# --- End NEW one-time login and password set endpoints ---


# --- Protected Endpoints (require authentication) ---
@app.get("/api/workflows")
async def get_workflows(current_user: UserInDB = Depends(get_current_user)):
    logger.info(f"Get workflows request for user: {current_user.username}")
    try:
        response = requests.get(f"{N8N_BASE_URL}/workflows", headers=headers)
        response.raise_for_status()
        all_workflows = response.json().get("data", [])
        
        if current_user.role == "admin":
            filtered_workflows = [
                {
                    "id": wf["id"],
                    "name": wf["name"],
                    "createdAt": wf["createdAt"],
                    "updatedAt": wf["updatedAt"],
                    "active": wf["active"],
                    "triggerCount": wf.get("triggerCount", 0),
                }
                for wf in all_workflows
                if not wf.get("isArchived", False)
            ]
        else:
            allowed_workflow_ids = set(current_user.workflow_access)
            filtered_workflows = [
                {
                    "id": wf["id"],
                    "name": wf["name"], # Use ID as name if name is missing
                    "createdAt": wf["createdAt"],
                    "updatedAt": wf["updatedAt"],
                    "active": wf["active"],
                    "triggerCount": wf.get("triggerCount", 0),
                }
                for wf in all_workflows
                if not wf.get("isArchived", False) and wf["id"] in allowed_workflow_ids
            ]
            
        return filtered_workflows
    except requests.RequestException as e:
        logger.error(f"Failed to get workflows: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch workflows from n8n: {e}")

@app.get("/api/all_workflows") # NEW: Endpoint to get all workflows (ID and name)
async def get_all_workflows(current_user: UserInDB = Depends(get_current_user)):
    logger.info(f"Get all workflows request for user: {current_user.username}")
    try:
        response = requests.get(f"{N8N_BASE_URL}/workflows", headers=headers)
        response.raise_for_status()
        all_n8n_workflows = response.json().get("data", [])
        
        workflows_list = [
            {"id": wf["id"], "name": wf.get("name", wf["id"])} # Use ID as name if name is missing
            for wf in all_n8n_workflows
            if not wf.get("isArchived", False)
        ]
        logger.info(f"Retrieved {len(workflows_list)} non-archived workflows from n8n.")
        return workflows_list
    except requests.RequestException as e:
        logger.error(f"Failed to fetch all workflows from n8n: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch all workflows from n8n: {e}")

@app.get("/api/workflows/{workflow_id}/executions")
async def get_workflow_executions(workflow_id: str, current_user: Any = Depends(get_current_user)):
    logger.info(f"Get executions request for workflow: {workflow_id}, user: {current_user.username}")
    try:
        response = requests.get(f"{N8N_BASE_URL}/executions?workflowId={workflow_id}", headers=headers)
        response.raise_for_status()
        data = response.json().get("data", [])
        
        executions = [
            {
                "id": ex["id"],
                "finished": ex["finished"],
                "mode": ex["mode"],
                "startedAt": ex["startedAt"],
                "stoppedAt": ex.get("stoppedAt"),
                "workflowId": ex["workflowId"],
                "status": ex.get("status", "unknown")
            }
            for ex in data
        ]
        logger.info(f"Retrieved {len(executions)} executions for workflow {workflow_id}")
        return executions
    except requests.RequestException as e:
        logger.error(f"Failed to fetch executions for workflow {workflow_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mongodb/workflows/{workflow_id}/data") # Updated to use 'data' in path
async def get_mongodb_workflow_data(workflow_id: str, current_user: Any = Depends(get_current_user)):
    logger.info(f"Get MongoDB data request for workflow: {workflow_id}, user: {current_user.username}")
    try:
        # Assuming you still want to fetch from the general workflows_collection for "data"
        cursor = await asyncio.to_thread(workflows_collection.find, {"workflowId": workflow_id})
        
        results = []
        for doc in await asyncio.to_thread(list, cursor):
            try:
                # Convert datetime objects back to ISO strings for frontend
                timestamp_obj = doc.get("Timestamp", datetime.min)
                timestamp_iso = timestamp_obj.isoformat() if isinstance(timestamp_obj, datetime) else str(timestamp_obj) # Handle potential non-datetime timestamps
                
                # Assuming 'Data' field contains a JSON string with execution details including 'executionId' and 'output'
                parsed_data = json.loads(doc.get("Data", "{}"))
                output_data = parsed_data.get("output")

                if output_data:
                    results.append({
                        "timestamp": timestamp_iso,
                        "executionId": parsed_data.get("executionId"),
                        "output": output_data
                    })
            except json.JSONDecodeError as e:
                logger.error(f"Error decoding JSON from MongoDB document for workflow {workflow_id}, doc_id {doc.get('_id')}: {e}")
            except Exception as e:
                logger.error(f"Error processing MongoDB document for workflow {workflow_id}, doc_id {doc.get('_id')}: {e}")
        
        results.sort(key=lambda x: x.get("timestamp", "")) # Sort by timestamp

        logger.info(f"Retrieved {len(results)} MongoDB data entries for workflow {workflow_id}")
        return results
    except Exception as e:
        logger.error(f"Failed to fetch MongoDB data for workflow {workflow_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch MongoDB data: {str(e)}")


@app.post("/api/workflows/{workflow_id}/activate")
async def activate_workflow(workflow_id: str, current_user: Any = Depends(get_current_user)):
    logger.info(f"Activate workflow request for: {workflow_id}, user: {current_user.username}")
    try:
        response = requests.post(
            f"{N8N_BASE_URL}/workflows/{workflow_id}/activate",
            headers=headers
        )
        
        if response.status_code == 400:
            error_data = response.json()
            error_msg = error_data.get("message", "").lower()

            if "trigger" in error_msg or "no trigger" in error_msg:
                raise HTTPException(
                    status_code=400,
                    detail="This agent cannot be activated because it has no trigger nodes."
                )

        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        if e.response is not None:
            try:
                error_detail = e.response.json().get("message", str(e))
            except Exception:
                error_detail = e.response.text
        else:
            error_detail = str(e)

        logger.error(f"Activation Error for workflow {workflow_id}: {error_detail}")
        raise HTTPException(
            status_code=e.response.status_code if e.response else 500,
            detail="Failed to activate workflow due to internal system error."
        )

@app.post("/api/workflows/{workflow_id}/deactivate")
async def deactivate_workflow(workflow_id: str, current_user: Any = Depends(get_current_user)):
    logger.info(f"Deactivate workflow request for: {workflow_id}, user: {current_user.username}")
    try:
        response = requests.post(f"{N8N_BASE_URL}/workflows/{workflow_id}/deactivate", headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Deactivation Error for workflow {workflow_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str, current_user: Any = Depends(get_current_user)):
    logger.info(f"Get workflow request for: {workflow_id}, user: {current_user.username}")
    try:
        response = requests.get(f"{N8N_BASE_URL}/workflows/{workflow_id}", headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to get workflow {workflow_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, workflow_update: WorkflowUpdate, current_user: Any = Depends(get_current_user)):
    logger.info(f"Update workflow request for: {workflow_id}, user: {current_user.username}")
    try:
        response = requests.get(f"{N8N_BASE_URL}/workflows/{workflow_id}", headers=headers)
        response.raise_for_status()
        current_workflow = response.json()

        settings = workflow_update.settings or current_workflow.get("settings", {})
        required_settings = {
            "saveExecutionProgress": False,
            "saveManualExecutions": True,
            "saveDataErrorExecution": "all",
            "saveDataSuccessExecution": "all",
            "executionTimeout": 3600,
            "timezone": settings.get("timezone", "UTC"),
            "executionOrder": settings.get("executionOrder", "v1")
        }
        settings = {**required_settings, **settings}

        nodes = [
            {**node.dict(exclude_unset=True), "typeVersion": int(node.typeVersion)}
            for node in workflow_update.nodes
        ]

        payload = {
            "name": workflow_update.name or current_workflow.get("name", "Workflow"),
            "nodes": nodes,
            "connections": workflow_update.connections or current_workflow.get("connections", {}),
            "settings": settings
        }
        logger.debug(f"PUT Payload for workflow {workflow_id}: {json.dumps(payload)}")

        response = requests.put(
            f"{N8N_BASE_URL}/workflows/{workflow_id}",
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        error_detail = e.response.json() if e.response else str(e)
        if isinstance(error_detail, dict):
            if "message" in error_detail:
                error_detail = error_detail["message"]
            elif "detail" in error_detail:
                if isinstance(error_detail["detail"], list):
                    error_detail = "; ".join(
                        f"{err['msg']} at {err['loc']}" for err in error_detail["detail"]
                    )
                else:
                    error_detail = error_detail["detail"]
        logger.error(f"Failed to update workflow {workflow_id}: {error_detail}")
        raise HTTPException(status_code=e.response.status_code if e.response else 500, detail=error_detail)
    except Exception as e:
        logger.error(f"General error updating workflow {workflow_id}: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    
@app.post("/api/audit")
async def generate_audit(current_user: Any = Depends(get_current_user)):
    try:
        response = requests.post(
            f"{N8N_BASE_URL}/audit",
            headers=headers,
            json={
                "additionalOptions": {
                    "daysAbandonedWorkflow": 30,
                    "categories": ["credentials", "database", "nodes", "filesystem", "instance"]
                }
            }
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to generate audit: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/webhook/n8n_execution_data")
async def n8n_execution_webhook(data: N8nExecutionData):
    logger.info(f"Received n8n execution webhook for workflow: {data.workflowId}")
    try:
        if not data.workflowId:
            logger.error("Received webhook data with missing workflowId")
            raise HTTPException(status_code=400, detail="Missing workflowId")

        data_dict = data.dict()

        try:
            timestamp = datetime.now()
            mongo_document = {
                "Timestamp": timestamp,
                "workflowId": data.workflowId,
                "Data": json.dumps(data_dict, default=str)
            }
            result = await asyncio.to_thread(workflows_collection.insert_one, mongo_document)
            logger.info(f"Data stored in MongoDB with _id: {result.inserted_id}")
        except Exception as e:
            logger.error(f"Error storing data in MongoDB: {str(e)}")

        execution_channel = f"execution_updates:{data.executionId}"
        workflow_channel = f"workflow_updates:{data.workflowId}"
        
        # Publish to Redis with robust error handling
        if redis_client:
            try:
                await redis_client.publish(execution_channel, data.json())
                logger.info(f"Published to execution channel: {execution_channel}")
            except redis.exceptions.ConnectionError as e:
                logger.error(f"Redis connection error publishing to {execution_channel}: {e}. Attempting to reconnect global client...")
                if await connect_to_redis(): # Attempt to reconnect global client
                    try: # Try publishing again after reconnection
                        await redis_client.publish(execution_channel, data.json())
                        logger.info(f"Published to execution channel after reconnection: {execution_channel}")
                    except Exception as re_e:
                        logger.error(f"Failed to publish to {execution_channel} even after reconnection: {re_e}")
                else:
                    logger.warning(f"Failed to reconnect global Redis client. Data not published to {execution_channel}.")
            except Exception as e:
                logger.error(f"Error publishing to {execution_channel}: {e}")
        else:
            logger.warning(f"Redis client not available. Data not published to {execution_channel}.")

        if redis_client:
            try:
                await redis_client.publish(workflow_channel, data.json())
                logger.info(f"Published to workflow channel: {workflow_channel}")
            except redis.exceptions.ConnectionError as e:
                logger.error(f"Redis connection error publishing to {workflow_channel}: {e}. Attempting to reconnect global client...")
                if await connect_to_redis(): # Attempt to reconnect global client
                    try: # Try publishing again after reconnection
                        await redis_client.publish(workflow_channel, data.json())
                        logger.info(f"Published to workflow channel after reconnection: {workflow_channel}")
                    except Exception as re_e:
                        logger.error(f"Failed to publish to {workflow_channel} even after reconnection: {re_e}")
                else:
                    logger.warning(f"Failed to reconnect global Redis client. Data not published to {workflow_channel}.")
            except Exception as e:
                logger.error(f"Error publishing to {workflow_channel}: {e}")
        else:
            logger.warning(f"Redis client not available. Data not published to {workflow_channel}.")

        return {"status": "success", "message": "Data received and published to Redis and stored in MongoDB"}
    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process webhook: {str(e)}")

@app.get("/api/diagnostics")
async def get_diagnostics(current_user: Any = Depends(get_current_user)):
    logger.info(f"Get diagnostics request for user: {current_user.username}")
    redis_status = "Disconnected (Global client is None)"
    channels = []
    num_subscribers = {}

    if redis_client:
        try:
            await redis_client.ping()
            redis_status = "Connected"
            channels = await redis_client.pubsub_channels("workflow_updates:*")
            for channel in channels:
                # pubsub_numsub takes a list of channels, returns a dict
                sub_info = await redis_client.pubsub_numsub(channel)
                # Redis returns a list of [channel_name, num_subscribers] for pubsub_numsub
                if isinstance(sub_info, list) and len(sub_info) > 0:
                    for ch, count in sub_info:
                        if ch == channel:
                            num_subscribers[channel] = count
                            break
                elif isinstance(sub_info, dict): # Older versions might return dict
                    num_subscribers[channel] = sub_info.get(channel, 0) # Get count for the specific channel
        except redis.exceptions.ConnectionError as e:
            redis_status = f"Disconnected: {e}"
            logger.error(f"Redis connection error during diagnostics: {e}")
        except Exception as e:
            redis_status = f"Error: {e}"
            logger.error(f"Unexpected error during Redis diagnostics: {e}")

    websocket_info = {
        workflow_id: len(clients)
        for workflow_id, clients in active_websockets.items()
    }

    mongo_status = "Connected"
    try:
        mongo_client.admin.command('ping')
    except Exception as e:
        mongo_status = f"Disconnected: {e}"

    return {
        "redis_status": redis_status,
        "redis_channels": channels,
        "redis_subscribers": num_subscribers,
        "active_websockets": websocket_info,
        "mongodb_status": mongo_status,
        "mongodb_database": MONGO_DB_NAME,
        "mongodb_collection_workflows": MONGO_WORKFLOWS_COLLECTION,
        "mongodb_collection_users": MONGO_USERS_COLLECTION
    }

# NEW: Simple test WebSocket endpoint
@app.websocket("/ws/test")
async def websocket_test(websocket: WebSocket):
    client_id = str(uuid.uuid4())
    logger.info(f"Attempting to accept WebSocket connection for /ws/test from client {client_id}")
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for /ws/test from client {client_id}")
    try:
        while True:
            data = await websocket.receive_text()
            logger.info(f"Received test message from client {client_id}: {data}")
            await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        logger.info(f"Test WebSocket client {client_id} disconnected.")
    except Exception as e:
        logger.error(f"Test WebSocket client {client_id} error: {e}")

@app.websocket("/ws/workflow_execution/{execution_id}")
async def websocket_workflow_execution(websocket: WebSocket, execution_id: str):
    client_id = str(uuid.uuid4())
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for execution {execution_id} from client {client_id}")

    # Create a new Redis client and pubsub instance for this specific WebSocket connection
    # This is crucial for Redis Pub/Sub to work correctly in a multi-client async environment
    redis_ws = None
    pubsub = None
    pubsub_task = None
    websocket_receive_task = None

    try:
        # Connect to Redis for this specific WebSocket
        connect_retries = 5
        for i in range(connect_retries):
            try:
                redis_ws = redis.from_url(REDIS_URL, decode_responses=True)
                await asyncio.wait_for(redis_ws.ping(), timeout=1)
                logger.info(f"WebSocket client {client_id} successfully connected its dedicated Redis client.")
                break
            except (redis.exceptions.ConnectionError, asyncio.TimeoutError) as e:
                logger.warning(f"WebSocket {client_id} failed to connect dedicated Redis client (attempt {i+1}/{connect_retries}): {e}. Retrying...")
                if redis_ws: await redis_ws.close()
                await asyncio.sleep(1)
        else:
            logger.error(f"WebSocket {client_id} failed to connect dedicated Redis client after {connect_retries} retries. Closing connection.")
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Failed to connect to Redis for pubsub")
            return

        pubsub = redis_ws.pubsub()
        channel_name = f"execution_updates:{execution_id}"
        await pubsub.subscribe(channel_name)
        logger.info(f"WebSocket client {client_id} subscribed to execution channel: {channel_name}")

        pubsub_task = asyncio.create_task(pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0))
        websocket_receive_task = asyncio.create_task(websocket.receive_text())

        while True:
            done, pending = await asyncio.wait(
                [pubsub_task, websocket_receive_task],
                return_when=asyncio.FIRST_COMPLETED
            )

            if websocket_receive_task in done:
                try:
                    message_from_client = websocket_receive_task.result()
                    logger.debug(f"Client {client_id} sent message: {message_from_client}")
                    # Re-create the task for the next iteration
                    websocket_receive_task = asyncio.create_task(websocket.receive_text())
                except WebSocketDisconnect:
                    logger.info(f"WebSocket client {client_id} disconnected from execution channel: {channel_name} (WebSocketDisconnect detected via receive_text)")
                    break
                except Exception as e:
                    logger.error(f"WebSocket client {client_id} error receiving from WebSocket: {str(e)}")
                    break

            if pubsub_task in done:
                message = pubsub_task.result()
                if message:
                    try:
                        data = json.loads(message['data'])
                        logger.debug(f"Client {client_id} sending data to execution WebSocket {channel_name}: {message['data']}")
                        await websocket.send_text(message['data'])
                    except json.JSONDecodeError:
                        logger.error(f"Client {client_id} invalid JSON in execution channel {channel_name}: {message['data']}")
                    except Exception as e:
                        logger.error(f"Error sending message to WebSocket for client {client_id}: {e}")
                # Re-create the task for the next iteration
                pubsub_task = asyncio.create_task(pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0))

            await asyncio.sleep(0.01) # Small sleep to prevent busy-waiting

    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected from execution channel: {channel_name} (WebSocketDisconnect - primary handler)")
    except Exception as e:
        logger.error(f"WebSocket client {client_id} error for execution channel {channel_name}: {str(e)}")
    finally:
        logger.info(f"STARTING FINALLY BLOCK for execution WebSocket client {client_id} for channel: {channel_name}")
        if pubsub_task and not pubsub_task.done():
            pubsub_task.cancel()
        if websocket_receive_task and not websocket_receive_task.done():
            websocket_receive_task.cancel()

        try:
            if pubsub:
                await pubsub.unsubscribe(channel_name)
                logger.info(f"Execution WebSocket client {client_id} unsubscribed from Redis channel: {channel_name}")
                await pubsub.close()
            if redis_ws:
                await redis_ws.close()
                logger.info(f"Execution WebSocket client {client_id} closed dedicated Redis client for channel: {channel_name}")
        except Exception as e:
            logger.error(f"Error during execution WebSocket cleanup for client {client_id} on channel {channel_name}: {str(e)}")

        logger.info(f"FINISHED FINALLY BLOCK for execution WebSocket client {client_id} for channel: {channel_name}")


@app.websocket("/ws/workflow_updates/{workflow_id}")
async def websocket_workflow_updates(websocket: WebSocket, workflow_id: str):
    client_id = str(uuid.uuid4())
    await websocket.accept()
    logger.info(f"WebSocket connection accepted for workflow {workflow_id} from client {client_id}")

    active_websockets[workflow_id].append(websocket)
    logger.info(f"WebSocket client {client_id} added to workflow {workflow_id}. Active clients: {len(active_websockets[workflow_id])}")

    # Create a new Redis client and pubsub instance for this specific WebSocket connection
    redis_ws = None
    pubsub = None
    pubsub_task = None
    websocket_receive_task = None

    try:
        # Connect to Redis for this specific WebSocket
        connect_retries = 5
        for i in range(connect_retries):
            try:
                redis_ws = redis.from_url(REDIS_URL, decode_responses=True)
                await asyncio.wait_for(redis_ws.ping(), timeout=1)
                logger.info(f"WebSocket client {client_id} successfully connected its dedicated Redis client.")
                break
            except (redis.exceptions.ConnectionError, asyncio.TimeoutError) as e:
                logger.warning(f"WebSocket {client_id} failed to connect dedicated Redis client (attempt {i+1}/{connect_retries}): {e}. Retrying...")
                if redis_ws: await redis_ws.close()
                await asyncio.sleep(1)
        else:
            logger.error(f"WebSocket {client_id} failed to connect dedicated Redis client after {connect_retries} retries. Closing connection.")
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Failed to connect to Redis for pubsub")
            return

        pubsub = redis_ws.pubsub()
        channel_name = f"workflow_updates:{workflow_id}"
        await pubsub.subscribe(channel_name)
        logger.info(f"WebSocket client {client_id} subscribed to workflow channel: {channel_name}")

        pubsub_task = asyncio.create_task(pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0))
        websocket_receive_task = asyncio.create_task(websocket.receive_text())

        while True:
            done, pending = await asyncio.wait(
                [pubsub_task, websocket_receive_task],
                return_when=asyncio.FIRST_COMPLETED
            )

            if websocket_receive_task in done:
                try:
                    message_from_client = websocket_receive_task.result()
                    logger.debug(f"Client {client_id} sent message: {message_from_client}")
                    # Re-create the task for the next iteration
                    websocket_receive_task = asyncio.create_task(websocket.receive_text())
                except WebSocketDisconnect:
                    logger.info(f"WebSocket client {client_id} disconnected from workflow channel: {channel_name} (WebSocketDisconnect detected via receive_text)")
                    break
                except Exception as e:
                    logger.error(f"WebSocket client {client_id} error receiving from WebSocket: {str(e)}")
                    break

            if pubsub_task in done:
                message = pubsub_task.result()
                if message:
                    try:
                        data = json.loads(message['data'])
                        if data.get('workflowId') == workflow_id:
                            logger.debug(f"Client {client_id} sending data to workflow WebSocket {channel_name}: {message['data']}")
                            await websocket.send_text(message['data'])
                        else:
                            logger.warning(f"Client {client_id} ignoring message for workflow {data.get('workflowId')} on channel {channel_name}; expected {workflow_id}")
                    except json.JSONDecodeError:
                        logger.error(f"Client {client_id} invalid JSON in workflow channel {channel_name}: {message['data']}")
                    except Exception as e:
                        logger.error(f"Error sending message to WebSocket for client {client_id}: {e}")
                # Re-create the task for the next iteration
                pubsub_task = asyncio.create_task(pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0))

            await asyncio.sleep(0.01) # Small sleep to prevent busy-waiting

    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected from workflow channel: {channel_name} (WebSocketDisconnect - primary handler)")
    except Exception as e:
        logger.error(f"WebSocket client {client_id} error for workflow channel {channel_name}: {str(e)}")
    finally:
        logger.info(f"STARTING FINALLY BLOCK for workflow WebSocket client {client_id} for channel: {channel_name}")
        if pubsub_task and not pubsub_task.done():
            pubsub_task.cancel()
        if websocket_receive_task and not websocket_receive_task.done():
            websocket_receive_task.cancel()

        try:
            if websocket in active_websockets[workflow_id]:
                active_websockets[workflow_id].remove(websocket)
                if not active_websockets[workflow_id]:
                    del active_websockets[workflow_id]
                logger.info(f"WebSocket client {client_id} removed from workflow {workflow_id}. Active clients: {len(active_websockets.get(workflow_id, []))}")
            else:
                logger.warning(f"WebSocket client {client_id} not found in active_websockets for workflow {workflow_id} during cleanup. (Already removed?)")
        except KeyError:
            logger.warning(f"WebSocket client {client_id} workflow {workflow_id} not in active_websockets during cleanup (KeyError).")

        try:
            if pubsub:
                await pubsub.unsubscribe(channel_name)
                logger.info(f"Workflow WebSocket client {client_id} unsubscribed from Redis channel: {channel_name}")
                await pubsub.close()
            if redis_ws:
                await redis_ws.close()
                logger.info(f"Workflow WebSocket client {client_id} closed dedicated Redis client for channel: {channel_name}")
        except Exception as e:
            logger.error(f"Error during workflow WebSocket cleanup for client {client_id} on channel {channel_name}: {str(e)}")

        logger.info(f"FINISHED FINALLY BLOCK for workflow WebSocket client {client_id} for channel: {channel_name}")


# --- Admin Endpoints ---
@app.post("/api/admin/users", response_model=LoginResponse)
async def create_user_by_admin(user_create: UserCreate, current_user: UserInDB = Depends(get_current_admin_user)):
    """
    Allows an admin to create a new user with a specified username, password, role,
    and optional initial workflow access. Sends a one-time login link to the new user.
    """
    logger.info(f"Create user request by admin {current_user.username} for: {user_create.username}")
    if len(user_create.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )

    existing_user = await asyncio.to_thread(users_collection.find_one, {"username": user_create.username})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists."
        )
    
    hashed_password = hash_password(user_create.password)
    user_secret_key = Fernet.generate_key().decode() 

    # Validate role
    if user_create.role not in ["admin", "user"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role. Must be 'admin' or 'user'.")

    # Generate one-time login token
    one_time_token = str(uuid.uuid4())
    one_time_token_expires_at = datetime.utcnow() + timedelta(minutes=ONE_TIME_LOGIN_TOKEN_EXPIRE_MINUTES)

    user_data = {
        "username": user_create.username,
        "hashed_password": hashed_password, # Store the initial password (hashed)
        "secret_key": user_secret_key,
        "role": user_create.role,
        "workflow_access": user_create.workflow_ids, # Use provided workflow_ids
        "one_time_login_token": one_time_token,
        "one_time_login_token_expires_at": one_time_token_expires_at
    }
    await asyncio.to_thread(users_collection.insert_one, user_data)

    # --- Send Welcome Email with One-Time Login Link ---
    # IMPORTANT: Replace "http://localhost:3002" with your actual frontend URL
    one_time_login_link = f"http://localhost:3002/initial-password?token={one_time_token}"
    try:
        await send_welcome_email(user_create.username, one_time_login_link)
    except Exception as e:
        logger.error(f"Failed to send welcome email for new user {user_create.username}: {e}")
        # User is still created, but email failed. You might want to notify admin.
    # --- End Send Welcome Email ---

    # For admin's immediate feedback, return a login response (though user will use link)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_create.username, "secret_key_payload": user_secret_key},
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": user_data["username"],
        "role": user_data["role"],
        "workflow_access": user_data["workflow_access"]
    }

@app.get("/api/admin/users", response_model=List[UserInDB])
async def get_all_users(current_user: UserInDB = Depends(get_current_admin_user)):
    """
    Retrieves all users from the database. Admin only.
    """
    logger.info(f"Get all users request by admin: {current_user.username}")
    users_cursor = await asyncio.to_thread(users_collection.find)
    users_list = []
    for user_doc in await asyncio.to_thread(list, users_cursor):
        # Ensure ObjectId is converted to string for JSON serialization
        user_doc["_id"] = str(user_doc["_id"])
        # Exclude one_time_login_token and its expiration from admin view for security
        user_doc.pop("one_time_login_token", None)
        user_doc.pop("one_time_login_token_expires_at", None)
        users_list.append(UserInDB(**user_doc))
    return users_list

@app.delete("/api/admin/users/{username}")
async def delete_user(username: str, current_user: UserInDB = Depends(get_current_admin_user)):
    """
    Deletes a user by username. Admin only.
    """
    logger.info(f"Delete user request by admin {current_user.username} for: {username}")
    result = await asyncio.to_thread(users_collection.delete_one, {"username": username})
    if result.deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return {"message": f"User {username} deleted successfully"}

@app.put("/api/admin/users/{username}/workflow_access")
async def update_user_workflow_access(
    username: str,
    workflow_access_update: WorkflowAccessUpdate,
    current_user: UserInDB = Depends(get_current_admin_user)
):
    """
    Updates the workflow access list for a specific user. Admin only.
    """
    logger.info(f"Update workflow access request by admin {current_user.username} for: {username}")
    user_in_db = await asyncio.to_thread(users_collection.find_one, {"username": username})
    if not user_in_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    # Ensure all workflow_ids in the update exist in n8n
    # This is an optional but good practice to prevent assigning non-existent workflows
    # You might want to fetch all n8n workflows here and validate `workflow_access_update.workflow_ids`
    # against them. For brevity, I'll skip the n8n validation for now.

    result = await asyncio.to_thread(
        users_collection.update_one,
        {"username": username},
        {"$set": {"workflow_access": workflow_access_update.workflow_ids}}
    )
    if result.modified_count == 0:
        # If no modification, it might mean the data was already the same or user not found (though checked above)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workflow access not updated (perhaps already set or user not found).")
    
    return {"message": f"Workflow access for {username} updated successfully"}

@app.put("/api/admin/users/{username}/role")
async def update_user_role(
    username: str,
    new_role: str, # Can be "admin" or "user"
    current_user: UserInDB = Depends(get_current_admin_user)
):
    """
    Updates the role of a specific user. Admin only.
    """
    logger.info(f"Update role request by admin {current_user.username} for: {username} to {new_role}")
    if new_role not in ["admin", "user"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role. Must be 'admin' or 'user'.")

    user_in_db = await asyncio.to_thread(users_collection.find_one, {"username": username})
    if not user_in_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    result = await asyncio.to_thread(
        users_collection.update_one,
        {"username": username},
        {"$set": {"role": new_role}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User role not updated (perhaps already set or user not found).")
    
    return {"message": f"User {username} role updated to {new_role} successfully"}

