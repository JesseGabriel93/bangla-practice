// Simple dev server — run with: node dev.js
// Requires: npm install dotenv
// Create a .env file with: GEMINI_API_KEY=your_key_here

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load .env
const __dir = dirname(fileURLToPath(import.meta.url));
if (existsSync(join(__dir, '.env'))) {
  const env = readFileSync(join(__dir, '.env'), 'utf8');
  env.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const PORT = 3000;
const MIME = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.css':'text/css' };

async function proxyGemini(body) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in .env');
  const { system, messages, max_tokens } = JSON.parse(body);
  const userMsg = messages?.[0]?.content || '';
  const fullPrompt = system ? `${system}\n\n${userMsg}` : userMsg;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: { maxOutputTokens: max_tokens || 1500, temperature: 0.7 },
    }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Empty Gemini response');
  return { content: [{ type: 'text', text }] };
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // AI proxy endpoint
  if (url.pathname === '/api/claude' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const result = await proxyGemini(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        console.error('AI error:', e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Serve static files from public/
  let filePath = join(__dir, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(filePath)) filePath = join(__dir, 'public', 'index.html');
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'text/plain' });
    res.end(content);
  } catch (e) {
    res.writeHead(404); res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`\n🇧🇩 Bangla Practice dev server running at http://localhost:${PORT}\n`);
});
