/* eslint-disable react-hooks/rules-of-hooks */
// src/components/Chat/ChatPanel.jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { logEvent } from '../../lib/logger'
import "github-markdown-css/github-markdown-dark.css"
import rehypeSanitize from 'rehype-sanitize'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const WS_URL = (API.replace('http', 'ws') + '/ws/chat').replace(/\/+$/, '')

/** Minimal code block with header + Copy */
function CodeBlock({ inline, className, children, problemId, ...props }) {
  if (inline) return <code className={className} {...props}>{children}</code>
  const codeRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const lang = className?.match(/language-([\w+-]+)/)?.[1]

  // Only render as a code block if it's a programming language
  if (!lang) {
    return <code className={className} {...props}>{children}</code>
  }

  const copy = async (_text, lang = "text") => {
    try {
      const codeElement = codeRef.current;
      const textContent = codeElement ? codeElement.textContent : '';
      await navigator.clipboard.writeText(textContent);
      if (problemId) {
        logEvent("chat_copy_code", { problem_id: problemId, n: textContent.length, lang })
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
        <button className='copybtn' onClick={() => copy(children, lang)}>
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
  const [images, setImages] = useState([]) // data URLs
  const [online, setOnline] = useState(false)
  const wsRef = useRef(null)
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)

  // Chat persistence helpers
  const getChatKey = () => {
    const sessionId = sessionStorage.getItem('session_id') || 'anon'
    return `chat_messages_${sessionId}_${problem?.id || 'global'}`
  }

  const saveChatMessages = (msgs) => {
    try {
      sessionStorage.setItem(getChatKey(), JSON.stringify(msgs))
    } catch (e) {
      console.warn('Failed to save chat messages:', e)
    }
  }

  const loadChatMessages = () => {
    try {
      const stored = sessionStorage.getItem(getChatKey())
      return stored ? JSON.parse(stored) : []
    } catch (e) {
      console.warn('Failed to load chat messages:', e)
      return []
    }
  }

  const meta = useMemo(() => ({
    session_id: sessionStorage.getItem('session_id') || 'anon',
    problem_id: problem?.id ?? null,
    problem_title: problem?.title ?? null,
    problem_statement: problem?.statement ?? null
  }), [problem])

  // autoscroll
  useEffect(() => {
    const savedMessages = loadChatMessages()
    setMessages(savedMessages)
  }, [problem?.id])

  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      saveChatMessages(messages)
    }
  }, [messages])

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // connect WS once
  useEffect(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => { setOnline(true); logEvent('chat_ws_open', { url: WS_URL }) }
    ws.onclose = () => { setOnline(false); logEvent('chat_ws_close', {}) }
    ws.onerror = () => { setOnline(false); logEvent('chat_ws_error', {}) }

    ws.onmessage = ev => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'token') {
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              const m = [...prev]
              m[m.length - 1] = { ...last, text: (last.text || '') + msg.text, streaming: true }
              return m
            }
            return [...prev, { id: crypto.randomUUID(), role: 'assistant', text: msg.text, streaming: true }]
          })
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
          setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', text: 'Error: ' + msg.error }])
          logEvent('chat_error', { problem_id: meta.problem_id, error: msg.error })
        }
      } catch (_e) {
        logEvent('chat_error', { problem_id: meta.problem_id, error: 'parse_error' })
      }
    }

    return () => ws.close()
  }, [meta.problem_id])

  const isStreaming = messages.some(m => m.streaming)

  const send = () => {
    const content = input.trim()
    if (!content && images.length === 0) return
    if (isStreaming) return

    const userMsg = { id: crypto.randomUUID(), role: 'user', text: content, images }
    setMessages(p => [...p, userMsg])
    setInput('')
    setImages([])
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px'
      textareaRef.current.style.overflowY = 'hidden'
    }

    logEvent('chat_send', { problem_id: meta.problem_id, prompt_len: content.length })

    // basic metrics for logging
    const totalImgBytes = images.reduce((acc, url) => {
      const i = typeof url === 'string' ? url.indexOf(',') : -1
      const b64 = i >= 0 ? url.slice(i + 1) : ''
      return acc + b64.length
    }, 0)
    logEvent('chat_send', { problem_id: meta.problem_id, prompt_len: content.length, img_count: images.length, img_bytes_b64_len: totalImgBytes })

    const payload = { message: content, images, ...meta }
    if (online && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
      setMessages(p => [...p, { id: crypto.randomUUID(), role: 'assistant', text: '', streaming: true }])
    } else {
      fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, session_id: meta.session_id })
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const onPaste = (e) => {
    const items = e.clipboardData?.items || []
    let handled = false
    for (const it of items) {
      if (it.type && it.type.startsWith('image/')) {
        const file = it.getAsFile()
        if (file) {
          const reader = new FileReader()
          reader.onload = () => {
            const url = reader.result
            if (typeof url === 'string') setImages(prev => [...prev, url])
          }
          reader.readAsDataURL(file)
          handled = true
        }
      }
    }
    if (handled) {
      // Prevent the raw image blob from trying to paste as text
      e.preventDefault()
    }
  }

  return (
    <div className="chat-root">
      <div ref={scrollRef} className='chat-scroll'>
        {messages.map(m => (
          <div key={m.id} className={`row ${m.role}`}>
            <div className={`bubble ${m.role}`}>
              {Array.isArray(m.images) && m.images.length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:8 }}>
                  {m.images.map((url, i) => (
                    <img key={i} src={url} alt={`img-${i}`} style={{ maxWidth: '180px', maxHeight: '180px', objectFit:'contain', borderRadius:8, border:'1px solid var(--border)', background:'#111' }} />
                  ))}
                </div>
              )}
              {m.role === 'assistant' ? (
                <article className="markdown-body chat-md">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                    components={{
                      code: ({ inline, className, children, ...props }) => {
                        if (inline && !className) {
                          return <code className="inline-code" {...props}>{children}</code>
                        }
                        return (
                          <CodeBlock inline={inline} className={className} problemId={meta.problem_id} {...props}>
                            {children}
                          </CodeBlock>
                        )
                      },
                    }}
                  >
                    {m.text}
                  </ReactMarkdown>
                </article>
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                  {m.text}
                </pre>
              )}
              {m.streaming && <span className="cursor">▍</span>}
            </div>
          </div>
        ))}
      </div>

      <div className='chat-input'>
        {/* Image attachments preview */}
        {images.length > 0 && (
          <div style={{ gridColumn: '1 / span 2', display:'flex', gap:8, padding:'0 12px 8px' }}>
            {images.map((url, i) => (
              <div key={i} style={{ position:'relative' }}>
                <img src={url} alt={`attachment-${i}`} style={{ width:56, height:56, objectFit:'cover', borderRadius:8, border:'1px solid var(--border)' }} />
                <button 
                  onClick={() => setImages(imgs => imgs.filter((_,idx) => idx!==i))}
                  className='btn'
                  style={{ position:'absolute', top:-8, right:-8, width:22, height:22, padding:0 }}
                >×</button>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => {
            setInput(e.target.value);
            // Auto-grow logic
            e.target.style.height = 'auto';
            const maxHeight = 200;
            const scrollHeight = e.target.scrollHeight;
            e.target.style.height = Math.min(scrollHeight, maxHeight) + 'px';
            // Enable/disable scrolling based on content height
            e.target.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
          }}
          onPaste={onPaste}
          onKeyDown={onKey}
          placeholder='Ask anything...'
          disabled={isStreaming}
          style={{
            minHeight: '44px',
            maxHeight: '200px',
          }}
        />
        <button 
          onClick={send}
          disabled={isStreaming || !(input.trim() || images.length)}
          title={isStreaming ? "Stop" : "Send"}
        >
          {isStreaming ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

