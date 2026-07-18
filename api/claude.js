export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { system, messages, max_tokens } = req.body;
    const userMsg = messages?.[0]?.content || '';
    const fullPrompt = system ? `${system}\n\n${userMsg}` : userMsg;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: max_tokens || 1000,
          temperature: 0.7,
        },
      }),
    });

    const data = await response.json();

    // Surface Gemini errors clearly so the frontend can show them
    if (data.error) {
      console.error('Gemini error:', JSON.stringify(data.error));
      return res.status(400).json({ error: data.error.message, detail: data.error });
    }

    if (!data.candidates?.length) {
      console.error('No candidates in Gemini response:', JSON.stringify(data));
      return res.status(500).json({ error: 'No response from Gemini', detail: data });
    }

    const text = data.candidates[0]?.content?.parts?.[0]?.text || '';
    if (!text) {
      return res.status(500).json({ error: 'Empty response from Gemini' });
    }

    // Return in Anthropic-compatible shape so frontend needs no changes
    return res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}