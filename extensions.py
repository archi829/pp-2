"""
extensions.py — shared Flask extension instances
Import from here in app.py (to init) and in routes (to use).
Avoids circular imports by keeping extensions separate from models and app.
"""

from flask_jwt_extended import JWTManager
from flask_cors import CORS

jwt  = JWTManager()
cors = CORS()