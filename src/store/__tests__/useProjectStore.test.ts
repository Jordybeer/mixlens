import { describe, it, expect, beforeEach } from 'vitest'
import { act } from 'react'
import { useProjectStore } from '../useProjectStore'

// Reset the store to its initial state before each test so tests are isolated
beforeEach(() => {
  useProjectStore.setState({ activeProjectId: null, activeProjectName: null })
})

describe('useProjectStore', () => {
  describe('initial state', () => {
    it('starts with no active project', () => {
      const state = useProjectStore.getState()
      expect(state.activeProjectId).toBeNull()
      expect(state.activeProjectName).toBeNull()
    })
  })

  describe('setActiveProject', () => {
    it('sets the active project id and name', () => {
      act(() => {
        useProjectStore.getState().setActiveProject('proj-123', 'My Album')
      })
      const state = useProjectStore.getState()
      expect(state.activeProjectId).toBe('proj-123')
      expect(state.activeProjectName).toBe('My Album')
    })

    it('replaces a previously active project', () => {
      act(() => {
        useProjectStore.getState().setActiveProject('proj-1', 'First Project')
      })
      act(() => {
        useProjectStore.getState().setActiveProject('proj-2', 'Second Project')
      })
      const state = useProjectStore.getState()
      expect(state.activeProjectId).toBe('proj-2')
      expect(state.activeProjectName).toBe('Second Project')
    })

    it('accepts a UUID-style id', () => {
      const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      act(() => {
        useProjectStore.getState().setActiveProject(uuid, 'UUID Project')
      })
      expect(useProjectStore.getState().activeProjectId).toBe(uuid)
    })

    it('accepts a project name with special characters', () => {
      act(() => {
        useProjectStore.getState().setActiveProject('id-x', 'Track #1 — Rev. 2')
      })
      expect(useProjectStore.getState().activeProjectName).toBe('Track #1 — Rev. 2')
    })
  })

  describe('clearActiveProject', () => {
    it('clears the active project to null', () => {
      act(() => {
        useProjectStore.getState().setActiveProject('proj-99', 'Something')
      })
      act(() => {
        useProjectStore.getState().clearActiveProject()
      })
      const state = useProjectStore.getState()
      expect(state.activeProjectId).toBeNull()
      expect(state.activeProjectName).toBeNull()
    })

    it('is a no-op when already null', () => {
      act(() => {
        useProjectStore.getState().clearActiveProject()
      })
      const state = useProjectStore.getState()
      expect(state.activeProjectId).toBeNull()
      expect(state.activeProjectName).toBeNull()
    })
  })

  describe('state transitions', () => {
    it('set → clear → set works correctly', () => {
      act(() => {
        useProjectStore.getState().setActiveProject('a', 'Alpha')
      })
      act(() => {
        useProjectStore.getState().clearActiveProject()
      })
      act(() => {
        useProjectStore.getState().setActiveProject('b', 'Beta')
      })
      const state = useProjectStore.getState()
      expect(state.activeProjectId).toBe('b')
      expect(state.activeProjectName).toBe('Beta')
    })
  })
})