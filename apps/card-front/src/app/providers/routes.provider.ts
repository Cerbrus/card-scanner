import { Route } from '@angular/router';

import { ShellComponent } from '../components/shell/shell.component';
import { requireLogin } from '../services/auth.service';

export const appRoutes: Array<Route> = [
    {
        path: 'login',
        loadComponent: () => import('../pages/login/login.page').then((m) => m.LoginPage)
    },
    {
        path: '',
        component: ShellComponent,
        canActivate: [requireLogin],
        children: [
            { path: '', pathMatch: 'full', redirectTo: 'collection' },
            {
                path: 'collection',
                loadComponent: () => import('../pages/collection/collection.page').then((m) => m.CollectionPage)
            },
            {
                path: 'scan',
                loadComponent: () => import('../pages/scan/scan.page').then((m) => m.ScanPage)
            },
            {
                path: 'cards/:id',
                loadComponent: () => import('../pages/card/card.page').then((m) => m.CardPage)
            },
            {
                path: 'settings',
                loadComponent: () => import('../pages/settings/settings.page').then((m) => m.SettingsPage)
            },
            {
                path: 'log',
                loadComponent: () => import('../pages/log/log.page').then((m) => m.LogPage)
            }
        ]
    },
    { path: '**', redirectTo: 'collection' }
];
