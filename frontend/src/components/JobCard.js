import React from 'react';
import { formatDate } from '../api';

const workModes = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  gig: 'Contract / gig',
};

export default function JobCard({
  job,
  onOpen,
  onApply,
  onCreateCv,
  onSave,
  onShare,
  isSaved,
}) {
  const date = job.posted_date ? `Posted ${formatDate(job.posted_date)}` : '';
  const summary = (job.description || '').replace(/\s+/g, ' ').trim();
  const skills = Array.isArray(job.skills) ? job.skills.slice(0, 4) : [];

  return (
    <article className="job-card">
      <div className="job-card-heading">
        <div className="company-mark" aria-hidden="true">
          {(job.company || '?').trim().charAt(0).toUpperCase()}
        </div>
        <div className="job-card-title">
          <h3>{job.title}</h3>
          <p className="company-name">{job.company || 'Employer not listed'}</p>
        </div>
        <span className={`work-badge work-${job.job_type || 'unknown'}`}>
          {workModes[job.job_type] || 'Work type not listed'}
        </span>
      </div>

      <div className="job-meta">
        {job.location && (
          <span>
            <span aria-hidden="true">⌖</span> {job.location}
          </span>
        )}
        {job.salary && (
          <span>
            <span aria-hidden="true">TSh</span> {job.salary}
          </span>
        )}
        {job.job_category && (
          <span className="job-sector-badge">{job.job_category}</span>
        )}
        {date && <span>{date}</span>}
      </div>

      {summary && (
        <p className="job-summary">
          {summary.length > 230
            ? `${summary.slice(0, 227).trimEnd()}…`
            : summary}
        </p>
      )}

      {skills.length > 0 && (
        <div className="job-skills" aria-label="Skills mentioned in this listing">
          {skills.map(skill => (
            <span className="skill-chip" key={skill}>
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="job-card-footer">
        <div className="job-actions">
          <button
            className="button button-primary button-small"
            type="button"
            onClick={() => onApply(job)}
          >
            Apply Now <span aria-hidden="true">→</span>
          </button>

          <button
            className="button button-outline button-small"
            type="button"
            onClick={() => onSave(job)}
            aria-pressed={isSaved}
          >
            {isSaved ? 'Saved' : 'Save'}
          </button>

          <button
            className="button button-outline button-small"
            type="button"
            onClick={() => onShare(job)}
          >
            Share
          </button>

          <button
            className="button button-outline button-small"
            type="button"
            onClick={() => onCreateCv(job)}
          >
            Create CV
          </button>

          <button
            className="button button-outline button-small"
            type="button"
            onClick={() => onOpen(job)}
          >
            View Details <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </article>
  );
}