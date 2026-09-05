import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import Auth from "./app/pages/auth/auth";
import ChangePassword from "./app/pages/changePassword/changePassword";
import RecoverPassword from "./app/pages/recoverPassword/recoverPassword";
import Dashboard from "./app/pages/dashboard/dashboard";
import Employees from "./app/pages/employees/employees";
import CompanyManagement from "./app/pages/companyManagement/companyManagement";
import Invoices from "./app/pages/invoices/invoices";
import TaskList from "./app/pages/taskList/taskList";
import ProtectedRouteComponent from "./app/components/protectedRoute/protectedRouteComponent";
import ProtectedLayoutComponent from "./app/components/protectedLayout/protectedLayoutComponent";
import NotifyComponent from "./app/components/notify/notifyComponent";
function App() {
  return (
    <BrowserRouter>
      {/* Fuori da <Routes>: deve restare montato su ogni rotta (auth incluso,
          es. errori di login), senza dipendere da quale pagina è attiva. */}
      <NotifyComponent />
      <Routes>
        <Route path="" element={<Navigate to={"/auth"} />} />
        <Route path="auth" element={<Auth />} />
        {/* Pubblica come "auth": è l'unico modo di recuperare l'accesso
            senza avere già una sessione (vedi recoverPassword.tsx). */}
        <Route path="recover-password" element={<RecoverPassword />} />
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
          {/* Stessa guardia owner-only di employees, ma qui il project manager
              NON è ammesso (vedi companyManagement.tsx): backup e le altre
              voci future toccano l'infrastruttura, non la gestione operativa
              che il manager già presidia altrove. */}
          <Route path="company-management" element={<CompanyManagement />} />
          {/* Stessa guardia owner-only di company-management (nessuna rotta
              protetta filtra già per ruolo): vedi invoices.tsx. */}
          <Route path="invoices" element={<Invoices />} />
        </Route>
        <Route path="*" element={<Navigate to={"/auth"} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
