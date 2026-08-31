import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import Auth from "./app/pages/auth/auth";
import ChangePassword from "./app/pages/changePassword/changePassword";
import Dashboard from "./app/pages/dashboard/dashboard";
import Employees from "./app/pages/employees/employees";
import TaskList from "./app/pages/taskList/taskList";
import ProtectedRouteComponent from "./app/components/protectedRoute/protectedRouteComponent";
import ProtectedLayoutComponent from "./app/components/protectedLayout/protectedLayoutComponent";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="" element={<Navigate to={"/auth"} />} />
        <Route path="auth" element={<Auth />} />
        {/* Fuori da ProtectedRouteComponent: ha una guardia propria
            (vedi changePassword.tsx) equivalente ma che non redirige verso
            se stessa quando mustChangePassword è true. */}
        <Route path="change-password" element={<ChangePassword />} />
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
          {/* Guardia owner-only fuori da ProtectedRouteComponent (che filtra
              solo autenticazione e mustChangePassword): il componente
              reindirizza da sé chi non è owner (vedi employees.tsx). */}
          <Route path="employees" element={<Employees />} />
        </Route>
        <Route path="*" element={<Navigate to={"/auth"} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
