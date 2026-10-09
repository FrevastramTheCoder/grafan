import React, { useCallback, useEffect, useState } from 'react';
import { api, friendlyError } from '../api';
import { AdPreview } from './AdvertisementHub';

function auth(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

export default function AdminDashboard({ onClose }) {
  const [token, setToken] = useState(() => window.sessionStorage.getItem('grafanAdminToken') || '');
  const [draft, setDraft] = useState(token);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(null);
  const [sources, setSources] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [source, setSource] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [taskId, setTaskId] = useState('');
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [showPost, setShowPost] = useState(false);
  const [advertisements, setAdvertisements] = useState([]);
  const [adCounts, setAdCounts] = useState(null);
  const [adCategory, setAdCategory] = useState('');
  const [adStatus, setAdStatus] = useState('');

  const load = useCallback(async (value, params = {}) => {
    const cfg = auth(value);
    const [statsResponse, sourcesResponse, jobsResponse] = await Promise.all([
      api.get('/admin/scraping/stats', cfg), api.get('/admin/sources', cfg), api.get('/admin/jobs', { ...cfg, params: { limit: 100, search, source: filterSource, ...params } }),
    ]);
    const adsResponse = await api.get('/admin/ads', { ...cfg, params: { category: adCategory, status: adStatus } });
    setStats(statsResponse.data);
    setSources(sourcesResponse.data.sources || []);
    setJobs(jobsResponse.data.jobs || []);
    setAdvertisements(adsResponse.data.advertisements || []);
    setAdCounts(adsResponse.data.counts || null);
    setConnected(true);
  }, [search, filterSource, adCategory, adStatus]);

  const reviewAd = async (ad, action) => {
    const reason = ['reject', 'request_changes'].includes(action) ? window.prompt(action === 'reject' ? 'Reason for rejection (required):' : 'Changes requested (required):') : null;
    if (['reject', 'request_changes'].includes(action) && !reason?.trim()) return;
    setBusy(true); setError('');
    try { await api.post(`/admin/ads/${ad.id}/review`, { action, reason }, auth(token)); await load(token); }
    catch (e) { setError(friendlyError(e, 'Advertisement review could not be saved.')); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!token) return;
    load(token).catch(e => { setConnected(false); setError(friendlyError(e, 'Admin data could not be loaded.')); });
  }, [token, load]);

  const connect = async event => {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true); setError('');
    try {
      await load(draft.trim());
      window.sessionStorage.setItem('grafanAdminToken', draft.trim());
      setToken(draft.trim());
    } catch (e) {
      setConnected(false); setError(friendlyError(e, 'Admin authentication failed. Check the token and server configuration.'));
    } finally { setBusy(false); }
  };

  const disconnect = () => {
    window.sessionStorage.removeItem('grafanAdminToken');
    setToken(''); setDraft(''); setConnected(false); setStats(null); setJobs([]);
  };

  const startScrape = async (sourceName, customUrl = '') => {
    setBusy(true); setError(''); setScrapeStatus('Starting scrape…');
    try {
      const response = customUrl
        ? await api.post('/scrape-url', { url: customUrl }, auth(token))
        : sourceName
          ? await api.post('/admin/scrape/source', { source: sourceName }, auth(token))
          : await api.post('/admin/scrape/all', {}, auth(token));
      const id = response.data.task_id;
      setTaskId(id);
      setScrapeStatus('Fetching listings, validating jobs, checking duplicates, and saving results…');
    } catch (e) { setError(friendlyError(e, 'The scrape could not be started.')); setScrapeStatus(''); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!taskId || !token) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const { data } = await api.get(`/scrape/status/${encodeURIComponent(taskId)}`, auth(token));
        if (cancelled) return;
        if (data.progress) setScrapeStatus(data.progress);
        if (data.state === 'completed') {
          const r = data.result || {};
          const sourceErrors = (r.errors || []).map(item => `${item.source}: ${item.error}`).join('; ');
          setScrapeStatus(`Complete: ${r.discovered || 0} found · ${r.added || 0} new · ${r.duplicates || 0} duplicates · ${r.invalid || 0} invalid · ${r.with_application_links || 0} with apply links.${sourceErrors ? ` Source errors: ${sourceErrors}` : ''}`);
          setTaskId(''); load(token).catch(() => {}); return;
        }
        if (data.state === 'failed') {
          const sourceErrors = (data.source_errors || []).map(item => `${item.source}: ${item.error}`).join('; ');
          setScrapeStatus(`${data.error || 'Scraping failed.'}${sourceErrors ? ` ${sourceErrors}` : ''}`);
          setTaskId(''); return;
        }
        timer = window.setTimeout(poll, 1000);
      } catch (e) { if (!cancelled) { setError(friendlyError(e, 'Scrape status could not be read.')); setTaskId(''); } }
    };
    poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [taskId, token, load]);

  const setStatus = async job => {
    setBusy(true); setError('');
    try { await api.put(`/admin/jobs/${job.id}`, { job_status: job.job_status === 'active' ? 'inactive' : 'active' }, auth(token)); await load(token); }
    catch (e) { setError(friendlyError(e, 'The job status could not be changed.')); }
    finally { setBusy(false); }
  };

  const editApplication = async job => {
    const value = window.prompt('Application URL (leave blank if unavailable):', job.application_url || '');
    if (value === null) return;
    setBusy(true); setError('');
    try { await api.put(`/admin/jobs/${job.id}`, { application_url: value.trim() }, auth(token)); await load(token); }
    catch (e) { setError(friendlyError(e, 'The application URL could not be saved.')); }
    finally { setBusy(false); }
  };

  const editJob = async job => {
    const fields = [
      ['title', 'Job title'], ['company', 'Company'], ['location', 'Location'], ['salary', 'Salary'],
      ['application_url', 'Application URL'], ['recruiter_email', 'Recruiter email'], ['application_deadline', 'Application deadline'],
      ['required_skills', 'Required skills (comma separated)'], ['experience_requirements', 'Experience requirements'],
      ['description', 'Description'], ['responsibilities', 'Responsibilities'], ['requirements', 'Requirements'],
      ['qualifications', 'Qualifications'], ['application_instructions', 'Application instructions'],
    ];
    const changes = {};
    for (const [key, label] of fields) {
      const value = window.prompt(label, job[key] || '');
      if (value === null) return;
      changes[key] = value;
    }
    const jobType = window.prompt('Job type (remote, hybrid, onsite, gig)', job.job_type || '');
    if (jobType === null) return;
    changes.job_type = jobType.trim().toLowerCase();
    setBusy(true); setError('');
    try { await api.put(`/admin/jobs/${job.id}`, changes, auth(token)); await load(token); }
    catch (e) { setError(friendlyError(e, 'The job could not be updated.')); }
    finally { setBusy(false); }
  };

  const removeJob = async job => {
    if (!window.confirm(`Permanently delete “${job.title}” from the database?`)) return;
    setBusy(true); setError('');
    try { await api.delete(`/admin/jobs/${job.id}`, auth(token)); await load(token); }
    catch (e) { setError(friendlyError(e, 'The job could not be deleted.')); }
    finally { setBusy(false); }
  };

  const postJob = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await api.post('/admin/jobs', values, auth(token));
      if (!response.data?.success) throw new Error('The server did not confirm the job was saved.');
      form.reset(); setShowPost(false); await load(token);
    } catch (e) { setError(friendlyError(e, e.message || 'The job could not be posted.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-heading"><div><p className="eyebrow">Restricted workspace</p><h2>Admin dashboard</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close admin">×</button></div>
      {!connected ? <form className="admin-login" onSubmit={connect}>
        <p>Admin routes are verified by the FastAPI server. Enter the configured admin token to continue.</p>
        <label className="form-field"><span>Admin API token</span><input type="password" autoComplete="current-password" value={draft} onChange={e => setDraft(e.target.value)} required /></label>
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="button button-primary" disabled={busy}>{busy ? 'Verifying…' : 'Connect'}</button>
      </form> : <>
        <div className="admin-toolbar"><span>Authenticated for this browser tab</span><button className="button button-outline button-small" onClick={disconnect}>Sign out</button></div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="admin-workspace"><nav className="admin-sidebar" aria-label="Admin sections"><a href="#admin-overview">Overview</a><a href="#admin-ads">Advertisements</a><a href="#admin-jobs">Jobs</a><a href="#admin-scraper">Scraper</a></nav><div className="admin-main">
        {stats && <div className="admin-stats" id="admin-overview">{[
          ['Total jobs', stats.total_jobs], ['Active jobs', stats.active_jobs], ['Scraped today', stats.scraped_today],
          ['With application links', stats.with_application_links], ['Missing application links', stats.without_application_links], ['Duplicates', stats.duplicates],
        ].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>}
        {stats?.jobs_by_source && <section className="admin-source-breakdown"><h3>Jobs by source</h3><div>{Object.entries(stats.jobs_by_source).map(([name, count]) => <span key={name}><strong>{name}</strong> {count}</span>)}</div></section>}
        <section className="admin-ad-management" id="admin-ads"><div className="admin-list-heading"><div><h3>Advertisement Management</h3><p>Review branded ads and manage their publication workflow.</p></div><div className="admin-ad-stats">{adCounts && Object.entries(adCounts).map(([label,value]) => <span key={label}><strong>{value}</strong> {label}</span>)}</div></div>
          <div className="admin-filters"><select aria-label="Filter advertisements by category" value={adCategory} onChange={e => setAdCategory(e.target.value)}><option value="">All categories</option>{['jobs','property','land','vehicles','products','services','training-courses','events','business-promotion','ngo-community','freelance','other'].map(x => <option key={x} value={x}>{x}</option>)}</select><select aria-label="Filter advertisements by status" value={adStatus} onChange={e => setAdStatus(e.target.value)}><option value="">All statuses</option>{['draft','pending','approved','published','rejected','expired','closed','suspended'].map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="admin-ad-list">{advertisements.length ? advertisements.map(ad => <article className="admin-ad-row" key={ad.id}><div><strong>{ad.title}</strong><span>{ad.category} · {ad.status} · {ad.promotion}{ad.featured ? ' · Featured' : ''}</span><small>{ad.business_name || 'Independent advertiser'} · {ad.location || 'Location not listed'}</small><p>{ad.description}</p>{ad.rejection_reason && <small>Review reason: {ad.rejection_reason}</small>}<details className="admin-ad-inspect"><summary>Inspect advertisement and branding</summary><AdPreview data={ad}/><p><strong>Contact:</strong> {ad.contact_phone || '—'} · {ad.whatsapp || '—'} · {ad.email || '—'} · {ad.website || '—'}</p><p><strong>Tagline:</strong> {ad.tagline || '—'} · <strong>CTA:</strong> {ad.cta || '—'} · <strong>Template:</strong> {ad.template || '—'}</p><p><strong>Brand colors:</strong> {ad.brand_primary || '—'} / {ad.brand_secondary || '—'}</p><p><strong>Social:</strong> {Array.isArray(ad.social_links) ? ad.social_links.join(', ') : '—'}</p></details></div><div className="admin-ad-actions">{ad.status === 'pending' && <><button disabled={busy} onClick={() => reviewAd(ad,'approve')}>Approve</button><button disabled={busy} onClick={() => reviewAd(ad,'request_changes')}>Request changes</button><button disabled={busy} onClick={() => reviewAd(ad,'reject')}>Reject</button></>}{ad.status === 'approved' && <button disabled={busy} onClick={() => reviewAd(ad,'publish')}>Publish</button>}{ad.status === 'published' && <button disabled={busy} onClick={() => reviewAd(ad,'suspend')}>Suspend</button>}{ad.status === 'suspended' && <button disabled={busy} onClick={() => reviewAd(ad,'restore')}>Restore</button>}<button className="danger-text" disabled={busy} onClick={() => window.confirm(`Delete “${ad.title}”?`) && reviewAd(ad,'delete')}>Delete</button></div></article>) : <p>No advertisements match these filters.</p>}</div>
        </section>
        <section className="admin-scraping" id="admin-scraper"><div className="admin-list-heading"><div><p className="eyebrow">Listings pipeline</p><h3>Scraper controls</h3></div>{taskId && <span className="admin-live-status"><i/> Running</span>}</div><div className="admin-actions">
          <button className="button button-primary" disabled={busy || Boolean(taskId)} onClick={() => startScrape()}>Scrape all sources</button>
          <select aria-label="Choose source" value={source} onChange={e => setSource(e.target.value)}><option value="">Choose source…</option>{sources.map(item => <option key={item.name}>{item.name}</option>)}</select>
          <button className="button button-outline" disabled={busy || Boolean(taskId) || !source} onClick={() => startScrape(source)}>Scrape source</button>
          <input aria-label="Website URL to scrape" type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://public-job-site.example"/>
          <button className="button button-outline" disabled={busy || Boolean(taskId) || !websiteUrl.trim()} onClick={() => startScrape('', websiteUrl.trim())}>Scrape website</button>
        </div>{scrapeStatus && <div role="status" className="scraper-feedback"><p>{scrapeStatus}</p>{taskId && <div className="scraper-indeterminate" aria-label="Scrape in progress"><span/></div>}</div>}</section>
        <section className="admin-job-list" id="admin-jobs"><div className="admin-list-heading"><div><p className="eyebrow">Manage opportunities</p><h3>Job management</h3></div><button className="button button-primary button-small" onClick={() => setShowPost(v => !v)}>{showPost ? 'Cancel' : 'Post a job'}</button></div>
          {showPost && <form className="admin-post-form" onSubmit={postJob}><input name="title" required maxLength="200" placeholder="Job title"/><input name="company" required maxLength="100" placeholder="Company"/><input name="location" placeholder="Location"/><select name="job_type" defaultValue="onsite"><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option><option value="gig">Contract / gig</option></select><input name="salary" placeholder="Salary or range"/><input name="recruiter_email" type="email" placeholder="Recruiter email"/><input name="application_url" type="url" placeholder="Application URL"/><textarea name="description" required maxLength="12000" placeholder="Job description"/><textarea name="responsibilities" placeholder="Responsibilities"/><textarea name="requirements" placeholder="Requirements"/><textarea name="qualifications" placeholder="Qualifications"/><input name="required_skills" placeholder="Required skills, comma separated"/><input name="experience_requirements" placeholder="Experience requirements"/><input name="application_deadline" placeholder="Application deadline"/><textarea name="application_instructions" placeholder="Application instructions"/><button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save job'}</button></form>}
          <div className="admin-filters"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title or company"/><select value={filterSource} onChange={e => setFilterSource(e.target.value)} aria-label="Filter jobs by source"><option value="">All sources</option>{sources.map(item => <option key={item.name}>{item.name}</option>)}</select><button className="button button-outline button-small" onClick={() => load(token)}>Refresh</button></div>
          <div className="admin-table-wrap"><table><thead><tr><th>Job</th><th>Source</th><th>Apply link</th><th>Status</th><th>Actions</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}>
          <td><strong>{job.title}</strong><small>{job.company} · {job.location}</small>{job.duplicate_status === 'duplicate' && <em>Possible duplicate</em>}</td>
          <td>{job.source || 'Unknown'}{job.source_url && <a href={job.source_url} target="_blank" rel="noopener noreferrer">Open source</a>}</td>
          <td>{job.application_url || job.recruiter_email || 'Unavailable'}<button className="text-button" onClick={() => editApplication(job)}>Edit link</button></td>
          <td>{job.job_status}</td><td><button className="text-button" disabled={busy} onClick={() => editJob(job)}>Edit job</button><button className="text-button" disabled={busy} onClick={() => setStatus(job)}>{job.job_status === 'active' ? 'Deactivate' : 'Activate'}</button><button className="text-button danger-text" disabled={busy} onClick={() => removeJob(job)}>Delete</button></td>
        </tr>)}</tbody></table></div></section>
        </div></div>
      </>}
    </div>
  );
}
