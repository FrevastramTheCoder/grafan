import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, friendlyError, formatDate } from './api';
import Dialog from './components/Dialog';
import JobCard from './components/JobCard';
import AdminDashboard from './components/AdminDashboard';
import CvBuilder from './components/CvBuilder';
import ApplyApplication from './components/ApplyApplication';
import JobPostingHub from './components/JobPostingHub';
import AdvertisementHub, { AdPreview, PublicAdvertisementPage, PublicBusinessPage } from './components/AdvertisementHub';
import './App.css';

const PAGE_SIZE = 24;
const WORK_MODES = [
  { key: 'all', label: 'All jobs' },
  { key: 'onsite', label: 'On-site' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'remote', label: 'Remote' },
  { key: 'gig', label: 'Contract / gig' },
];

function Notice({ notice, onDismiss }) {
  if (!notice) return null;
  return (
    <div className={`notice notice-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span>{notice.message}</span>
      <button type="button" className="notice-close" aria-label="Dismiss message" onClick={onDismiss}>×</button>
    </div>
  );
}

function LoadingJobs() {
  return <div className="state-panel" role="status"><span className="spinner" aria-hidden="true" /> Loading jobs…</div>;
}

function savedOwnerKey() {
  let key = window.localStorage.getItem('grafanSavedJobsKey');
  if (!key) {
    key = window.crypto?.randomUUID?.() || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem('grafanSavedJobsKey', key);
  }
  return key;
}

function App() {
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [locationText, setLocationText] = useState('');
  const [criteria, setCriteria] = useState({ search: '', location: '' });
  const [totalJobs, setTotalJobs] = useState(0);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [jobsError, setJobsError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [featuredAds, setFeaturedAds] = useState([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [adsInitialView, setAdsInitialView] = useState('browse');
  const [adsInitialCategory, setAdsInitialCategory] = useState('');
  const [savedOwner] = useState(savedOwnerKey);
  const [savedJobs, setSavedJobs] = useState([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [notice, setNotice] = useState(null);
  const requestId = useRef(0);
  const jobsLength = useRef(0);
  const linkedJobHandled = useRef(false);

  const [activeDialog, setActiveDialog] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDetailsLoading, setJobDetailsLoading] = useState(false);
  const [jobDetailsError, setJobDetailsError] = useState('');

  const [coachQuestion, setCoachQuestion] = useState('');
  const [coachSkills, setCoachSkills] = useState('');
  const [coachMessages, setCoachMessages] = useState([]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState('');
  const [matchSkills, setMatchSkills] = useState('');
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [matchResults, setMatchResults] = useState(null);

  const closeDialog = useCallback(() => {
    setActiveDialog(null);
    api.get('/stats').then(({ data }) => { setStats(data); setStatsError(''); }).catch(() => {});
    api.get('/ads', { params: { limit: 6 } }).then(({ data }) => setFeaturedAds((data.advertisements || []).filter(ad => ad.promotion !== 'free').slice(0, 3))).catch(() => {});
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const loadJobs = useCallback(async ({ append = false } = {}) => {
    const id = ++requestId.current;
    const offset = append ? jobsLength.current : 0;
    if (append) setLoadingMore(true);
    else setJobsLoading(true);
    setJobsError('');
    try {
      const { data } = await api.get('/jobs', {
        params: { type: filter, search: criteria.search, location: criteria.location, limit: PAGE_SIZE, offset },
      });
      if (id !== requestId.current) return;
      const rows = Array.isArray(data?.jobs) ? data.jobs : [];
      setJobs(current => {
        const next = append ? [...current, ...rows] : rows;
        jobsLength.current = next.length;
        return next;
      });
      setTotalJobs(Number.isFinite(data?.total) ? data.total : (data?.count || rows.length));
    } catch (error) {
      if (id !== requestId.current) return;
      console.error('Job list request failed', error);
      setJobsError(friendlyError(error, 'We couldn’t load jobs. Check the server connection and try again.'));
      if (!append) {
        jobsLength.current = 0;
        setJobs([]);
      }
    } finally {
      if (id === requestId.current) {
        setJobsLoading(false);
        setLoadingMore(false);
      }
    }
  }, [criteria, filter]);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await api.get('/stats');
      setStats(data);
      setStatsError('');
    } catch (error) {
      console.error('Statistics request failed', error);
      setStatsError(friendlyError(error, 'Job statistics are temporarily unavailable.'));
    }
  }, []);

  const loadSavedJobs = useCallback(async () => {
    try {
      const { data } = await api.get('/saved-jobs', { params: { owner_key: savedOwner } });
      setSavedJobs(data.jobs || []);
    } catch (error) {
      console.error('Saved jobs request failed', error);
      setNotice({ type: 'error', message: friendlyError(error, 'Saved jobs are temporarily unavailable.') });
    }
  }, [savedOwner]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    api.get('/ads', { params: { limit: 6 } }).then(({ data }) => {
      setFeaturedAds((data.advertisements || []).filter(ad => ad.promotion !== 'free').slice(0, 3));
    }).catch(() => setFeaturedAds([]));
  }, []);

  useEffect(() => { loadSavedJobs(); }, [loadSavedJobs]);

  const submitSearch = event => {
    event.preventDefault();
    setCriteria({ search: searchText.trim(), location: locationText.trim() });
  };

  const openJob = useCallback(async job => {
    setSelectedJob(null);
    setJobDetailsError('');
    setJobDetailsLoading(true);
    setActiveDialog('job');
    try {
      const { data } = await api.get(`/jobs/${job.id}`);
      if (!data?.job) throw new Error('Job details were not returned.');
      setSelectedJob(data.job);
    } catch (error) {
      console.error('Job details request failed', error);
      setJobDetailsError(friendlyError(error, 'Job details are unavailable right now.'));
    } finally {
      setJobDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (linkedJobHandled.current) return;
    const linkedId = new URLSearchParams(window.location.search).get('job');
    if (!linkedId || !/^\d+$/.test(linkedId)) { linkedJobHandled.current = true; return; }
    linkedJobHandled.current = true;
    openJob({ id: Number(linkedId) });
  }, [openJob]);

  const handleSaveJob = async job => {
    try {
      await api.post(`/jobs/${job.id}/save`, { owner_key: savedOwner });
      await loadSavedJobs();
      setNotice({ type: 'success', message: 'Job saved in this browser.' });
    } catch (error) {
      setNotice({ type: 'error', message: friendlyError(error, 'This job could not be saved.') });
    }
  };

  const handleShareJob = async job => {
    const url = new URL(window.location.href);
    url.searchParams.set('job', job.id);
    url.hash = '';
    try {
      if (navigator.share) await navigator.share({ title: job.title, text: `${job.title} · ${job.company || 'Grafan'}`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setNotice({ type: 'success', message: 'Job link copied.' }); }
    } catch (error) {
      if (error.name !== 'AbortError') setNotice({ type: 'error', message: 'The job link could not be shared.' });
    }
  };

  const handleApplyNow = job => {
    if (!job || !job.id) {
      setNotice({ type: 'error', message: 'This job cannot be opened for application.' });
      return;
    }
    setSelectedJob(job);
    setActiveDialog('apply');
  };

  const openCvBuilder = job => {
    setSelectedJob(job || null);
    setActiveDialog('cv-builder');
  };

  const sendCoachMessage = async event => {
    event.preventDefault();
    const question = coachQuestion.trim();
    if (coachLoading) return;
    if (!question) {
      setCoachError('Write a question to get career guidance.');
      return;
    }
    setCoachLoading(true);
    setCoachError('');
    setCoachMessages(current => [...current, { role: 'user', text: question }]);
    setCoachQuestion('');
    try {
      const { data } = await api.post('/ai/ask', { question, skills: coachSkills });
      if (!data?.success || !data?.response) throw new Error('The guidance service returned no answer.');
      setCoachMessages(current => [...current, {
        role: 'coach',
        topic: data.topic || 'Career guidance',
        summary: data.summary || data.response,
        nextSteps: Array.isArray(data.next_steps) ? data.next_steps : [],
      }]);
    } catch (error) {
      console.error('Career guidance request failed', error);
      setCoachError(error.response ? friendlyError(error, 'Career guidance is unavailable right now.') : error.message);
    } finally {
      setCoachLoading(false);
    }
  };

  const runSkillMatch = async event => {
    event.preventDefault();
    if (matchLoading) return;
    if (!matchSkills.trim()) {
      setMatchError('Enter one or more skills, separated by commas.');
      return;
    }
    setMatchLoading(true);
    setMatchError('');
    setMatchResults(null);
    try {
      const { data } = await api.post('/jobs/match', { skills: matchSkills.trim() });
      if (!data?.success || !Array.isArray(data.matched_jobs)) throw new Error('The matching service returned an incomplete result.');
      setMatchResults(data);
    } catch (error) {
      console.error('Skill match request failed', error);
      setMatchError(error.response ? friendlyError(error, 'We couldn’t match your skills to jobs.') : error.message);
    } finally {
      setMatchLoading(false);
    }
  };

  const statsCards = useMemo(() => [
    { label: 'Open opportunities', value: stats?.total_jobs ?? '—' },
    { label: 'Remote', value: stats?.jobs_by_type?.remote ?? '—' },
    { label: 'Hybrid', value: stats?.jobs_by_type?.hybrid ?? '—' },
    { label: 'Companies', value: stats?.companies ?? '—' },
    { label: 'Advertisements', value: stats?.advertisements ?? '—' },
  ], [stats]);

  const canLoadMore = !savedOnly && jobs.length < totalJobs;
  const visibleJobs = savedOnly ? savedJobs : jobs;
  const businessRoute = window.location.pathname.match(/^\/business\/([^/]+)\/?$/);
  const advertisementRoute = window.location.pathname.match(/^\/advertisement\/(\d+)\/?$/);
  if (businessRoute) return <PublicBusinessPage slug={decodeURIComponent(businessRoute[1])} />;
  if (advertisementRoute) return <PublicAdvertisementPage id={advertisementRoute[1]} />;

  return (
    <div className="app-shell">
      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
        <a className="brand" href="#top" aria-label="Grafan home">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>grafan</span>
        </a>
        <button className="mobile-menu-toggle" type="button" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(value => !value)}>{mobileNavOpen ? '×' : '☰'}</button>
        <nav className={`site-nav${mobileNavOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <a href="#jobs" onClick={() => { setSavedOnly(false); setMobileNavOpen(false); }}>Jobs</a>
          <button type="button" onClick={() => { setAdsInitialView('browse'); setAdsInitialCategory(''); setActiveDialog('ads'); setMobileNavOpen(false); }}>Advertisements</button>
          <a href="#career-tools" onClick={() => { setSavedOnly(false); setMobileNavOpen(false); }}>Career Tools</a>
          <button type="button" onClick={() => { openCvBuilder(null); setMobileNavOpen(false); }}>CV Builder</button>
          <button type="button" onClick={() => { setSavedOnly(true); loadSavedJobs(); setMobileNavOpen(false); }}>Saved Jobs ({savedJobs.length})</button>
          <button type="button" onClick={() => { setSelectedJob(null); setActiveDialog('profile'); setMobileNavOpen(false); }}>My Profile</button>
          <button type="button" onClick={() => { setActiveDialog('admin'); setMobileNavOpen(false); }}>Admin</button>
        </nav>
        <button className="button button-primary header-post" type="button" onClick={() => { setAdsInitialView('create'); setAdsInitialCategory(''); setActiveDialog('ads'); }}>Post an ad <span aria-hidden="true">＋</span></button>
        <button className="button button-secondary header-post" type="button" onClick={() => { setActiveDialog('post-job'); }}>Post a job <span aria-hidden="true">＋</span></button>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-dot" /> Opportunities across Tanzania</p>
            <h1 id="hero-title">Find your next opportunity <span>in Tanzania.</span></h1>
            <p className="hero-description">Search jobs, discover local businesses and grow your career with practical tools for your next step.</p>
          </div>
          <form className="search-form" role="search" onSubmit={submitSearch}>
            <label className="search-field">
              <span className="field-label">Role, company or keyword</span>
              <input
                type="search"
                value={searchText}
                onChange={event => setSearchText(event.target.value)}
                placeholder="e.g. Accountant, NMB, Python"
                aria-label="Search jobs by role, company or keyword"
              />
            </label>
            <label className="search-field location-field">
              <span className="field-label">Location</span>
              <input
                value={locationText}
                onChange={event => setLocationText(event.target.value)}
                placeholder="Any location in Tanzania"
                aria-label="Filter jobs by location"
              />
            </label>
            <button className="button button-primary search-submit" type="submit">Search jobs <span aria-hidden="true">→</span></button>
          </form>
          <p className="hero-hint">Use a title, employer, skill, or region to narrow the list.</p>
        </section>

        <section className="stats-strip" aria-label="Job platform statistics">
          {statsCards.map(item => (
            <div className="stat-item" key={item.label}>
              <span className="stat-value">{item.value}</span>
              <span className="stat-label">{item.label}</span>
            </div>
          ))}
          {statsError && <span className="stat-error" role="status">Statistics unavailable</span>}
        </section>

        <section className="category-discovery" aria-label="Popular advertisement categories"><div className="category-discovery-heading"><div><p className="eyebrow">Explore Grafan</p><h2>Discover opportunities and businesses</h2></div><button className="text-button" type="button" onClick={() => { setAdsInitialView('browse'); setAdsInitialCategory(''); setActiveDialog('ads'); }}>Browse all advertisements →</button></div><div className="category-chips">{[['jobs','Jobs'],['property','Property'],['products','Products'],['services','Services'],['training-courses','Training'],['events','Events'],['ngo-community','NGO & Community']].map(([key,label]) => <button type="button" key={key} onClick={() => { setAdsInitialView('browse'); setAdsInitialCategory(key); setActiveDialog('ads'); }}>{label}<span aria-hidden="true">↗</span></button>)}</div></section>

        {featuredAds.length > 0 && <section className="featured-ads-section"><div className="category-discovery-heading"><div><p className="eyebrow">Featured & sponsored</p><h2>From businesses on Grafan</h2></div><button className="text-button" type="button" onClick={() => { setAdsInitialView('browse'); setAdsInitialCategory(''); setActiveDialog('ads'); }}>View marketplace →</button></div><div className="featured-ad-grid">{featuredAds.map(ad => <article className="featured-ad-card" key={ad.id} style={{ '--ad-primary': ad.brand_primary || '#176b52', '--ad-secondary': ad.brand_secondary || '#e7f4ee' }}><span className="featured-badge">{ad.promotion}</span><AdPreview data={ad}/><a className="featured-ad-link" href={`/advertisement/${ad.id}`}>View advertisement <span aria-hidden="true">→</span></a></article>)}</div></section>}

        <section className="career-tools" id="career-tools" aria-labelledby="tools-title">
          <div className="section-heading compact-heading">
            <div><p className="eyebrow">Make your next move</p><h2 id="tools-title">Career tools</h2></div>
            <p>Practical help for your search. Matching and guidance use clear, rule-based methods.</p>
          </div>
          <div className="tool-grid">
            <button className="tool-card" type="button" onClick={() => { setMatchResults(null); setMatchError(''); setActiveDialog('match'); }}>
              <span className="tool-icon tool-icon-blue" aria-hidden="true">↗</span>
              <span className="tool-copy"><strong>Match my skills</strong><small>Compare your skills with real job listings</small></span>
              <span className="tool-arrow" aria-hidden="true">→</span>
            </button>
            <button className="tool-card" type="button" onClick={() => openCvBuilder(null)}>
              <span className="tool-icon tool-icon-green" aria-hidden="true">▤</span>
              <span className="tool-copy"><strong>Analyze my CV</strong><small>Extract your profile and get improvement tips</small></span>
              <span className="tool-arrow" aria-hidden="true">→</span>
            </button>
            <button className="tool-card" type="button" onClick={() => { setCoachError(''); setActiveDialog('coach'); }}>
              <span className="tool-icon tool-icon-violet" aria-hidden="true">✳</span>
              <span className="tool-copy"><strong>Career coach</strong><small>Get focused, rule-based career guidance</small></span>
              <span className="tool-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <section className="jobs-section" id="jobs" aria-labelledby="jobs-title">
          <div className="section-heading jobs-heading">
            <div><p className="eyebrow">Made for your next step</p><h2 id="jobs-title">{savedOnly ? 'Saved jobs' : 'Explore jobs'}</h2></div>
            <p className="results-count">{savedOnly ? `${savedJobs.length} saved ${savedJobs.length === 1 ? 'job' : 'jobs'}` : jobsLoading ? 'Finding opportunities…' : `${totalJobs.toLocaleString()} ${totalJobs === 1 ? 'opportunity' : 'opportunities'}`}</p>
          </div>

          <div className="job-controls">
            <div className="filter-list" role="group" aria-label="Filter by work arrangement">
              {WORK_MODES.map(mode => (
                <button
                  key={mode.key}
                  className={`filter-chip${filter === mode.key ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={filter === mode.key}
                  onClick={() => setFilter(mode.key)}
                >{mode.label}</button>
              ))}
            </div>
            {(criteria.search || criteria.location || savedOnly) && (
              <button className="clear-filter" type="button" onClick={() => { if (savedOnly) setSavedOnly(false); setSearchText(''); setLocationText(''); setCriteria({ search: '', location: '' }); }}>
                {savedOnly ? 'Back to jobs' : 'Clear search'}
              </button>
            )}
          </div>

          {!savedOnly && jobsError ? (
            <div className="state-panel state-error" role="alert">
              <span className="state-symbol" aria-hidden="true">!</span><h3>Jobs aren’t available right now</h3><p>{jobsError}</p>
              <button className="button button-outline" type="button" onClick={() => loadJobs()}>Try again</button>
            </div>
          ) : !savedOnly && jobsLoading ? (
            <LoadingJobs />
          ) : visibleJobs.length === 0 ? (
            <div className="state-panel empty-jobs" role="status">
              <span className="state-symbol" aria-hidden="true">⌕</span>
              <h3>{savedOnly ? 'No saved jobs yet' : criteria.search || criteria.location ? 'No jobs match this search' : 'No jobs to show yet'}</h3>
              <p>{savedOnly ? 'Save a listing to keep it here on this browser.' : criteria.search || criteria.location ? 'Try a broader role, skill, or location.' : 'New opportunities will appear here when they are approved for publication.'}</p>
              {(criteria.search || criteria.location) && <button className="button button-outline" type="button" onClick={() => { setSearchText(''); setLocationText(''); setCriteria({ search: '', location: '' }); }}>Clear search</button>}
            </div>
          ) : (
            <>
              <div className="job-grid">
                {visibleJobs.map(job => <div id={`job-${job.id}`} key={job.id}><JobCard job={job} onOpen={openJob} onApply={handleApplyNow} onCreateCv={openCvBuilder} onSave={handleSaveJob} onShare={handleShareJob} isSaved={savedJobs.some(saved => saved.id === job.id)} /></div>)}
              </div>
              {canLoadMore && (
                <div className="load-more-wrap">
                  <button className="button button-outline load-more" type="button" disabled={loadingMore} onClick={() => loadJobs({ append: true })}>
                    {loadingMore ? 'Loading more jobs…' : `Load more (${(totalJobs - jobs.length).toLocaleString()} remaining)`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="site-footer"><a className="brand footer-brand" href="#top"><span className="brand-mark" aria-hidden="true">G</span><span>grafan</span></a><p>Helping Tanzania’s talent find their next opportunity.</p></footer>

      {activeDialog === 'match' && (
        <Dialog title="Match your skills to jobs" onClose={closeDialog} size="large">
          <p className="dialog-intro">Grafan compares listed skills with job titles and descriptions using keyword and synonym rules. A score is a guide, not a hiring decision.</p>
          <form onSubmit={runSkillMatch}>
            <label className="form-field"><span>Your skills</span><textarea rows="3" value={matchSkills} onChange={event => setMatchSkills(event.target.value)} placeholder="Python, Excel, customer service" /></label>
            <button className="button button-primary button-full" type="submit" disabled={matchLoading}>{matchLoading ? 'Comparing jobs…' : 'Find matching jobs'}</button>
          </form>
          {matchError && <p className="form-error" role="alert">{matchError}</p>}
          {matchLoading && <p className="state-inline" role="status"><span className="spinner" aria-hidden="true" /> Comparing your skills with current listings…</p>}
          {matchResults && <MatchResults results={matchResults} />}
        </Dialog>
      )}

      {activeDialog === 'coach' && (
        <Dialog title="Career coach" onClose={closeDialog} size="large">
          <p className="dialog-intro">Topic-based career guidance using prepared rules and suggestions. Responses are not generated by an AI model.</p>
          <label className="form-field"><span>Skills to consider (optional)</span><input value={coachSkills} onChange={event => setCoachSkills(event.target.value)} placeholder="e.g. accounting, Excel" /></label>
          <div className="coach-thread" aria-live="polite">
            {coachMessages.length === 0 && <div className="coach-welcome"><span className="tool-icon tool-icon-violet" aria-hidden="true">✳</span><div><strong>What would you like help with?</strong><p>Try asking about interviews, CV structure, skills, or choosing a career direction.</p></div></div>}
            {coachMessages.map((message, index) => (
              <article className={`coach-message coach-${message.role}`} key={`${message.role}-${index}`}>
                <span className="message-label">{message.role === 'user' ? 'You' : message.topic || 'Career Coach'}</span>
                {message.role === 'user' ? <p>{message.text}</p> : <><p>{message.summary}</p>{message.nextSteps?.length > 0 && <><strong>Suggested next steps</strong><ul>{message.nextSteps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ul></>}</>}
              </article>
            ))}
            {coachLoading && <p className="state-inline" role="status"><span className="spinner" aria-hidden="true" /> Preparing guidance…</p>}
          </div>
          {coachError && <p className="form-error" role="alert">{coachError}</p>}
          <form className="coach-form" onSubmit={sendCoachMessage}><label className="visually-hidden" htmlFor="coach-question">Your question</label><input id="coach-question" value={coachQuestion} onChange={event => setCoachQuestion(event.target.value)} placeholder="Ask about your next career step…" /><button className="button button-primary" type="submit" disabled={coachLoading}>Send</button></form>
        </Dialog>
      )}

      {activeDialog === 'job' && (
        <Dialog title={selectedJob?.title || 'Job details'} onClose={closeDialog} size="large">
          {jobDetailsLoading && <p className="state-inline" role="status"><span className="spinner" aria-hidden="true" /> Loading job details…</p>}
          {jobDetailsError && <p className="form-error" role="alert">{jobDetailsError}</p>}
          {selectedJob && <JobDetails job={selectedJob} onApply={handleApplyNow} onSave={handleSaveJob} onShare={handleShareJob} onCreateCv={openCvBuilder} isSaved={savedJobs.some(saved => saved.id === selectedJob.id)} />}
        </Dialog>
      )}

      {activeDialog === 'apply' && selectedJob && (
        <Dialog title={`Apply: ${selectedJob.title}`} onClose={closeDialog} size="large">
          <ApplyApplication job={selectedJob} onClose={closeDialog} />
        </Dialog>
      )}

      {activeDialog === 'admin' && <Dialog title="Admin dashboard" onClose={closeDialog} size="large"><AdminDashboard onClose={closeDialog} /></Dialog>}

      {activeDialog === 'ads' && <Dialog title="Advertisements and businesses" onClose={closeDialog} size="large"><AdvertisementHub onClose={closeDialog} initialView={adsInitialView} initialCategory={adsInitialCategory} /></Dialog>}
      {activeDialog === 'post-job' && (
        <Dialog title="Post a job" onClose={closeDialog} size="large">
          <JobPostingHub
            onClose={closeDialog}
            onSuccess={() => {
              loadJobs();
              loadStats();
            }}
          />
        </Dialog>
      )}

      {(activeDialog === 'cv-builder' || activeDialog === 'profile') && <Dialog title={activeDialog === 'profile' ? 'My Profile' : 'CV Builder'} onClose={closeDialog} size="large"><CvBuilder job={activeDialog === 'profile' ? null : selectedJob} onClose={closeDialog} /></Dialog>}

    </div>
  );
}

function MatchResults({ results }) {
  return (
    <div className="match-results" aria-live="polite">
      <div className="match-summary"><div><span className="eyebrow">Skills understood</span><strong>{(results.extracted_skills || []).join(', ') || 'No recognized skills'}</strong></div><div><span className="eyebrow">Jobs matched</span><strong>{results.total_matches || 0} of {results.total_jobs || 0}</strong></div></div>
      {results.message && <p className="match-explanation">{results.message}</p>}
      {(results.matched_jobs || []).length === 0 ? <div className="state-panel compact-state"><h3>No matching jobs found</h3><p>{results.message || 'Try adding specific skills used in job descriptions.'}</p></div> : <div className="match-list">{results.matched_jobs.map(job => (
        <article className="match-card" key={job.id}>
          <div className="match-card-heading"><div><h3>{job.jobTitle || job.title}</h3><p>{job.company}</p></div><span className="match-score">{job.matchScore}% match</span></div>
          <p className="match-why">{job.whyMatch || `Matched on ${(job.matchedSkills || []).join(', ') || 'listed skills'}.`}</p>
          {job.matchedSkills?.length > 0 && <p><strong>Matched:</strong> {job.matchedSkills.join(', ')}</p>}
          {job.missingSkills?.length > 0 && <p className="missing-skills"><strong>Not found in listing:</strong> {job.missingSkills.join(', ')}</p>}
          <div className="match-footer">{job.location && <span>{job.location}</span>}{job.salary && <span>{job.salary}</span>}</div>
        </article>
      ))}</div>}
      {(results.recommendations || []).length > 0 && <ul className="recommendation-list">{results.recommendations.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    </div>
  );
}

function JobDetails({ job, onApply, onSave, onShare, onCreateCv, isSaved }) {
  const typeLabel = { onsite: 'On-site', remote: 'Remote', hybrid: 'Hybrid', gig: 'Contract / gig' }[job.job_type] || 'Work type not listed';
  return (
    <div className="job-details">
      <p className="detail-company">{job.company || 'Employer not listed'} <span>·</span> {typeLabel}</p>
      <div className="detail-meta">{job.location && <span>Location: {job.location}</span>}{job.salary && <span>Salary: {job.salary}</span>}{job.posted_date && <span>Posted: {formatDate(job.posted_date)}</span>}</div>
      {job.description && <section><h3>About the job</h3><p className="detail-description">{job.description}</p></section>}
      {job.responsibilities && <section><h3>Responsibilities</h3><p className="detail-description">{job.responsibilities}</p></section>}
      {job.requirements && <section><h3>Requirements</h3><p className="detail-description">{job.requirements}</p></section>}
      {job.qualifications && <section><h3>Qualifications</h3><p className="detail-description">{job.qualifications}</p></section>}
      {job.experience_requirements && <section><h3>Experience</h3><p className="detail-description">{job.experience_requirements}</p></section>}
      {job.skills?.length > 0 && <section><h3>Required skills</h3><div className="job-skills">{job.skills.map(skill => <span className="skill-chip" key={skill}>{skill}</span>)}</div></section>}
      {job.application_deadline && <p><strong>Application deadline:</strong> {job.application_deadline}</p>}
      {job.application_instructions && <section><h3>Application instructions</h3><p className="detail-description">{job.application_instructions}</p></section>}
      <JobMatchCard job={job} />
      <div className="detail-apply detail-actions">
        <button className="button button-primary" type="button" onClick={() => onApply(job)}>Apply Now <span aria-hidden="true">→</span></button>
        <button className="button button-outline" type="button" onClick={() => onCreateCv(job)}>Create CV for this job</button>
        <button className="button button-outline" type="button" onClick={() => onSave(job)} aria-pressed={isSaved}>{isSaved ? 'Saved' : 'Save job'}</button>
        <button className="button button-outline" type="button" onClick={() => onShare(job)}>Share</button>
      </div>
    </div>
  );
}

function JobMatchCard({ job }) {
  const [skills, setSkills] = useState('');
  const [experience, setExperience] = useState('');
  const [education, setEducation] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.post(`/jobs/${job.id}/match`, { skills, experience, education });
      setResult(data);
    } catch (e) {
      setError(friendlyError(e, 'This job could not be matched right now.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="job-match-panel">
      <h3>Check your match</h3>
      <p>Enter your own details. Grafan compares them with fields present in this listing; it does not infer missing qualifications.</p>
      <form className="job-match-form" onSubmit={submit}>
        <label className="form-field">
          <span>Your skills, comma separated</span>
          <input value={skills} onChange={e => setSkills(e.target.value)} placeholder="GIS, Python, PostGIS" />
        </label>
        <label className="form-field">
          <span>Experience (optional)</span>
          <input value={experience} onChange={e => setExperience(e.target.value)} placeholder="e.g. 3 years GIS" />
        </label>
        <label className="form-field">
          <span>Education (optional)</span>
          <input value={education} onChange={e => setEducation(e.target.value)} placeholder="e.g. Bachelor's in GIS" />
        </label>
        <button className="button button-outline" type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Calculate match'}
        </button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {result && (
        <div className="match-breakdown" role="status">
          <p>
            <strong>Skills:</strong> {result.skills_match == null ? 'Not assessed' : `${result.skills_match}%`}
            {' · '}
            <strong>Experience:</strong> {result.experience_match == null ? 'Not enough listing data' : `${result.experience_match}%`}
            {' · '}
            <strong>Education:</strong> {result.education_match == null ? 'Not enough listing data' : `${result.education_match}%`}
          </p>
          {result.overall_match != null && <p><strong>Overall rule-based match: {result.overall_match}%</strong></p>}
          <p>{result.explanation}</p>
          {result.matched_skills?.length > 0 && <p>Matched terms: {result.matched_skills.join(', ')}</p>}
          {result.missing_skills?.length > 0 && <p>Not found in listing: {result.missing_skills.join(', ')}</p>}
        </div>
      )}
    </section>
  );
}

export default App;
