import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RotateCcw } from "lucide-react";
import NoticeComponent from "./noticeComponent";

describe("NoticeComponent", () => {
  it("renders the text", () => {
    render(<NoticeComponent variant="info" text="Testo dell'avviso" />);
    expect(screen.getByText("Testo dell'avviso")).toBeInTheDocument();
  });

  it("renders the title only when provided", () => {
    const { rerender } = render(<NoticeComponent variant="info" text="Testo" />);
    expect(screen.queryByText("Titolo")).not.toBeInTheDocument();

    rerender(<NoticeComponent variant="info" title="Titolo" text="Testo" />);
    expect(screen.getByText("Titolo")).toBeInTheDocument();
  });

  it("uses role=alert only for the error variant", () => {
    const { rerender } = render(<NoticeComponent variant="error" text="Testo" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<NoticeComponent variant="warning" text="Testo" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("accepts a custom icon override", () => {
    const { container } = render(
      <NoticeComponent variant="warning" text="Testo" icon={RotateCcw} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
