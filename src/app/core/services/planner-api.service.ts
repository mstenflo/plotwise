import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GardenProject, PlannerTask } from '../models/planner.model';
import { SeedMetadata } from '../models/seed.model';
import { Observable } from 'rxjs';
import {
  BedDetailsResponse,
  BedPlacementResponse,
  BedSummaryResponse,
  CreatePlacementRequest,
  CreateProjectRequest,
  HarvestPreviewRequest,
  HarvestPreviewResponse,
  PlannerTaskResponse,
  TaskQueryParams,
  UpdateBedDetailsRequest,
} from './planner-api.types';

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

  getSeeds(): Observable<SeedMetadata[]> {
    return this.http.get<SeedMetadata[]>(`${API_BASE_URL}/seeds`);
  }

  getProjectTasks(projectId: string, query?: TaskQueryParams): Observable<PlannerTaskResponse[]> {
    return this.http.get<PlannerTask[]>(`${API_BASE_URL}/projects/${projectId}/tasks`, {
      params: {
        ...(query?.bedId ? { bedId: query.bedId } : {}),
        ...(query?.placementId ? { placementId: query.placementId } : {}),
        ...(query?.completed !== undefined ? { completed: String(query.completed) } : {})
      }
    });
  }

  syncProjectTasks(projectId: string): Observable<{ synced: true }> {
    return this.http.post<{ synced: true }>(`${API_BASE_URL}/projects/${projectId}/tasks/sync`, {});
  }

  getBedSummaries(projectId: string): Observable<BedSummaryResponse[]> {
    return this.http.get<BedSummaryResponse[]>(`${API_BASE_URL}/projects/${projectId}/beds/summary`);
  }

  getBedDetails(projectId: string, bedId: string): Observable<BedDetailsResponse> {
    return this.http.get<BedDetailsResponse>(`${API_BASE_URL}/projects/${projectId}/beds/${bedId}`);
  }

  updateBedDetails(projectId: string, bedId: string, payload: UpdateBedDetailsRequest): Observable<BedDetailsResponse> {
    return this.http.put<BedDetailsResponse>(
      `${API_BASE_URL}/projects/${projectId}/beds/${bedId}`,
      payload
    );
  }

  createPlacement(projectId: string, bedId: string, payload: CreatePlacementRequest): Observable<BedPlacementResponse> {
    return this.http.post<BedPlacementResponse>(
      `${API_BASE_URL}/projects/${projectId}/beds/${bedId}/placements`,
      payload
    );
  }

  updatePlacement(
    projectId: string,
    bedId: string,
    placementId: string,
    payload: CreatePlacementRequest
  ): Observable<BedPlacementResponse> {
    return this.http.put<BedPlacementResponse>(
      `${API_BASE_URL}/projects/${projectId}/beds/${bedId}/placements/${placementId}`,
      payload
    );
  }

  deletePlacement(projectId: string, bedId: string, placementId: string): Observable<{ deleted: true }> {
    return this.http.delete<{ deleted: true }>(
      `${API_BASE_URL}/projects/${projectId}/beds/${bedId}/placements/${placementId}`
    );
  }

  previewHarvest(
    projectId: string,
    bedId: string,
    payload: HarvestPreviewRequest
  ): Observable<HarvestPreviewResponse> {
    return this.http.post<HarvestPreviewResponse>(
      `${API_BASE_URL}/projects/${projectId}/beds/${bedId}/placements/preview-harvest`,
      payload
    );
  }

  updateTaskStatus(projectId: string, taskId: string, completed: boolean): Observable<PlannerTaskResponse> {
    return this.http.patch<PlannerTaskResponse>(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}`, { completed });
  }
}
