import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import FlowApp from "./flow/FlowApp.jsx"

const params = new URLSearchParams(location.search)
const useFlow = params.get('flow') === '1'

createRoot(document.getElementById('root')).render(
  useFlow ? <FlowApp /> : <App />
)