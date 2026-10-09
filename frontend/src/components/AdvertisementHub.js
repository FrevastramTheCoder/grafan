import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, API_BASE_URL, friendlyError } from '../api';

const CATEGORIES = [
  ['jobs', 'Jobs'], ['property', 'Property'], ['land', 'Land'], ['vehicles', 'Vehicles'], ['products', 'Products'], ['services', 'Services'],
  ['training-courses', 'Training / Courses'], ['events', 'Events'], ['business-promotion', 'Business Promotion'], ['ngo-community', 'NGO / Community Opportunities'], ['freelance', 'Freelance'], ['other', 'Other'],
];
const TEMPLATES = ['Modern', 'Professional', 'Corporate', 'Creative', 'Minimal', 'Business', 'Product', 'Property', 'Job', 'Event'];
const CTAS = ['Contact Us', 'WhatsApp Us', 'Apply Now', 'Buy Now', 'Register Now', 'Learn More', 'Book Now', 'Call Now', 'Visit Website'];
const KEY_NAME = 'grafanAdvertiserKey';
function getOwnerKey() {
  let key = window.localStorage.getItem(KEY_NAME);
  if (!key) { const bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes); key = [...bytes].map(x => x.toString(16).padStart(2, '0')).join(''); window.localStorage.setItem(KEY_NAME, key); }
  return key;
}
const ownerConfig = key => ({ headers: { 'X-Profile-Key': key } });
const blank = { title: '', description: '', category: 'products', location: '', price: '', salary: '', images: [], contact_phone: '', whatsapp: '', email: '', website: '', social_links: {}, deadline: '', expires_at: '', details: '', business_name: '', logo: '', cover_image: '', tagline: '', brand_primary: '#12664f', brand_secondary: '#e5f2ec', template: 'Modern', cta: 'Contact Us', cta_url: '', promotion: 'free' };

function ctaTarget(ad) {
  const rawPhone = String(ad.whatsapp || ad.contact_phone || '').replace(/\D/g, '');
  const phone = rawPhone.startsWith('0') ? `255${rawPhone.slice(1)}` : rawPhone;
  const value = ad.cta_url || (
    ad.cta === 'Visit Website' ? ad.website
      : ad.cta === 'WhatsApp Us' && phone ? `https://wa.me/${phone}`
        : ad.cta === 'Call Now' && ad.contact_phone ? `tel:${ad.contact_phone}`
          : ad.cta === 'Contact Us' ? (ad.email ? `mailto:${ad.email}` : ad.contact_phone ? `tel:${ad.contact_phone}` : '')
            : ''
  );
  if (/^(mailto:|tel:)/i.test(value)) return value;
  return /^https?:\/\//i.test(value || '') ? value : '';
}
function sendAdEvent(adId, eventType) {
  const url = `${API_BASE_URL}/ads/${encodeURIComponent(adId)}/track/${encodeURIComponent(eventType)}`;
  if (navigator.sendBeacon) navigator.sendBeacon(url, '');
  else fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
}

function ImageField({ label, value, onChange, multiple = false }) {
  const select = async event => {
    const files = Array.from(event.target.files || []).slice(0, multiple ? 8 : 1);
    const data = await Promise.all(files.map(file => new Promise((resolve, reject) => {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) { reject(new Error('Use PNG, JPEG, or WebP images up to 2 MB each.')); return; }
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The selected image could not be read.')); reader.readAsDataURL(file);
    })));
    onChange(multiple ? [...(value || []), ...data].slice(0, 8) : data[0]); event.target.value = '';
  };
  return <label className="ad-field"><span>{label}</span><input type="file" accept="image/png,image/jpeg,image/webp" multiple={multiple} onChange={e => select(e).catch(err => window.alert(err.message))}/>{(multiple ? value : value ? [value] : []).map((img, index) => <img className="ad-upload-preview" src={img} alt={`${label} preview ${index + 1}`} key={index}/>)}</label>;
}

