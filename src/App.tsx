import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { ROUTES } from "./shared/routes";
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="" element={<Navigate to={"auth"} />} />
        {ROUTES.map((r) => (
          <Route path={r.name} element={r.element} />
        ))}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
