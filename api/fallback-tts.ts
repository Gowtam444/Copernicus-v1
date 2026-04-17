export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, lang } = req.body;

    // Split text into chunks to avoid Google Translate TTS length limits (~200 chars)
    const chunks: string[] = [];
    let currentChunk = '';
    const words = (text || '').split(' ');

    for (const word of words) {
      if ((currentChunk + ' ' + word).length <= 150) {
        currentChunk += (currentChunk ? ' ' : '') + word;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = word;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    const buffers = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk.trim())}&tl=${lang}&client=tw-ob`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });

      if (response.ok) {
        buffers.push(Buffer.from(await response.arrayBuffer()));
      } else {
        console.error(`TTS chunk failed with status ${response.status}`);     
      }
    }

    if (buffers.length === 0) {
      return res.status(500).json({ error: "Fallback TTS failed" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.concat(buffers));
  } catch (error) {
    console.error("Fallback TTS error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}