export function AdPreview({ data }) {
  return <article className={`ad-preview template-${String(data.template || 'modern').toLowerCase()}`} style={{ '--ad-primary': data.brand_primary || '#12664f', '--ad-secondary': data.brand_secondary || '#e5f2ec' }}>
    {data.cover_image && <img className="ad-preview-cover" src={data.cover_image} alt="Advertisement cover"/>}
    <div className="ad-preview-inner">{data.promotion && data.promotion !== 'free' && <span className="ad-promotion-badge">{data.promotion}</span>}{data.logo && <img className="ad-preview-logo" src={data.logo} alt="Brand logo"/>}<p className="ad-preview-category">{CATEGORIES.find(([v]) => v === data.category)?.[1] || data.category}</p><h3>{data.title || 'Your advertisement title'}</h3>
      {data.business_name && <p className="ad-preview-brand">{data.business_name}{data.tagline ? ` · ${data.tagline}` : ''}</p>}
      <p>{data.description || 'Your description will appear here.'}</p>{(data.location || data.price || data.salary) && <small>{[data.location, data.price || data.salary].filter(Boolean).join(' · ')}</small>}
      {data.images?.length > 0 && <div className="ad-preview-images">{data.images.slice(0, 3).map((image, i) => <img src={image} alt={`Advertisement ${i + 1}`} key={i}/>)}</div>}
      <button type="button" className="ad-cta-preview">{data.cta}</button>
    </div>
  </article>;
}

