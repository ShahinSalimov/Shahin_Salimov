// Minimal OpenAI-compatible mock used only by the E2E suite. Never used in production.
import { createServer } from 'node:http';

const port = Number(process.env.MOCK_AI_PORT ?? 9911);
let calls = 0;

function concepts() {
  return {
    concepts: Array.from({ length: 5 }, (_, i) => ({
      title: `AI concept ${i + 1}`,
      mainIdea: `Mock idea ${i + 1}`,
      audience: 'Mock audience',
      angle: `Angle ${i + 1}`,
      emotionalTrigger: 'Curiosity',
      hook: `AI hook number ${i + 1}`,
      message: 'Mock message',
      cta: 'Order today',
      visualDirection: 'Mock visual direction',
    })),
  };
}

function script(user) {
  const n = Number(/exactly (\d+) scenes/.exec(user)?.[1] ?? 6);
  const total = Number(/"durationSeconds":(\d+)/.exec(user)?.[1] ?? 30);
  // Deliberately wrong arithmetic: the app must still fit timings exactly.
  return {
    scenes: Array.from({ length: n }, (_, i) => ({
      duration: Math.round(total / n) + 1,
      shot: i === 0 ? 'close' : i === n - 1 ? 'text' : 'medium',
      visual: `AI visual ${i + 1}`,
      camera: 'Static medium shot',
      action: 'Subject acts',
      onScreenText: `AI text ${i + 1}`,
      voiceover: `AI line ${i + 1}.`,
      sfx: 'Soft whoosh',
      transition: 'Hard cut',
    })),
  };
}

const social = () => ({
  instagram: 'AI Instagram caption',
  tiktok: 'AI TikTok caption',
  youtubeShorts: 'AI Shorts description #Shorts',
  facebook: 'AI Facebook text',
  hashtags: ['#ai', '#mock'],
  shortTitle: 'AI short title',
  ctas: ['Order today', 'Message us', 'Save this post'],
});

createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    if (req.url === '/calls') {
      res.end(String(calls));
      return;
    }
    calls++;
    const body = JSON.parse(raw || '{}');
    const user = body.messages?.find((m) => m.role === 'user')?.content ?? '';
    const auth = req.headers.authorization === 'Bearer e2e-key';
    const content = !auth ? null : /video script/.test(user) ? script(user) : /social copy/.test(user) ? social() : concepts();
    res.writeHead(auth ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        auth
          ? { id: 'x', object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, finish_reason: 'stop', logprobs: null, message: { role: 'assistant', content: JSON.stringify(content), refusal: null } }] }
          : { error: { message: 'bad key' } },
      ),
    );
  });
}).listen(port, '127.0.0.1', () => console.log(`mock AI on ${port}`));
