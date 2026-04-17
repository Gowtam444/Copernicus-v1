export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
}