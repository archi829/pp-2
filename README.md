# Placement Portal

A Flask-based web application for managing campus recruitment activities. It allows institutes to manage students, companies, and placement drives through a centralized system.

## Prerequisites

* Python 3.8 or higher
* `pip` (Python package installer)

## Setup Instructions

### 1. Clone or Extract the Project

Navigate to the root directory of the project in your terminal.

### 2. Create a Virtual Environment (Recommended)

```bash
# On Windows
python -m venv venv
venv\Scripts\activate

# On macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

Install the required Python packages from `requirements.txt`:

```bash
pip install -r requirements.txt
```

### 4. Initialize and Seed the Database

Run the database initialization script. This will create the SQLite database (`placement_portal.db`), set up the upload folders, and populate the system with sample data (Admin, Companies, Students, and Drives):

```bash
python init_db.py
```

### 5. Run the Application

Start the Flask development server:

```bash
python app.py
```

Alternatively:

```bash
flask run
```

### 6. Access the Portal

Open your web browser and navigate to:

```
http://127.0.0.1:5000
```

## Default Test Credentials

Because you ran `init_db.py`, the database is pre-populated with the following test accounts:

### Admin Account

* Role: Admin
* Email: [admin@placementportal.com](mailto:admin@placementportal.com)
* Password: admin123

### Company Account (Approved)

* Role: Company
* Email: [hr@technova.com](mailto:hr@technova.com) (or [careers@globalfinance.com](mailto:careers@globalfinance.com))
* Password: password123

### Student Account

* Role: Student
* Email: [student1@test.com](mailto:student1@test.com) (can use student1 through student10)
* Password: password123

## Project Structure Highlights

* `app.py`: Main application entry point and configuration
* `init_db.py`: Database creation and dummy data seeder
* `models.py`: Database schema definitions (Admin, Company, Student, Drives, etc.)
* `routes/`: Contains the logic/controllers for different user roles (Admin, Company, Student) and API endpoints
* `templates/`: Jinja2 HTML templates styled with Bootstrap
