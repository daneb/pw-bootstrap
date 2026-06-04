import { Component } from '@angular/core';

@Component({
  selector: 'app-reports',
  imports: [],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  exported = false;
  reports = [
    { id: 1, name: 'Q1 Summary', date: '2026-03-31', type: 'Quarterly' },
    { id: 2, name: 'Q2 Summary', date: '2026-06-30', type: 'Quarterly' },
    { id: 3, name: 'Client Activity', date: '2026-05-01', type: 'Monthly' },
    { id: 4, name: 'Revenue Overview', date: '2026-04-15', type: 'Ad Hoc' },
  ];

  export() {
    this.exported = true;
  }
}
