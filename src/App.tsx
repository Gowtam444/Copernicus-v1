import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, AlertCircle, Volume2, Menu, Plus, X, MessageSquare, ArrowRightLeft } from 'lucide-react';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const LANGUAGES = [
  { code: 'ar', name: 'Arabic', speechCode: 'ar-SA' },
  { code: 'bn', name: 'Bengali', speechCode: 'bn-IN' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)', speechCode: 'zh-CN' },
  { code: 'en', name: 'English', speechCode: 'en-US' },
  { code: 'fr', name: 'French', speechCode: 'fr-FR' },
  { code: 'de', name: 'German', speechCode: 'de-DE' },
  { code: 'gu', name: 'Gujarati', speechCode: 'gu-IN' },
  { code: 'hi', name: 'Hindi', speechCode: 'hi-IN' },
  { code: 'it', name: 'Italian', speechCode: 'it-IT' },
  { code: 'ja', name: 'Japanese', speechCode: 'ja-JP' },
  { code: 'kn', name: 'Kannada', speechCode: 'kn-IN' },
  { code: 'ko', name: 'Korean', speechCode: 'ko-KR' },
  { code: 'ml', name: 'Malayalam', speechCode: 'ml-IN' },
  { code: 'mr', name: 'Marathi', speechCode: 'mr-IN' },
  { code: 'ne', name: 'Nepali', speechCode: 'ne-NP' },
  { code: 'or', name: 'Odia', speechCode: 'or-IN' },
  { code: 'pa', name: 'Punjabi', speechCode: 'pa-IN' },
  { code: 'ru', name: 'Russian', speechCode: 'ru-RU' },
  { code: 'es', name: 'Spanish', speechCode: 'es-ES' },
  { code: 'ta', name: 'Tamil', speechCode: 'ta-IN' },
  { code: 'te', name: 'Telugu', speechCode: 'te-IN' },
  { code: 'ur', name: 'Urdu', speechCode: 'ur-IN' },
];

type Speaker = 1 | 2;

interface Message {
  id: string;
  speaker: Speaker;
  text1: string; // Text in Person 1's language
  text2: string; // Text in Person 2's language
  timestamp: number;
  sourceLang: string;
  targetLang: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  lang1: string;
  lang2: string;
  updatedAt: number;
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>(Date.now().toString());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [lang1, setLang1] = useState('en');
  const [lang2, setLang2] = useState('es');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  
  const [activeRecording, setActiveRecording] = useState<Speaker | null>(null);
  const [interimText, setInterimText] = useState<string>('');
  const [processingSpeaker, setProcessingSpeaker] = useState<Speaker | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>('');
  
