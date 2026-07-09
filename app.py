"""
app.py — Placement Portal V2 (MAD2) Application Factory

MAD2 changes from MAD1:
  - Flask-Login replaced by flask-jwt-extended (JWT tokens)
  - flask-cors added for Vue frontend
  - Catch-all route added to serve Vue SPA (templates/index.html)
  - Error handlers return JSON instead of rendered HTML
"""

from flask import Flask, jsonify, render_template

from models import db
from extensions import jwt, cors

from routes.auth    import auth_bp
from routes.admin   import admin_bp
from routes.company import company_bp
from routes.student import student_bp
from routes.api     import api_bp


def create_app():
    app = Flask(__name__)

    # ── Config ────────────────────────────────────────────────────────────────
    app.config['SECRET_KEY']                  = 'mad2-jwt-secret-change-in-prod'
    app.config['JWT_SECRET_KEY']              = 'mad2-jwt-secret-change-in-prod'
    app.config['JWT_ACCESS_TOKEN_EXPIRES']    = False   # no expiry for dev; set timedelta in prod
    app.config['SQLALCHEMY_DATABASE_URI']     = 'sqlite:///placement_portal.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER']               = 'static/uploads/resumes'

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    jwt.init_app(app)
    # Same-origin: Vue is served by Flask on the same host.
    # If running Vue dev server on port 5173, add: origins=["http://localhost:5173"]
    cors.init_app(app, origins=["http://localhost:5000"])

    # ── Blueprints ────────────────────────────────────────────────────────────
    app.register_blueprint(auth_bp)     # /api/auth/*
    app.register_blueprint(admin_bp)    # /admin/*   ← Jinja2 (to be replaced in M3)
    app.register_blueprint(company_bp)  # /company/* ← Jinja2 (to be replaced in M4)
    app.register_blueprint(student_bp)  # /student/* ← Jinja2 (to be replaced in M5)
    app.register_blueprint(api_bp)      # /api/*     ← Flask-RESTful (to be expanded M3+)

    # ── Vue SPA entry point ───────────────────────────────────────────────────
    # All non-API, non-static routes serve index.html so Vue Router handles navigation.
    @app.route('/')
    @app.route('/<path:path>')
    def serve_vue(path=''):
        # Skip catch-all for API and static routes
        if path.startswith('api/') or path.startswith('static/'):
            return jsonify({"msg": "Not found."}), 404
        return render_template('index.html')

    # ── JWT error handlers (return JSON, not HTML) ────────────────────────────
    @jwt.unauthorized_loader
    def missing_token(reason):
        return jsonify({"msg": f"Missing token: {reason}"}), 401

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return jsonify({"msg": f"Invalid token: {reason}"}), 422

    @jwt.expired_token_loader
    def expired_token(jwt_header, jwt_payload):
        return jsonify({"msg": "Token has expired."}), 401

    @jwt.revoked_token_loader
    def revoked_token(jwt_header, jwt_payload):
        return jsonify({"msg": "Token has been revoked."}), 401

    # ── General error handlers ────────────────────────────────────────────────
    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"msg": "Forbidden — you do not have access to this resource."}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"msg": "Resource not found."}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"msg": "Internal server error."}), 500

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)