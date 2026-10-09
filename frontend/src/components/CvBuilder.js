import React, { useEffect, useMemo, useState } from 'react';
import { api, friendlyError } from '../api';

const PROFILE_KEY = 'grafanCvProfile';
const PROFILE_ACCESS_KEY = 'grafanProfileAccessKey';
const INITIAL_PROFILE = {
  full_name: '', professional_title: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '', summary: '',
  education: '', experience: '', internships: '', projects: '', skills: '', certifications: '', languages: '', achievements: '', references: '',
  photo_data: '', use_photo: false,
};
const FIELDS = [
  ['full_name', 'Full name', 'text'], ['professional_title', 'Professional title', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'],
  ['location', 'Location', 'text'], ['website', 'Website', 'url'], ['linkedin', 'LinkedIn', 'url'], ['github', 'GitHub', 'url'],
  ['summary', 'Professional summary', 'textarea'], ['experience', 'Work experience (one entry per paragraph)', 'textarea'],
  ['internships', 'Internships', 'textarea'], ['projects', 'Projects', 'textarea'], ['education', 'Education', 'textarea'],
  ['skills', 'Skills (one per line)', 'textarea'], ['certifications', 'Certifications', 'textarea'], ['languages', 'Languages', 'textarea'],
  ['achievements', 'Achievements', 'textarea'], ['references', 'References (optional)', 'textarea'],
];
const TEMPLATES = [
  { id: 'modern', name: 'Modern Professional' }, { id: 'ats', name: 'ATS Professional' }, { id: 'executive', name: 'Executive' },
  { id: 'creative', name: 'Creative Professional' }, { id: 'minimal', name: 'Minimal' },
];

function initialProfile() {
  try { return { ...INITIAL_PROFILE, ...JSON.parse(window.localStorage.getItem(PROFILE_KEY) || '{}') }; }
  catch { return INITIAL_PROFILE; }
}

function profileAccessKey() {
  let key = window.localStorage.getItem(PROFILE_ACCESS_KEY);
  if (!key) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    key = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    window.localStorage.setItem(PROFILE_ACCESS_KEY, key);
  }
  return key;
}

function preparePhoto(dataUrl, x = 50, y = 50) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) return resolve('');
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const left = (image.naturalWidth - side) * (x / 100);
      const top = (image.naturalHeight - side) * (y / 100);
      const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = 700;
      const context = canvas.getContext('2d');
      context.drawImage(image, left, top, side, side, 0, 0, 700, 700);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    image.onerror = reject; image.src = dataUrl;
  });
}

function lines(value) { return String(value || '').split(/\n+/).map(item => item.trim()).filter(Boolean); }

