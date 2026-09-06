import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import TaskCommentsPanelComponent from "./taskCommentsPanelComponent";
import { listTaskComments } from "../../services/project/projectService";
import { getUser } from "../../services/auth/authService";
import type { TaskComment } from "../../../shared/types/project";

vi.mock("../../services/project/projectService", () => ({
  listTaskComments: vi.fn(),
  createTaskComment: vi.fn(),
  updateTaskComment: vi.fn(),
  deleteTaskComment: vi.fn(),
}));
vi.mock("../../services/realtime/socketService", () => ({
  subscribeToTaskComments: vi.fn(() => () => {}),
}));
vi.mock("../../services/auth/authService", () => ({
  getUser: vi.fn(),
}));

const mockedListTaskComments = vi.mocked(listTaskComments);
const mockedGetUser = vi.mocked(getUser);

const ownComment: TaskComment = {
  id: "comment-1",
  taskId: "task-1",
  authorId: "user-1",
  authorDisplayName: "mario",
  body: "Un commento",
  createdAt: "2026-09-01T10:00:00.000Z",
  edited: false,
};

describe("TaskCommentsPanelComponent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra la casella di invio e il menù azioni sui commenti propri quando non è readOnly", async () => {
    mockedListTaskComments.mockResolvedValue([ownComment]);
    mockedGetUser.mockReturnValue({ id: "user-1" } as ReturnType<typeof getUser>);

    render(<TaskCommentsPanelComponent projectId="project-1" taskId="task-1" />);

    expect(await screen.findByText("Un commento")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Scrivi un commento/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Altre azioni per il commento" }),
    ).toBeInTheDocument();
  });

  it("nasconde la casella di invio e il menù azioni quando readOnly", async () => {
    mockedListTaskComments.mockResolvedValue([ownComment]);
    mockedGetUser.mockReturnValue({ id: "user-1" } as ReturnType<typeof getUser>);

    render(<TaskCommentsPanelComponent projectId="project-1" taskId="task-1" readOnly />);

    expect(await screen.findByText("Un commento")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Scrivi un commento/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Altre azioni per il commento" }),
    ).not.toBeInTheDocument();
  });
});
