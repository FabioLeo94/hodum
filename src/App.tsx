import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import Auth from "./app/pages/auth/auth";
import Dashboard from "./app/pages/dashboard/dashboard";
import TaskList from "./app/pages/taskList/taskList";
import ProtectedRouteComponent from "./app/components/protectedRoute/protectedRouteComponent";
import ProtectedLayoutComponent from "./app/components/protectedLayout/protectedLayoutComponent";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="" element={<Navigate to={"/auth"} />} />
        <Route path="auth" element={<Auth />} />
        {/* Rotta senza path: fa solo da layout condiviso. ProtectedLayoutComponent
            (e con esso l'assistente) resta montato quando si naviga tra le rotte
            figlie, che cambiano solo il contenuto dell'Outlet. */}
        <Route
          element={
            <ProtectedRouteComponent>
              <ProtectedLayoutComponent />
            </ProtectedRouteComponent>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route
            path="dashboard/:progettoId/task-list"
            element={<TaskList />}
          />
        </Route>
        <Route path="*" element={<Navigate to={"/auth"} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
