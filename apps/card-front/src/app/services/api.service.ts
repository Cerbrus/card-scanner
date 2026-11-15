import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Candidate, CardChanges, CardDetail, CardSummary, CatalogState, Health, LogLine, PhotoSide, SyncState, SystemState } from '../models';
import { ScaledPhoto } from './photo-scaler';
import { SettingsService } from './settings/settings.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly settings = inject(SettingsService);

    public get baseUrl(): string {
        return `${this.settings.getApiUrl('core')}/v1`;
    }

    public get exportUrl(): string {
        return `${this.baseUrl}/export/cards.csv`;
    }

    public get googleConnectUrl(): string {
        return `${this.baseUrl}/google/connect`;
    }

    public photoUrl(photoId: number, thumb = false): string {
        return `${this.baseUrl}/photos/${photoId}${thumb ? '?thumb' : ''}`;
    }

    public getHealth(): Observable<Health> {
        return this.http.get<Health>(`${this.baseUrl}/health`);
    }

    public getSystem(): Observable<SystemState> {
        return this.http.get<SystemState>(`${this.baseUrl}/system`);
    }

    public getLogs(): Observable<Array<LogLine>> {
        return this.http.get<Array<LogLine>>(`${this.baseUrl}/logs`, { params: { limit: 500 } });
    }

    public getCards(): Observable<Array<CardSummary>> {
        return this.http.get<Array<CardSummary>>(`${this.baseUrl}/cards`);
    }

    public getCard(id: number): Observable<CardDetail> {
        return this.http.get<CardDetail>(`${this.baseUrl}/cards/${id}`);
    }

    public createCard(photos: FormData): Observable<CardSummary> {
        return this.http.post<CardSummary>(`${this.baseUrl}/cards`, photos);
    }

    public updateCard(id: number, changes: CardChanges): Observable<CardDetail> {
        return this.http.patch<CardDetail>(`${this.baseUrl}/cards/${id}`, changes);
    }

    public confirmCard(id: number, catalogCardId: string): Observable<CardDetail> {
        return this.http.post<CardDetail>(`${this.baseUrl}/cards/${id}/confirm`, { catalogCardId });
    }

    public readCard(id: number): Observable<CardDetail> {
        return this.http.post<CardDetail>(`${this.baseUrl}/cards/${id}/read`, {});
    }

    public getPhoto(photoId: number, source = false): Observable<Blob> {
        return this.http.get(`${this.photoUrl(photoId)}${source ? '?source' : ''}`, { responseType: 'blob' });
    }

    public replacePhoto(id: number, side: PhotoSide, scaled: ScaledPhoto, keepSource = false): Observable<CardDetail> {
        const form = new FormData();
        form.append('photo', scaled.photo, `${side}.jpg`);
        form.append('thumb', scaled.thumb, `${side}-thumb.jpg`);
        if (keepSource) {
            form.append('keepSource', 'yes');
        } else if (scaled.source) {
            form.append('source', scaled.source, `${side}-source.jpg`);
        }

        return this.http.put<CardDetail>(`${this.baseUrl}/cards/${id}/photos/${side}`, form);
    }

    public deleteCard(id: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/cards/${id}`);
    }

    public searchCatalog(name: string, number: string): Observable<Array<Candidate>> {
        return this.http.get<Array<Candidate>>(`${this.baseUrl}/catalog/search`, { params: { name, number } });
    }

    public refreshCatalog(): Observable<CatalogState> {
        return this.http.post<CatalogState>(`${this.baseUrl}/system/catalog/refresh`, {});
    }

    public refreshPrices(): Observable<{ priced: number }> {
        return this.http.post<{ priced: number }>(`${this.baseUrl}/system/prices/refresh`, {});
    }

    public runSync(): Observable<SyncState> {
        return this.http.post<SyncState>(`${this.baseUrl}/google/sync`, {});
    }

    public disconnectGoogle(): Observable<SyncState> {
        return this.http.post<SyncState>(`${this.baseUrl}/google/disconnect`, {});
    }
}
