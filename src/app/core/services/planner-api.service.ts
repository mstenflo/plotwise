import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GardenProject } from '../models/planner.model';
import { Observable } from 'rxjs';
import { CreateProjectRequest } from './planner-api.types';

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

  createProject(payload: CreateProjectRequest): Observable<GardenProject> {
    return this.http.post<GardenProject>(`${API_BASE_URL}/projects`, payload);
  }

  deleteProject(projectId: string): Observable<{ deleted: true }> {
    return this.http.delete<{ deleted: true }>(`${API_BASE_URL}/projects/${projectId}`);
  }
}
