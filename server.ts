import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/free-translate", async (req, res) => {
    try {
      const { text, sourceLang, targetLang } = req.body;
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        return res.status(response.status).json({ error: "Translation failed" });
      }
      
      const data = await response.json();
      const translation = data[0].map((item: any) => item[0]).join('');
      res.json({ translation });
    } catch (error) {
      console.error("Free translation error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/fallback-tts", async (req, res) => {
    try {
      const { text, lang } = req.body;
      
      // Split text into chunks to avoid Google Translate TTS length limits (~200 chars)
      const chunks: string[] = [];
      let currentChunk = '';
      const words = text.split(' ');
      
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
      
      res.set("Content-Type", "audio/mpeg");
      res.send(Buffer.concat(buffers));
    } catch (error) {
      console.error("Fallback TTS error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
