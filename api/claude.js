export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // Debug endpoint — GET /api/claude returns available models
  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      const d = await r.json();
      const models = (d.models || []).map(m => m.name);
      return res.status(200).json({ models, keyPrefix: apiKey.slice(0,8)+'...' });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { system, messages, max_tokens } = req.body;
    const userMsg = messages?.[0]?.content || '';
    const fullPrompt = system ? `${system}\n\n${userMsg}` : userMsg;

    // Try gemini-flash-latest as the stable alias
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: max_tokens || 1500,
          temperature: 0.7,
        },
      }),
    });

    // Log status for debugging
    console.log('Gemini response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini HTTP error:', response.status, errorText);
      return res.status(response.status).json({ error: `Gemini returned ${response.status}`, detail: errorText });
    }

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
