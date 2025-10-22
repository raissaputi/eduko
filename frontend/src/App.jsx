import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AdminLanding from "./pages/AdminLanding.jsx";
import FlowApp from "./flow/FlowApp.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminLanding />} />
        <Route path="/run/:testType/*" element={<FlowApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
