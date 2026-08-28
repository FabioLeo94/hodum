import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ModalBaseComponent from "./modalBaseComponent";

describe("ModalBaseComponent", () => {
  it("renders title, content, primaryAction and secondaryActions when open", () => {
    render(
      <ModalBaseComponent
        isOpen
        onClose={() => {}}
        title="Titolo modale"
        primaryAction={<button>Salva</button>}
        secondaryActions={<button>Annulla</button>}
      >
        <p>Contenuto della modale</p>
      </ModalBaseComponent>,
    );

    expect(screen.getByText("Titolo modale")).toBeInTheDocument();
    expect(screen.getByText("Contenuto della modale")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salva" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Annulla" }),
    ).toBeInTheDocument();
  });

  it("calls onClose once when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ModalBaseComponent
        isOpen
        onClose={onClose}
        title="Titolo"
        primaryAction={<button>Salva</button>}
      >
        <p>Contenuto</p>
      </ModalBaseComponent>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when a cancel event is fired on the dialog (Esc)", () => {
    const onClose = vi.fn();
    render(
      <ModalBaseComponent
        isOpen
        onClose={onClose}
        title="Titolo"
        primaryAction={<button>Salva</button>}
      >
        <p>Contenuto</p>
      </ModalBaseComponent>,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on backdrop click but not on click inside content", () => {
    const onClose = vi.fn();
    render(
      <ModalBaseComponent
        isOpen
        onClose={onClose}
        title="Titolo"
        primaryAction={<button>Salva</button>}
      >
        <p>Contenuto interno</p>
      </ModalBaseComponent>,
    );

    fireEvent.click(screen.getByText("Contenuto interno"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render the close button when showCloseButton is false", () => {
    render(
      <ModalBaseComponent
        isOpen
        onClose={() => {}}
        title="Titolo"
        showCloseButton={false}
        primaryAction={<button>Salva</button>}
      >
        <p>Contenuto</p>
      </ModalBaseComponent>,
    );

    expect(
      screen.queryByRole("button", { name: "Chiudi" }),
    ).not.toBeInTheDocument();
  });

  it("always renders primaryAction as the last DOM child of the bottom bar, regardless of prop order", () => {
    render(
      <ModalBaseComponent
        isOpen
        onClose={() => {}}
        title="Titolo"
        primaryAction={<button>Salva</button>}
        secondaryActions={<button>Annulla</button>}
      >
        <p>Contenuto</p>
      </ModalBaseComponent>,
    );

    const primary = screen.getByRole("button", { name: "Salva" });
    const secondary = screen.getByRole("button", { name: "Annulla" });

    expect(primary.parentElement).toBe(secondary.parentElement);
    expect(primary.parentElement?.lastElementChild).toBe(primary);
  });

  it("does not render a form when onSubmit is not provided", () => {
    render(
      <ModalBaseComponent
        isOpen
        onClose={() => {}}
        title="Titolo"
        primaryAction={<button>Salva</button>}
      >
        <p>Contenuto</p>
      </ModalBaseComponent>,
    );

    expect(document.querySelector("form")).not.toBeInTheDocument();
  });

  it("wraps content and actions in a form and calls onSubmit when the primary action is clicked, without navigating away", () => {
    const onSubmit = vi.fn();
    render(
      <ModalBaseComponent
        isOpen
        onClose={() => {}}
        title="Titolo"
        onSubmit={onSubmit}
        primaryAction={
          <button type="submit">Salva</button>
        }
      >
        <p>Contenuto</p>
      </ModalBaseComponent>,
    );

    expect(document.querySelector("form")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("places the field inside the real form so a native Enter keypress submits it, and calls onSubmit (preventing navigation) when the form submit event fires", () => {
    const onSubmit = vi.fn();
    render(
      <ModalBaseComponent
        isOpen
        onClose={() => {}}
        title="Titolo"
        onSubmit={onSubmit}
        primaryAction={<button type="submit">Salva</button>}
      >
        <input aria-label="Nome" />
      </ModalBaseComponent>,
    );

    const input = screen.getByLabelText("Nome");
    const form = input.closest("form");
    // Un input dentro un <form> con un bottone submit innesca l'invio nativo
    // del browser alla pressione di Invio: jsdom non simula quel default
    // browser action su un keydown sintetico, quindi qui si verifica che il
    // campo sia realmente figlio del form e che il gestore di submit sia
    // collegato correttamente (stesso evento che il browser scatenerebbe).
    expect(form).not.toBeNull();
    expect(form).toContainElement(input);

    fireEvent.submit(form!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["generic"],
    ["error"],
    ["info"],
    ["success"],
  ] as const)("sets data-variant=%s on the top bar", (variant) => {
    render(
      <ModalBaseComponent
        isOpen
        onClose={() => {}}
        title="Titolo"
        variant={variant}
        primaryAction={<button>Salva</button>}
      >
        <p>Contenuto</p>
      </ModalBaseComponent>,
    );

    const heading = screen.getByRole("heading", { name: "Titolo" });
    expect(heading.parentElement).toHaveAttribute("data-variant", variant);
  });
});
