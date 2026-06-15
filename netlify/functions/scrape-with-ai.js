const GROQ_API_KEY = process.env.GROQ_API_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  try {
    const { websiteUrl } = JSON.parse(event.body);
    
    if (!websiteUrl) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL is required' })
      };
    }
    
    console.log('Ì¥ç Fetching URL:', websiteUrl);
    
    // Fetch the website
    const response = await fetch(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    console.log('Ì≥° Response status:', response.status);
    
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `Failed to fetch: ${response.status}` })
      };
    }
    
    const html = await response.text();
    console.log('Ì≥Ñ HTML length:', html.length);
    
    if (html.length < 500) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Content too short' })
      };
    }
    
    // Use Groq to extract jobs
    console.log('Ì¥ñ Calling Groq API...');
    
    const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Extract job listings from HTML. Return ONLY JSON: {"jobs":[{"title":"job title","company":"company name","location":"location"}]}'
          },
          {
            role: 'user',
            content: `Extract jobs from this HTML. Return only JSON.\n\nHTML: ${html.substring(0, 8000)}`
          }
        ],
        temperature: 0.1
      })
    });
    
    const aiData = await aiResponse.json();
    let result;
    
    try {
      const content = aiData.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { jobs: [] };
    } catch (e) {
      result = { jobs: [] };
    }
    
    console.log(`Ì≥ä Found ${result.jobs?.length || 0} jobs`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, jobsCount: result.jobs?.length || 0, jobs: result.jobs || [] })
    };
  } catch (error) {
    console.error('‚ùå Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
