import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Use production API URL when deployed, localhost for development
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://grafan-1.onrender.com/api' 
  : 'http://localhost:5000/api';

// Netlify Functions URL (ina-run locally kwa sasa)
const NETLIFY_FUNCTIONS_URL = process.env.NODE_ENV === 'production'
  ? '/.netlify/functions'
  : 'http://localhost:8888/.netlify/functions';

function App() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showPostForm, setShowPostForm] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(null);
  const [showCVBuilder, setShowCVBuilder] = useState(false);
  const [showUrlScraper, setShowUrlScraper] = useState(false);
  const [showAIChatbot, setShowAIChatbot] = useState(false);
  const [showJobMatcher, setShowJobMatcher] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [scrapingUrl, setScrapingUrl] = useState(false);
  const [cvData, setCvData] = useState(null);
  const [stats, setStats] = useState({});
  const [cvUploading, setCvUploading] = useState(false);
  
  // State for AI features
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [userSkills, setUserSkills] = useState('');
  const [jobMatches, setJobMatches] = useState([]);
  const [matchLoading, setMatchLoading] = useState(false);

  useEffect(() => {
    loadJobs();
    loadStats();
  }, [filter, search]);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/jobs?type=${filter}&search=${search}`);
      setJobs(res.data.jobs || []);
    } catch (error) {
      console.error('Error loading jobs:', error);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const res = await axios.get(`${API_URL}/stats`);
      setStats(res.data);
    } catch (error) {
      console.error('Stats error:', error);
    }
  };

  // AI Chatbot function
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatInput('');
    setChatLoading(true);
    
    try {
      const response = await axios.post(`${NETLIFY_FUNCTIONS_URL}/chatbot`, {
        message: userMessage,
        userSkills: userSkills.split(',').map(s => s.trim()).filter(s => s)
      });
      
      const reply = response.data.reply;
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      console.error('Chatbot error:', error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, AI service is temporarily unavailable. Please try again later.' }]);
    }
    setChatLoading(false);
  };

  // Job Matching function
  const matchJobsWithSkills = async () => {
    if (!userSkills.trim()) {
      alert('Please enter your skills first (e.g., JavaScript, Python, React)');
      return;
    }
    
    const skillsArray = userSkills.split(',').map(s => s.trim()).filter(s => s);
    const availableJobs = jobs.slice(0, 20).map(job => ({
      title: job.title,
      company: job.company,
      type: job.job_type
    }));
    
    setMatchLoading(true);
    setJobMatches([]);
    
    try {
      const response = await axios.post(`${NETLIFY_FUNCTIONS_URL}/match-jobs`, {
        userSkills: skillsArray,
        availableJobs: availableJobs
      });
      
      let matches = [];
      if (response.data && response.data.matches) {
        matches = response.data.matches;
      } else if (Array.isArray(response.data)) {
        matches = response.data;
      } else if (response.data && typeof response.data === 'object') {
        matches = [response.data];
      }
      
      if (!Array.isArray(matches)) {
        matches = [];
      }
      
      setJobMatches(matches);
      
      if (matches.length === 0) {
        alert('No matching jobs found. Try different skills!');
      }
    } catch (error) {
      console.error('Matching error:', error);
      alert('Failed to match jobs. Error: ' + (error.response?.data?.error || error.message));
    }
    setMatchLoading(false);
  };

  // AI-powered URL Scraper
  const handleUrlScrapeAI = async () => {
    if (!targetUrl) {
      alert('Please enter a website URL');
      return;
    }
    
    setScrapingUrl(true);
    try {
      const response = await axios.post(`${NETLIFY_FUNCTIONS_URL}/scrape-with-ai`, {
        websiteUrl: targetUrl
      });
      
      if (response.data) {
        alert(`✅ AI scraping completed! Jobs have been processed.`);
        setShowUrlScraper(false);
        setTargetUrl('');
        setTimeout(loadJobs, 3000);
      }
    } catch (error) {
      console.error('AI Scrape error:', error);
      alert('❌ AI scraping failed. Make sure the URL is valid and contains job listings.');
    }
    setScrapingUrl(false);
  };

  // ========== IMPROVED CV PARSER WITH BETTER NAME EXTRACTION ==========
  const handleCVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }
    
    setCvUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await axios.post(`${API_URL}/cv/parse`, formData);
      if (res.data && res.data.extracted) {
        let extracted = res.data.extracted;
        
        // Ikiwa jina ni "PERSONAL INFORMATION" au "Not detected", tafuta jina sahihi
        const isNameInvalid = !extracted.name || 
                              extracted.name === 'Not detected' || 
                              extracted.name === 'PERSONAL INFORMATION' || 
                              extracted.name.includes('PERSONAL') ||
                              extracted.name.includes('PROFILE');
        
        if (isNameInvalid) {
          // Tafuta raw text kutoka kwenye response
          const rawText = res.data.raw_text || '';
          
          // Tafuta "Name: AMINA SINGANO" pattern
          let nameMatch = rawText.match(/Name:\s*([A-Za-z\s\.]+)/i);
          
          if (!nameMatch) {
            // Tafuta "Name : AMINA SINGANO"
            nameMatch = rawText.match(/Name\s*:\s*([A-Za-z\s\.]+)/i);
          }
          
          if (!nameMatch) {
            // Tafuta mstari wenye "CURRICULUM VITAE" unaofuatwa na jina
            nameMatch = rawText.match(/CURRICULUM\s*VITAE\s*\n([A-Za-z\s\.]+)/i);
          }
          
          if (!nameMatch) {
            // Tafuta jina kwenye mistari ya kwanza (AMINA SINGANO)
            const lines = rawText.split('\n');
            for (let i = 0; i < Math.min(lines.length, 15); i++) {
              const line = lines[i].trim();
              // Angalia kama line inaonekana kama jina
              if (line.match(/^[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/) && 
                  line.length < 40 && 
                  !line.includes('PERSONAL') && 
                  !line.includes('PROFILE') &&
                  !line.includes('CONTACT')) {
                nameMatch = [null, line];
                break;
              }
            }
          }
          
          if (nameMatch && nameMatch[1]) {
            extracted.name = nameMatch[1].trim();
            console.log('Name extracted from raw text:', extracted.name);
          } else {
            // Ikiwa bado haijapatikana, muulize mtumiaji
            const userName = prompt('📝 Jina lako halikutambuliwa kwenye CV. Tafadhali weka jina lako kamili:', '');
            if (userName && userName.trim()) {
              extracted.name = userName.trim();
            }
          }
        }
        
        setCvData(extracted);
        alert(`✅ CV imechambuliwa!\n👤 Jina: ${extracted.name || 'Likapatikana'}\n📧 Barua pepe: ${extracted.email || 'Likapatikana'}`);
      } else {
        throw new Error('No extracted data');
      }
    } catch (error) {
      console.error('CV parse failed:', error);
      
      // Manual entry fallback
      const userName = prompt('📝 Tafadhali weka jina lako kamili (Full Name):', '');
      const userEmail = prompt('📧 Tafadhali weka barua pepe yako (Email):', '');
      const userPhone = prompt('📞 Tafadhali weka namba yako ya simu (Phone):', '');
      
      setCvData({
        name: userName || 'Not provided',
        email: userEmail || 'Not provided',
        phone: userPhone || 'Not provided',
        skills: [],
        experience: [],
        education: []
      });
      alert(`✅ CV information saved manually! Name: ${userName || 'Not provided'}`);
    }
    setCvUploading(false);
  };

  const handleScrape = async () => {
    try {
      await axios.post(`${API_URL}/scrape`);
      alert('✅ AI Scraping started! Jobs will appear soon.');
      setTimeout(loadJobs, 5000);
    } catch (error) {
      alert('❌ Scraping failed');
    }
  };

  const handlePostJob = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await axios.post(`${API_URL}/jobs`, {
        title: fd.get('title'),
        company: fd.get('company'),
        job_type: fd.get('job_type'),
        location: fd.get('location'),
        salary: fd.get('salary')
      });
      alert('✅ Job posted!');
      setShowPostForm(false);
      loadJobs();
      loadStats();
    } catch (error) {
      alert('❌ Failed to post job');
    }
  };

  const handleApply = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await axios.post(`${API_URL}/apply`, fd);
      alert('✅ Application submitted! Check your email for confirmation.');
      setShowApplyModal(null);
      loadStats();
    } catch (error) {
      alert('❌ Failed to submit application');
    }
  };

  const getTypeBadge = (type) => {
    const badges = { remote: '🏠 Remote', hybrid: '💻 Hybrid', onsite: '🏢 On-job', gig: '⚡ Gig' };
    return badges[type] || type;
  };

  const getSourceDisplay = (source) => {
    if (!source) return '📌 Source: Direct Post';
    if (source === 'Mabumbe') return '📌 Source: Mabumbe';
    if (source === 'Ajirayako') return '📌 Source: Ajirayako';
    if (source === 'Sample') return '📌 Source: GRAFAN (Sample)';
    if (source === 'Ajira Portal') return '🔗 Source: Ajira Portal (Official)';
    if (source.startsWith('Scraped')) return `📌 Source: ${source}`;
    return `📌 Source: ${source}`;
  };

  return (
    <div className="app">
      <div className="main-layout">
        
        {/* LEFT COLUMN - Job Listings */}
        <div className="left-column">
          <header>
            <h1>🛠️ GRAFAN</h1>
            <p>AI-Powered Job Platform - Scrape ANY Website, Build CV, Apply with AI</p>
            <div className="stats-bar">
              <span>📋 {stats.total_jobs || 0} Jobs</span>
              <span>🏠 {stats.jobs_by_type?.remote || 0} Remote</span>
              <span>💻 {stats.jobs_by_type?.hybrid || 0} Hybrid</span>
              <span>🏢 {stats.jobs_by_type?.onsite || 0} On-job</span>
              <span>⚡ {stats.jobs_by_type?.gig || 0} Gig</span>
            </div>
            <div className="buttons">
              <button onClick={handleScrape} className="btn-ai">🤖 AI Scrape All</button>
              <button onClick={() => setShowUrlScraper(true)} className="btn-url">🌐 Scrape Any URL</button>
              <button onClick={() => setShowPostForm(true)} className="btn-post">📝 Post a Job</button>
              <button onClick={() => setShowCVBuilder(true)} className="btn-cv">📄 Build CV</button>
              <button onClick={() => setShowAIChatbot(true)} className="btn-ai">💬 AI Career Coach</button>
              <button onClick={() => setShowJobMatcher(true)} className="btn-ai">🎯 Match My Skills</button>
            </div>
          </header>

          <div className="search-filter">
            <input 
              type="text" 
              placeholder="🔍 Search jobs by title or company..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
            <div className="filters">
              {['all', 'remote', 'hybrid', 'onsite', 'gig'].map(t => (
                <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
                  {t === 'all' ? '📋 All' : getTypeBadge(t)}
                </button>
              ))}
            </div>
          </div>

          <div className="jobs">
            {loading ? (
              <div className="loading">🔄 Loading jobs...</div>
            ) : jobs.length === 0 ? (
              <div className="empty">
                <p>😔 No jobs found</p>
                <button onClick={() => setShowUrlScraper(true)} className="link-btn">
                  🌐 Click here to scrape jobs from any website
                </button>
              </div>
            ) : (
              jobs.map(job => (
                <div key={job.id} className="job-card">
                  <h3>{job.title}</h3>
                  <p className="company">{job.company}</p>
                  <span className={`badge ${job.job_type}`}>{getTypeBadge(job.job_type)}</span>
                  {job.location && <p className="location">📍 {job.location}</p>}
                  {job.salary && <p className="salary">💰 {job.salary}</p>}
                  
                  <div className="job-source">
                    <span className="source-icon">📌</span>
                    <span className="source-text">{getSourceDisplay(job.source)}</span>
                  </div>
                  
                  <button onClick={() => setShowApplyModal(job)} className="apply-btn">📧 Apply Now</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - ADS SPACE */}
        <div className="right-column">
          <div className="ads-container">
            <div className="ad-card">
              <div className="ad-label">ADVERTISEMENT</div>
              <div className="ad-content">
                <div className="ad-space">
                  <p>📢</p>
                  <p className="ad-title">Advertise Here</p>
                  <p className="ad-text">Reach thousands of job seekers daily</p>
                  <button className="ad-btn">Contact Us</button>
                </div>
              </div>
            </div>

            <div className="ad-card sponsored">
              <div className="ad-label">SPONSORED</div>
              <div className="ad-content">
                <div className="ad-space">
                  <p>🏆</p>
                  <p className="ad-title">Featured Employers</p>
                  <p className="ad-text">Post your jobs and find top talent</p>
                  <button className="ad-btn">Post a Job</button>
                </div>
              </div>
            </div>

            <div className="ad-card">
              <div className="ad-label">PROMOTION</div>
              <div className="ad-content">
                <div className="ad-space">
                  <p>📚</p>
                  <p className="ad-title">CV Writing Services</p>
                  <p className="ad-text">Professional CV from TSh 50,000</p>
                  <button className="ad-btn">Learn More</button>
                </div>
              </div>
            </div>

            <div className="ad-card">
              <div className="ad-label">PARTNER</div>
              <div className="ad-content">
                <div className="ad-space">
                  <p>🎓</p>
                  <p className="ad-title">Online Courses</p>
                  <p className="ad-text">Upskill with top certifications</p>
                  <button className="ad-btn">View Courses</button>
                </div>
              </div>
            </div>

            <div className="ad-card">
              <div className="ad-label">INFO</div>
              <div className="ad-content">
                <div className="ad-space">
                  <p>🤖</p>
                  <p className="ad-title">AI Scraping</p>
                  <p className="ad-text">Scrape jobs from ANY website</p>
                  <button className="ad-btn" onClick={() => setShowUrlScraper(true)}>Try Now</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ MODALS ============ */}

      {/* AI CHATBOT MODAL */}
      {showAIChatbot && (
        <div className="modal" onClick={() => setShowAIChatbot(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setShowAIChatbot(false)}>×</button>
            <h2>💬 AI Career Coach</h2>
            <p>Ask me anything about jobs, CVs, interviews, or career advice!</p>
            
            <div className="chat-container" style={{ height: '300px', overflowY: 'auto', border: '1px solid #ccc', borderRadius: '10px', padding: '10px', marginBottom: '10px', backgroundColor: '#f9f9f9' }}>
              {chatMessages.map((msg, idx) => (
                <div key={idx} style={{ margin: '10px 0', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                  <div style={{ 
                    display: 'inline-block', 
                    padding: '8px 12px', 
                    borderRadius: '15px',
                    backgroundColor: msg.role === 'user' ? '#007bff' : '#e0e0e0',
                    color: msg.role === 'user' ? 'white' : 'black',
                    maxWidth: '80%'
                  }}>
                    <strong>{msg.role === 'user' ? 'You' : 'AI Coach'}:</strong> {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && <div style={{ textAlign: 'center' }}>🤖 AI is thinking...</div>}
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Ask a question..."
                style={{ flex: 1, padding: '10px' }}
              />
              <button onClick={sendChatMessage} disabled={chatLoading}>Send</button>
            </div>
            
            <div style={{ marginTop: '10px' }}>
              <p><strong>Your Skills (for better advice):</strong></p>
              <input 
                type="text" 
                value={userSkills}
                onChange={(e) => setUserSkills(e.target.value)}
                placeholder="e.g., JavaScript, Python, React, Data Analysis"
                style={{ width: '100%', padding: '8px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* JOB MATCHER MODAL */}
      {showJobMatcher && (
        <div className="modal" onClick={() => setShowJobMatcher(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setShowJobMatcher(false)}>×</button>
            <h2>🎯 AI Job Matcher</h2>
            <p>Enter your skills and I'll find the best matching jobs for you!</p>
            
            <div style={{ marginBottom: '15px' }}>
              <label><strong>Your Skills (comma-separated):</strong></label>
              <input 
                type="text" 
                value={userSkills}
                onChange={(e) => setUserSkills(e.target.value)}
                placeholder="JavaScript, Python, React, Project Management, etc."
                style={{ width: '100%', padding: '10px', marginTop: '5px' }}
              />
            </div>
            
            <button onClick={matchJobsWithSkills} disabled={matchLoading} style={{ width: '100%', padding: '12px', marginBottom: '20px' }}>
              {matchLoading ? '🤖 Analyzing...' : '🔍 Find Matching Jobs'}
            </button>
            
            {matchLoading && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>🤖 AI is analyzing your skills against {jobs.length} jobs...</p>
              </div>
            )}
            
            {!matchLoading && jobMatches.length > 0 && (
              <div>
                <h3>📊 Job Matches Found: {jobMatches.length}</h3>
                {jobMatches.map((match, idx) => (
                  <div key={idx} style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '15px', marginBottom: '10px', backgroundColor: '#fff' }}>
                    <h4>{match.jobTitle || 'Job Position'}</h4>
                    {match.matchScore && (
                      <p><strong>Match Score:</strong> 
                        <span style={{ 
                          color: match.matchScore >= 70 ? 'green' : match.matchScore >= 40 ? 'orange' : 'red',
                          fontWeight: 'bold',
                          marginLeft: '10px'
                        }}>
                          {match.matchScore}%
                        </span>
                      </p>
                    )}
                    {match.reason && <p><strong>Why it fits:</strong> {match.reason}</p>}
                    {match.missingSkills && match.missingSkills.length > 0 && (
                      <p><strong>Skills to learn:</strong> {match.missingSkills.join(', ')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {!matchLoading && jobMatches.length === 0 && userSkills.trim() && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                <p>No matching jobs found for "{userSkills}". Try different skills!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* URL Scraper Modal */}
      {showUrlScraper && (
        <div className="modal" onClick={() => setShowUrlScraper(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setShowUrlScraper(false)}>×</button>
            <h2>🌐 AI Job Scraper</h2>
            <p>Enter any website URL with job listings - AI will extract all jobs automatically</p>
            <input 
              type="url" 
              placeholder="https://example.com/jobs" 
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="url-input"
            />
            <button onClick={handleUrlScrapeAI} disabled={scrapingUrl}>
              {scrapingUrl ? '🤖 AI Scraping in progress...' : '🚀 Start AI Scraping'}
            </button>
            <small>Examples: mabumbe.com, ajirayako.co.tz, dproz.com, brighterMonday.co.tz</small>
          </div>
        </div>
      )}

      {/* Post Job Modal */}
      {showPostForm && (
        <div className="modal" onClick={() => setShowPostForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setShowPostForm(false)}>×</button>
            <h2>📝 Post a Job</h2>
            <form onSubmit={handlePostJob}>
              <input name="title" placeholder="Job Title*" required />
              <input name="company" placeholder="Company Name*" required />
              <select name="job_type" required>
                <option value="onsite">🏢 On-job</option>
                <option value="remote">🏠 Remote</option>
                <option value="hybrid">💻 Hybrid</option>
                <option value="gig">⚡ Gig</option>
              </select>
              <input name="location" placeholder="Location" />
              <input name="salary" placeholder="Salary" />
              <button type="submit">Post Job</button>
            </form>
          </div>
        </div>
      )}

      {/* Apply Modal */}
      {showApplyModal && (
        <div className="modal" onClick={() => setShowApplyModal(null)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setShowApplyModal(null)}>×</button>
            <h2>📧 Apply for {showApplyModal.title}</h2>
            <p><strong>{showApplyModal.company}</strong></p>
            <form onSubmit={handleApply} encType="multipart/form-data">
              <input name="job_id" type="hidden" value={showApplyModal.id} />
              <input name="name" placeholder="Your Full Name*" required defaultValue={cvData?.name || ''} />
              <input name="email" type="email" placeholder="Your Email*" required defaultValue={cvData?.email || ''} />
              <input name="phone" placeholder="Your Phone" defaultValue={cvData?.phone || ''} />
              <div className="cv-upload">
                <label>Upload your CV (PDF):</label>
                <input name="cv" type="file" accept=".pdf" required />
              </div>
              <textarea name="message" placeholder="Cover Letter / Why you're a good fit..." rows="4" required />
              <button type="submit">Submit Application</button>
            </form>
            <p className="note">✨ You will receive a confirmation email after submitting.</p>
          </div>
        </div>
      )}

      {/* CV BUILDER MODAL */}
      {showCVBuilder && (
        <div className="modal" onClick={() => setShowCVBuilder(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <button className="close" onClick={() => setShowCVBuilder(false)}>×</button>
            <h2>📄 Build Your CV</h2>
            <p>Upload your certificates or existing CV - AI will extract your information automatically</p>
            <div className="cv-upload-area">
              <input type="file" accept=".pdf" onChange={handleCVUpload} disabled={cvUploading} />
              {cvUploading && <p>⏳ AI is analyzing your CV...</p>}
              <small>Supported: PDF files (Degree, Diploma, CV, Certificates)</small>
            </div>
            {cvData && (
              <div className="cv-preview">
                <h3>📋 Extracted Information:</h3>
                {/* NAME SECTION - HIGHLIGHTED */}
                <div style={{ 
                  backgroundColor: '#e8f4fd', 
                  padding: '12px', 
                  borderRadius: '10px', 
                  marginBottom: '15px',
                  border: '1px solid #2196F3'
                }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#666' }}><strong>👤 Full Name</strong></p>
                  <p style={{ margin: '5px 0 0 0', fontSize: '18px', fontWeight: 'bold', color: '#1976D2' }}>
                    {cvData.name || 'Not detected'}
                  </p>
                </div>
                
                <p><strong>📧 Email:</strong> {cvData.email || 'Not detected'}</p>
                <p><strong>📞 Phone:</strong> {cvData.phone || 'Not detected'}</p>
                <p><strong>⚙️ Skills:</strong> {Array.isArray(cvData.skills) ? cvData.skills.join(', ') : (cvData.skills || 'Not detected')}</p>
                <p><strong>💼 Experience:</strong> {Array.isArray(cvData.experience) ? cvData.experience.join(', ') : (cvData.experience || 'Not detected')}</p>
                <p><strong>🎓 Education:</strong> {Array.isArray(cvData.education) ? cvData.education.join(', ') : (cvData.education || 'Not detected')}</p>
                <button onClick={() => alert('✅ CV data saved! It will be used when applying for jobs.')}>💾 Save CV</button>
              </div>
            )}
            {!cvData && !cvUploading && (
              <div className="cv-preview">
                <p>💡 Tip: Upload a PDF CV and our AI will extract your information automatically.</p>
                <p>The AI can detect: Name, Email, Phone, Skills, Experience, and Education.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;