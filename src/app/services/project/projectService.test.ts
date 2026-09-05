import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getAllCompanyTasks, getAllProjects, getProjectById, createProject } from "./projectService";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("projectService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getAllProjects", () => {
    it("recupera i progetti e i task di ciascuno dal backend", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "http://localhost:3000/projects") {
          return jsonResponse(200, [
            { id: "1", name: "Progetto Demo", isActive: true, customerId: null },
          ]);
        }
        if (url === "http://localhost:3000/projects/1/tasks") {
          return jsonResponse(200, [
            { id: "t1", projectId: "1", title: "Task 1", description: null, status: "progress" },
          ]);
        }
        throw new Error(`URL non atteso: ${url}`);
      });

      const projects = await getAllProjects();

      expect(projects).toEqual([
        {
          id: "1",
          name: "Progetto Demo",
          customerId: null,
          tasks: [
            { id: "t1", title: "Task 1", description: "", status: "progress", dueDate: null },
          ],
        },
      ]);
    });

    it("lancia un errore se la richiesta dei progetti fallisce", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(500, {}));

      await expect(getAllProjects()).rejects.toThrow(
        "Impossibile caricare i progetti.",
      );
    });
  });

  describe("getAllCompanyTasks", () => {
    it("recupera i task di tutti i progetti con projectId/projectName mantenuti", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, [
          {
            id: "t1",
            projectId: "1",
            projectName: "Progetto Demo",
            title: "Task 1",
            description: null,
            status: "progress",
            priority: 5,
            dueDate: "2026-01-10",
            assignees: [],
          },
        ]),
      );

      const tasks = await getAllCompanyTasks();

      expect(tasks).toEqual([
        {
          id: "t1",
          projectId: "1",
          projectName: "Progetto Demo",
          title: "Task 1",
          description: "",
          status: "progress",
          priority: 5,
          dueDate: "2026-01-10",
          assignees: [],
        },
      ]);
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe("http://localhost:3000/tasks");
    });

    it("lancia un errore se la richiesta fallisce", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(500, {}));

      await expect(getAllCompanyTasks()).rejects.toThrow(
        "Impossibile caricare i task dell'azienda.",
      );
    });
  });

  describe("getProjectById", () => {
    it("recupera il progetto con i suoi task", async () => {
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input);
        if (url === "http://localhost:3000/projects/1") {
          return jsonResponse(200, { id: "1", name: "Progetto Demo", isActive: true, customerId: null });
        }
        if (url === "http://localhost:3000/projects/1/tasks") {
          return jsonResponse(200, []);
        }
        throw new Error(`URL non atteso: ${url}`);
      });

      const project = await getProjectById("1");

      expect(project).toEqual({ id: "1", name: "Progetto Demo", customerId: null, tasks: [] });
    });

    it("ritorna undefined per un id inesistente (404)", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { message: "non trovato" }));

      await expect(getProjectById("id-inesistente")).resolves.toBeUndefined();
    });
  });

  describe("createProject", () => {
    it("invia una POST JSON a /projects e ritorna il progetto creato", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(201, { id: "2", name: "Nuovo progetto", isActive: true, customerId: null }),
      );

      const project = await createProject("Nuovo progetto");

      expect(project).toEqual({ id: "2", name: "Nuovo progetto", customerId: null, tasks: [] });
      const [url, options] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("http://localhost:3000/projects");
      expect(options?.method).toBe("POST");
      expect(JSON.parse(options?.body as string)).toEqual({ name: "Nuovo progetto" });
    });

    it("lancia un errore se la creazione fallisce", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(422, { message: "name non può essere vuoto" }),
      );

      await expect(createProject("")).rejects.toThrow(
        "name non può essere vuoto",
      );
    });
  });
});
