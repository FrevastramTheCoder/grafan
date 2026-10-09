import { useState } from 'react';
import { api, friendlyError } from '../api';

const JOB_TYPES = [
  { key: 'onsite', label: 'On-site' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'remote', label: 'Remote' },
  { key: 'gig', label: 'Contract / gig' },
];

export default function JobPostingHub({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: '',
    company: '',
    job_type: 'onsite',
    location: '',
    salary: '',
    description: '',
    application_url: '',
    recruiter_email: '',
    poster_name: '',
    poster_email: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');

    if (!form.title.trim()) return setError('Job title is required.');
    if (!form.company.trim()) return setError('Company name is required.');
    if (!form.application_url.trim() && !form.recruiter_email.trim()) {
      return setError('Provide an application URL or recruiter email.');
    }

    try {
      setSubmitting(true);
      const { data } = await api.post('/jobs/public', {
        title: form.title.trim(),
        company: form.company.trim(),
        job_type: form.job_type,
        location: form.location.trim(),
        salary: form.salary.trim(),
        description: form.description.trim(),
        application_url: form.application_url.trim(),
        recruiter_email: form.recruiter_email.trim(),
        poster_name: form.poster_name.trim(),
        poster_email: form.poster_email.trim(),
      });

      if (data?.success) {
        setDone(true);
        if (onSuccess) onSuccess(data.job);
      } else {
        throw new Error('Server did not confirm the post.');
      }
    } catch (err) {
      setError(friendlyError(err, 'The job could not be posted. Try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="state-panel" role="status">
        <span className="state-symbol" aria-hidden="true">✓</span>
        <h3>Job posted!</h3>
        <p>
          Your job <strong>{form.title}</strong> at <strong>{form.company}</strong> is now live.
          Applicants can apply directly from the job listing.
        </p>
        <div className="form-actions">
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              setForm({
                title: '', company: '', job_type: 'onsite',
                location: '', salary: '', description: '',
                application_url: '', recruiter_email: '',
                poster_name: '', poster_email: '',
              });
              setDone(false);
            }}
          >
            Post another job
          </button>
          <button className="button button-outline" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="apply-form" onSubmit={handleSubmit} noValidate>
      <p className="dialog-intro">
        Post a job to reach thousands of candidates across Tanzania.
        Your listing appears immediately in the job board.
      </p>

      <div className="form-grid">
        <label className="form-field form-field-wide">
          <span>Job title <span className="required-mark">*</span></span>
          <input
            type="text"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            placeholder="e.g. Senior Accountant"
            maxLength={200}
            required
          />
        </label>

        <label className="form-field">
          <span>Company <span className="required-mark">*</span></span>
          <input
            type="text"
            value={form.company}
            onChange={e => update('company', e.target.value)}
            placeholder="e.g. NMB Bank"
            maxLength={100}
            required
          />
        </label>

        <label className="form-field">
          <span>Job type</span>
          <select value={form.job_type} onChange={e => update('job_type', e.target.value)}>
            {JOB_TYPES.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Location</span>
          <input
            type="text"
            value={form.location}
            onChange={e => update('location', e.target.value)}
            placeholder="e.g. Dar es Salaam"
            maxLength={150}
          />
        </label>

        <label className="form-field">
          <span>Salary (optional)</span>
          <input
            type="text"
            value={form.salary}
            onChange={e => update('salary', e.target.value)}
            placeholder="e.g. TSh 800,000 - 1,200,000"
            maxLength={150}
          />
        </label>

        <label className="form-field form-field-wide">
          <span>Job description</span>
          <textarea
            rows="5"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            placeholder="Describe the role, responsibilities, and requirements."
            maxLength={12000}
          />
        </label>

        <label className="form-field form-field-wide">
          <span>Application URL</span>
          <input
            type="url"
            value={form.application_url}
            onChange={e => update('application_url', e.target.value)}
            placeholder="https://example.com/apply"
          />
        </label>

        <label className="form-field form-field-wide">
          <span>Or recruiter email</span>
          <input
            type="email"
            value={form.recruiter_email}
            onChange={e => update('recruiter_email', e.target.value)}
            placeholder="hr@company.com"
          />
          <small className="form-hint">
            Provide at least one: application URL or recruiter email.
          </small>
        </label>

        <label className="form-field">
          <span>Your name (optional)</span>
          <input
            type="text"
            value={form.poster_name}
            onChange={e => update('poster_name', e.target.value)}
            placeholder="Who is posting this?"
          />
        </label>

        <label className="form-field">
          <span>Your email (optional)</span>
          <input
            type="email"
            value={form.poster_email}
            onChange={e => update('poster_email', e.target.value)}
            placeholder="you@example.com"
          />
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="dialog-actions">
        <button
          type="button"
          className="button button-outline"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={submitting}
        >
          {submitting ? 'Posting…' : 'Post job'}
        </button>
      </div>
    </form>
  );
}