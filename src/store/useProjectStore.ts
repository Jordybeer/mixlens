import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Project {
  id: string
  name: string
  created_at: string
}

interface ProjectStore {
  activeProjectId: string | null
  activeProjectName: string | null
  // storagePath of the last file used per project id
  lastUsedStoragePaths: Record<string, string>
  setActiveProject: (id: string, name: string) => void
  clearActiveProject: () => void
  setLastUsedStoragePath: (projectId: string, storagePath: string) => void
  clearLastUsedStoragePath: (projectId: string) => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeProjectName: null,
      lastUsedStoragePaths: {},
      setActiveProject: (id, name) => set({ activeProjectId: id, activeProjectName: name }),
      clearActiveProject: () => set({ activeProjectId: null, activeProjectName: null }),
      setLastUsedStoragePath: (projectId, storagePath) =>
        set((state) => ({
          lastUsedStoragePaths: { ...state.lastUsedStoragePaths, [projectId]: storagePath },
        })),
      clearLastUsedStoragePath: (projectId) =>
        set((state) => {
          const next = { ...state.lastUsedStoragePaths }
          delete next[projectId]
          return { lastUsedStoragePaths: next }
        }),
    }),
    {
      name: 'mixlens-project',
      partialize: (state) => ({ lastUsedStoragePaths: state.lastUsedStoragePaths }),
    }
  )
)
