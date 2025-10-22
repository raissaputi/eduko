import { Routes, Route, Navigate, useParams } from "react-router-dom";
import NameScreen from "./NameScreen.jsx";
import ConsentScreen from "./ConsentScreen.jsx";
import TaskScreen from "./TaskScreen.jsx";
import SurveyScreen from "./SurveyScreen.jsx";
import FinishScreen from "./FinishScreen.jsx";

export default function FlowApp() {
  const { testType } = useParams(); // "fe" | "dv"
  return (
    <div className="container">
      <Routes>
        <Route path="name" element={<NameScreen testType={testType} />} />
        <Route path="consent" element={<ConsentScreen testType={testType} />} />
        <Route path="task" element={<TaskScreen testType={testType} />} />
        <Route path="survey" element={<SurveyScreen testType={testType} />} />
        <Route path="finish" element={<FinishScreen testType={testType} />} />
        <Route path="*" element={<Navigate to="name" replace />} />
      </Routes>
    </div>
  );
}
