import { render, screen } from '@testing-library/react';
import App from './App';
import { describe, it, expect, vi } from 'vitest';
import * as auth from './lib/auth';

// Mock matchMedia para evitar errores con algunas librerías
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('App', () => {
  it('redirects to login if not authenticated', () => {
    // Espiamos y falseamos isAuthenticated para que devuelva false
    vi.spyOn(auth, 'isAuthenticated').mockReturnValue(false);

    render(<App />);
    
    // Verificamos que se muestre algún texto de la pantalla de Login
    expect(screen.getByText(/Ingresa a tu cuenta para continuar/i)).toBeInTheDocument();
  });
});
