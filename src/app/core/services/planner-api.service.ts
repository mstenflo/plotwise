import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GardenProject } from '../models/planner.model';
import { Observable } from 'rxjs';

const API_BASE_URL = 'http://localhost:3000/api';

@Injectable({ providedIn: 'root' })
export class PlannerApiService {
  private readonly http = inject(HttpClient);

  getProjects(): Observable<GardenProject[]> {
    return this.http.get<GardenProject[]>(`${API_BASE_URL}/projects`);
  }

  getProject(id: string): Observable<GardenProject> {
    return this.http.get<GardenProject>(`${API_BASE_URL}/projects/${id}`);
  }

  saveProject(project: GardenProject): Observable<GardenProject> {
    return this.http.put<GardenProject>(`${API_BASE_URL}/projects/${project.id}`, project);
  }
}
