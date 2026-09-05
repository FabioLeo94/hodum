import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCustomer, deleteCustomer, getAllCustomers, updateCustomer } from "./customerService";
import { AUTH_TOKEN_KEY } from "../auth/authService";

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const customer = {
  id: "customer-1",
  companyId: "company-1",
  name: "Cliente Uno",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastInvoicedAt: null,
};

describe("customerService", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem(AUTH_TOKEN_KEY, "signed-jwt-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getAllCustomers invia una GET con il token e risolve l'elenco", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [customer]));

    await expect(getAllCustomers()).resolves.toEqual([customer]);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/customers");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer signed-jwt-token" });
  });

  it("createCustomer invia una POST JSON e risolve il cliente creato", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, customer));

    await expect(createCustomer({ name: "Cliente Uno" })).resolves.toEqual(customer);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/customers");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toEqual({ name: "Cliente Uno" });
  });

  it("createCustomer lancia un errore con il messaggio del backend su 422", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(422, { message: "name non può essere vuoto" }));

    await expect(createCustomer({ name: "" })).rejects.toThrow("name non può essere vuoto");
  });

  it("updateCustomer invia una PUT JSON e risolve il cliente aggiornato", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, customer));

    await expect(updateCustomer("customer-1", { name: "Cliente Uno" })).resolves.toEqual(customer);

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/customers/customer-1");
    expect(options?.method).toBe("PUT");
  });

  it("deleteCustomer invia una DELETE con il token", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(204));

    await expect(deleteCustomer("customer-1")).resolves.toBeUndefined();

    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:3000/customers/customer-1");
    expect(options?.method).toBe("DELETE");
  });
});
