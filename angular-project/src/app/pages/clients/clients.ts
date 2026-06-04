import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-clients',
  imports: [RouterLink, FormsModule],
  templateUrl: './clients.html',
  styleUrl: './clients.scss',
})
export class Clients {
  search = '';
  clients = [
    { id: 1, name: 'Acme Corp', contact: 'jane@acme.com', status: 'Active' },
    { id: 2, name: 'Beta Ltd', contact: 'john@beta.com', status: 'Active' },
    { id: 3, name: 'Gamma Inc', contact: 'sam@gamma.com', status: 'Inactive' },
    { id: 4, name: 'Delta Co', contact: 'alex@delta.com', status: 'Active' },
  ];

  get filtered() {
    return this.clients.filter(c =>
      c.name.toLowerCase().includes(this.search.toLowerCase())
    );
  }
}
