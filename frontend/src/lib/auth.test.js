import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearSession, isAuthenticated, isTokenExpired } from './auth';

describe('auth helper', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('clearSession removes keys', () => {
    localStorage.setItem('token', 'fake-token');
    localStorage.setItem('role', 'admin');
    
    clearSession();
    
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('role')).toBeNull();
  });

  it('isTokenExpired returns true when no token', () => {
    expect(isTokenExpired(null)).toBe(true);
  });

  it('isAuthenticated returns false when no token', () => {
    expect(isAuthenticated()).toBe(false);
  });
});
