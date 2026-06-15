import pdfplumber
import re
import os

class CVParser:
    def parse_pdf(self, file_path):
        """Extract text from PDF"""
        text = ""
        try:
            print(f"📄 Parsing PDF: {file_path}")
            print(f"📄 File size: {os.path.getsize(file_path)} bytes")
            
            with pdfplumber.open(file_path) as pdf:
                print(f"📄 Number of pages: {len(pdf.pages)}")
                for i, page in enumerate(pdf.pages):
                    page_text = page.extract_text() or ""
                    text += page_text + "\n"
                    print(f"📄 Page {i+1}: {len(page_text)} characters")
            
            print(f"📄 Total extracted text: {len(text)} characters")
            print(f"📄 First 200 chars: {text[:200]}")
            
        except Exception as e:
            print(f"❌ PDF parsing error: {e}")
            import traceback
            traceback.print_exc()
        
        return text
    
    def extract_info(self, text):
        """Extract personal info from CV text"""
        info = {
            'name': self.extract_name(text),
            'email': self.extract_email(text),
            'phone': self.extract_phone(text),
            'skills': self.extract_skills(text),
            'experience': self.extract_experience(text),
            'education': self.extract_education(text)
        }
        
        print(f"📊 Extracted: Name={info['name']}, Email={info['email']}, Phone={info['phone']}")
        
        return info
    
    def extract_name(self, text):
        """Improved name extraction - looks for 'Name:' pattern"""
        
        # Pattern 1: Look for "Name: AMINA SINGANO" or "Name : AMINA SINGANO"
        pattern1 = re.search(r'Name\s*:\s*([A-Za-z\s\.]+)(?:\n|$)', text, re.IGNORECASE)
        if pattern1:
            name = pattern1.group(1).strip()
            if name and len(name) > 2:
                print(f"✅ Name found via 'Name:' pattern: {name}")
                return name
        
        # Pattern 2: Look for "CURRICULUM VITAE" followed by name on next line
        pattern2 = re.search(r'CURRICULUM\s*VITAE\s*\n([A-Za-z\s\.]+)', text, re.IGNORECASE)
        if pattern2:
            name = pattern2.group(1).strip()
            if name and len(name) > 2:
                print(f"✅ Name found via 'CURRICULUM VITAE' pattern: {name}")
                return name
        
        # Pattern 3: Look for name on first few lines that looks like a person's name
        lines = text.split('\n')
        for i, line in enumerate(lines[:20]):  # Check first 20 lines
            line = line.strip()
            # Skip empty lines and lines with common CV headers
            if not line or len(line) > 50:
                continue
            
            line_upper = line.upper()
            if any(skip in line_upper for skip in ['EMAIL', 'PHONE', 'ADDRESS', 'CONTACT', 'PERSONAL', 'PROFILE']):
                continue
            
            # Check if line looks like a name (contains letters, spaces, maybe dots)
            if re.match(r'^[A-Za-z\s\.\'-]{2,50}$', line):
                # Check if it has at least two parts (first and last name)
                parts = line.split()
                if len(parts) >= 2:
                    print(f"✅ Name found via line detection: {line}")
                    return line
        
        # Pattern 4: Look for name anywhere in the document with common name prefixes
        pattern4 = re.search(r'(?:My name is|Name:|I am)\s+([A-Za-z\s\.]+?)(?:\.|\n|$)', text, re.IGNORECASE)
        if pattern4:
            name = pattern4.group(1).strip()
            if name and len(name) > 2:
                print(f"✅ Name found via prefix pattern: {name}")
                return name
        
        print("⚠️ No name detected in CV")
        return "Not detected"
    
    def extract_email(self, text):
        match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        return match.group(0) if match else "Not detected"
    
    def extract_phone(self, text):
        # Tanzanian phone numbers
        patterns = [
            r'(\+255|0)[0-9]{9}',
            r'\(?\+255\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{6}',
            r'Mobile[-:]?\s*([\+0-9\s]+)',
            r'Phone[-:]?\s*([\+0-9\s]+)',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                phone = match.group(0)
                # Clean up phone number
                phone = re.sub(r'[^\d\+]', '', phone)
                return phone
        return "Not detected"
    
    def extract_skills(self, text):
        skills_keywords = [
            'python', 'java', 'javascript', 'react', 'node', 'sql', 'aws', 'docker',
            'html', 'css', 'php', 'laravel', 'django', 'flask', 'mongodb', 'postgresql',
            'git', 'linux', 'excel', 'word', 'powerpoint', 'communication', 'leadership',
            'banking', 'customer service', 'marketing', 'sales', 'management', 'finance',
            'accounting', 'data analysis', 'project management', 'excel', 'word', 'powerpoint'
        ]
        found = []
        text_lower = text.lower()
        for skill in skills_keywords:
            if skill in text_lower and skill not in found:
                found.append(skill)
        return found[:15]  # Return top 15 skills
    
    def extract_experience(self, text):
        exp = []
        lines = text.split('\n')
        for i, line in enumerate(lines):
            # Look for date patterns (20XX - 20XX or 20XX - present)
            if re.search(r'\b(20\d{2})\s*[-–]\s*(20\d{2}|present|now)\b', line.lower()):
                # Get the line with the date
                exp.append(line.strip())
                # Also get the next line if it exists and seems like a job title
                if i+1 < len(lines) and len(lines[i+1].strip()) > 10:
                    exp.append(lines[i+1].strip())
        # Remove duplicates and return
        seen = set()
        unique_exp = []
        for e in exp:
            if e not in seen:
                seen.add(e)
                unique_exp.append(e)
        return unique_exp[:6]  # Return top 6 experiences
    
    def extract_education(self, text):
        edu = []
        edu_keywords = [
            'bachelor', 'master', 'degree', 'diploma', 'university', 'college',
            'school', 'certificate', 'certification', 'bsc', 'msc', 'phd',
            'institute', 'academy', 'high school', 'secondary school'
        ]
        lines = text.split('\n')
        for line in lines:
            line_lower = line.lower()
            if any(kw in line_lower for kw in edu_keywords):
                if len(line) > 10 and len(line) < 300:
                    edu.append(line.strip())
        # Remove duplicates
        seen = set()
        unique_edu = []
        for e in edu:
            if e not in seen:
                seen.add(e)
                unique_edu.append(e)
        return unique_edu[:5]  # Return top 5 education entries