"""
routes/public.py — pre-login public API endpoints.
No JWT required. Responses are heavily Redis-cached (10 min TTL).
"""
from flask import Blueprint, jsonify
from models import db, Student, Company, PlacementDrive, Application, Placement
from constants import DriveStatus, ApprovalStatus
from cache_keys import public_stats_key, safe_get, safe_set

public_bp = Blueprint('public', __name__, url_prefix='/api/public')


@public_bp.route('/stats')
def public_stats():
    """Read-only aggregate stats visible without authentication.
    Cached for 10 minutes — these numbers change slowly and a brief
    staleness window is an acceptable trade-off for zero-auth DB load."""
    cache_key = public_stats_key()
    cached = safe_get(cache_key)
    if cached is not None:
        return jsonify(cached), 200

    total_students   = Student.query.count()
    total_companies  = Company.query.filter_by(
        approval_status=ApprovalStatus.APPROVED
    ).count()
    active_drives    = PlacementDrive.query.filter_by(
        status=DriveStatus.APPROVED
    ).count()
    total_placements = Placement.query.count()
    total_applications = Application.query.count()

    payload = {
        'total_students':     total_students,
        'total_companies':    total_companies,
        'active_drives':      active_drives,
        'total_placements':   total_placements,
        'total_applications': total_applications,
    }

    safe_set(cache_key, payload, timeout=600)   # 10 min TTL
    return jsonify(payload), 200
