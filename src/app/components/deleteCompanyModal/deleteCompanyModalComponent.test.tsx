import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DeleteCompanyModalComponent from "./deleteCompanyModalComponent";

describe("DeleteCompanyModalComponent", () => {
  it("disables the confirm button until the company name is typed exactly", () => {
    render(
      <DeleteCompanyModalComponent
        isOpen
        onClose={() => {}}
        companyName="Acme Srl"
        onConfirm={() => {}}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Elimina" });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByLabelText(/Acme Srl/);
    fireEvent.change(input, { target: { value: "Acme" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "acme srl" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: "Acme Srl" } });
    expect(confirmButton).not.toBeDisabled();
  });

  it("calls onConfirm only once the typed name matches exactly", async () => {
    const onConfirm = vi.fn();
    render(
      <DeleteCompanyModalComponent
        isOpen
        onClose={() => {}}
        companyName="Acme Srl"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole("button", { name: "Elimina" });
    fireEvent.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Acme Srl/), {
      target: { value: "Acme Srl" },
    });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("shows the submit error when provided", () => {
    render(
      <DeleteCompanyModalComponent
        isOpen
        onClose={() => {}}
        companyName="Acme Srl"
        onConfirm={() => {}}
        submitError="Impossibile eliminare l'azienda."
      />,
    );

    expect(screen.getByText("Impossibile eliminare l'azienda.")).toBeInTheDocument();
  });

  it("resets the typed confirmation text when the modal is cancelled", () => {
    const onClose = vi.fn();
    render(
      <DeleteCompanyModalComponent
        isOpen
        onClose={onClose}
        companyName="Acme Srl"
        onConfirm={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Acme Srl/), {
      target: { value: "Acme Srl" },
    });
    fireEvent.click(screen.getByText("Annulla"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