export default function AdvertisementHub({ onClose, initialView = 'browse', initialCategory = '' }) {
  const [owner] = useState(getOwnerKey);
  const [form, setForm] = useState(() => ({ ...blank, ...(initialCategory ? { category: initialCategory } : {}) }));
  const [business, setBusiness] = useState(null);
  const [ads, setAds] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [view, setView] = useState(initialView);
  const [step, setStep] = useState(0);
  const [browseCategory, setBrowseCategory] = useState(initialCategory);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [businessDraft, setBusinessDraft] = useState({ name: '', description: '', tagline: '', phone: '', whatsapp: '', email: '', website: '', linkedin: '', facebook: '', instagram: '', x: '', location: '', logo: '', brand_primary: '#12664f', brand_secondary: '#e5f2ec' });
  const auth = ownerConfig(owner);
  const categoryFields = useMemo(() => ({ jobs: ['salary', 'deadline', 'job details'], property: ['price', 'property details'], land: ['price', 'land details'], vehicles: ['price', 'vehicle details'], products: ['price', 'product details'], services: ['price', 'service details'], 'training-courses': ['price', 'course details', 'deadline'], events: ['price', 'event details', 'deadline'], freelance: ['price', 'project details', 'deadline'] }[form.category] || ['price', 'additional details']), [form.category]);

  const load = useCallback(async () => {
    const config = ownerConfig(owner);
    const [mine, biz, listing] = await Promise.all([api.get('/ads/mine', config), api.get('/business/me', config), api.get('/ads')]);
    setAds(mine.data.advertisements || []); setBusiness(biz.data.business); setDirectory(listing.data.advertisements || []);
    if (biz.data.business) setBusinessDraft(current => ({ ...current, ...biz.data.business }));
  }, [owner]);
  useEffect(() => { load().catch(e => setError(friendlyError(e, 'Advertisements could not be loaded.'))); }, [load]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const useBusiness = () => {
    if (!business) { setError('Save your business profile first.'); return; }
    setForm(current => ({ ...current, business_id: business.id, business_name: business.name, logo: business.logo || '', cover_image: business.cover_image || '', tagline: business.tagline || '', contact_phone: business.phone || '', whatsapp: business.whatsapp || '', email: business.email || '', website: business.website || '', brand_primary: business.brand_primary || '#12664f', brand_secondary: business.brand_secondary || '#e5f2ec' }));
    setError(''); setNotice('Business branding and contact details added to the preview.');
  };
  const saveBusiness = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { const { data } = await api.post('/business/me', { profile: businessDraft }, auth); setBusiness(data.business); setNotice(`Business profile saved. Public page: /business/${data.business.slug}`); }
    catch (e) { setError(friendlyError(e, 'Business profile could not be saved.')); } finally { setBusy(false); }
  };
  const saveAd = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = { advertisement: form };
      const submitAfterSave = event.nativeEvent.submitter?.value === 'submit';
      const response = editing ? await api.put(`/ads/${editing}`, body, auth) : await api.post('/ads', body, auth);
      const id = response.data.advertisement.id;
      setEditing(id); setForm(response.data.advertisement);
      if (submitAfterSave) { await api.post(`/ads/${id}/submit`, {}, auth); await load(); setView('mine'); setNotice('Advertisement submitted for admin review.'); }
      else { await load(); setNotice('Draft saved. Review the preview before submitting it.'); }
    } catch (e) { setError(friendlyError(e, 'Advertisement could not be saved.')); } finally { setBusy(false); }
  };
  const doAction = async (ad, action) => {
    setBusy(true); setError('');
    try {
      if (action === 'submit') await api.post(`/ads/${ad.id}/submit`, {}, auth);
      else await api.post(`/ads/${ad.id}/actions/${action}`, {}, auth);
      await load(); setNotice(`Advertisement ${action === 'submit' ? 'submitted for review' : `${action}d`}.`);
    } catch (e) { setError(friendlyError(e, 'That action could not be completed.')); } finally { setBusy(false); }
  };
  const selectEdit = ad => { setForm({ ...blank, ...ad }); setEditing(ad.id); setStep(1); setView('create'); };
  const track = async (ad, event) => { try { await api.post(`/ads/${ad.id}/track/${event}`); } catch (_) {} };
  const ctaHref = ad => {
    return ctaTarget(ad);
  };
  const nextStep = () => {
    if (step === 1 && (!form.title.trim() || !form.description.trim())) { setError('Add a title and description before continuing.'); return; }
    setError(''); setStep(value => Math.min(3,value+1));
  };

  return <div className="advertisement-hub">
    <div className="ad-hub-heading"><div><p className="eyebrow">Grafan marketplace</p><h2>Advertisements & business branding</h2></div><button className="icon-button" onClick={onClose} aria-label="Close advertisements">×</button></div>
    <div className="ad-hub-tabs">{[['browse', 'Explore'], ['create', 'Post Advertisement'], ['mine', 'My Advertisements'], ['business', 'My Business']].map(([key, label]) => <button type="button" className={view === key ? 'is-active' : ''} onClick={() => { setView(key); if (key === 'create') setStep(0); setError(''); }} key={key}>{label}</button>)}</div>
    {error && <p role="alert" className="form-error">{error}</p>}{notice && <p role="status" className="ad-notice">{notice}</p>}
    {(view === 'browse' || String(view).startsWith('detail-')) && <section className="ad-directory"><div className="ad-directory-heading"><div><p className="eyebrow">Grafan marketplace</p><h3>Published advertisements</h3></div><label className="category-filter"><span className="visually-hidden">Filter advertisements by category</span><select value={browseCategory} onChange={e => setBrowseCategory(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{directory.filter(ad => !browseCategory || ad.category === browseCategory).length ? <div className="ad-directory-grid">{directory.filter(ad => !browseCategory || ad.category === browseCategory).map(ad => <article className="ad-listing" key={ad.id}><AdPreview data={ad}/><div className="ad-directory-actions"><a href={`/advertisement/${ad.id}`} onClick={e => { e.preventDefault(); track(ad, 'view'); setView(`detail-${ad.id}`); }}>View advertisement</a><button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/advertisement/${ad.id}`); track(ad, 'share'); setNotice('Advertisement link copied.'); }}>Share</button><button onClick={() => { track(ad, 'save'); setNotice('Saved to your advertisement activity.'); }}>Save</button></div></article>)}</div> : <div className="ad-empty-state"><span aria-hidden="true">◇</span><h3>{browseCategory ? 'No ads in this category yet' : 'No advertisements published yet'}</h3><p>Approved and published offers will show here.</p><button className="button button-primary" onClick={() => { setView('create'); setStep(0); }}>Post the first advertisement</button></div>}
      {String(view).startsWith('detail-') && (() => { const ad = directory.find(item => item.id === Number(view.slice(7))); if (!ad) return null; const href = ctaHref(ad); return <div className="ad-detail"><button className="text-button" onClick={() => setView('browse')}>← Back to ads</button><AdPreview data={ad}/><p>{ad.location}</p>{ad.details && <p>{ad.details}</p>}{ad.job_id && <p><a href={`/?job=${ad.job_id}`}>View full job details, CV tools, and skills match →</a></p>}{href ? <a className="button button-primary" href={href} target={/^https?:/i.test(href) ? '_blank' : undefined} rel="noopener noreferrer" onClick={() => track(ad, /wa\.me/.test(href) ? 'whatsapp' : /^tel:/.test(href) ? 'phone' : ad.category === 'jobs' ? 'application' : 'cta')}>{ad.cta}</a> : <p>Contact details were not provided for this action.</p>}</div>; })()}
    </section>}
    {view === 'create' && <form className="ad-builder" onSubmit={saveAd}>
      <div className="ad-builder-form">
        <div className="ad-stepper" aria-label="Advertisement creation progress">{['Choose category','Add details','Images & branding','Preview & submit'].map((label,index) => <div className={`ad-step${step===index?' is-current':''}${step>index?' is-done':''}`} key={label}><span>{step>index?'✓':index+1}</span><strong>{label}</strong></div>)}</div>
        {step===0 && <section className="ad-step-panel"><p className="eyebrow">Step 1 of 4</p><h3>What are you advertising?</h3><p>Choose a category to get a focused set of relevant fields.</p><div className="ad-category-choices">{CATEGORIES.map(([value,label]) => <button type="button" className={form.category===value?'is-selected':''} key={value} onClick={() => set('category',value)}><span aria-hidden="true">{({jobs:'↗',property:'⌂',land:'▱',vehicles:'◈',products:'◇',services:'✳','training-courses':'▤',events:'◷','business-promotion':'◉','ngo-community':'♡',freelance:'⌘',other:'＋'})[value]}</span>{label}</button>)}</div></section>}
        {step===1 && <section className="ad-step-panel"><p className="eyebrow">Step 2 of 4 · {CATEGORIES.find(([key])=>key===form.category)?.[1]}</p><h3>Tell people what they need to know</h3><div className="ad-form-grid">
          <label className="ad-field ad-field-wide"><span>Title</span><input required maxLength="200" value={form.title} onChange={e => set('title',e.target.value)}/></label>
          <label className="ad-field ad-field-wide"><span>Description</span><textarea required rows="4" maxLength="12000" value={form.description} onChange={e => set('description',e.target.value)}/></label>
          <label className="ad-field"><span>Location</span><input value={form.location} onChange={e => set('location',e.target.value)}/></label>
          {categoryFields.some(f=>f.includes('price')) && <label className="ad-field"><span>Price / salary</span><input value={form.price||form.salary} onChange={e=>{set('price',e.target.value);if(form.category==='jobs')set('salary',e.target.value);}}/></label>}
          {categoryFields.some(f=>f.includes('details')) && <label className="ad-field ad-field-wide"><span>{categoryFields.find(f=>f.includes('details'))}</span><textarea rows="3" value={form.details} onChange={e=>set('details',e.target.value)}/></label>}
          {form.category==='jobs' && <><label className="ad-field"><span>Work arrangement</span><select value={form.job_type||'onsite'} onChange={e=>set('job_type',e.target.value)}><option value="onsite">On-site</option><option value="hybrid">Hybrid</option><option value="remote">Remote</option><option value="gig">Contract / gig</option></select></label><label className="ad-field"><span>Job sector</span><select value={form.job_sector||''} onChange={e=>set('job_sector',e.target.value)}><option value="">Select sector</option>{['HIV/AIDS','Health','ICT','Finance','Education','Agriculture','Other'].map(x=><option key={x}>{x}</option>)}</select></label><label className="ad-field"><span>Required skills</span><input value={form.required_skills||''} onChange={e=>set('required_skills',e.target.value)}/></label><label className="ad-field"><span>Experience requirements</span><input value={form.experience_requirements||''} onChange={e=>set('experience_requirements',e.target.value)}/></label><label className="ad-field"><span>Qualifications</span><input value={form.qualifications||''} onChange={e=>set('qualifications',e.target.value)}/></label><label className="ad-field ad-field-wide"><span>Responsibilities</span><textarea rows="3" value={form.responsibilities||''} onChange={e=>set('responsibilities',e.target.value)}/></label><label className="ad-field ad-field-wide"><span>Application instructions</span><textarea rows="2" value={form.application_instructions||''} onChange={e=>set('application_instructions',e.target.value)}/></label></>}
          <label className="ad-field"><span>Contact phone</span><input type="tel" value={form.contact_phone} onChange={e=>set('contact_phone',e.target.value)}/></label><label className="ad-field"><span>WhatsApp number</span><input type="tel" value={form.whatsapp} onChange={e=>set('whatsapp',e.target.value)}/></label><label className="ad-field"><span>Email</span><input type="email" value={form.email} onChange={e=>set('email',e.target.value)}/></label><label className="ad-field"><span>Website</span><input type="url" placeholder="https://" value={form.website} onChange={e=>set('website',e.target.value)}/></label><label className="ad-field"><span>CTA button</span><select value={form.cta} onChange={e=>set('cta',e.target.value)}>{CTAS.map(cta=><option key={cta}>{cta}</option>)}</select></label><label className="ad-field"><span>CTA destination (optional)</span><input type="url" placeholder="https://" value={form.cta_url} onChange={e=>set('cta_url',e.target.value)}/></label>
          <label className="ad-field"><span>Deadline (optional)</span><input type="date" value={form.deadline} onChange={e=>set('deadline',e.target.value)}/></label><label className="ad-field"><span>Publication expiry</span><input type="date" value={String(form.expires_at||'').slice(0,10)} onChange={e=>set('expires_at',e.target.value)}/></label>
        </div></section>}
        {step===2 && <section className="ad-step-panel"><p className="eyebrow">Step 3 of 4</p><h3>Make the advertisement yours</h3><p>Use your saved business brand or customize this advertisement on its own.</p><div className="ad-builder-actions"><button type="button" className="button button-outline" onClick={useBusiness}>Use My Business Profile</button></div><div className="ad-form-grid"><label className="ad-field"><span>Business / organization name</span><input value={form.business_name} onChange={e=>set('business_name',e.target.value)}/></label><label className="ad-field"><span>Tagline</span><input value={form.tagline} onChange={e=>set('tagline',e.target.value)}/></label><label className="ad-field"><span>Template</span><select value={form.template} onChange={e=>set('template',e.target.value)}>{TEMPLATES.map(t=><option key={t}>{t}</option>)}</select></label><label className="ad-field"><span>Promotion</span><select value={form.promotion} onChange={e=>set('promotion',e.target.value)}>{['free','featured','sponsored','premium','urgent'].map(x=><option key={x} value={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select></label><label className="ad-field"><span>Primary brand color</span><input type="color" value={form.brand_primary} onChange={e=>set('brand_primary',e.target.value)}/></label><label className="ad-field"><span>Secondary brand color</span><input type="color" value={form.brand_secondary} onChange={e=>set('brand_secondary',e.target.value)}/></label><label className="ad-field ad-field-wide"><span>Social links (comma-separated URLs)</span><input value={Object.values(form.social_links||{}).join(', ')} onChange={e=>set('social_links',e.target.value.split(',').map(x=>x.trim()).filter(Boolean))}/></label><ImageField label="Logo" value={form.logo} onChange={v=>set('logo',v)}/><ImageField label="Cover image" value={form.cover_image} onChange={v=>set('cover_image',v)}/><ImageField label="Advertisement images" multiple value={form.images} onChange={v=>set('images',v)}/></div></section>}
        {step===3 && <section className="ad-step-panel ad-final-preview"><p className="eyebrow">Step 4 of 4</p><h3>Review your advertisement</h3><p>Check the details and branding before saving or sending it to the review queue.</p><AdPreview data={form}/><p className="ad-review-meta">{CATEGORIES.find(([key])=>key===form.category)?.[1]}{form.location?` · ${form.location}`:''}{form.price||form.salary?` · ${form.price||form.salary}`:''}</p></section>}
        <div className="ad-builder-actions ad-step-actions">{step>0 && <button type="button" className="button button-outline" onClick={()=>setStep(value=>Math.max(0,value-1))}>← Back</button>}{step<3 && <button type="button" className="button button-primary" onClick={nextStep}>Continue <span aria-hidden="true">→</span></button>}{step===3 && <><button type="submit" value="draft" className="button button-outline" disabled={busy}>{busy?'Saving…':'Save Draft'}</button><button type="submit" value="submit" className="button button-primary" disabled={busy}>{busy?'Submitting…':'Submit for Review'}</button></>}</div>
      </div>
      {step===2 && <aside className="ad-live-preview"><h3>Live preview</h3><AdPreview data={form}/></aside>}
    </form>}
    {view === 'mine' && <section className="my-ads"><div className="ad-counts"><div><strong>{ads.length}</strong><span>Total</span></div>{['published','pending','rejected','expired'].map(key => <div key={key}><strong>{ads.filter(a => a.status === key || (key === 'expired' && a.status === 'published' && a.expires_at && new Date(a.expires_at) <= new Date())).length}</strong><span>{key}</span></div>)}</div>
      {ads.length ? ads.map(ad => <article className="my-ad-row" key={ad.id}><div><strong>{ad.title}</strong><span>{ad.category} · {ad.status}</span>{ad.rejection_reason && <small className="form-error">Review note: {ad.rejection_reason}</small>}<small>Views {ad.analytics?.view || 0} · CTA {ad.analytics?.cta || 0} · WhatsApp {ad.analytics?.whatsapp || 0} · Phone {ad.analytics?.phone || 0} · Website / applications {(ad.analytics?.website || 0)+(ad.analytics?.application || 0)} · Shares {ad.analytics?.share || 0}</small></div><div className="my-ad-actions">{['draft','rejected'].includes(ad.status) && <><button className="text-button" onClick={() => selectEdit(ad)}>Edit</button><button className="text-button" onClick={() => doAction(ad,'submit')}>Submit</button></>}<button className="text-button" onClick={() => doAction(ad,'duplicate')}>Duplicate</button>{ad.status === 'published' && <><a href={`/advertisement/${ad.id}`} target="_blank" rel="noreferrer">View</a><button className="text-button" onClick={() => doAction(ad,'close')}>Close</button></>}<button className="text-button danger-text" onClick={() => doAction(ad,'delete')}>Delete</button></div></article>) : <p>You have not created any advertisements yet.</p>}</section>}
    {view === 'business' && <form className="business-form" onSubmit={saveBusiness}><h3>Reusable business profile</h3><p>Save this once and apply the contact and brand details to future advertisements.</p><div className="ad-form-grid">{[['name','Business / organization name'],['tagline','Tagline'],['phone','Phone'],['whatsapp','WhatsApp'],['email','Email'],['website','Website'],['linkedin','LinkedIn'],['facebook','Facebook'],['instagram','Instagram'],['x','X'],['location','Location'],['brand_primary','Primary color'],['brand_secondary','Secondary color']].map(([key,label]) => <label className="ad-field" key={key}><span>{label}</span><input type={key.startsWith('brand_') ? 'color' : key==='email' ? 'email' : 'text'} value={businessDraft[key] || ''} onChange={e => setBusinessDraft(v => ({...v,[key]:e.target.value}))}/></label>)}<label className="ad-field ad-field-wide"><span>Description</span><textarea rows="3" value={businessDraft.description || ''} onChange={e => setBusinessDraft(v => ({...v,description:e.target.value}))}/></label><ImageField label="Business logo" value={businessDraft.logo} onChange={v => setBusinessDraft(x => ({...x,logo:v}))}/><ImageField label="Cover image" value={businessDraft.cover_image} onChange={v => setBusinessDraft(x => ({...x,cover_image:v}))}/></div><button className="button button-primary" disabled={busy}>{busy?'Saving…':'Save Business Profile'}</button>{business?.slug && <p>Public page: <a href={`/business/${business.slug}`} target="_blank" rel="noreferrer">/business/{business.slug}</a></p>}</form>}
  </div>;
}

export function PublicBusinessPage({ slug }) {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api.get(`/business/${encodeURIComponent(slug)}`).then(r => setData(r.data)).catch(e => setError(friendlyError(e, 'Business page could not be loaded.'))); }, [slug]);
  if (error) return <main className="public-business"><h1>Business page unavailable</h1><p>{error}</p></main>;
  if (!data) return <main className="public-business"><p>Loading business…</p></main>;
  const socials = ['linkedin','facebook','instagram','x','website'].filter(key => data.business[key]);
  return <main className="public-business" style={{'--ad-primary':data.business.brand_primary||'#12664f','--ad-secondary':data.business.brand_secondary||'#e5f2ec'}}><a href="/">← Grafan home</a>{data.business.cover_image && <img className="business-cover" src={data.business.cover_image} alt={`${data.business.name} cover`}/>}<div className="business-public-heading">{data.business.logo && <img src={data.business.logo} alt={`${data.business.name} logo`}/>}<div><p className="eyebrow">Grafan business</p><h1>{data.business.name}</h1><p>{data.business.tagline}</p></div></div><p>{data.business.description}</p><p className="business-contact">{[data.business.location,data.business.phone,data.business.email].filter(Boolean).join(' · ')}</p><div className="business-social-links">{socials.map(key=><a key={key} href={data.business[key]} target="_blank" rel="noopener noreferrer">{key==='x'?'X':key[0].toUpperCase()+key.slice(1)} ↗</a>)}</div><div className="business-ads-heading"><h2>Published advertisements</h2><span>{data.advertisements.length} listings</span></div><div className="ad-directory-grid">{data.advertisements.map(ad => <article className="business-ad-card" key={ad.id}><AdPreview data={ad}/><a className="featured-ad-link" href={`/advertisement/${ad.id}`}>View details →</a></article>)}</div></main>;
}

export function PublicAdvertisementPage({ id }) {
  const [ad, setAd] = useState(null); const [error, setError] = useState('');
  useEffect(() => { api.get(`/ads/${encodeURIComponent(id)}`).then(r => setAd(r.data.advertisement)).catch(e => setError(friendlyError(e, 'Advertisement could not be loaded.'))); }, [id]);
  if (error) return <main className="public-business"><a href="/">← Grafan home</a><h1>Advertisement unavailable</h1><p>{error}</p></main>;
  if (!ad) return <main className="public-business"><p>Loading advertisement…</p></main>;
  const href = ctaTarget(ad);
  const event = /wa\.me/.test(href) ? 'whatsapp' : /^tel:/i.test(href) ? 'phone' : ad.cta === 'Visit Website' ? 'website' : ad.category === 'jobs' ? 'application' : 'cta';
  return <main className="public-business" style={{'--ad-primary':ad.brand_primary||'#12664f','--ad-secondary':ad.brand_secondary||'#e5f2ec'}}><a href="/">← Grafan home</a><div className="ad-public-detail"><AdPreview data={ad}/><p>{ad.location}</p>{ad.details && <p>{ad.details}</p>}{ad.business_id && ad.business_slug && <a href={`/business/${ad.business_slug}`}>View advertiser</a>}{ad.job_id && <p><a href={`/?job=${ad.job_id}`}>Open full job listing, CV tools, and skills match →</a></p>}{href ? <a className="button button-primary" href={href} target={/^https?:/i.test(href) ? '_blank' : undefined} rel="noopener noreferrer" onClick={() => sendAdEvent(ad.id,event)}>{ad.cta}</a> : <p>Contact details were not provided for this action.</p>}</div></main>;
}
