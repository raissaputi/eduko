/* eslint-disable react-hooks/rules-of-hooks */
// src/components/Chat/ChatPanel.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { logEvent } from '../../lib/logger'   // ← adjust if your path differs

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const WS_URL = (API.replace('http', 'ws') + '/ws/chat').replace(/\/+$/, '')

/** Minimal code block with header + Copy */
function CodeBlock({ inline, className, children, problemId, ...props }) {
  if (inline) return <code className={className} {...props}>{children}</code>
  const codeRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const lang =
    (className?.match(/language-([\w+-]+)/)?.[1]) ||
    (className?.split(' ').find(s => s !== 'hljs') || 'text')

  const copy = async (text, lang = "text") => {
    try {
      await navigator.clipboard.writeText(text);
      // emit a lightweight copy event (helps your analysis)
      if (problemId) {
        logEvent("chat_copy_code", {
          problem_id: problemId,
          n: (text || "").length,
          lang
        })
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (e) {
      console.warn("copy failed", e);
    }
  }

  return (
    <div className='codewrap'>
      <div className='codehdr'>
        <span className='lang'>{lang}</span>
        <button
          className='copybtn'
          onClick={() => {
            const text = Array.isArray(children) ? children.join('') : String(children ?? '')
            copy(text, lang)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={className}><code ref={codeRef} {...props}>{children}</code></pre>
    </div>
  )
}

export default function ChatPanel({ problem }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [online, setOnline] = useState(false)
  const wsRef = useRef(null)
  const scrollRef = useRef(null)

  const meta = useMemo(() => ({
    session_id: sessionStorage.getItem('session_id') || 'anon',
    problem_id: problem?.id ?? null,
    problem_title: problem?.title ?? null,
    problem_statement: problem?.statement ?? null
  }), [problem])

  // throttle token logging
  const lastTokLogRef = useRef(0)
  const shouldLogToken = () => {
    const now = performance.now()
    if (now - lastTokLogRef.current > 500) {
      lastTokLogRef.current = now
      return true
    }
    return false
  }

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // connect WS once
  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setOnline(true)
      logEvent('chat_ws_open', { url: WS_URL })
    }
    ws.onclose = () => {
      setOnline(false)
      logEvent('chat_ws_close', {})
    }
    ws.onerror = () => {
      setOnline(false)
      logEvent('chat_ws_error', {})
    }

    ws.onmessage = ev => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'token') {
          // stream token into the last assistant message or create one
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              const m = [...prev]
              m[m.length - 1] = { ...last, text: (last.text || '') + msg.text, streaming: true }
              return m
            }
            return [...prev, { id: crypto.randomUUID(), role: 'assistant', text: msg.text, streaming: true }]
          })
          if (shouldLogToken()) logEvent('chat_token', { problem_id: meta.problem_id, n: msg.text?.length || 0 })
        } else if (msg.type === 'done') {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant') {
              const m = [...prev]
              m[m.length - 1] = { ...last, streaming: false }
              return m
            }
            return prev
          })
          logEvent('chat_done', { problem_id: meta.problem_id })
        } else if (msg.type === 'error') {
          setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', text: '⚠ ' + msg.error }])
          logEvent('chat_error', { problem_id: meta.problem_id, error: msg.error })
        }
      // eslint-disable-next-line no-unused-vars
      } catch (e) {
        logEvent('chat_error', { problem_id: meta.problem_id, error: 'parse_error' })
      }
    }

    return () => ws.close()
  }, [meta.problem_id])

  const send = () => {
    const content = input.trim()
    if (!content) return

    const userMsg = { id: crypto.randomUUID(), role: 'user', text: content }
    setMessages(p => [...p, userMsg])
    setInput('')

    logEvent('chat_send', { problem_id: meta.problem_id, prompt_len: content.length })

    if (online && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message: content, ...meta }))
      // create a placeholder streaming msg
      setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', text: '', streaming: true }])
    } else {
      fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, ...meta })
      })
        .then(r => r.json())
        .then(data => setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', text: data.reply }]))
        .catch(() => {
          setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', text: 'Network error.' }])
          logEvent('chat_error', { problem_id: meta.problem_id, error: 'network' })
        })
    }
  }

  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (

      <div className="chat-root">
        <div ref={scrollRef} className='chat-scroll'>
          {messages.map(m => (
            <div key={m.id} className={`row ${m.role}`}>
              <div className={`bubble ${m.role}`}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    code: (mdProps) => <CodeBlock {...mdProps} problemId={meta.problem_id} />
                  }}
                >
                  {m.text}
                </ReactMarkdown>
                {m.streaming && <span className='cursor'>▍</span>}
              </div>
            </div>
          ))}
        </div>

        <div className='chat-input'>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder='Ask anything...'
          />
          <button onClick={send}>Send</button>
        </div>
    </div>
  )
}
