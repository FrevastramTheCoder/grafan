const GROQ_API_KEY = process.env.GROQ_API_KEY;

exports.handler = async (event) => {
  // Headers za CORS - Lazima ziwe kwenye response zote
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
    };
  }

  // Hakikisha ni POST request
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse request body
    let userSkills = [];
    let availableJobs = [];
    
    try {
      const body = JSON.parse(event.body);
      userSkills = body.userSkills || [];
      availableJobs = body.availableJobs || [];
    } catch (parseError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON body', matches: [] })
      };
    }

    // Hakikisha GROQ_API_KEY ipo
    if (!GROQ_API_KEY) {
      console.error('GROQ_API_KEY is missing');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured', matches: [] })
      };
    }

    // Ikiwa hakuna skills au jobs, rudisha matokeo tupu
    if (!userSkills.length || !availableJobs.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ matches: [] })
      };
    }

    // Call Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
            content: `You are a job matcher. Match user skills with jobs. Return ONLY valid JSON. 
            Format: {"matches":[{"jobTitle":"exact title","matchScore":number,"reason":"why it matches","missingSkills":[]}]}
            If no matches, return {"matches":[]}`
          },
          {
            role: 'user',
            content: `User Skills: ${userSkills.join(', ')}\n\nJobs: ${JSON.stringify(availableJobs.slice(0, 10))}`
          }
        ],
        temperature: 0.2
      })
    });

    const data = await response.json();
    
    let result;
    try {
      result = JSON.parse(data.choices[0].message.content);
    } catch (e) {
      result = { matches: [] };
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Match jobs error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, matches: [] })
    };
  }
};