import { useEffect, useMemo, useRef, useState } from "react";

const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const WS_URL = (API.replace("http", "ws") + "/ws/chat").replace(/\/+$/, "");

export default function ChatPanel({ problem }) {
  const [messages, setMessages] = useState([
    { id: "sys1", role: "assistant", text: "Hi! Ask me for a hint or paste a snippet." },
  ]);
  const [input, setInput] = useState("");
  const [connecting, setConnecting] = useState(true);
  const [online, setOnline] = useState(false);
  const wsRef = useRef(null);
  const scrollRef = useRef(null);

  const meta = useMemo(() => ({
    problem_title: problem?.title ?? null,
    problem_statement: problem?.statement ?? null,
  }), [problem]);

  // autoscroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // connect WS
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnecting(false);
      setOnline(true);
    };
    ws.onclose = () => {
      setOnline(false);
    };
    ws.onerror = () => {
      setOnline(false);
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "token") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.streaming) {
              const merged = [...prev];
              merged[merged.length - 1] = { ...last, text: (last.text || "") + msg.text, streaming: true };
              return merged;
            }
            return [...prev, { id: crypto.randomUUID(), role: "assistant", text: msg.text, streaming: true }];
          });
        } else if (msg.type === "done") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              const merged = [...prev];
              merged[merged.length - 1] = { ...last, streaming: false };
              return merged;
            }
            return prev;
          });
        } else if (msg.type === "error") {
          setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", text: "⚠ " + msg.error }]);
        }
      } catch {
        // ignore bad frames
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendWS = () => {
    if (!input.trim()) return;
    const userMsg = { id: crypto.randomUUID(), role: "user", text: input };
    setMessages((p) => [...p, userMsg]);
    setInput("");

    if (online && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message: userMsg.text, ...meta }));
      // placeholder assistant slot to stream into
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", text: "", streaming: true }]);
    } else {
      // Fallback to REST
      fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg.text, ...meta }),
      })
        .then((r) => r.json())
        .then((data) => {
          setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", text: data.reply }]);
        })
        .catch(() => {
          setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", text: "Network error." }]);
        });
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendWS();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong>Chat</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {connecting ? "Connecting…" : online ? "Live" : "Offline (REST)"}
        </span>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          border: "1px solid #2d2f36",
          borderRadius: 8,
          padding: 12,
          background: "#0f1115",
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              margin: "8px 0",
              whiteSpace: "pre-wrap",
              opacity: m.streaming ? 0.95 : 1,
            }}
          >
            <span style={{ fontWeight: 600 }}>{m.role === "user" ? "You" : "Assistant"}: </span>
            <span>{m.text}</span>
            {m.streaming && <span className="blink">▍</span>}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask for a hint, paste a snippet, or describe the issue…"
          style={{
            flex: 1,
            height: 64,
            resize: "none",
            padding: 8,
            borderRadius: 8,
            border: "1px solid #2d2f36",
            background: "#0f1115",
            color: "inherit",
          }}
        />
        <button onClick={sendWS} style={{ borderRadius: 8, padding: "0 14px" }}>
          Send
        </button>
      </div>
    </div>
  );
}
