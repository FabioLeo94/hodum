// Forma dell'entità User esposta dall'API: camelCase lato applicativo, e
// soprattutto SENZA il campo password — l'hash non deve mai lasciare il
// service (vedi toUser in userService.ts).
export interface User {
  id: string;
  username: string;
  email: string;
}
