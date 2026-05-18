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
  setActiveProject: (id: string, name: string) => void
  clearActiveProject: () => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      activeProjectId: null,
      activeProjectName: null,
      setActiveProject: (id, name) => set({ activeProjectId: id, activeProjectName: name }),
      clearActiveProject: () => set({ activeProjectId: null, activeProjectName: null }),
    }),
    { name: 'mixlens-project' }
  )
)
