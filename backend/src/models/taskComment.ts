// projectId incluso (a differenza di Task, che lo ha comunque) per poter
// instradare l'evento realtime nella project room senza una query aggiuntiva
// lato frontend (vedi emitTaskCommentCreated in realtime/io.ts).
export interface TaskComment {
  id: string;
  taskId: string;
  projectId: string;
  authorId: string;
  authorUsername: string;
  body: string;
  createdAt: string; // ISO 8601
  edited: boolean;
}
