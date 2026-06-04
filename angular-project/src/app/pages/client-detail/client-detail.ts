import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-client-detail',
  imports: [],
  templateUrl: './client-detail.html',
  styleUrl: './client-detail.scss',
})
export class ClientDetail implements OnInit {
  clientId = '';
  client = { name: 'Acme Corp', contact: 'jane@acme.com', phone: '+1 555 0100', status: 'Active', since: '2021-03-15' };

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.clientId = this.route.snapshot.paramMap.get('id') ?? '';
  }
}
