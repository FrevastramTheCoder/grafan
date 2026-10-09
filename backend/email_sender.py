import smtplib
import os
import html
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from dotenv import load_dotenv

load_dotenv()

class EmailSender:
    def __init__(self, smtp_server='smtp.gmail.com', smtp_port=587, sender_email=None, sender_password=None):
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.sender_email = sender_email or os.environ.get('SENDER_EMAIL')
        self.sender_password = sender_password or os.environ.get('EMAIL_PASSWORD')

    @property
    def is_configured(self):
        return bool(self.sender_email and self.sender_password)
    
    def send_application_email(self, to_email, job_title, company, applicant_name, applicant_email, applicant_phone, cover_letter, cv_path=None):
        """Send email to recruiter with full application details"""
        subject = f"Job Application: {job_title} at {company} - from {applicant_name}".replace("\r", " ").replace("\n", " ")
        safe = {key: html.escape(value or "") for key, value in {
            "job_title": job_title, "company": company, "applicant_name": applicant_name,
            "applicant_email": applicant_email, "applicant_phone": applicant_phone,
            "cover_letter": cover_letter,
        }.items()}
        
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif;">
            <div style="background: #667eea; color: white; padding: 20px; text-align: center;">
                <h2>🛠️ New Job Application</h2>
                <p>from Grafan Job Platform</p>
            </div>
            <div style="padding: 20px;">
                <h3>Position:</h3>
                <p><strong>{safe['job_title']}</strong> at <strong>{safe['company']}</strong></p>
                
                <h3>Applicant Information:</h3>
                <p><strong>Name:</strong> {safe['applicant_name']}<br>
                <strong>Email:</strong> {safe['applicant_email']}<br>
                <strong>Phone:</strong> {safe['applicant_phone'] or 'Not provided'}</p>
                
                <h3>Cover Letter:</h3>
                <p>{safe['cover_letter']}</p>
                
                <hr>
                <p style="color: #666; font-size: 12px;">CV attached separately.</p>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(to_email, subject, body, cv_path)
    
    def send_confirmation_email(self, to_email, applicant_name, job_title, company):
        """Send confirmation email to applicant"""
        subject = f"Application Confirmation: {job_title} at {company}".replace("\r", " ").replace("\n", " ")
        safe_name = html.escape(applicant_name or "")
        safe_title = html.escape(job_title or "")
        safe_company = html.escape(company or "")
        
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif;">
            <div style="background: #667eea; color: white; padding: 20px; text-align: center;">
                <h2>✅ Application Received</h2>
            </div>
            <div style="padding: 20px;">
                <p>Dear <strong>{safe_name}</strong>,</p>
                <p>Thank you for applying for <strong>{safe_title}</strong> at <strong>{safe_company}</strong>.</p>
                <p>Your application has been submitted successfully!</p>
                <p>The employer will review your application and contact you if shortlisted.</p>
                <hr>
                <p style="color: #666;">This is an automated confirmation from Grafan.</p>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(to_email, subject, body)
    
    def send_email(self, to_email, subject, body, attachment_path=None):
        if not self.is_configured:
            print("⚠️ Email not configured. Skipping email send.")
            return False
        if not to_email:
            return False
        
        try:
            msg = MIMEMultipart()
            msg['From'] = self.sender_email
            msg['To'] = to_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'html'))
            
            if attachment_path and os.path.exists(attachment_path):
                with open(attachment_path, 'rb') as attachment:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment.read())
                    encoders.encode_base64(part)
                    part.add_header('Content-Disposition', f'attachment; filename={os.path.basename(attachment_path)}')
                    msg.attach(part)
            
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.sender_email, self.sender_password)
            server.send_message(msg)
            server.quit()
            print(f"✅ Email sent to {to_email}")
            return True
        except Exception as e:
            print(f"❌ Email error: {e}")
            return False
