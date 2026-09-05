import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditProjectModalComponent from "./editProjectModalComponent";
import * as customerService from "../../services/customer/customerService";

function mockCustomers(customers: { id: string; name: string }[]) {
  vi.spyOn(customerService, "listCustomerSummaries").mockResolvedValue(customers);
}

describe("EditProjectModalComponent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("precompiles the name field with the current project name", () => {
    mockCustomers([]);
    render(
      <EditProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        currentCustomerId={null}
        onSave={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("Progetto Demo")).toBeInTheDocument();
  });

  it("shows an error and does not call onSave when submitting an empty name", async () => {
    mockCustomers([]);
    const onSave = vi.fn();
    render(
      <EditProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        currentCustomerId={null}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("Progetto Demo"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByText("Salva"));

    expect(
      await screen.findByText("Inserisci un nome per il progetto."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onSave with the trimmed name and no customer when none is assigned", async () => {
    mockCustomers([]);
    const onSave = vi.fn();
    render(
      <EditProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        currentCustomerId={null}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("Progetto Demo"), {
      target: { value: "  Nuovo Nome  " },
    });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ name: "Nuovo Nome", customerId: null });
  });

  it("shows a placeholder instead of the dropdown when the company has no customers", async () => {
    mockCustomers([]);
    render(
      <EditProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        currentCustomerId={null}
        onSave={() => {}}
      />,
    );

    expect(
      await screen.findByText(
        "Aggiungi i tuoi clienti nella pagina gestione aziendale per assegnare questo progetto.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("preselects the current customer in the dropdown and reports a change", async () => {
    mockCustomers([
      { id: "c1", name: "Cliente Uno" },
      { id: "c2", name: "Cliente Due" },
    ]);
    const onSave = vi.fn();
    render(
      <EditProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        currentCustomerId="c1"
        onSave={onSave}
      />,
    );

    const select = await screen.findByRole("combobox");
    await waitFor(() => expect(select).toHaveValue("c1"));

    fireEvent.change(select, { target: { value: "c2" } });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({ name: "Progetto Demo", customerId: "c2" });
  });

  it("disables the confirm button while onSave is pending", async () => {
    mockCustomers([]);
    let resolveSave: () => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(
      <EditProjectModalComponent
        isOpen
        onClose={() => {}}
        currentName="Progetto Demo"
        currentCustomerId={null}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByText("Salva"));

    const confirmButton = await screen.findByRole("button", {
      name: "Salvataggio in corso...",
    });
    expect(confirmButton).toBeDisabled();

    resolveSave();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Salva" })).not.toBeDisabled(),
    );
  });
});
