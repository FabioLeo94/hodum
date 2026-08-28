import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import Auth from "./app/pages/auth/auth";
import Dashboard from "./app/pages/dashboard/dashboard";
import TaskList from "./app/pages/taskList/taskList";
import ProtectedRouteComponent from "./app/components/protectedRoute/protectedRouteComponent";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="" element={<Navigate to={"/auth"} />} />
        <Route path="auth" element={<Auth />} />
        <Route
          path="dashboard"
          element={
            <ProtectedRouteComponent>
              <Dashboard />
            </ProtectedRouteComponent>
          }
        />
        <Route
          path="dashboard/:progettoId/task-list"
          element={
            <ProtectedRouteComponent>
              <TaskList />
            </ProtectedRouteComponent>
          }
        />
        <Route path="*" element={<Navigate to={"/auth"} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
