"""
reports.py — rendering helpers for the monthly placement report (Milestone 7).

Kept separate from tasks.py so the "what does the report look like" concern
(HTML template + PDF layout) doesn't get tangled with the "when does the
report run / who does it query" concern. tasks.send_monthly_report imports
from here.

Two outputs per report:
  - an HTML string, used as the email body
  - a PDF (bytes), attached to the same email and also saved under
    static/reports/ so it's inspectable in dev even when MAIL_USERNAME
    isn't configured and _send_report_email() no-ops the actual send.
"""
from datetime import datetime, timezone

from fpdf import FPDF


# ── HTML rendering ───────────────────────────────────────────────────────────

def _html_shell(title, month_label, rows_html, table_rows_html=''):
    return f"""\
<html>
<body style="font-family: Arial, sans-serif; color: #222; max-width: 640px; margin: 0 auto;">
  <div style="background:#212529; color:#fff; padding:20px 24px; border-radius:8px 8px 0 0;">
    <h2 style="margin:0;">{title}</h2>
    <p style="margin:4px 0 0; color:#adb5bd;">{month_label}</p>
  </div>
  <div style="border:1px solid #e9ecef; border-top:none; padding:20px 24px; border-radius:0 0 8px 8px;">
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
      {rows_html}
    </table>
    {table_rows_html}
    <p style="color:#868e96; font-size:12px; margin-top:24px;">
      Generated automatically by the Placement Portal on
      {datetime.now(timezone.utc).strftime('%d %b %Y at %H:%M UTC')}.
      A PDF copy of this report is attached.
    </p>
  </div>
</body>
</html>"""


def _stat_row(label, value):
    return (
        f'<tr>'
        f'<td style="padding:8px 0; border-bottom:1px solid #f1f3f5; color:#495057;">{label}</td>'
        f'<td style="padding:8px 0; border-bottom:1px solid #f1f3f5; text-align:right; '
        f'font-weight:bold; font-size:16px;">{value}</td>'
        f'</tr>'
    )


def render_admin_report_html(month_label, stats):
    rows = (
        _stat_row('New Applications', stats['new_apps'])
        + _stat_row('Candidates Selected', stats['selected'])
        + _stat_row('Confirmed Placements', stats['new_placements'])
        + _stat_row('Total Students (all time)', stats['total_students'])
        + _stat_row('Total Drives (all time)', stats['total_drives'])
        + _stat_row('Total Companies (all time)', stats['total_companies'])
    )
    return _html_shell('Monthly Placement Report — Platform Overview', month_label, rows)


def render_company_report_html(month_label, company_name, stats, per_drive_rows):
    rows = (
        _stat_row('Active Drives', stats['active_drives'])
        + _stat_row('New Applications This Month', stats['new_apps'])
        + _stat_row('Candidates Selected This Month', stats['selected'])
        + _stat_row('Confirmed Placements This Month', stats['placements'])
    )

    drive_table = ''
    if per_drive_rows:
        body_rows = ''.join(
            f'<tr>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #f1f3f5;">{r["job_title"]}</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #f1f3f5; text-align:center;">{r["applications"]}</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #f1f3f5; text-align:center;">{r["selected"]}</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #f1f3f5; text-align:center;">{r["placed"]}</td>'
            f'</tr>'
            for r in per_drive_rows
        )
        drive_table = f"""
        <h4 style="margin-top:8px;">Per-Drive Breakdown</h4>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th style="padding:6px 8px; text-align:left;">Drive</th>
              <th style="padding:6px 8px;">Applications</th>
              <th style="padding:6px 8px;">Selected</th>
              <th style="padding:6px 8px;">Placed</th>
            </tr>
          </thead>
          <tbody>{body_rows}</tbody>
        </table>"""

    return _html_shell(f'Monthly Placement Report — {company_name}', month_label, rows, drive_table)


# ── PDF rendering (fpdf2 — pure Python, no system deps) ─────────────────────

class _ReportPDF(FPDF):
    def header(self):
        self.set_font('Helvetica', 'B', 14)
        self.set_text_color(33, 37, 41)
        self.cell(0, 10, _pdf_safe(self.title_text), ln=True)
        self.set_font('Helvetica', '', 10)
        self.set_text_color(120, 120, 120)
        self.cell(0, 6, _pdf_safe(self.subtitle_text), ln=True)
        self.ln(4)
        self.set_draw_color(220, 220, 220)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f'Page {self.page_no()}', align='C')


def _pdf_safe(text):
    """fpdf2's built-in core fonts (Helvetica etc.) only support Latin-1.
    Company names, student names, and job titles come from user input and
    could contain em-dashes, curly quotes, emoji, or non-Latin scripts —
    without this, a single unusual character anywhere in the report data
    would raise FPDFUnicodeEncodingException and fail the whole Celery task.
    Unsupported characters are replaced with '?' rather than crashing; the
    HTML email body (not subject to this limitation) always has the exact
    original text, so nothing is silently lost, only the PDF degrades."""
    return str(text).encode('latin-1', errors='replace').decode('latin-1')


def build_pdf_report(title, subtitle, stat_rows, table_title=None, table_headers=None, table_rows=None):
    """
    stat_rows: list of (label, value) tuples -> rendered as a simple key/value block
    table_*:   optional secondary table (used for the company per-drive breakdown)
    Returns raw PDF bytes.
    """
    pdf = _ReportPDF()
    pdf.title_text = title
    pdf.subtitle_text = subtitle
    pdf.add_page()

    pdf.set_font('Helvetica', '', 12)
    pdf.set_text_color(30, 30, 30)
    for label, value in stat_rows:
        pdf.set_font('Helvetica', '', 12)
        pdf.cell(120, 9, _pdf_safe(label), border='B')
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 9, _pdf_safe(value), border='B', ln=True, align='R')

    if table_title and table_headers and table_rows:
        pdf.ln(8)
        pdf.set_font('Helvetica', 'B', 12)
        pdf.cell(0, 8, _pdf_safe(table_title), ln=True)
        pdf.ln(1)

        col_width = 190 / len(table_headers)
        pdf.set_font('Helvetica', 'B', 10)
        pdf.set_fill_color(248, 249, 250)
        for h in table_headers:
            pdf.cell(col_width, 8, _pdf_safe(h), border=1, align='C', fill=True)
        pdf.ln()

        pdf.set_font('Helvetica', '', 10)
        for row in table_rows:
            for cell in row:
                pdf.cell(col_width, 8, _pdf_safe(cell), border=1, align='C')
            pdf.ln()

    return bytes(pdf.output())
