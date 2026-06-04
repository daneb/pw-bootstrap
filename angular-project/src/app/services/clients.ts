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

  updateClient(id: number, data: unknown) {
    return this.http.put(`/api/clients/${id}`, data);
  }

  deleteClient(id: number) {
    return this.http.delete(`/api/clients/${id}`);
  }

  searchClients(query: string) {
    return this.http.get('/api/clients/search?q=' + query);
  }
}
