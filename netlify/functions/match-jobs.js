const GROQ_API_KEY = process.env.GROQ_API_KEY;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    };
  }

  try {
    const { userSkills, availableJobs } = JSON.parse(event.body);
    
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
            content: 'You are a job matcher. Match user skills with jobs. Return ONLY valid JSON format: {"matches":[{"jobTitle":"title","matchScore":85,"reason":"why it matches","missingSkills":[]}]}'
          },
          {
            role: 'user',
            content: `User Skills: ${userSkills.join(', ')}\nAvailable Jobs: ${JSON.stringify(availableJobs)}`
          }
        ],
        temperature: 0.2
      })
    });
    
    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(result)
    };
  } catch (error) {
    console.error('Match jobs error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message, matches: [] })
    };
  }
};
