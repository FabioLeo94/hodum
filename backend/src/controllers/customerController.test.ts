import type { Request as ExRequest } from 'express';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from '../models/user';
import type { Customer } from '../models/customer';

vi.mock('../services/customerService', () => ({
  createCustomer: vi.fn(),
  CustomerNotFoundError: class CustomerNotFoundError extends Error {},
  deleteCustomer: vi.fn(),
  getCustomerById: vi.fn(),
  listCustomersByCompany: vi.fn(),
  updateCustomer: vi.fn(),
}));

import {
  createCustomer,
  CustomerNotFoundError,
  deleteCustomer,
  getCustomerById,
  listCustomersByCompany,
  updateCustomer,
} from '../services/customerService';
import { CustomerController } from './customerController';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'owner-1',
    username: 'owner',
    email: 'owner@example.com',
    companyId: 'company-1',
    role: 'owner',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLoginAt: null,
    ...overrides,
  };
}

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-1',
    companyId: 'company-1',
    name: 'Cliente Uno',
    description: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastInvoicedAt: null,
    ...overrides,
  };
}

function makeRequest(user: User): ExRequest {
  return { user } as unknown as ExRequest;
}

function controllerWithStatus() {
  const controller = new CustomerController();
  controller.setStatus = vi.fn();
  return controller;
}

beforeEach(() => {
  vi.mocked(listCustomersByCompany).mockReset();
  vi.mocked(getCustomerById).mockReset();
  vi.mocked(createCustomer).mockReset();
  vi.mocked(updateCustomer).mockReset();
  vi.mocked(deleteCustomer).mockReset();
});

describe('CustomerController.listCustomers', () => {
  it('elenca solo i clienti della company del richiedente', async () => {
    const controller = controllerWithStatus();
    vi.mocked(listCustomersByCompany).mockResolvedValue([makeCustomer()]);

    const result = await controller.listCustomers(makeRequest(makeUser()));

    expect(listCustomersByCompany).toHaveBeenCalledWith('company-1');
    expect(result).toEqual([makeCustomer()]);
  });

  it('un utente senza company riceve una lista vuota', async () => {
    const controller = controllerWithStatus();

    const result = await controller.listCustomers(makeRequest(makeUser({ companyId: null })));

    expect(listCustomersByCompany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

describe('CustomerController.createCustomer: validazione', () => {
  it('rifiuta un name vuoto con 422', async () => {
    const controller = controllerWithStatus();

    const result = await controller.createCustomer({ name: '   ' }, makeRequest(makeUser()));

    expect(controller.setStatus).toHaveBeenCalledWith(422);
    expect(result).toEqual({ message: 'name non può essere vuoto' });
    expect(createCustomer).not.toHaveBeenCalled();
  });

  it('crea il cliente nella company del richiedente', async () => {
    const controller = controllerWithStatus();
    vi.mocked(createCustomer).mockResolvedValue(makeCustomer());

    const result = await controller.createCustomer(
      { name: 'Cliente Uno', description: 'Nota' },
      makeRequest(makeUser()),
    );

    // tariffaOraria/tariffaUnita non normalizzati qui: da questa correzione la
    // normalizzazione/validazione dell'accoppiamento vive in
    // customerService.createCustomer (validateAndNormalizeTariffa), non più
    // nel controller, che inoltra i valori grezzi ricevuti dal body.
    expect(createCustomer).toHaveBeenCalledWith('company-1', {
      name: 'Cliente Uno',
      description: 'Nota',
      tariffaOraria: undefined,
      tariffaUnita: undefined,
    });
    expect(controller.setStatus).toHaveBeenCalledWith(201);
    expect(result).toEqual(makeCustomer());
  });
});

describe('CustomerController.getCustomer: scoping sulla company del richiedente', () => {
  it("un utente NON vede i clienti di un'altra company passandone semplicemente l'id (IDOR)", async () => {
    const controller = controllerWithStatus();
    vi.mocked(getCustomerById).mockRejectedValue(new CustomerNotFoundError('customer-1'));

    const result = await controller.getCustomer('customer-1', makeRequest(makeUser()));

    expect(controller.setStatus).toHaveBeenCalledWith(404);
    expect(result).toEqual({ message: 'Customer con id customer-1 non trovato' });
  });
});

describe('CustomerController.deleteCustomer', () => {
  it('risponde 404 se il cliente non esiste o è di un\'altra company', async () => {
    const controller = controllerWithStatus();
    vi.mocked(deleteCustomer).mockRejectedValue(new CustomerNotFoundError('customer-1'));

    await controller.deleteCustomer('customer-1', makeRequest(makeUser()));

    expect(controller.setStatus).toHaveBeenCalledWith(404);
  });
});
