import React, { useMemo, useState } from 'react';
import { MessageCircle, Send, Sparkles, X } from 'lucide-react';
import chatbotFace from '../assets/chatbot.png';

const BOT_NAME = 'COBRA Assistant';

const quickPrompts = [
  'Find an available room for 40 students',
  'Show room schedules this week',
  'Help me create a non-academic request',
];

export default function CobraChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');

  const messages = useMemo(
    () => [
      {
        id: 'intro',
        role: 'bot',
        text: `Hi! I am ${BOT_NAME}, your SWU-IFSS chatbot. Ask me about rooms, schedules, and requests.`,
      },
      {
        id: 'ui-note',
        role: 'bot',
        text: 'This is UI preview mode only. No database or backend is connected yet.',
      },
    ],
    []
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[70] w-16 h-16 rounded-full shadow-xl flex items-center justify-center border-2 border-white print:hidden"
        style={{ background: 'linear-gradient(135deg, #800000 0%, #9E1C1C 100%)' }}
        title={`Open ${BOT_NAME}`}
      >
        <img
          src={chatbotFace}
          alt="Cobra chatbot"
          className="w-full h-full object-cover rounded-full"
        />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-end p-4 md:p-6 print:hidden">
          <div className="absolute inset-0 bg-black/20" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-white">
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, #800000 0%, #5F0000 100%)' }}
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
                AI Preview Interface
              </div>
            </div>

            <div className="h-[320px] overflow-y-auto p-4 space-y-3 bg-[#FCFCFD]">
              {messages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: '#FFEFEF', color: '#7A0808' }}
                  >
                    <MessageCircle size={13} />
                  </div>
                  <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed border border-gray-200 bg-white text-[#2B3235]">
                    {msg.text}
                  </div>
                </div>
              ))}

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Quick Prompts</p>
                <div className="flex flex-wrap gap-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="text-[11px] px-2.5 py-1.5 rounded-full border border-gray-200 bg-white text-[#2B3235] hover:border-[#800000] hover:text-[#800000]"
                      onClick={() => setInput(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-gray-100 bg-white">
              <div className="flex items-center gap-2">
                <input
                  className="form-input text-sm"
                  placeholder="Type your message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button
                  type="button"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                  style={{ background: '#800000' }}
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