  const generatedAudioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
    } else {
      setError("Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari for the best experience.");
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, processingSpeaker]);

  // Auto-save conversations
  useEffect(() => {
    setConversations(prev => {
      const existingIndex = prev.findIndex(c => c.id === currentConversationId);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          messages,
          lang1,
          lang2,
          updatedAt: Date.now()
        };
        return updated.sort((a, b) => b.updatedAt - a.updatedAt);
      } else if (messages.length > 0) {
        return [
          {
            id: currentConversationId,
            title: `Chat (${lang1} & ${lang2})`,
            messages,
            lang1,
            lang2,
            updatedAt: Date.now()
          },
          ...prev
        ];
      }
      return prev;
    });
  }, [messages, lang1, lang2, currentConversationId]);

  const startNewConversation = () => {
    stopAllAudio();
    setCurrentConversationId(Date.now().toString());
    setMessages([]);
    setIsSidebarOpen(false);
  };

  const loadConversation = (id: string) => {
    stopAllAudio();
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setCurrentConversationId(conv.id);
      setMessages(conv.messages);
      setLang1(conv.lang1);
      setLang2(conv.lang2);
      setIsSidebarOpen(false);
    }
  };

  const stopAllAudio = () => {
    window.speechSynthesis.cancel();
    if (generatedAudioRef.current) {
      generatedAudioRef.current.pause();
      generatedAudioRef.current.currentTime = 0;
    }
  };

  const speakText = async (text: string, langCode: string) => {
    stopAllAudio();
    
    const speechCode = LANGUAGES.find(l => l.code === langCode)?.speechCode || langCode;
    
    let hasLocalVoice = false;
    if (window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      const langVoices = voices.filter(v => v.lang.toLowerCase().startsWith(speechCode.toLowerCase()) || v.lang.toLowerCase().startsWith(speechCode.split('-')[0].toLowerCase()));
      
      if (langVoices.length > 0) {
        hasLocalVoice = true;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = speechCode;
        utterance.rate = playbackSpeed;
        
        // Prefer premium/natural voices if available for clarity
        const premiumVoice = langVoices.find(v => v.name.includes('Premium') || v.name.includes('Natural') || v.name.includes('Google'));
        if (premiumVoice) {
          utterance.voice = premiumVoice;
        } else {
          utterance.voice = langVoices[0];
        }
        
        window.speechSynthesis.speak(utterance);
      }
    }
    
    // If no local voice is found (common for Indian languages), fallback to Google Translate TTS
    if (!hasLocalVoice) {
      try {
        const res = await fetch('/api/fallback-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, lang: langCode })
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.playbackRate = playbackSpeed;
          generatedAudioRef.current = audio;
          audio.play().catch(e => console.error("Audio play error:", e));
        }
      } catch (e) {
        console.error("Fallback TTS error:", e);
      }
    }
  };

  const startRecording = (speaker: Speaker) => {
    if (!recognitionRef.current) {
      setError("Speech Recognition is not supported in this browser.");
      return;
    }
    
    setError(null);
    setActiveRecording(speaker);
    setInterimText('');
    finalTranscriptRef.current = '';
    
    const rec = recognitionRef.current;
    const langCode = speaker === 1 ? lang1 : lang2;
    rec.lang = LANGUAGES.find(l => l.code === langCode)?.speechCode || langCode;
    
    rec.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      setInterimText(transcript);
      finalTranscriptRef.current = transcript;
    };
    
    rec.onerror = (event: any) => {
      if (event.error !== 'aborted') {
        setError("Microphone error: " + event.error);
      }
      setActiveRecording(null);
    };
    
    rec.onend = () => {
      setActiveRecording(null);
      const text = finalTranscriptRef.current.trim();
      setInterimText('');
      if (text) {
        processText(text, speaker);
      }
    };
    
    try {
      rec.start();
    } catch (e) {
      console.error(e);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && activeRecording !== null) {
      recognitionRef.current.stop(); // Triggers onend
    }
  };

  const processText = async (text: string, speaker: Speaker) => {
    setProcessingSpeaker(speaker);
    setError(null);

    try {
      const sourceLang = speaker === 1 ? lang1 : lang2;
      const targetLang = speaker === 1 ? lang2 : lang1;

      const res = await fetch('/api/free-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLang, targetLang })
      });
      
      if (!res.ok) throw new Error("Translation failed");
      const { translation } = await res.json();

      const newMessage: Message = {
        id: Date.now().toString(),
        speaker,
        text1: speaker === 1 ? text : translation,
        text2: speaker === 2 ? text : translation,
        timestamp: Date.now(),
        sourceLang,
        targetLang,
      };

      setMessages(prev => [...prev, newMessage]);
      
      // Auto-play the translation
      speakText(translation, targetLang);

    } catch (err: any) {
      console.error('Processing error:', err);
      setError(err.message || 'Failed to process audio. Please try again.');
    } finally {
      setProcessingSpeaker(null);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col font-sans bg-neutral-50 text-neutral-900 overflow-hidden relative">
      {/* Sidebar Overlay & Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 w-80 bg-white z-50 flex flex-col border-r border-neutral-200 shadow-2xl"
            >
              <div className="p-6 flex items-center justify-between border-b border-neutral-100">
                <h2 className="text-xl font-semibold">Conversations</h2>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4">
                <button
                  onClick={startNewConversation}
                  className="w-full flex items-center justify-center gap-2 bg-black hover:bg-neutral-800 text-white py-3 px-4 rounded-xl font-medium transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  New Conversation
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {conversations.length === 0 ? (
                  <p className="text-center text-neutral-500 mt-8 text-sm">No previous conversations</p>
                ) : (
                  conversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className={cn(
                        "w-full flex flex-col text-left p-4 rounded-xl transition-colors border",
                        currentConversationId === conv.id 
                          ? "bg-neutral-100 border-neutral-200" 
                          : "bg-transparent border-transparent hover:bg-neutral-50"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <MessageSquare className="w-4 h-4 text-black" />
                        <span className="font-medium truncate">{conv.title}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span>{conv.messages.length} messages</span>
                        <span>{new Date(conv.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Error overlay */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 max-w-md w-[calc(100%-2rem)]"
          >
            <AlertCircle className="w-6 h-6 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="ml-auto bg-white/20 hover:bg-white/30 p-1.5 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-2 sm:px-4 py-2 sm:py-3 flex flex-wrap items-center justify-between shrink-0 shadow-sm z-10 gap-y-2">
        <div className="flex items-center gap-1 sm:gap-3">
          <button onClick={() => setIsSidebarOpen(true)} className="p-1.5 sm:p-2 hover:bg-neutral-100 rounded-full transition-colors">
            <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-600" />
          </button>
          <h1 className="font-bold text-base sm:text-lg text-black hidden md:block">VoiceMatch</h1>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 bg-neutral-100 p-1 rounded-xl flex-1 mx-1 sm:mx-4 justify-between sm:justify-center min-w-0">
          <select value={lang1} onChange={e => setLang1(e.target.value)} disabled={activeRecording !== null || processingSpeaker !== null} className="bg-transparent font-medium outline-none cursor-pointer py-1 px-1 sm:px-2 text-xs sm:text-sm w-[40%] sm:w-auto sm:max-w-[120px] text-ellipsis overflow-hidden">
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <button 
            onClick={() => {
              setLang1(lang2);
              setLang2(lang1);
            }}
            disabled={activeRecording !== null || processingSpeaker !== null}
            className="p-1 sm:p-1.5 hover:bg-neutral-200 rounded-full transition-colors text-neutral-500 disabled:opacity-50 shrink-0"
            title="Swap languages"
          >
            <ArrowRightLeft className="w-3 h-3 sm:w-4 sm:h-4" />
          </button>
          <select value={lang2} onChange={e => setLang2(e.target.value)} disabled={activeRecording !== null || processingSpeaker !== null} className="bg-transparent font-medium outline-none cursor-pointer py-1 px-1 sm:px-2 text-xs sm:text-sm w-[40%] sm:w-auto sm:max-w-[120px] text-ellipsis overflow-hidden">
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex items-center bg-neutral-100 p-1 rounded-xl shrink-0">
          <span className="text-xs font-medium text-neutral-500 pl-2 hidden sm:inline">Speed:</span>
          <select 
            value={playbackSpeed} 
            onChange={e => setPlaybackSpeed(Number(e.target.value))} 
            className="bg-transparent font-medium outline-none cursor-pointer py-1 px-1 sm:px-2 text-xs sm:text-sm"
          >
            <option value={0.75}>0.75x</option>
            <option value={0.9}>0.9x</option>
            <option value={1.0}>1.0x</option>
            <option value={1.1}>1.1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
          </select>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth" ref={scrollRef}>
        {messages.length === 0 && processingSpeaker === null && (
          <div className="h-full flex items-center justify-center text-center opacity-40 font-medium">
            Hold a microphone button below to speak
          </div>
        )}

        {messages.map(msg => {
          const isMine = msg.speaker === 1;
          const originalText = isMine ? msg.text1 : msg.text2;
          const translatedText = isMine ? msg.text2 : msg.text1;
          const originalLang = msg.sourceLang || (isMine ? lang1 : lang2);
          const translatedLang = msg.targetLang || (isMine ? lang2 : lang1);
          const timeString = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          return (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              key={msg.id}
              className={cn(
                "flex flex-col max-w-[90%] md:max-w-[75%]",
                isMine ? "items-end self-end ml-auto" : "items-start self-start mr-auto"
              )}
            >
              <span className={cn(
                "text-xs font-bold mb-1.5 uppercase tracking-wider",
                isMine ? "text-black" : "text-neutral-500"
              )}>
                {isMine ? "You" : "Them"}
              </span>
              <div className={cn(
                "p-4 rounded-3xl text-lg leading-relaxed shadow-sm flex flex-col gap-4 w-full",
                isMine 
                  ? "bg-black text-white rounded-tr-sm" 
                  : "bg-white text-neutral-900 rounded-tl-sm border border-neutral-200"
              )}>
                {/* Original */}
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{LANGUAGES.find(l => l.code === originalLang)?.name || originalLang} (Original)</span>
                      <span className="text-[10px] opacity-60 ml-4">{timeString}</span>
                    </div>
                    <span>{originalText}</span>
                  </div>
                  <button
                    onClick={() => speakText(originalText, originalLang)}
                    className={cn(
                      "shrink-0 p-2.5 rounded-full transition-colors opacity-80 hover:opacity-100 mt-1",
                      isMine 
                        ? "bg-neutral-800 hover:bg-neutral-700 text-white" 
                        : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                    )}
                    title="Play original audio"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
                
                <div className={cn("h-px w-full opacity-20", isMine ? "bg-white" : "bg-neutral-300")} />

                {/* Translated */}
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{LANGUAGES.find(l => l.code === translatedLang)?.name || translatedLang} (Translated)</span>
                      <span className="text-[10px] opacity-60 ml-4">{timeString}</span>
                    </div>
                    <span>{translatedText}</span>
                  </div>
                  <button
                    onClick={() => speakText(translatedText, translatedLang)}
                    className={cn(
                      "shrink-0 p-2.5 rounded-full transition-colors opacity-80 hover:opacity-100 mt-1",
                      isMine 
                        ? "bg-neutral-800 hover:bg-neutral-700 text-white" 
                        : "bg-neutral-100 hover:bg-neutral-200 text-neutral-700"
                    )}
                    title="Play translated audio"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {activeRecording !== null && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={cn(
              "flex flex-col max-w-[90%] md:max-w-[75%]",
              activeRecording === 1 ? "items-end self-end ml-auto" : "items-start self-start mr-auto"
            )}
          >
            <span className={cn(
              "text-xs font-bold mb-1.5 uppercase tracking-wider",
              activeRecording === 1 ? "text-black" : "text-neutral-500"
            )}>
              {activeRecording === 1 ? "You" : "Them"} (Listening...)
            </span>
            <div className={cn(
              "p-4 rounded-3xl text-lg leading-relaxed shadow-sm flex flex-col gap-4 w-full opacity-80",
              activeRecording === 1 
                ? "bg-black text-white rounded-tr-sm" 
                : "bg-white text-neutral-900 rounded-tl-sm border border-neutral-200"
            )}>
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                <span className="italic">{interimText || "Listening..."}</span>
              </div>
            </div>
          </motion.div>
        )}

        {processingSpeaker !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              "flex flex-col py-2 gap-2",
              processingSpeaker === 1 ? "items-end self-end ml-auto" : "items-start self-start mr-auto"
            )}
          >
            <div className="bg-neutral-200 text-neutral-500 px-4 py-3 rounded-2xl flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Translating...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="bg-white border-t border-neutral-200 p-4 shrink-0 pb-safe">
        <div className="max-w-md mx-auto flex items-center justify-between gap-8">
          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Them ({LANGUAGES.find(l => l.code === lang2)?.name || lang2})</span>
            <div className="relative">
              <AnimatePresence>
                {activeRecording === 2 && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.5, opacity: 0.2 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    className="absolute inset-0 bg-red-500 rounded-full"
                  />
                )}
              </AnimatePresence>
              <button
                onPointerDown={() => {
                  if (activeRecording !== null || processingSpeaker !== null) return;
                  startRecording(2);
                }}
                onPointerUp={() => stopRecording()}
                onPointerLeave={() => stopRecording()}
                onPointerCancel={() => stopRecording()}
                onContextMenu={(e) => e.preventDefault()}
                disabled={activeRecording !== null && activeRecording !== 2 || processingSpeaker !== null}
                className={cn(
                  "relative z-10 flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 shadow-md touch-none select-none",
                  activeRecording === 2
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20 scale-110" 
                    : "bg-white border-2 border-neutral-200 hover:border-neutral-300 text-neutral-600",
                  (activeRecording === 1 || processingSpeaker !== null) && "opacity-30 cursor-not-allowed scale-90"
                )}
              >
                {activeRecording === 2 ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-6 h-6" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            <span className="text-xs font-bold text-black uppercase tracking-wider">You ({LANGUAGES.find(l => l.code === lang1)?.name || lang1})</span>
            <div className="relative">
              <AnimatePresence>
                {activeRecording === 1 && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.5, opacity: 0.2 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    className="absolute inset-0 bg-red-500 rounded-full"
                  />
                )}
              </AnimatePresence>
              <button
                onPointerDown={() => {
                  if (activeRecording !== null || processingSpeaker !== null) return;
                  startRecording(1);
                }}
                onPointerUp={() => stopRecording()}
                onPointerLeave={() => stopRecording()}
                onPointerCancel={() => stopRecording()}
                onContextMenu={(e) => e.preventDefault()}
                disabled={activeRecording !== null && activeRecording !== 1 || processingSpeaker !== null}
                className={cn(
                  "relative z-10 flex items-center justify-center w-16 h-16 rounded-full transition-all duration-300 shadow-md touch-none select-none",
                  activeRecording === 1
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20 scale-110" 
                    : "bg-black hover:bg-neutral-800 text-white shadow-black/20",
                  (activeRecording === 2 || processingSpeaker !== null) && "opacity-30 cursor-not-allowed scale-90"
                )}
              >
                {activeRecording === 1 ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
