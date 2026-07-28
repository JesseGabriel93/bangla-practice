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

    // Try models in order until one works
    const models = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash',
    ];

    let lastError = '';
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body,
      });

      console.log(`Model ${model} status:`, response.status);

      if (response.status === 404) {
        const errText = await response.text();
        console.log(`Model ${model} 404:`, errText.slice(0, 200));
        lastError = `${model}: 404`;
        continue; // try next model
      }

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Model ${model} error ${response.status}:`, errText.slice(0, 200));
        lastError = `${model}: ${response.status} ${errText.slice(0,100)}`;
        continue;
      }

      const data = await response.json();
      if (data.error) {
        lastError = `${model}: ${data.error.message}`;
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        lastError = `${model}: empty response`;
        continue;
      }

      // Success
      console.log(`Success with model: ${model}`);
      return res.status(200).json({ content: [{ type: 'text', text }] });
    }

    // All models failed
    console.error('All models failed. Last error:', lastError);
    return res.status(404).json({ error: 'All Gemini models failed', detail: lastError });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
