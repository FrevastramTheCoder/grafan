import requests
from bs4 import BeautifulSoup
import re
import time
import random
from datetime import datetime
from urllib.parse import urljoin
import traceback
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

# ============================================================
# CONFIGURED SOURCES
# ============================================================
CONFIGURED_SOURCES = (
    ("Mabumbe", "https://mabumbe.com", "scrape_mabumbe"),
    ("Ajirayako", "https://ajirayako.co.tz", "scrape_ajirayako"),
    ("Ajira Zote", "https://ajirazote.com", "scrape_ajira_zote"),
    ("BrighterMonday", "https://www.brightermonday.co.tz/jobs", "scrape_brightermonday"),
)


class JobScraper:
    def __init__(self, debug=False):
        self.session = requests.Session()
        self.debug = debug
        self.last_errors = []
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        ]

        self.known_companies = [
            'NMB Bank', 'Vodacom', 'CRDB Bank', 'Selcom', 'Huawei', 'Tigo', 'Airtel',
            'World Vision', 'Action Against Hunger', 'Marie Stopes', 'Bolt', 'Tembo Nickel',
            'Tanzania Football Federation', 'TFF', 'NBC Bank', 'Braeburn', 'St. Constantine',
            'Milvik', 'Glory New Building', 'Jerusalem Mbezi', 'World Bank', 'UNICEF',
            'UNDP', 'WHO', 'Oxfam', 'Save the Children', 'Plan International',
            'KPMG', 'Deloitte', 'PwC', 'EY', 'Serengeti Breweries', 'Tanzania Breweries',
            'Bakhresa', 'Muhimbili Hospital', 'Aga Khan Hospital', 'Suma JKT', 'TANESCO',
            'NSSF', 'NHIF', 'TRA', 'TCCIA', 'TBS', 'TASAC', 'TCRA', 'EWURA',
            'BBC', 'UN Women', 'IFC', 'World Economic Forum', 'CARE International',
            'British High Commission', 'Thomson Safaris', 'Blue Recruits', 'Fortune House',
            'Benter Group', 'NRG Media', 'DP World', 'Cartrack', 'Mango Tree',
            'BRAC', 'Jhpiego', 'ActionAid', 'TadaHost', 'Realbiz',
        ]

        print("🤖 GRAFAN JOB SCRAPER READY (Keyword-based)")
        print(f"   Sources: {len(CONFIGURED_SOURCES)}")
        print("   Using smart keyword matching for job detection")

    def log(self, message):
        if self.debug:
            print(f"  [DEBUG] {message}")

    @staticmethod
    def validate_public_http_url(value):
        candidate = value.strip()
        if not candidate:
            raise ValueError("A website URL is required.")
        if "://" not in candidate:
            candidate = "https://" + candidate
        parsed = urlparse(candidate)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("Enter a valid HTTP or HTTPS website URL.")
        if parsed.username or parsed.password:
            raise ValueError("URLs containing usernames or passwords are not allowed.")
        try:
            port = parsed.port
        except ValueError as e:
            raise ValueError("The URL contains an invalid port.") from e
        if port not in (None, 80, 443):
            raise ValueError("Only standard HTTP and HTTPS ports are allowed.")
        hostname = parsed.hostname.rstrip(".").lower()
        if hostname == "localhost" or hostname.endswith((".localhost", ".local", ".internal", ".home", ".lan")):
            raise ValueError("Local and internal network addresses cannot be scraped.")
        try:
            try:
                addresses = {ipaddress.ip_address(hostname)}
            except ValueError:
                addresses = {ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(hostname, None)}
        except (socket.gaierror, ValueError) as e:
            raise ValueError("The website hostname could not be resolved.") from e
        if not addresses or any(not address.is_global for address in addresses):
            raise ValueError("Local and internal network addresses cannot be scraped.")
        return candidate

    def get_headers(self):
        return {
            'User-Agent': random.choice(self.user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,sw;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Cache-Control': 'max-age=0',
        }

    def is_job(self, text):
        """Flexible job detection — accepts if role keyword OR job indicator found."""
        if not text:
            return False
        text = " ".join(text.split())
        if len(text) > 250 or len(text) < 15:
            return False
        text_lower = text.lower()

        # Exact matches to reject
        rejected_exact = {
            'jobs', 'job', 'recent jobs', 'promoted jobs', 'featured jobs',
            'popular jobs', 'latest jobs', 'new jobs', 'all jobs',
            'find jobs', 'browse jobs', 'search jobs', 'job search',
            'home', 'about', 'contact', 'read more', 'view all',
        }
        if text_lower.strip() in rejected_exact:
            return False

        # Phrase exclusions — navigation, menus
        excluded_phrases = (
            'search jobs', 'post a job', 'job posting packages', 'useful links',
            'never pay to get a job', 'job vacancies page', 'latest careers & apply online',
            'connecting tanzania’s talent', "connecting tanzania's talent",
            'privacy policy', 'terms of service', 'contact us', 'about us',
            'log in', 'sign up', 'register', 'home page', 'read more',
            'promoted jobs', 'recent jobs', 'featured jobs', 'popular jobs',
            'jobs by category', 'jobs by location', 'browse jobs', 'all jobs',
            'latest jobs', 'new jobs', 'job alerts', 'job search', 'find jobs',
            'top jobs', 'best jobs', 'urgent jobs', 'hot jobs', 'trending jobs',
            'career opportunities', 'digital recruitment',
            'job categories', 'job types', 'job listings',
            'view all jobs', 'see more jobs', 'more jobs', 'see all',
            'subscribe', 'newsletter', 'copyright', 'all rights reserved',
        )
        if any(phrase in text_lower for phrase in excluded_phrases):
            return False

        # Job indicators — kama text ina hizi, ni job
        job_indicators = (
            'job', 'vacancy', 'vacancies', 'position', 'opening',
            'opportunity', 'opportunities', 'career', 'hiring',
            'recruitment', 'kazi', 'nafasi', 'ajira', 'tender', 'internship',
        )
        has_indicator = any(ind in text_lower for ind in job_indicators)

        # Role keywords — aina za kazi
        role_keywords = [
            'officer', 'manager', 'engineer', 'developer', 'specialist',
            'consultant', 'analyst', 'coordinator', 'supervisor', 'director',
            'assistant', 'associate', 'intern', 'trainee', 'accountant',
            'teacher', 'nurse', 'doctor', 'technician', 'executive',
            'administrator', 'recruiter', 'architect', 'designer', 'scientist',
            'researcher', 'auditor', 'driver', 'cashier', 'mechanic', 'lawyer',
            'advocate', 'lecturer', 'professor', 'chef', 'clerk', 'attendant',
            'programmer', 'economist', 'agronomist', 'sales', 'representative',
            'customer service', 'fellow', 'volunteer', 'adviser', 'advisor',
            'head', 'chief', 'lead', 'leader', 'president', 'secretary',
            'treasurer', 'bursar', 'librarian', 'counselor', 'therapist',
            'pharmacist', 'dentist', 'veterinarian', 'pilot', 'captain',
            'guard', 'security', 'cleaner', 'cook', 'waiter', 'waitress',
            'receptionist', 'typist', 'data entry', 'ict',
            'webmaster', 'full stack', 'frontend', 'backend', 'fullstack',
            'devops', 'tester', 'business development', 'marketing',
            'communications', 'public relations', 'logistics', 'procurement',
            'supply chain', 'warehouse', 'store keeper', 'storekeeper',
            'operations', 'quality', 'safety', 'environmental', 'social',
            'community', 'field', 'project', 'program', 'grant', 'monitoring',
            'evaluation', 'gis', 'remote sensing', 'hydrogeologist',
            'geologist', 'geophysicist', 'surveyor', 'civil', 'electrical',
            'mechanical', 'chemical', 'petroleum', 'mining', 'metallurgist',
            'accounting', 'finance', 'hr', 'human resource', 'it support',
        ]
        has_role = any(re.search(r'\b' + re.escape(role) + r'\b', text_lower) for role in role_keywords)

        return has_indicator or has_role

    @staticmethod
    def extract_source_url(node, current_url):
        link = node if getattr(node, "name", None) == "a" else node.find_parent("a", href=True)
        if not link:
            container = node.find_parent(["article", "li", "section", "div"])
            link = container.find("a", href=True) if container else None
        if not link or not link.get("href"):
            return current_url
        target = urljoin(current_url, link["href"])
        parsed = urlparse(target)
        return target if parsed.scheme in {"http", "https"} and parsed.netloc else current_url

    @staticmethod
    def extract_listing_context(node):
        container = node.find_parent("article") or node.find_parent(class_=re.compile(r"job|vacan|listing|career", re.I))
        if not container:
            container = node.parent
        return container.get_text(" ", strip=True)[:3000] if container else ""

    @staticmethod
    def extract_application_url(node, current_url):
        container = node.find_parent("article") or node.find_parent(class_=re.compile(r"job|vacan|listing|career", re.I)) or node.parent
        if not container:
            return None
        for anchor in container.find_all("a", href=True):
            label = " ".join(anchor.get_text(" ", strip=True).casefold().split())
            if not re.search(r"^(apply(?: now| here| for)?|application form|submit application|send application)$", label):
                continue
            target = urljoin(current_url, anchor["href"])
            parsed = urlparse(target)
            if parsed.scheme in {"http", "https"} and parsed.netloc:
                return target
        return None

    @staticmethod
    def extract_email(node):
        container = node.find_parent("article") or node.find_parent(class_=re.compile(r"job|vacan|listing|career", re.I)) or node.parent
        if not container:
            return None
        link = container.find("a", href=re.compile(r"^mailto:", re.I))
        if link:
            address = link.get("href", "")[7:].split("?", 1)[0]
            return address if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", address) else None
        return None

    @staticmethod
    def extract_labeled_section(text, labels):
        if not text:
            return None
        escaped = "|".join(re.escape(label) for label in labels)
        match = re.search(r"(?:^|\s)(?:" + escaped + r")\s*[:\-–]\s*(.+?)(?=\s+(?:requirements|responsibilities|qualifications|skills|experience|education|application deadline|how to apply)\s*[:\-–]|$)", text, re.I)
        return match.group(1).strip(" -–:;.")[:2500] if match else None

    def extract_company(self, text):
        """Extract company name from job title — patterns 3 tu."""
        if not text:
            return None

        text_clean = text.replace('\n', ' ').strip()
        text_lower = text_clean.lower()

        # Pattern 1: "at Company Name" — most reliable
        match = re.search(
            r'\bat\s+([A-Z][A-Za-z0-9\s&\.\-]{2,60}?)(?:\s+-|\s+\(|\s+is|\s+in|\s+–|\s+\)|,|\s+for|$)',
            text_clean
        )
        if match:
            company = match.group(1).strip()
            company = re.sub(r'\s+(Job|Vacancy|Position|Opportunity|Job Vacancy).*$', '', company, flags=re.IGNORECASE).strip()
            if 2 < len(company) < 60:
                return company

        # Pattern 2: "Company Name is hiring"
        match = re.search(r'^([A-Z][A-Za-z0-9\s&\.\-]{2,60}?)\s+(?:is hiring|announces|seeks|wants|looking for)', text_clean)
        if match:
            company = match.group(1).strip()
            if 2 < len(company) < 60:
                return company

        # Pattern 3: Known companies — search all
        for company in self.known_companies:
            if company.lower() in text_lower:
                return company

        return None

    def classify_job_type(self, text):
        if not text:
            return None
        text_lower = text.lower()
        if any(kw in text_lower for kw in ['remote', 'work from home', 'wfh', 'work-from-home', 'remote work']):
            return 'remote'
        elif any(kw in text_lower for kw in ['hybrid', 'flexible', 'flexi', 'part remote']):
            return 'hybrid'
        elif any(kw in text_lower for kw in ['contract', 'freelance', 'gig', 'temporary', 'consultant']):
            return 'gig'
        elif any(kw in text_lower for kw in ['on-site', 'onsite', 'office-based', 'in-office']):
            return 'onsite'
        return None

    def extract_location(self, text):
        if not text:
            return None
        locations = [
            'Dar es Salaam', 'Arusha', 'Mwanza', 'Dodoma', 'Tanga', 'Mbeya', 'Zanzibar',
            'Kilimanjaro', 'Morogoro', 'Tabora', 'Kigoma', 'Singida', 'Rukwa', 'Mtwara',
            'Pwani', 'Coast', 'Iringa', 'Kagera', 'Lindi', 'Manyara', 'Mara', 'Njombe',
            'Ruvuma', 'Shinyanga', 'Simiyu', 'Geita', 'Katavi', 'Kaskazini', 'Kusini',
            'Moshi', 'Bagamoyo', 'Mikumi', 'Tanzania',
        ]
        text_lower = text.lower()
        for loc in locations:
            if loc.lower() in text_lower:
                return loc
        return None

    def extract_salary(self, text):
        if not text:
            return None
        patterns = [
            r'(?:TSh|TZS|TSH|Tsh)\s*[\d,]+(?:[\s\-–]*[\d,]+)?',
            r'[\d,]+(?:[\s\-–]*[\d,]+)?\s*(?:TSh|TZS|TSH|Tsh)',
            r'(?:USD|US\$|USD\s*\$)\s*[\d,]+(?:[\s\-–]*[\d,]+)?',
            r'[\d,]+(?:[\s\-–]*[\d,]+)?\s*(?:USD|US\$)',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(0)
        return None

    def scrape_any_url(self, url, source_name=None):
        jobs = []
        source = source_name or f"Scraped-{url[:40]}"
        url = self.validate_public_http_url(url)

        print(f"\n🔍 Scraping: {url}")
        print(f"   Source: {source}")

        try:
            print(f"   📡 Fetching page...")
            current_url = url
            response = None
            for redirect_count in range(4):
                current_url = self.validate_public_http_url(current_url)

                # Retry logic kwa HTTP 500, 502, 503, 504
                for attempt in range(3):
                    response = self.session.get(
                        current_url,
                        headers=self.get_headers(),
                        timeout=20,
                        allow_redirects=False
                    )
                    if response.status_code in {500, 502, 503, 504} and attempt < 2:
                        print(f"   ⚠️ HTTP {response.status_code}, retrying ({attempt + 1}/3)...")
                        time.sleep(2)
                        continue
                    break

                print(f"   📡 HTTP Status: {response.status_code}")
                if response.status_code not in {301, 302, 303, 307, 308}:
                    break
                location = response.headers.get('Location')
                if not location:
                    raise RuntimeError(f"Website returned HTTP {response.status_code} without a redirect destination.")
                redirected_url = urljoin(current_url, location)
                if urlparse(current_url).scheme == 'https' and urlparse(redirected_url).scheme != 'https':
                    raise RuntimeError("HTTPS redirects to HTTP are not followed.")
                if redirect_count == 3:
                    raise RuntimeError("Website redirected too many times.")
                current_url = redirected_url

            if response.status_code != 200:
                raise RuntimeError(f"Website returned HTTP {response.status_code}.")

            soup = BeautifulSoup(response.text, 'html.parser')

            for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "form"]):
                tag.decompose()

            found_jobs = {}

            print(f"   🔍 Searching for job headings...")
            for heading in soup.find_all(['h1', 'h2', 'h3', 'h4']):
                text = heading.get_text(" ", strip=True)
                if text and 15 < len(text) < 250 and self.is_job(text):
                    if text not in found_jobs:
                        found_jobs[text] = {
                            'title': text[:250],
                            'company': self.extract_company(text),
                            'job_type': self.classify_job_type(text),
                            'location': self.extract_location(text),
                            'salary': self.extract_salary(text),
                            'source_url': self.extract_source_url(heading, current_url),
                            'description': self.extract_listing_context(heading),
                            'application_url': self.extract_application_url(heading, current_url),
                            'recruiter_email': self.extract_email(heading)
                        }

            print(f"   🔍 Searching for job links...")
            for link in soup.find_all('a'):
                text = link.get_text(" ", strip=True)
                if text and 15 < len(text) < 250 and self.is_job(text):
                    if text not in found_jobs:
                        found_jobs[text] = {
                            'title': text[:250],
                            'company': self.extract_company(text),
                            'job_type': self.classify_job_type(text),
                            'location': self.extract_location(text),
                            'salary': self.extract_salary(text),
                            'source_url': self.extract_source_url(link, current_url),
                            'description': self.extract_listing_context(link),
                            'application_url': self.extract_application_url(link, current_url),
                            'recruiter_email': self.extract_email(link)
                        }

            print(f"   📊 Found {len(found_jobs)} potential jobs")

            if not found_jobs:
                print(f"   ⚠️ No job listings found")
                return []

            seen_titles = set()
            for key, job_data in list(found_jobs.items())[:100]:
                title = job_data['title']
                title = re.sub(r'^(?:Apply|View|Read\s+More|Click\s+Here)\s*[:|]?\s*', '', title, flags=re.IGNORECASE)
                title = title.strip()

                context = job_data.get('description', '')
                requirements = self.extract_labeled_section(context, ['requirements', 'what you will need', 'what we are looking for'])
                responsibilities = self.extract_labeled_section(context, ['responsibilities', 'duties', 'role overview'])
                qualifications = self.extract_labeled_section(context, ['qualifications', 'education'])
                experience = self.extract_labeled_section(context, ['experience', 'years of experience'])
                skills = self.extract_labeled_section(context, ['required skills', 'skills'])
                application_instructions = self.extract_labeled_section(context, ['how to apply', 'application instructions', 'application process'])
                application_deadline = self.extract_labeled_section(context, ['application deadline', 'closing date', 'deadline'])

                if title not in seen_titles and len(title) >= 15:
                    seen_titles.add(title)
                    jobs.append({
                        'title': title,
                        'company': job_data['company'] or self.extract_company(title),
                        'job_type': job_data['job_type'],
                        'location': job_data['location'],
                        'salary': job_data['salary'],
                        'source': source,
                        'url': current_url,
                        'source_url': job_data.get('source_url', current_url),
                        'description': job_data.get('description', ''),
                        'requirements': requirements,
                        'responsibilities': responsibilities,
                        'qualifications': qualifications,
                        'required_skills': skills,
                        'experience_requirements': experience,
                        'application_deadline': application_deadline,
                        'application_instructions': application_instructions,
                        'application_url': job_data.get('application_url'),
                        'recruiter_email': job_data.get('recruiter_email'),
                        'posted_date': None,
                        'scraped_at': datetime.now().isoformat()
                    })

            print(f"   ✅ Successfully scraped {len(jobs)} unique jobs")
            return jobs

        except requests.exceptions.Timeout:
            raise RuntimeError("The website did not respond within 20 seconds.")
        except requests.exceptions.ConnectionError as e:
            raise RuntimeError(f"Could not connect to the website: {e}") from e
        except Exception as e:
            print(f"   ❌ Error: {str(e)}")
            if self.debug:
                traceback.print_exc()
            raise RuntimeError(f"Could not parse job listings: {e}") from e

    # ============ SCRAPE FUNCTIONS ============

    def scrape_mabumbe(self):
        return self.scrape_any_url('https://mabumbe.com', 'Mabumbe')

    def scrape_ajirayako(self):
        return self.scrape_any_url('https://ajirayako.co.tz', 'Ajirayako')

    def scrape_ajira_zote(self):
        return self.scrape_any_url('https://ajirazote.com', 'Ajira Zote')

    def scrape_brightermonday(self):
        return self.scrape_any_url('https://www.brightermonday.co.tz/jobs', 'BrighterMonday')

    def scrape_custom_url(self, url):
        return self.scrape_any_url(url, 'Custom')

    def scrape_all_sources(self):
        print("\n" + "=" * 60)
        print("📌 GRAFAN JOB SCRAPER (Keyword-based)")
        print("=" * 60)
        print(f"⏰ Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"📋 Sources: {len(CONFIGURED_SOURCES)}")
        print("=" * 60)

        all_jobs = []
        self.last_errors = []

        print("\n📢 SCRAPING CONFIGURED SOURCES...")
        for source_name, _url, method_name in CONFIGURED_SOURCES:
            scrape = getattr(self, method_name, None)
            if not scrape:
                print(f"⚠️ {source_name}: method {method_name} not found")
                continue
            try:
                result = scrape()
                all_jobs.extend(result)
                print(f"✅ {source_name}: {len(result)} jobs")
            except Exception as e:
                message = str(e)
                http_status = re.search(r"HTTP (\d{3})", message)
                if "within 20 seconds" in message.lower() or isinstance(e, requests.exceptions.Timeout):
                    reason = "The source timed out."
                elif http_status:
                    reason = f"The source returned HTTP {http_status.group(1)}."
                elif "could not connect" in message.lower() or isinstance(e, requests.exceptions.ConnectionError):
                    reason = "Could not connect to the source."
                else:
                    reason = "The source could not be read."
                self.last_errors.append({"source": source_name, "error": reason})
                print(f"❌ {source_name}: {reason}")
            time.sleep(1)

        seen = set()
        unique_jobs = []
        for job in all_jobs:
            key = f"{job.get('title', '')}_{job.get('company', '')}_{job.get('source', '')}".lower()
            if key not in seen and key != '_':
                seen.add(key)
                unique_jobs.append(job)

        print("\n" + "=" * 60)
        print("📊 SCRAPING SUMMARY")
        print("=" * 60)

        sources_count = {}
        for job in unique_jobs:
            src = job.get('source', 'Unknown')
            sources_count[src] = sources_count.get(src, 0) + 1

        for source, count in sorted(sources_count.items()):
            print(f"  {source:20} : {count:3} jobs")

        print("-" * 60)
        print(f"  {'TOTAL':20} : {len(unique_jobs):3} jobs")
        print("=" * 60)

        return unique_jobs

    @staticmethod
    def get_configured_sources():
        return [{"name": name, "url": url, "status": "configured"} for name, url, _method in CONFIGURED_SOURCES]