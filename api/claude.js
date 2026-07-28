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

    const body = JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { maxOutputTokens: max_tokens || 1500, temperature: 0.7 },
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body,
    });

    console.log('Gemini status:', response.status);

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error:', response.status, errText.slice(0, 300));
      return res.status(response.status).json({ error: `Gemini returned ${response.status}`, detail: errText.slice(0, 300) });
    }

    const data = await response.json();
    if (data.error) {
      console.error('Gemini API error:', data.error);
      return res.status(400).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(500).json({ error: 'Empty response from Gemini' });

    return res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
