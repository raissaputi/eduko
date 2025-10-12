import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const WS_URL = (API.replace("http", "ws") + "/ws/chat").replace(/\/+$/, "");

/** Minimal code block with header + Copy */
function CodeBlock({ inline, className, children, ...props }) {
  if (inline) return <code className={className} {...props}>{children}</code>;
  const codeRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const lang =
    (className?.match(/language-([\w+-]+)/)?.[1]) || // e.g. "language-html"
    (className?.split(" ").find(s => s !== "hljs") || "text"); // fallback when hljs adds classes

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codeRef.current?.innerText ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {}
  };

  return (
    <div className="codewrap">
      <div className="codehdr">
        <span className="lang">{lang}</span>
        <button className="copybtn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <pre className={className}><code ref={codeRef} {...props}>{children}</code></pre>
    </div>
  );
}

export default function ChatPanel({ problem }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [connecting, setConnecting] = useState(true);
  const [online, setOnline] = useState(false);
  const wsRef = useRef(null);
  const scrollRef = useRef(null);

  const meta = useMemo(() => ({
    problem_title: problem?.title ?? null,
    problem_statement: problem?.statement ?? null,
  }), [problem]);

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // connect WS once
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => { setConnecting(false); setOnline(true); };
    ws.onclose = () => setOnline(false);
    ws.onerror = () => setOnline(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "token") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.streaming) {
              const m = [...prev];
              m[m.length - 1] = { ...last, text: (last.text || "") + msg.text, streaming: true };
              return m;
            }
            return [...prev, { id: crypto.randomUUID(), role: "assistant", text: msg.text, streaming: true }];
          });
        } else if (msg.type === "done") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              const m = [...prev];
              m[m.length - 1] = { ...last, streaming: false };
              return m;
            }
            return prev;
          });
        } else if (msg.type === "error") {
          setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", text: "⚠ " + msg.error }]);
        }
      } catch {}
    };

    return () => ws.close();
  }, []);

  const send = () => {
    const content = input.trim();
    if (!content) return;

    const userMsg = { id: crypto.randomUUID(), role: "user", text: content };
    setMessages((p) => [...p, userMsg]);
    setInput("");

    if (online && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message: content, ...meta }));
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", text: "", streaming: true }]);
    } else {
      fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, ...meta }),
      })
        .then((r) => r.json())
        .then((data) => setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", text: data.reply }]))
        .catch(() => setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", text: "Network error." }]));
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-root minimal">
      <div className="chat-head">
        <div className="title">Assistant</div>
        <div className="dotwrap">
          <span className={`dot ${online ? "live" : connecting ? "connecting" : "offline"}`} />
          <span className="status">{connecting ? "Connecting…" : online ? "Live" : "Offline"}</span>
        </div>
      </div>

      <div ref={scrollRef} className="chat-scroll">
        {messages.map((m) => (
          <div key={m.id} className={`row ${m.role}`}>
            <div className={`bubble ${m.role}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{ code: CodeBlock }}
              >
                {m.text}
              </ReactMarkdown>
              {m.streaming && <span className="cursor">▍</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask anything..."
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}
