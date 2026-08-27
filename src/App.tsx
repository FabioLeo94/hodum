import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import Auth from "./app/pages/auth/auth";
import Dashboard from "./app/pages/dashboard/dashboard";
import TaskList from "./app/pages/taskList/taskList";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="" element={<Navigate to={"/auth"} />} />
        <Route path="auth" element={<Auth />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="dashboard/:progettoId/task-list" element={<TaskList />} />
        <Route path="*" element={<Navigate to={"/auth"} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
