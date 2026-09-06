import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaskAssigneesComponent from "./taskAssigneesComponent";
import type { User } from "../../services/auth/authService";

const employees: User[] = [
  {
    id: "user-1",
    username: "Alice",
    firstName: "Alice",
    lastName: "A.",
    pronoun: null,
    email: "alice@example.com",
    companyId: "company-1",
    role: "employee",
    mustChangePassword: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    disabledAt: null,
  },
  {
    id: "user-2",
    username: "Bob",
    firstName: "Bob",
    lastName: "B.",
    pronoun: null,
    email: "bob@example.com",
    companyId: "company-1",
    role: "employee",
    mustChangePassword: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    disabledAt: null,
  },
  {
    id: "user-3",
    username: "Carol",
    firstName: "Carol",
    lastName: "C.",
    pronoun: null,
    email: "carol@example.com",
    companyId: "company-1",
    role: "employee",
    mustChangePassword: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: null,
    disabledAt: null,
  },
];

describe("TaskAssigneesComponent", () => {
  it("renders a dashed trigger button labelled with the task title", () => {
    render(
      <TaskAssigneesComponent
        employees={employees}
        selectedIds={[]}
        taskTitle="Task di prova"
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Assegna dipendenti a Task di prova",
    });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the dropdown listing every employee when the trigger is clicked", () => {
    render(
      <TaskAssigneesComponent
        employees={employees}
        selectedIds={[]}
        taskTitle="Task di prova"
        onChange={() => {}}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Assegna dipendenti a Task di prova" }),
    );

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("selecting an employee without shift closes the dropdown and commits that single change", () => {
    const onChange = vi.fn();
    render(
      <TaskAssigneesComponent
        employees={employees}
        selectedIds={[]}
        taskTitle="Task di prova"
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Assegna dipendenti a Task di prova" }),
    );
    fireEvent.click(screen.getByRole("option", { name: /Alice/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["user-1"]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selecting with shift keeps the dropdown open and accumulates ids into a single onChange on close", () => {
    const onChange = vi.fn();
    render(
      <TaskAssigneesComponent
        employees={employees}
        selectedIds={[]}
        taskTitle="Task di prova"
        onChange={onChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Assegna dipendenti a Task di prova" }),
    );
    fireEvent.click(screen.getByRole("option", { name: /Alice/ }), { shiftKey: true });
    fireEvent.click(screen.getByRole("option", { name: /Bob/ }), { shiftKey: true });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual(
      expect.arrayContaining(["user-1", "user-2"]),
    );
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not open the dropdown when disabled", () => {
    render(
      <TaskAssigneesComponent
        employees={employees}
        selectedIds={[]}
        taskTitle="Task di prova"
        onChange={() => {}}
        disabled
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Assegna dipendenti a Task di prova" }),
    );

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
