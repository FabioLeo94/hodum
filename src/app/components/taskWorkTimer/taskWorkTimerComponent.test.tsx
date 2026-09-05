import { afterEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import TaskWorkTimerComponent from "./taskWorkTimerComponent";

afterEach(() => {
  vi.useRealTimers();
});

describe("TaskWorkTimerComponent", () => {
  it("mostra solo Play quando il timer non è mai stato avviato", () => {
    const onAction = vi.fn();
    render(
      <TaskWorkTimerComponent
        status="progress"
        taskTitle="Task di prova"
        workStartedAt={null}
        workAccumulatedSeconds={0}
        workEndedAt={null}
        onAction={onAction}
      />,
    );

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /imposta inizio lavorazione/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /metti in pausa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /termina lavorazione/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /azzera/i })).not.toBeInTheDocument();
  });

  it("preme Play e invoca onAction('start')", () => {
    const onAction = vi.fn();
    render(
      <TaskWorkTimerComponent
        status="progress"
        taskTitle="Task di prova"
        workStartedAt={null}
        workAccumulatedSeconds={0}
        workEndedAt={null}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /imposta inizio lavorazione/i }));
    expect(onAction).toHaveBeenCalledWith("start");
  });

  it("mostra Pausa, Termina e Reset mentre il timer è in esecuzione, e conta ogni secondo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    const onAction = vi.fn();
    render(
      <TaskWorkTimerComponent
        status="progress"
        taskTitle="Task di prova"
        workStartedAt="2026-01-01T00:00:00.000Z"
        workAccumulatedSeconds={0}
        workEndedAt={null}
        onAction={onAction}
      />,
    );

    // Il primo tick dell'intervallo (e quindi il primo valore corretto)
    // arriva solo dopo 1000ms: nessun calcolo sincrono nel corpo dell'effect
    // (regola react-hooks/set-state-in-effect), stesso principio del
    // setTimeout auto-riprogrammato di authFormComponent.tsx. L'avanzamento
    // di 1000ms porta l'orologio da :00 a :01, quindi il primo valore
    // mostrato è "1:01", non "1:00".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("1:01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /imposta inizio lavorazione/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /metti in pausa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /termina lavorazione/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /azzera/i })).toBeInTheDocument();

    // setSystemTime porta l'orologio a :05, poi advanceTimersByTimeAsync lo
    // fa avanzare di altri 1000ms per innescare il prossimo tick dell'intervallo:
    // il tempo effettivo dopo l'avanzamento è quindi :06, non :05.
    vi.setSystemTime(new Date("2026-01-01T00:01:05.000Z"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("1:06")).toBeInTheDocument();
  });

  it("non mostra alcun bottone su un task completato: il tempo resta congelato", () => {
    render(
      <TaskWorkTimerComponent
        status="completed"
        taskTitle="Task di prova"
        workStartedAt={null}
        workAccumulatedSeconds={125}
        workEndedAt="2026-01-01T00:02:05.000Z"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("dopo Termina lavorazione mostra solo Play e Reset, non Pausa/Termina", () => {
    render(
      <TaskWorkTimerComponent
        status="progress"
        taskTitle="Task di prova"
        workStartedAt={null}
        workAccumulatedSeconds={90}
        workEndedAt="2026-01-01T00:01:30.000Z"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /imposta inizio lavorazione/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /azzera/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /metti in pausa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /termina lavorazione/i })).not.toBeInTheDocument();
  });
});
