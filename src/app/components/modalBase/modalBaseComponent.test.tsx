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
