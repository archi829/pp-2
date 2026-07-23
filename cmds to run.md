# Testing Celery + Redis + Flask (Future Checklist)

Use this checklist whenever you want to verify that your async tasks are working.

---

# Step 1 – Start Redis

```bash
sudo service redis-server start
```

Verify:

```bash
redis-cli ping
```

Expected:

```text
PONG
```

---

# Step 2 – Start the Flask Server (Terminal 1)

```bash
cd /mnt/c/Users/Asus/Desktop/projects/mad2/repo

source venv/bin/activate

python app.py
```

Keep this terminal running.

---

# Step 3 – Start the Celery Worker (Terminal 2)

```bash
cd /mnt/c/Users/Asus/Desktop/projects/mad2/repo

source venv/bin/activate

celery -A celery_worker.celery worker --loglevel=info
```

Wait until you see:

```text
celery@<hostname> ready.
```

Keep this terminal running.

---

# Step 4 – Login and Get JWT Token (Terminal 3)

```bash
curl -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student1@test.com","password":"password123","role":"student"}'
```

Copy the `access_token` from the response.

Store it:

```bash
export TOKEN="paste_the_access_token_here"
```

---

# Step 5 – Trigger the Background Task

```bash
curl -X POST http://127.0.0.1:5000/api/student/applications/export \
  -H "Authorization: Bearer $TOKEN"
```

Expected response:

```json
{
  "msg": "Export started...",
  "task_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Copy the `task_id`.

---

# Step 6 – Verify the Worker Received the Task

Look at the Celery terminal.

You should see something similar to:

```text
Task tasks.export_applications_csv[...] received

Task tasks.export_applications_csv[...] succeeded
```

✅ This confirms:

- Flask sent the task.
- Redis queued it.
- Celery executed it successfully.

---

# Step 7 – Verify the CSV Was Created

```bash
ls static/exports/
```

You should see something like:

```text
applications_student_<id>.csv
```

Open the CSV to verify the exported data.

---

# Step 8 – Check Task Status

```bash
curl http://127.0.0.1:5000/api/student/applications/export/status/<task_id> \
  -H "Authorization: Bearer $TOKEN"
```

Expected:

```json
{
  "status": "SUCCESS"
}
```

---

# Step 9 – Test from the Browser

1. Open:

```
http://127.0.0.1:5000
```

2. Login:

```
Email:
student1@test.com

Password:
password123
```

3. Go to **My Applications**.

4. Click **Export CSV**.

5. Watch the Celery terminal.

Expected:

```text
Task received
Task succeeded
```

The UI should eventually notify you that the export is ready.

---

# When Finished

Stop Flask:

```text
Ctrl + C
```

Stop Celery:

```text
Ctrl + C
```

Stop Redis:

```bash
sudo service redis-server stop
```

---

# Success Checklist ✅

- [ ] Redis responds with `PONG`
- [ ] Flask server is running
- [ ] Celery worker shows `ready`
- [ ] Login returns an `access_token`
- [ ] Export endpoint returns a `task_id`
- [ ] Worker logs show **Task received**
- [ ] Worker logs show **Task succeeded**
- [ ] CSV file is created in `static/exports/`
- [ ] Status endpoint returns `"SUCCESS"`
- [ ] Export works correctly from the browser