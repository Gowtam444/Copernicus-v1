import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface TranslationResult {
  transcription: string;
  translation: string;
  speakerGender: "male" | "female";
}

export async function translateAudio(
  base64Audio: string,
  mimeType: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<TranslationResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: base64Audio,
            mimeType: mimeType,
          },
        },
        `Transcribe this audio (spoken in ${sourceLanguage}), translate it to ${targetLanguage}. Preserve the original emotion, tone, and articulation by using appropriate punctuation (commas, exclamation marks, etc.) in the translation. Determine if the speaker sounds more 'male' or 'female'. Keep the response concise.`,
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcription: {
              type: Type.STRING,
              description: `The transcription of the original audio in ${sourceLanguage}`,
            },
            translation: {
              type: Type.STRING,
              description: `The translation of the audio into ${targetLanguage}`,
            },
            speakerGender: {
              type: Type.STRING,
              description: "The perceived gender of the speaker",
              enum: ["male", "female"],
            },
          },
          required: ["transcription", "translation", "speakerGender"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return JSON.parse(text) as TranslationResult;
  } catch (error: any) {
    const errorString = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
    if (errorString.includes("429") || errorString.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("Gemini API quota exceeded. Please check your API key billing details or try again later.");
    }
    throw error;
  }
}

function createWavHeader(dataLength: number, sampleRate: number, numChannels: number, bitsPerSample: number): ArrayBuffer {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  return header;
}

export async function generateSpeech(
  text: string, 
  detectedGender: "male" | "female",
  language: string
): Promise<{ buffer: ArrayBuffer, isFallback: boolean } | null> {
  
  const supportedByGemini = ['Arabic', 'Chinese (Mandarin)', 'English', 'French', 'German', 'Hindi', 'Italian', 'Japanese', 'Korean', 'Russian', 'Spanish'];
  
  if (supportedByGemini.includes(language)) {
    try {
      const voiceName = detectedGender === "female" ? "Aoede" : "Charon";
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const wavHeader = createWavHeader(bytes.length, 24000, 1, 16);
        const wavBytes = new Uint8Array(wavHeader.byteLength + bytes.length);
        wavBytes.set(new Uint8Array(wavHeader), 0);
        wavBytes.set(bytes, wavHeader.byteLength);
        
        return { buffer: wavBytes.buffer, isFallback: false };
      }
    } catch (error: any) {
      const errorString = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      if (errorString.includes("429") || errorString.includes("RESOURCE_EXHAUSTED")) {
        throw new Error("Gemini API quota exceeded. Please check your API key billing details or try again later.");
      }
      // Suppress the console error for unsupported prompts
      if (!errorString.includes("not supported by the AudioOut model")) {
        console.error("Gemini TTS generation failed:", error);
      }
    }
  }
  
  // Fallback to Google Translate TTS API for unsupported languages
  try {
    const langMap: Record<string, string> = {
      'Arabic': 'ar', 'Bengali': 'bn', 'Chinese (Mandarin)': 'zh-CN', 'English': 'en',
      'French': 'fr', 'German': 'de', 'Gujarati': 'gu', 'Hindi': 'hi', 'Italian': 'it',
      'Japanese': 'ja', 'Kannada': 'kn', 'Korean': 'ko', 'Malayalam': 'ml', 'Marathi': 'mr',
      'Nepali': 'ne', 'Odia': 'or', 'Punjabi': 'pa', 'Russian': 'ru', 'Spanish': 'es',
      'Tamil': 'ta', 'Telugu': 'te', 'Urdu': 'ur'
    };
    
    const langCode = langMap[language] || 'en';
    
    // Split text into smaller chunks if it's too long (Google TTS limit is ~200 chars)
    // For simplicity in this chat app, we assume messages are relatively short.
    const response = await fetch('/api/fallback-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.substring(0, 200), lang: langCode })
    });
    
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      return { buffer, isFallback: true };
    } else {
      console.error("Fallback TTS failed:", await response.text());
    }
  } catch (error) {
    console.error("Fallback TTS error:", error);
  }
  
  return null;
}
