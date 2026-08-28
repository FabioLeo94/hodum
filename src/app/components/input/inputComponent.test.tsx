import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import InputComponent from "./inputComponent";

function ControlledWrapper() {
  const [value, setValue] = useState("");
  return (
    <InputComponent
      type="text"
      label="Nome"
      placeholder="Nome"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

describe("InputComponent", () => {
  it("keeps the same DOM node and the focus across re-renders triggered by typing", () => {
    render(<ControlledWrapper />);
    const input = screen.getByPlaceholderText("Nome") as HTMLInputElement;

    input.focus();
    expect(document.activeElement).toBe(input);

    for (const char of "ciao") {
      fireEvent.change(input, { target: { value: input.value + char } });
      expect(screen.getByPlaceholderText("Nome")).toBe(input);
      expect(document.activeElement).toBe(input);
    }

    expect(input.value).toBe("ciao");
  });
});
