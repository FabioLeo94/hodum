import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import NotifyComponent from "./notifyComponent";
import {
  dismissToast,
  notifyError,
  notifySuccess,
  subscribeToToasts,
  type NotifyToast,
} from "../../services/notify/notifyService";

// Lo store di notifyService è un singleton a livello di modulo: sopravvive
// allo smontaggio del componente tra un test e l'altro, quindi va svuotato
// esplicitamente per non far trapelare i toast di un test nel successivo.
function clearAllToasts() {
  let current: NotifyToast[] = [];
  subscribeToToasts((toasts) => {
    current = toasts;
  })();
  current.forEach((toast) => dismissToast(toast.id));
}

describe("NotifyComponent", () => {
  beforeEach(() => {
    clearAllToasts();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAllToasts();
  });

  it("mostra il messaggio dopo una notifica di successo", () => {
    render(<NotifyComponent />);
    act(() => notifySuccess("Backup creato con successo"));

    expect(screen.getByText("Backup creato con successo")).toBeInTheDocument();
  });

  it("usa role=alert per gli errori e role=status per gli altri tipi", () => {
    render(<NotifyComponent />);
    act(() => {
      notifySuccess("Operazione riuscita");
      notifyError("Qualcosa è andato storto");
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Qualcosa è andato storto");
    expect(screen.getByRole("status")).toHaveTextContent("Operazione riuscita");
  });

  it("scompare automaticamente dopo 5 secondi", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotifyComponent />);
    act(() => notifySuccess("Backup creato con successo"));
    expect(screen.getByText("Backup creato con successo")).toBeInTheDocument();

    // Due avanzamenti separati (non un unico 5300ms): il timer di uscita
    // (EXIT_MS) viene creato solo dall'effetto che reagisce a isLeaving, cioè
    // dopo che il primo timer (VISIBLE_MS) è scattato, quindi va fatto
    // avanzare in una chiamata successiva.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.queryByText("Backup creato con successo")).not.toBeInTheDocument();
  });

  it("il pulsante di chiusura anticipa la scomparsa senza attendere i 5 secondi", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NotifyComponent />);
    act(() => notifySuccess("Backup creato con successo"));

    fireEvent.click(screen.getByRole("button", { name: "Chiudi notifica" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.queryByText("Backup creato con successo")).not.toBeInTheDocument();
  });
});
