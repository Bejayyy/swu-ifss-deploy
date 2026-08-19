import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Send, Sparkles, X, Loader2, AlertCircle } from 'lucide-react';
import chatbotFace from '../assets/chatbot.png';
import { queryGeminiWithRAG, generateQuickPrompts, preloadSystemData } from '../services/ragChatbotService_fetch';

const BOT_NAME = 'COBRA Assistant';

export default function CobraChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataPreloaded, setDataPreloaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(2);
  const [quickPrompts, setQuickPrompts] = useState([
    'Find an available room for 40 students',
    'Show room schedules this week',
    'Which rooms have projectors?',
  ]);

  // Initialize chatbot with welcome message
  useEffect(() => {
    const initMessages = [
      {
        id: 'intro',
        role: 'bot',
        text: `Hi! I am ${BOT_NAME}, your SWU-IFSS intelligent assistant. Ask me about rooms, schedules, availability, equipment, and facility performance.`,
      },
      {
        id: 'capabilities',
        role: 'bot',
        text: 'I can help you:\n• Find rooms by capacity and requirements\n• Check room availability and schedules\n• View room equipment and facilities\n• Get information about maintenance status\n• Analyze room performance data',
      },
    ];
    setMessages(initMessages);

    // Load dynamic quick prompts
    generateQuickPrompts().then(prompts => {
      if (prompts && prompts.length > 0) {
        setQuickPrompts(prompts);
      }
    }).catch(err => {
      console.error('Error loading quick prompts:', err);
    });
  }, []);

  // Preload data when chat window opens
  useEffect(() => {
    if (open && !dataPreloaded) {
      console.log('🚀 Pre-loading system data for faster responses...');
      preloadSystemData()
        .then(() => {
          console.log('✅ System data pre-loaded and cached!');
          setDataPreloaded(true);
        })
        .catch(err => {
          console.warn('⚠️ Pre-load failed, will load on demand:', err);
        });
    }
  }, [open, dataPreloaded]);

  // Handle sending a message with streaming
  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: input.trim(),
    };

    // Add user message to chat
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Create placeholder for bot response
    const botMessageId = `bot-${Date.now()}`;
    const botMessage = {
      id: botMessageId,
      role: 'bot',
      text: '',
    };
    setMessages(prev => [...prev, botMessage]);

    try {
      // Get minimal conversation history (last 4 messages = 2 turns)
      const conversationHistory = messages.slice(-4);

      // Stream response chunks
      let fullResponse = '';
      for await (const chunk of queryGeminiWithRAG(userMessage.text, conversationHistory)) {
        fullResponse += chunk;
        // Update bot message with accumulated text
        setMessages(prev => 
          prev.map(msg => 
            msg.id === botMessageId 
              ? { ...msg, text: fullResponse }
              : msg
          )
        );
      }
      if (!open) {
        setUnreadCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => 
        prev.map(msg => 
          msg.id === botMessageId 
            ? { 
                ...msg, 
                text: 'Sorry, I encountered an error. Please check your Gemini API key configuration.',
                error: true 
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle quick prompt click
  const handleQuickPrompt = (prompt) => {
    setInput(prompt);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setUnreadCount(0);
        }}
        className="fixed bottom-6 right-6 z-[70] w-16 h-16 rounded-full shadow-2xl flex items-center justify-center border-2 border-white print:hidden transition-all duration-300 hover:scale-110 active:scale-95 group cursor-pointer bg-[#7A0808]"
        title={`Open ${BOT_NAME}`}
      >
        <div className="relative w-full h-full rounded-full overflow-hidden p-1.5 bg-[#7A0808] flex items-center justify-center">
          <img
            src={chatbotFace}
            alt="COBRA AI Assistant"
            className="w-full h-full object-contain transform group-hover:scale-105 transition-transform duration-300"
          />
        </div>

        {/* Live Active Green Status Ping */}
        <span className="absolute bottom-0 right-0 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white shadow-2xs"></span>
        </span>

        {/* Unread Chat Message Count Badge */}
        {unreadCount > 0 && !open && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center rounded-full text-[11px] font-black shadow-md bg-[#F59E0B] text-white border-2 border-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-end p-4 md:p-6 print:hidden">
          <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, #7A0808 0%, #5F0000 100%)' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-white/15 flex items-center justify-center border border-white/25">
                  <img
                    src={chatbotFace}
                    alt="Cobra chatbot"
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                <div>
                  <p className="text-sm font-black text-white leading-tight">{BOT_NAME}</p>
                  <p className="text-[11px] font-medium text-white/80">Smart Facility Chatbot</p>
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-lg text-white/90 hover:bg-white/15"
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-4 bg-[#FFF8F8] border-b border-[#f0dede]">
              <div className="inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-[#f0dede] text-[#7A0808]">
                <Sparkles size={12} />
                {dataPreloaded ? 'AI Ready - Instant Responses' : 'AI Loading Data...'}
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">
                {dataPreloaded 
                  ? 'Data cached • Ready for instant answers' 
                  : 'Pre-loading system data for faster responses...'}
              </p>
            </div>

            <div className="h-[380px] overflow-y-auto p-4 space-y-3 bg-[#FCFCFD]">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      msg.role === 'user' 
                        ? 'bg-gray-200 text-gray-700' 
                        : msg.error 
                        ? 'bg-red-100 text-red-600'
                        : 'bg-[#FFEFEF] text-[#7A0808]'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <span className="text-xs font-bold">U</span>
                    ) : msg.error ? (
                      <AlertCircle size={13} />
                    ) : (
                      <img src={chatbotFace} alt="Cobra bot" className="w-full h-full object-cover rounded-full" />
                    )}
                  </div>
                  <div 
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed border ${
                      msg.role === 'user'
                        ? 'bg-[#7A0808] text-white border-[#7A0808]'
                        : msg.error
                        ? 'bg-red-50 border-red-200 text-red-900'
                        : 'bg-white border-gray-200 text-[#2B3235]'
                    }`}
                    style={{ whiteSpace: 'pre-wrap' }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-[#FFEFEF] text-[#7A0808]">
                    <Loader2 size={13} className="animate-spin" />
                  </div>
                  <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed border border-gray-200 bg-white text-[#2B3235]">
                    <div className="flex items-center gap-2">
                      <span>Analyzing system data</span>
                      <span className="flex gap-1">
                        <span className="w-1 h-1 bg-[#7A0808] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-1 bg-[#7A0808] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-1 bg-[#7A0808] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {!loading && messages.length > 2 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Suggested Questions</p>
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        className="text-[11px] px-2.5 py-1.5 rounded-full border border-gray-200 bg-white text-[#2B3235] hover:border-[#7A0808] hover:text-[#7A0808] transition-colors"
                        onClick={() => handleQuickPrompt(prompt)}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-gray-100 bg-white">
              <div className="flex items-center gap-2">
                <input
                  className="form-input text-sm flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7A0808] focus:border-transparent"
                  placeholder="Ask about rooms, schedules, equipment..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  style={{ background: '#7A0808' }}
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5 text-center">
                Powered by Google Gemini AI • Real-time data from Firestore
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
