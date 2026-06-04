import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient) {}

  login(credentials: { username: string; password: string }) {
    return this.http.post('/api/auth/login', credentials);
  }

  logout() {
    return this.http.post('/api/auth/logout', {});
  }

  getProfile() {
    return this.http.get('/api/auth/profile');
  }
}
