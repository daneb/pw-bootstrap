import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'login', component: null },
  { path: 'dashboard', component: null },
  { path: 'clients', component: null },
  { path: 'clients/:id', component: null },
  { path: 'reports', component: null },
];