export default function CvBuilder({ job = null, onClose }) {
  const [profile, setProfile] = useState(initialProfile);
  const [template, setTemplate] = useState('ats');
  const [instructions, setInstructions] = useState('');
  const [photoX, setPhotoX] = useState(50);
  const [photoY, setPhotoY] = useState(50);
  const [templates, setTemplates] = useState(TEMPLATES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [aiAvailable, setAiAvailable] = useState(false);

  useEffect(() => { api.get('/cv/templates').then(({ data }) => setTemplates(data.templates || TEMPLATES)).catch(() => {}); }, []);
  useEffect(() => { api.get('/cv/status').then(({ data }) => setAiAvailable(Boolean(data.ai_available))).catch(() => setAiAvailable(false)); }, []);

  const skillList = useMemo(() => lines(profile.skills), [profile.skills]);
  const profileSections = [
    ['summary', 'Professional Summary'], ['experience', 'Experience'], ['internships', 'Internships'], ['projects', 'Projects'],
    ['education', 'Education'], ['skills', 'Skills'], ['certifications', 'Certifications'], ['languages', 'Languages'],
    ['achievements', 'Achievements'], ['references', 'References'],
  ].map(([key, label]) => ({ key, label, items: lines(profile[key]) })).filter(section => section.items.length);

  const update = (key, value) => setProfile(previous => ({ ...previous, [key]: value }));
  const saveProfile = () => {
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      setNotice('Profile saved in this browser only.'); setError('');
    } catch { setError('This browser could not save the profile. Reduce the photo size and try again.'); }
  };

  const syncProfileToServer = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.post('/profile', { profile }, { headers: { 'X-Profile-Key': profileAccessKey() } });
      setNotice('Profile synced to the Grafan server. Anyone with this browser’s private profile key can access it.');
    } catch (e) { setError(friendlyError(e, 'The profile could not be synced.')); }
    finally { setBusy(false); }
  };

  const loadProfileFromServer = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await api.get('/profile', { headers: { 'X-Profile-Key': profileAccessKey() } });
      if (!data.profile) { setNotice('No server profile exists for this browser yet.'); return; }
      setProfile(previous => ({ ...previous, ...data.profile }));
      setNotice('Profile loaded from the Grafan server. Review it before use.');
    } catch (e) { setError(friendlyError(e, 'The profile could not be loaded.')); }
    finally { setBusy(false); }
  };

  const uploadCv = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setError(''); setNotice(''); setUploadName(file.name);
    try {
      const form = new FormData(); form.append('file', file);
      const { data } = await api.post('/cv/analyze', form);
      if (!data.success || !data.extracted) throw new Error('The analyzer returned no profile data.');
      const found = data.extracted;
      setProfile(previous => ({ ...previous,
        full_name: found.name && found.name !== 'Not detected' ? found.name : previous.full_name,
        email: found.email && found.email !== 'Not detected' ? found.email : previous.email,
        phone: found.phone && found.phone !== 'Not detected' ? found.phone : previous.phone,
        skills: (found.skills || []).join('\n') || previous.skills,
        experience: (found.experience || []).join('\n') || previous.experience,
        education: (found.education || []).join('\n') || previous.education,
      }));
      setNotice('CV analyzed. Review each extracted field for accuracy before saving or exporting.');
    } catch (e) { setError(e.response ? friendlyError(e, 'We could not analyze this CV.') : e.message); }
    finally { setBusy(false); event.target.value = ''; }
  };

  const uploadPhoto = event => {
    const file = event.target.files?.[0]; if (!file) return;
    setError(''); setNotice('');
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      setError('Choose a JPG or PNG image no larger than 3 MB.'); event.target.value = ''; return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth < 80 || image.naturalHeight < 80 || image.naturalWidth > 4000 || image.naturalHeight > 4000) {
          setError('Image dimensions must be between 80 and 4000 pixels.'); return;
        }
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        update('photo_data', canvas.toDataURL('image/jpeg', 0.86));
        setNotice('Photo loaded. Adjust the crop or choose not to include it.');
      };
      image.onerror = () => setError('This image could not be read.'); image.src = reader.result;
    };
    reader.onerror = () => setError('This image could not be read.'); reader.readAsDataURL(file); event.target.value = '';
  };

  const exportFile = async format => {
    if (!profile.full_name.trim()) { setError('Enter your name before exporting.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const photo = profile.use_photo && template !== 'ats' ? await preparePhoto(profile.photo_data, photoX, photoY) : '';
      const response = await api.post('/cv/export', {
        profile: { ...profile, photo_data: '' }, template, format, include_photo: Boolean(photo), photo_base64: photo,
        target_job: job ? { title: job.title, company: job.company } : null,
      }, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement('a'); anchor.href = blobUrl; anchor.download = `grafan-cv.${format}`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(blobUrl);
      setNotice(`${format.toUpperCase()} CV downloaded.`);
    } catch (e) {
      if (e.response?.data instanceof Blob) {
        try { const payload = JSON.parse(await e.response.data.text()); setError(payload.detail || 'CV export failed.'); }
        catch { setError('CV export failed.'); }
      } else setError(friendlyError(e, 'CV export failed.'));
    } finally { setBusy(false); }
  };

  const requestAi = async route => {
    setBusy(true); setError(''); setNotice('');
    try {
      const aiProfile = { ...profile, photo_data: '' };
      const { data } = await api.post(`/cv/${route}`, { profile: aiProfile, job: job || null, instructions, existing_cv: aiProfile });
      if (data.profile) setProfile(previous => ({ ...previous, ...data.profile }));
      setNotice(data.message || 'AI update completed. Review the result for accuracy.');
    } catch (e) { setError(friendlyError(e, 'AI CV tools are unavailable until a server-side provider is configured.')); }
    finally { setBusy(false); }
  };

  return (
    <div className="cv-builder">
      <div className="cv-builder-heading"><div><p className="eyebrow">Your information stays in this browser</p><h2>{job ? `CV for ${job.title}` : 'CV Builder'}</h2><p>Only use details that are accurate and yours. Grafan will not add unverified qualifications or experience.</p></div>{onClose && <button type="button" className="icon-button" onClick={onClose} aria-label="Close CV builder">×</button>}</div>
      <div className="cv-builder-grid">
        <section className="cv-editor" aria-label="Edit your CV profile">
          <div className="cv-import"><label className="upload-panel"><strong>{busy ? 'Working…' : 'Analyze an existing CV'}</strong><small>PDF or DOCX · up to 10 MB</small><input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={uploadCv} disabled={busy}/></label>{uploadName && <small>Last file: {uploadName}</small>}</div>
          <div className="cv-private-note">By default, your profile and photo stay in this browser. CV analysis, AI actions, exports, and server sync send the relevant information to the Grafan server. {aiAvailable ? 'AI drafts are sent to the configured OpenAI provider; review all generated text.' : 'AI features are disabled until the server is configured.'}</div>
          <div className="cv-fields-grid">{FIELDS.map(([key, label, type]) => <label className={`form-field ${type === 'textarea' ? 'cv-wide' : ''}`} key={key}><span>{label}</span>{type === 'textarea' ? <textarea rows={key === 'summary' ? 3 : 4} value={profile[key]} onChange={e => update(key, e.target.value)} /> : <input type={type} value={profile[key]} onChange={e => update(key, e.target.value)} />}</label>)}</div>
          <section className="cv-photo-editor"><h3>Profile photo (optional)</h3><p>JPG or PNG, at least 80 × 80 and no larger than 4000 × 4000 pixels or 3 MB.</p><input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={uploadPhoto} aria-label="Upload profile photo"/>
            {profile.photo_data && <><div className="cv-photo-controls"><label>Crop horizontally <input type="range" min="0" max="100" value={photoX} onChange={e => setPhotoX(Number(e.target.value))}/></label><label>Crop vertically <input type="range" min="0" max="100" value={photoY} onChange={e => setPhotoY(Number(e.target.value))}/></label><label><input type="checkbox" checked={profile.use_photo} onChange={e => update('use_photo', e.target.checked)}/> Use photo in supported templates</label><button type="button" className="text-button" onClick={() => { update('photo_data', ''); update('use_photo', false); }}>Remove photo</button></div><img className="cv-photo-preview" src={profile.photo_data} alt="CV profile preview" style={{ objectPosition: `${photoX}% ${photoY}%` }}/></>}
          </section>
          <label className="form-field cv-ai-instructions"><span>Instructions for AI tailoring</span><textarea rows="3" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="For example: focus on GIS and use professional British English." disabled={!aiAvailable}/></label>
          <div className="cv-button-row"><button className="button button-outline" type="button" onClick={saveProfile}>Save profile in this browser</button><button className="button button-outline" type="button" disabled={busy} onClick={syncProfileToServer}>Sync profile to server</button><button className="button button-outline" type="button" disabled={busy} onClick={loadProfileFromServer}>Load server profile</button><button className="button button-outline" type="button" disabled={busy || !aiAvailable} onClick={() => requestAi(job ? 'tailor' : 'generate')}>{busy ? 'Working…' : job ? 'AI tailor for this job' : 'AI improve my CV'}</button><button className="button button-outline" type="button" disabled={busy || !aiAvailable} onClick={() => requestAi('instruct')}>Apply instructions</button><button className="button button-primary" type="button" disabled={busy} onClick={() => exportFile('pdf')}>Download PDF</button><button className="button button-outline" type="button" disabled={busy} onClick={() => exportFile('docx')}>Download DOCX</button></div>
          {!aiAvailable && <p className="form-hint">AI tailoring is disabled until a real server-side provider is configured. The profile-based builder and exports do not invent facts.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="inline-feedback feedback-success" role="status">{notice}</p>}
        </section>
        <section className="cv-preview-panel" aria-label="Live CV preview"><div className="cv-preview-controls"><label>Template<select value={template} onChange={e => setTemplate(e.target.value)}>{templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          <article className={`cv-preview cv-template-${template}`}>
            {profile.use_photo && profile.photo_data && template !== 'ats' && <img className="cv-preview-photo" src={profile.photo_data} alt="" style={{ objectPosition: `${photoX}% ${photoY}%` }}/>} 
            <header><h1>{profile.full_name || 'Your name'}</h1><p className="cv-preview-title">{profile.professional_title || 'Professional title'}</p><p className="cv-preview-contact">{[profile.email, profile.phone, profile.location, profile.website, profile.linkedin, profile.github].filter(Boolean).join(' · ') || 'Contact details appear here when added'}</p></header>
            {job && <p className="cv-target-role">Target role: {job.title}{job.company ? ` · ${job.company}` : ''}</p>}
            {profileSections.map(section => <section key={section.key}><h2>{section.label}</h2>{section.key === 'skills' ? <div className="cv-preview-skills">{skillList.map(skill => <span key={skill}>{skill}</span>)}</div> : section.items.map((item, index) => <p key={`${section.key}-${index}`}>{item}</p>)}</section>)}
            {!profileSections.length && <p className="cv-preview-empty">Add profile details to preview your CV. Only entered information will appear.</p>}
          </article>
        </section>
      </div>
    </div>
  );
}
