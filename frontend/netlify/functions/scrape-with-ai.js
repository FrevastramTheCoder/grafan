const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const { websiteUrl } = JSON.parse(event.body);
    
    const response = await fetch(websiteUrl);
    const html = await response.text();
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Wewe ni mtaalam wa kuchambua matangazo ya kazi. Toa taarifa kwa muundo wa JSON tu.`
        },
        {
          role: 'user',
          content: `Chambua HTML hii na utoe orodha ya kazi zote: ${html.substring(0, 15000)}`
        }
      ],
      temperature: 0.3,
    });
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobs: completion.choices[0].message.content })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};