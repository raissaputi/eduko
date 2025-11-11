import { Routes, Route, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import NameScreen from "./NameScreen.jsx";
import TaskScreen from "./TaskScreen.jsx";
import SurveyScreen from "./SurveyScreen.jsx";
import FinishScreen from "./FinishScreen.jsx";

// Flow step order and validation
const FLOW_STEPS = {
  info: { order: 1, next: 'task' },
  task: { order: 2, next: 'survey', requires: ['info'] },
  survey: { order: 3, next: 'finish', requires: ['info', 'task'] },
  finish: { order: 4, requires: ['info', 'task', 'survey'] }
};

function getFlowState() {
  const sessionId = sessionStorage.getItem('session_id');
  if (!sessionId) return { completedSteps: [], currentMaxStep: 'info' };
  
  try {
    const stored = sessionStorage.getItem(`flow_state_${sessionId}`);
  return stored ? JSON.parse(stored) : { completedSteps: [], currentMaxStep: 'info' };
  } catch {
  return { completedSteps: [], currentMaxStep: 'info' };
  }
}

function updateFlowState(step) {
  const sessionId = sessionStorage.getItem('session_id');
  if (!sessionId) return;
  
  const state = getFlowState();
  if (!state.completedSteps.includes(step)) {
    state.completedSteps.push(step);
  }
  
  // Update max reachable step
  const currentOrder = FLOW_STEPS[step]?.order || 1;
  const maxOrder = FLOW_STEPS[state.currentMaxStep]?.order || 1;
  if (currentOrder > maxOrder) {
    state.currentMaxStep = step;
    // Allow access to next step
    const nextStep = FLOW_STEPS[step]?.next;
    if (nextStep) {
      state.currentMaxStep = nextStep;
    }
    
    // Clear history when advancing to prevent back navigation
    if (typeof window !== 'undefined' && window.history) {
      // Replace current history entry to prevent back navigation
      window.history.replaceState(null, '', window.location.pathname);
    }
  }
  
  try {
    sessionStorage.setItem(`flow_state_${sessionId}`, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save flow state:', e);
  }
}

function canAccessStep(targetStep) {
  const state = getFlowState();
  const sessionId = sessionStorage.getItem('session_id');
  
  // Always allow name step if no session exists
  if (targetStep === 'info' && !sessionId) return true;
  
  // Require session for other steps  
  if (!sessionId && targetStep !== 'info') return false;
  
  const stepConfig = FLOW_STEPS[targetStep];
  if (!stepConfig) return false;
  
  // Allow access to current max step only
  return targetStep === state.currentMaxStep;
}

function getRedirectTarget() {
  const state = getFlowState();
  return `../${state.currentMaxStep}`;
}

export default function FlowApp() {
  const { testType } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const currentStep = location.pathname.split('/').pop() || 'info';
  const lastValidStepRef = useRef(currentStep);
  
  // Update flow state when accessing a valid step
  useEffect(() => {
    const sessionId = sessionStorage.getItem('session_id');
    
    // For fresh starts (no session), allow name step
    if (!sessionId && currentStep === 'info') {
      return;
    }
    
    if (canAccessStep(currentStep)) {
      updateFlowState(currentStep);
      lastValidStepRef.current = currentStep;
    } else {
      // If trying to access invalid step, redirect to current max step
  const state = getFlowState();
  const targetStep = state.currentMaxStep || 'info';
      if (currentStep !== targetStep) {
        navigate(`../${targetStep}`, { replace: true });
      }
    }
  }, [currentStep, navigate]);
  
  // Prevent browser back button and page navigation from protected steps
  useEffect(() => {
    const state = getFlowState();
    const sessionId = sessionStorage.getItem('session_id');
    
    // Only block navigation if we have a session and are in protected steps
    if (!sessionId) return;
    
    const currentAllowedStep = state.currentMaxStep;
    
    // For task, survey, and finish steps - completely block navigation
    if (['task', 'survey', 'finish'].includes(currentAllowedStep)) {
      const handlePopState = (event) => {
        // Push current state back to prevent going back
        window.history.pushState(null, '', window.location.pathname);
      };
      
      const handleBeforeUnload = (event) => {
        // Prevent leaving the page entirely
        event.preventDefault();
        event.returnValue = 'You cannot leave during the task. Please complete the current step.';
        return 'You cannot leave during the task. Please complete the current step.';
      };
      
      const handleVisibilityChange = () => {
        // If user tries to navigate away and comes back, ensure we're on the right page
        if (document.visibilityState === 'visible') {
          const currentPath = window.location.pathname;
          const expectedPath = `/run/${sessionStorage.getItem('testType') || 'fe'}/${currentAllowedStep}`;
          if (!currentPath.includes(currentAllowedStep)) {
            // Force redirect back to the correct step
            window.location.href = expectedPath;
          }
        }
      };
      
      // Push extra states to make back button ineffective
      for (let i = 0; i < 3; i++) {
        window.history.pushState(null, '', window.location.pathname);
      }
      
      // Add event listeners
      window.addEventListener('popstate', handlePopState);
      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Disable keyboard shortcuts that could navigate away
      const handleKeyDown = (event) => {
        // Block Alt+Left (back), Alt+Right (forward), F5 (refresh), Ctrl+R (refresh)
        if ((event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) ||
            event.key === 'F5' ||
            (event.ctrlKey && event.key === 'r') ||
            (event.ctrlKey && event.shiftKey && event.key === 'I') || // Dev tools
            event.key === 'F12') { // Dev tools
          event.preventDefault();
          event.stopPropagation();
          return false;
        }
      };
      
      document.addEventListener('keydown', handleKeyDown, { capture: true });
      
      return () => {
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.removeEventListener('keydown', handleKeyDown, { capture: true });
      };
    }
  }, [currentStep]);
  
  return (
    <Routes>
  <Route path="info" element={<NameScreen testType={testType} />} />
      { /* consent step removed (combined with name) */ }
      <Route 
        path="task" 
        element={
          canAccessStep('task') ? 
            <TaskScreen testType={testType} /> : 
            <Navigate to={getRedirectTarget()} replace />
        } 
      />
      <Route 
        path="survey" 
        element={
          canAccessStep('survey') ? 
            <SurveyScreen testType={testType} /> : 
            <Navigate to={getRedirectTarget()} replace />
        } 
      />
      <Route 
        path="finish" 
        element={
          canAccessStep('finish') ? 
            <FinishScreen testType={testType} /> : 
            <Navigate to={getRedirectTarget()} replace />
        } 
      />
  <Route path="*" element={<Navigate to="info" replace />} />
    </Routes>
  );
}
