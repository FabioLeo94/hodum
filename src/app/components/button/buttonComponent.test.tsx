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
});
