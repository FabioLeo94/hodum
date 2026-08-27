import type { Project } from "../../../shared/types/project";

const MOCK_PROJECTS: Project[] = [
  {
    id: "1",
    name: "Progetto Demo",
    tasks: [
      {
        title: "FIX: rendering auth form",
        description:
          "Il form di auth non renderizza correttamente e risulta spostato troppo a destra invece di essere centrato",
        status: "progress",
        tags: ["auth"],
      },
      {
        title: "FEAT: creazione form clienti",
        description: "Inserire un form per la registrazione dei clienti",
        status: "progress",
        tags: ["auth"],
      },
      {
        title: "FIX: colore primario mancante",
        description:
          "Il bottone della pagina di login non ha il primary come sfondo",
        status: "review",
        tags: ["auth"],
      },
    ],
  },
];

export function getAllProjects(): Project[] {
  return MOCK_PROJECTS;
}

export function getProjectById(id: string): Project | undefined {
  return MOCK_PROJECTS.find((project) => project.id === id);
}
