from flask import Blueprint
from flask_restful import Api, Resource, reqparse
from models import db, Student, Company, PlacementDrive, Application
from werkzeug.security import generate_password_hash

api_bp = Blueprint('api', __name__, url_prefix='/api')
api = Api(api_bp)

# Parsers
student_parser = reqparse.RequestParser()
student_parser.add_argument('full_name', type=str)
student_parser.add_argument('email', type=str)
student_parser.add_argument('password', type=str)
student_parser.add_argument('cgpa', type=float)
student_parser.add_argument('skills', type=str)
student_parser.add_argument('education', type=str)
student_parser.add_argument('phone', type=str)

drive_parser = reqparse.RequestParser()
drive_parser.add_argument('status', type=str)
create_drive_parser = reqparse.RequestParser()
create_drive_parser.add_argument('job_title', type=str)
create_drive_parser.add_argument('company_id', type=int)
create_drive_parser.add_argument('status', type=str)


class StatsResource(Resource):
    def get(self):
        return {
            'students': Student.query.count(),
            'companies': Company.query.count(),
            'drives': PlacementDrive.query.count(),
            'applications': Application.query.count()
        }

# students
class StudentListResource(Resource):
    def get(self):
        students = Student.query.all()
        return [{'id': s.id, 'name': s.full_name, 'email': s.email} for s in students]

    def post(self):
        args = student_parser.parse_args()

        if not args['full_name'] or not args['email'] or not args['password']:
            return {'error': 'Missing required fields'}, 400

        if Student.query.filter_by(email=args['email']).first():
            return {'error': 'Email exists'}, 409

        s = Student(
            full_name=args['full_name'],
            email=args['email'],
            password_hash=generate_password_hash(args['password']),
            phone=args.get('phone'),
            cgpa=args.get('cgpa'),
            skills=args.get('skills'),
            education=args.get('education')
        )

        db.session.add(s)
        db.session.commit()

        return {'id': s.id, 'message': 'created'}, 201


class StudentResource(Resource):
    def get(self, student_id):
        s = Student.query.get_or_404(student_id)
        return {'id': s.id, 'name': s.full_name, 'email': s.email}

    def put(self, student_id):
        s = Student.query.get_or_404(student_id)
        args = student_parser.parse_args()

        if args.get('full_name'): s.full_name = args['full_name']
        if args.get('phone'): s.phone = args['phone']
        if args.get('cgpa'): s.cgpa = args['cgpa']
        if args.get('skills'): s.skills = args['skills']
        if args.get('education'): s.education = args['education']

        db.session.commit()
        return {'message': 'updated'}

    def delete(self, student_id):
        s = Student.query.get_or_404(student_id)
        db.session.delete(s)
        db.session.commit()
        return {'message': 'deleted'}


#Drives
class DriveListResource(Resource):
    def get(self):
        drives = PlacementDrive.query.all()
        return [{'id': d.id, 'title': d.job_title, 'status': d.status} for d in drives]

    def post(self):
        args = create_drive_parser.parse_args()

        if not args['job_title'] or not args['company_id']:
            return {'error': 'job_title and company_id required'}, 400

        company = Company.query.get(args['company_id'])
        if not company:
            return {'error': 'Invalid company_id'}, 404

        d = PlacementDrive(
            job_title=args['job_title'],
            company_id=args['company_id'],
            status=args.get('status') or 'Pending'
        )

        db.session.add(d)
        db.session.commit()

        return {'id': d.id, 'message': 'drive created'}, 201

class DriveResource(Resource):
    def get(self, drive_id):
        d = PlacementDrive.query.get_or_404(drive_id)
        return {
            'id': d.id,
            'title': d.job_title,
            'status': d.status
        }

    def put(self, drive_id):
        d = PlacementDrive.query.get_or_404(drive_id)
        args = drive_parser.parse_args()

        if not args.get('status'):
            return {'error': 'status required'}, 400

        d.status = args['status']
        db.session.commit()

        return {'message': 'updated'}

    def delete(self, drive_id):
        d = PlacementDrive.query.get_or_404(drive_id)
        db.session.delete(d)
        db.session.commit()
        return {'message': 'deleted'}
    
# Register
api.add_resource(StatsResource, '/stats')
api.add_resource(StudentListResource, '/students')
api.add_resource(StudentResource, '/students/<int:student_id>')
api.add_resource(DriveListResource, '/drives')
api.add_resource(DriveResource, '/drives/<int:drive_id>')