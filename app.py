from flask import Flask, redirect, url_for, render_template_string, abort, flash
from models import db, Admin, Company, Student
from flask_login import LoginManager, login_required, current_user

from routes.auth import auth_bp
from routes.admin import admin_bp
from routes.company import company_bp  
from routes.student import student_bp
from routes.api import api_bp

login_manager = LoginManager()

def create_app():
    app = Flask(__name__)

    app.config['SECRET_KEY'] = 'mad1-project'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///placement_portal.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = 'static/uploads/resumes'

    db.init_app(app)
    login_manager.init_app(app)

    login_manager.login_view = "auth.login"
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.login_message_category = 'warning'

    @login_manager.user_loader
    def load_user(user_id):
        if user_id.startswith('admin-'):
            return Admin.query.get(int(user_id.split('-')[1]))
        elif user_id.startswith('company-'):
            return Company.query.get(int(user_id.split('-')[1]))
        elif user_id.startswith('student-'):
            return Student.query.get(int(user_id.split('-')[1]))
        return None

    #Reject unauthorized access attempts cleanly 
    @login_manager.unauthorized_handler
    def unauthorized():
        flash('Please log in to access this page.', 'warning')
        return redirect(url_for('auth.login'))

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(company_bp) 
    app.register_blueprint(student_bp)
    app.register_blueprint(api_bp)

    @app.route('/')
    def index():
        return redirect(url_for('auth.login'))

    # --- 403 handler ---
    @app.errorhandler(403)
    def forbidden(e):
        return render_template_string('''
        {% extends "base.html" %}
        {% block content %}
        <div class="container mt-5 text-center">
            <h3 class="text-danger">403 — Access Denied</h3>
            <p class="text-muted">You don't have permission to view this page.</p>
            <a href="/" class="btn btn-dark">Go Home</a>
        </div>
        {% endblock %}
        '''), 403

    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True)