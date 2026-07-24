from tests.conftest import auth_header

def test_public_stats_returns_200(client, seed_data):
    resp = client.get('/api/public/stats')
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_students'] == 1
    assert data['active_drives'] == 1

def test_admin_dashboard_returns_200(client, admin_token):
    resp = client.get('/api/admin/dashboard', headers=auth_header(admin_token))
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['total_drives'] == 1
