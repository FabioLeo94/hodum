import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DownloadProjectModalComponent from "./downloadProjectModalComponent";

describe("DownloadProjectModalComponent", () => {
  it("defaults to JSON and lists every supported format", () => {
    render(
      <DownloadProjectModalComponent
        isOpen
        onClose={() => {}}
        onDownload={() => {}}
      />,
    );

    expect(screen.getByRole("radio", { name: "JSON" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "XML" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "CSV" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Excel" })).not.toBeChecked();
  });

  it("calls onDownload with the selected format and then closes", () => {
    const onDownload = vi.fn();
    const onClose = vi.fn();
    render(
      <DownloadProjectModalComponent
        isOpen
        onClose={onClose}
        onDownload={onDownload}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Excel" }));
    fireEvent.click(screen.getByText("Scarica"));

    expect(onDownload).toHaveBeenCalledWith("excel");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <DownloadProjectModalComponent
        isOpen
        onClose={onClose}
        onDownload={() => {}}
      />,
    );

    fireEvent.click(screen.getByText("Annulla"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
