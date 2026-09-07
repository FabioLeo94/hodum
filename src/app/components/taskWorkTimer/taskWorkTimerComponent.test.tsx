import { afterEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, within, fireEvent } from "@testing-library/react";
import TaskWorkTimerComponent from "./taskWorkTimerComponent";

afterEach(() => {
  vi.useRealTimers();
});

// I quattro segmenti (giorni, ore, minuti, secondi) sono sempre presenti nel
// DOM, in quest'ordine: role="timer" è la stessa semantica ARIA impostata dal
// componente (vedi taskWorkTimerComponent.tsx) e permette di isolare i soli
// segmenti numerici dai separatori (spazio/":", marcati aria-hidden) e dai
// bottoni azione, che vivono fuori dal blocco tempo.
function getSegments() {
  const timer = screen.getByRole("timer");
  return within(timer).getAllByText(/^\d{2}$/);
}

describe("TaskWorkTimerComponent", () => {
  it("mostra i 4 segmenti a zero, tutti attenuati, quando il timer non è mai stato avviato", () => {
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

    const [days, hours, minutes, seconds] = getSegments();
    expect(days).toHaveTextContent("00");
    expect(hours).toHaveTextContent("00");
    expect(minutes).toHaveTextContent("00");
    expect(seconds).toHaveTextContent("00");
    [days, hours, minutes, seconds].forEach((segment) => {
      expect(segment.className).toContain("segmentMuted");
    });
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
    // mostrato è 1 minuto e 1 secondo, non 1 minuto esatto.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const [days, hours, firstMinutes, firstSeconds] = getSegments();
    expect(days).toHaveTextContent("00");
    expect(hours).toHaveTextContent("00");
    expect(firstMinutes).toHaveTextContent("01");
    expect(firstSeconds).toHaveTextContent("01");
    // Giorni/ore sono ancora a zero (attenuati), minuti/secondi sono >0 (in
    // chiaro): l'attenuazione è per singolo segmento, non a cascata dal più
    // significativo.
    expect(days.className).toContain("segmentMuted");
    expect(hours.className).toContain("segmentMuted");
    expect(firstMinutes.className).not.toContain("segmentMuted");
    expect(firstSeconds.className).not.toContain("segmentMuted");
    expect(screen.queryByRole("button", { name: /imposta inizio lavorazione/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /metti in pausa/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /termina lavorazione/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /azzera/i })).toBeInTheDocument();

    // setSystemTime porta l'orologio a :05, poi advanceTimersByTimeAsync lo
    // fa avanzare di altri 1000ms per innescare il prossimo tick dell'intervallo:
    // il tempo effettivo dopo l'avanzamento è quindi 1 minuto e 6 secondi, non 5.
    vi.setSystemTime(new Date("2026-01-01T00:01:05.000Z"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    const [, , secondMinutes, secondSeconds] = getSegments();
    expect(secondMinutes).toHaveTextContent("01");
    expect(secondSeconds).toHaveTextContent("06");
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

    const [days, hours, minutes, seconds] = getSegments();
    expect(days).toHaveTextContent("00");
    expect(hours).toHaveTextContent("00");
    expect(minutes).toHaveTextContent("02");
    expect(seconds).toHaveTextContent("05");
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
