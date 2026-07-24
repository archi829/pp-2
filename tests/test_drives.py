from tests.conftest import auth_header

def test_student_sees_approved_drives(client, student_token):
    resp = client.get('/api/student/drives', headers=auth_header(student_token))
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data['drives']) == 1
    assert data['drives'][0]['job_title'] == 'Software Engineer'

def test_student_applies(client, student_token, seed_data):
    drive_id = seed_data['drive'].id
    resp = client.post('/api/student/applications', 
                       json={'drive_id': drive_id},
                       headers=auth_header(student_token))
    assert resp.status_code == 201

def test_student_duplicate_apply(client, student_token, seed_data):
    drive_id = seed_data['drive'].id
    client.post('/api/student/applications', 
                json={'drive_id': drive_id},
                headers=auth_header(student_token))
    # Second time should fail
    resp = client.post('/api/student/applications', 
                       json={'drive_id': drive_id},
                       headers=auth_header(student_token))
    assert resp.status_code == 409
