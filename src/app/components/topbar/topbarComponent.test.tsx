import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TopbarComponent from "./topbarComponent";

describe("TopbarComponent", () => {
  it("renders the logo and the account button, with the menu closed", () => {
    render(<TopbarComponent onLogout={() => {}} />);

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "span" &&
          element?.textContent === "Hodum",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Menu account" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu with the Disconnetti option when the account button is clicked", () => {
    render(<TopbarComponent onLogout={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Menu account" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Disconnetti" }),
    ).toBeInTheDocument();
  });

  it("toggles the menu closed when the account button is clicked again", () => {
    render(<TopbarComponent onLogout={() => {}} />);
    const accountButton = screen.getByRole("button", { name: "Menu account" });

    fireEvent.click(accountButton);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.click(accountButton);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls onLogout and closes the menu when Disconnetti is clicked", () => {
    const onLogout = vi.fn();
    render(<TopbarComponent onLogout={onLogout} />);

    fireEvent.click(screen.getByRole("button", { name: "Menu account" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Disconnetti" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu when Escape is pressed", () => {
    render(<TopbarComponent onLogout={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Menu account" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside of it", () => {
    render(
      <div>
        <TopbarComponent onLogout={() => {}} />
        <button>Fuori</button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Menu account" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText("Fuori"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
