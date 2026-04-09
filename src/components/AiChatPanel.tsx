"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, Send, Loader2, X, Sparkles, Trash2, ChevronDown,
} from "lucide-react";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

export default function AiChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load history when panel opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      loadHistory();
    }
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  // Trigger for automatic message sending
  const [autoSendTrigger, setAutoSendTrigger] = useState<string | null>(null);

  useEffect(() => {
    if (autoSendTrigger && !isLoading) {
      sendMessage(autoSendTrigger);
      setAutoSendTrigger(null);
    }
  }, [autoSendTrigger, isLoading]);

  // Listen for external chat triggers
  useEffect(() => {
    const handleRemoteOpen = (e: any) => {
      const { message, autoSend } = e.detail || {};
      setIsOpen(true);
      if (message) {
        if (autoSend) {
          setAutoSendTrigger(message);
        } else {
          setInput(message);
        }
      }
    };

    window.addEventListener("open-ai-chat", handleRemoteOpen);
    return () => window.removeEventListener("open-ai-chat", handleRemoteOpen);
  }, []);

  const loadHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const res = await fetch("/api/chat");
      const data = await res.json();
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const sendMessage = async (overrideMsg?: string) => {
    const contentToSend = overrideMsg || input;
    const trimmed = contentToSend.trim();
    if (!trimmed || isLoading) return;

    if (!overrideMsg) setInput("");
    const userMessage: ChatMessage = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `笞・・繧ｨ繝ｩ繝ｼ: ${data.error}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "AI遘俶嶌縺御ｼ第・荳ｭ縺ｧ縺吶ょｰ代＠譎る俣繧堤ｽｮ縺・※縺九ｉ隧ｱ縺励°縺代※縺上□縺輔＞縲・ },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatContent = (content: string) => {
    // Simple markdown-like formatting
    return content.split("\n").map((line, i) => {
      if (line.startsWith("###")) {
        return <h4 key={i} className="font-bold text-sm mt-2 mb-1">{line.replace(/^###\s*/, "")}</h4>;
      }
      if (line.startsWith("##")) {
        return <h3 key={i} className="font-bold text-sm mt-2 mb-1">{line.replace(/^##\s*/, "")}</h3>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <li key={i} className="ml-3 text-sm">{formatInline(line.replace(/^[-*]\s*/, ""))}</li>;
      }
      if (line.match(/^\d+\./)) {
        return <li key={i} className="ml-3 text-sm list-decimal">{formatInline(line.replace(/^\d+\.\s*/, ""))}</li>;
      }
      if (line.trim() === "") return <br key={i} />;
      return <p key={i} className="text-sm">{formatInline(line)}</p>;
    });
  };

  const formatInline = (text: string) => {
    // Bold with **
    const parts = text.split(/(\*\*[^*]+\*\*)/);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full p-4 shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300 group"
        >
          <div className="relative">
            <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-pulse border-2 border-white" />
          </div>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-50 w-full md:w-[420px] h-[100dvh] md:h-[620px] bg-white md:rounded-2xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm tracking-wide">V-ARC AI遘俶嶌</h3>
                <p className="text-[10px] text-white/70 font-medium">繝ｪ繧｢繝ｫ繧ｿ繧､繝繝・・繧ｿ蛻・梵 窶｢ Gemini</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50/50">
            {isHistoryLoading ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-sm">螻･豁ｴ繧定ｪｭ縺ｿ霎ｼ縺ｿ荳ｭ...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-indigo-500" />
                </div>
                <h4 className="font-bold text-slate-800 text-lg mb-2">V-ARC AI遘俶嶌縺ｸ繧医≧縺薙◎</h4>
                <p className="text-sm text-slate-500 mb-6">
                  髯｢縺ｮ邨悟霧迥ｶ豕√ｒ繝ｪ繧｢繝ｫ繧ｿ繧､繝縺ｧ蛻・梵縺励・
                  <br />蜈ｷ菴鍋噪縺ｪ繧｢繧ｯ繧ｷ繝ｧ繝ｳ繧呈署譯医＠縺ｾ縺吶・
                </p>
                <div className="space-y-2 w-full">
                  {[
                    "莉翫・邨悟霧迥ｶ豕√ｒ縺ｩ縺・昴≧・・,
                    "莉頑怦縺ｮ逶ｮ讓咎＃謌舌・縺溘ａ縺ｫ縺吶∋縺阪％縺ｨ縺ｯ・・,
                    "髮・ｮ｢繧貞｢励ｄ縺吶い繧､繝・い繧呈蕗縺医※",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="w-full text-left p-3 bg-white rounded-xl border border-slate-200 text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group"
                    >
                      <span className="text-indigo-500 mr-2 group-hover:mr-3 transition-all">竊・/span>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-br-md"
                          : "bg-white text-slate-700 border border-slate-200 shadow-sm rounded-bl-md"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="space-y-1">{formatContent(msg.content)}</div>
                      ) : (
                        <p className="text-sm">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">蛻・梵荳ｭ...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="border-t bg-white px-4 py-3 shrink-0">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="邨悟霧縺ｫ縺､縺・※逶ｸ隲・☆繧・.."
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 placeholder:text-slate-400"
                disabled={isLoading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl px-4 py-2.5 transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              邨悟霧遘俶嶌AI 窶｢ 繝ｪ繧｢繝ｫ繧ｿ繧､繝繝・・繧ｿ縺ｫ蝓ｺ縺･縺乗署譯・
            </p>
          </div>
        </div>
      )}
    </>
  );
}

