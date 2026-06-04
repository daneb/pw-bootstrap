import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class ClientsService {
  constructor(private http: HttpClient) {}

  getClients() {
    return this.http.get('/api/clients');
  }

  getClient(id: number) {
    return this.http.get(`/api/clients/${id}`);
  }

  createClient(data: unknown) {
    return this.http.post('/api/clients', data);
  }
}
