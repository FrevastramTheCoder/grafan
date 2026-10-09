import { useState } from 'react';

// ✅ CRA inatumia proxy kutoka package.json
// Proxy inaelekeza /api/* kwa http://127.0.0.1:5000
const API_BASE = process.env.REACT_APP_API_URL || '';

const ALLOWED_CV_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export default function ApplyApplication({ job, onClose }) {
  const [form, setForm] = useState({
    applicant_name: '',
    applicant_email: '',
    applicant_phone: '',
    cover_letter: '',
  });
  const [cv, setCv] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [applicationUrl, setApplicationUrl] = useState('');

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleCvChange = event => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setCv(null);
      return;
    }
    if (!ALLOWED_CV_TYPES.includes(file.type)) {
      setError('CV must be a PDF or Word document.');
      setCv(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('CV must be under 5 MB.');
      setCv(null);
      return;
    }
    setError('');
    setCv(file);
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');

    if (!form.applicant_name.trim()) return setError('Please enter your full name.');
    if (!form.applicant_email.trim() || !/^\S+@\S+\.\S+$/.test(form.applicant_email)) {
      return setError('Please enter a valid email address.');
    }
    if (!form.applicant_phone.trim()) return setError('Please enter your phone number.');
    if (!cv) return setError('Please attach your CV.');

    const data = new FormData();
    data.append('job_id', String(job.id));
    data.append('applicant_name', form.applicant_name.trim());
    data.append('applicant_email', form.applicant_email.trim());
    data.append('applicant_phone', form.applicant_phone.trim());
    data.append('cover_letter', form.cover_letter.trim());
    data.append('cv', cv);

    try {
      setSubmitting(true);
      // ✅ Proxy inaelekeza /api/* kwa backend (port 5000 kutoka package.json)
      const res = await fetch(`${API_BASE}/api/apply`, {
        method: 'POST',
        body: data,
      });

      if (!res.ok) {
        let detail = `Server error (${res.status})`;
        try {
          const body = await res.json();
          if (body?.detail) {
            detail = typeof body.detail === 'string'
              ? body.detail
              : JSON.stringify(body.detail);
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }

      let payload = {};
      try {
        payload = await res.json();
      } catch {
        /* empty response is fine */
      }

      if (payload?.application_url) {
        setApplicationUrl(payload.application_url);
      }
      setDone(true);
    } catch (err) {
      setError(err.message || 'Application could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="state-panel" role="status">
        <span className="state-symbol" aria-hidden="true">✓</span>
        <h3>Application sent</h3>
        <p>
          Your application for <strong>{job.title}</strong>
          {job.company ? ` at ${job.company}` : ''} has been received.
          A confirmation email has been sent to <em>{form.applicant_email}</em>.
        </p>
        {applicationUrl && (
          <p className="state-inline">
            This employer also has an online form:{' '}
            <a href={applicationUrl} target="_blank" rel="noopener noreferrer">
              Open employer form ↗
            </a>
          </p>
        )}
        <button className="button button-primary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  return (
    <form className="apply-form" onSubmit={handleSubmit} noValidate>
      <p className="dialog-intro">
        Applying for <strong>{job.title}</strong>
        {job.company ? ` at ${job.company}` : ''}.
        {job.location ? ` · ${job.location}` : ''}
      </p>

      <label className="form-field">
        <span>Full name *</span>
        <input
          type="text"
          value={form.applicant_name}
          onChange={event => update('applicant_name', event.target.value)}
          placeholder="e.g. Amina Juma"
          autoComplete="name"
          required
        />
      </label>

      <label className="form-field">
        <span>Email *</span>
        <input
          type="email"
          value={form.applicant_email}
          onChange={event => update('applicant_email', event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </label>

      <label className="form-field">
        <span>Phone *</span>
        <input
          type="tel"
          value={form.applicant_phone}
          onChange={event => update('applicant_phone', event.target.value)}
          placeholder="+255 7XX XXX XXX"
          autoComplete="tel"
          required
        />
      </label>

      <label className="form-field">
        <span>Cover letter (optional)</span>
        <textarea
          rows="4"
          value={form.cover_letter}
          onChange={event => update('cover_letter', event.target.value)}
          placeholder="Tell the employer briefly why you fit this role."
        />
      </label>

      <label className="form-field">
        <span>Attach CV (PDF or Word, max 5 MB) *</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleCvChange}
          required
        />
        {cv && (
          <small className="form-hint">
            Selected: {cv.name} ({(cv.size / 1024).toFixed(0)} KB)
          </small>
        )}
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button
          type="submit"
          className="button button-primary button-full"
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : 'Submit application'}
        </button>
        <button
          type="button"
          className="button button-outline"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}