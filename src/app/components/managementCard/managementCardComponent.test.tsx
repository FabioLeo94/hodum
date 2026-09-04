import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ManagementCardComponent from "./managementCardComponent";

describe("ManagementCardComponent", () => {
  it("mostra titolo e descrizione", () => {
    render(
      <ManagementCardComponent
        icon={<span>icon</span>}
        title="Backup"
        description="Gestisci i backup"
        onClick={() => {}}
      />,
    );
    expect(screen.getByText("Backup")).toBeInTheDocument();
    expect(screen.getByText("Gestisci i backup")).toBeInTheDocument();
  });

  it("chiama onClick al click", () => {
    const onClick = vi.fn();
    render(
      <ManagementCardComponent icon={<span>icon</span>} title="Backup" description="Gestisci i backup" onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /backup/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
