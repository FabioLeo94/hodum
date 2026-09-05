import type { Request as ExRequest } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../models/user';

// Mock manuale completo del modulo (stesso stile di companyTasksController.test.ts
// e customerController.test.ts): isValid* tornano sempre true perché questi
// test riguardano il lock (409), non la validazione degli input, già coperta
// altrove implicitamente dal comportamento reale di taskService.
vi.mock('../services/taskService', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  isValidDueDate: vi.fn().mockReturnValue(true),
  isValidPriority: vi.fn().mockReturnValue(true),
  isValidTaskStatus: vi.fn().mockReturnValue(true),
  isValidWorkTimerAction: vi.fn().mockReturnValue(true),
  listTasksByProject: vi.fn(),
  ProjectNotFoundError: class ProjectNotFoundError extends Error {},
  setTaskAssignees: vi.fn(),
  TaskLockedError: class TaskLockedError extends Error {
    constructor(public readonly id: string) {
      super(`Task con id ${id} è lockato: già incluso in una pre-fattura`);
      this.name = 'TaskLockedError';
    }
  },
  TaskNotFoundError: class TaskNotFoundError extends Error {},
  updateTask: vi.fn(),
  updateTaskPriority: vi.fn(),
  updateTaskStatus: vi.fn(),
  updateTaskWorkTimer: vi.fn(),
}));

vi.mock('../services/projectAssignmentService', () => ({
  assertProjectAccessible: vi.fn(),
}));

vi.mock('../services/userService', () => ({
  UserNotFoundError: class UserNotFoundError extends Error {},
}));

import {
  deleteTask,
  setTaskAssignees,
  TaskLockedError,
  updateTask,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskWorkTimer,
} from '../services/taskService';
import { assertProjectAccessible } from '../services/projectAssignmentService';
import { TaskController } from './taskController';

const PROJECT_ID = 'project-1';
const TASK_ID = 'task-1';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'mario',
    email: 'mario@example.com',
    companyId: 'company-1',
    role: 'employee',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

function makeRequest(user: User): ExRequest {
  return { user } as unknown as ExRequest;
}

function controllerWithStatus() {
  const controller = new TaskController();
  controller.setStatus = vi.fn();
  return controller;
}

beforeEach(() => {
  vi.mocked(assertProjectAccessible).mockReset().mockResolvedValue(undefined);
  vi.mocked(updateTask).mockReset();
  vi.mocked(updateTaskStatus).mockReset();
  vi.mocked(updateTaskPriority).mockReset();
  vi.mocked(updateTaskWorkTimer).mockReset();
  vi.mocked(deleteTask).mockReset();
  vi.mocked(setTaskAssignees).mockReset();
});

// Le 6 operazioni mutanti esposte da TaskController: un TaskLockedError dal
// service deve emergere come 409 con un body { message }, mai un 500 e mai un
// 404 (il task esiste, è solo lockato). Stesso principio dei test 404 già
// presenti in customerController.test.ts per CustomerNotFoundError.
describe('TaskController: un task già fatturato risponde 409 su ciascuna delle 6 operazioni mutanti', () => {
  it('PUT tasks/{id}: updateTask', async () => {
    const controller = controllerWithStatus();
    vi.mocked(updateTask).mockRejectedValue(new TaskLockedError(TASK_ID));

    const result = await controller.updateTask(PROJECT_ID, TASK_ID, { title: 'Nuovo' }, makeRequest(makeUser()));

    expect(controller.setStatus).toHaveBeenCalledWith(409);
    expect(result).toEqual({ message: new TaskLockedError(TASK_ID).message });
  });

  it('PATCH tasks/{id}/status: updateTaskStatus', async () => {
    const controller = controllerWithStatus();
    vi.mocked(updateTaskStatus).mockRejectedValue(new TaskLockedError(TASK_ID));

    const result = await controller.updateTaskStatus(
      PROJECT_ID,
      TASK_ID,
      { status: 'completed' },
      makeRequest(makeUser()),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(409);
    expect(result).toEqual({ message: new TaskLockedError(TASK_ID).message });
  });

  it('PATCH tasks/{id}/priority: updateTaskPriority', async () => {
    const controller = controllerWithStatus();
    vi.mocked(updateTaskPriority).mockRejectedValue(new TaskLockedError(TASK_ID));

    const result = await controller.updateTaskPriority(PROJECT_ID, TASK_ID, { priority: 3 }, makeRequest(makeUser()));

    expect(controller.setStatus).toHaveBeenCalledWith(409);
    expect(result).toEqual({ message: new TaskLockedError(TASK_ID).message });
  });

  it('PATCH tasks/{id}/work-timer: updateTaskWorkTimer', async () => {
    const controller = controllerWithStatus();
    vi.mocked(updateTaskWorkTimer).mockRejectedValue(new TaskLockedError(TASK_ID));

    const result = await controller.updateTaskWorkTimer(
      PROJECT_ID,
      TASK_ID,
      { action: 'start' },
      makeRequest(makeUser()),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(409);
    expect(result).toEqual({ message: new TaskLockedError(TASK_ID).message });
  });

  it('DELETE tasks/{id}: deleteTask', async () => {
    const controller = controllerWithStatus();
    vi.mocked(deleteTask).mockRejectedValue(new TaskLockedError(TASK_ID));

    const result = await controller.deleteTask(PROJECT_ID, TASK_ID, makeRequest(makeUser()));

    expect(controller.setStatus).toHaveBeenCalledWith(409);
    expect(result).toEqual({ message: new TaskLockedError(TASK_ID).message });
  });

  it('PUT tasks/{id}/assignees: setTaskAssignees', async () => {
    const controller = controllerWithStatus();
    vi.mocked(setTaskAssignees).mockRejectedValue(new TaskLockedError(TASK_ID));

    const result = await controller.updateTaskAssignees(
      PROJECT_ID,
      TASK_ID,
      { userIds: ['u1'] },
      makeRequest(makeUser()),
    );

    expect(controller.setStatus).toHaveBeenCalledWith(409);
    expect(result).toEqual({ message: new TaskLockedError(TASK_ID).message });
  });
});
