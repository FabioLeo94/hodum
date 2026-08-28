import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ButtonComponent from "./buttonComponent";

describe("ButtonComponent", () => {
  it("renders its children", () => {
    render(<ButtonComponent onClick={() => {}}>Click me</ButtonComponent>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<ButtonComponent onClick={onClick}>Click me</ButtonComponent>);
    fireEvent.click(screen.getByText("Click me"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is not disabled by default", () => {
    render(<ButtonComponent onClick={() => {}}>Click me</ButtonComponent>);
    expect(screen.getByRole("button", { name: "Click me" })).not.toBeDisabled();
  });

  it("disables the native button and blocks clicks when disabled is true", () => {
    const onClick = vi.fn();
    render(
      <ButtonComponent onClick={onClick} disabled>
        Click me
      </ButtonComponent>,
    );
    const button = screen.getByRole("button", { name: "Click me" });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
