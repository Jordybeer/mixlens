import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { useProjectStore } from '@/store/useProjectStore'

// ─── Supabase mock ───────────────────────────────────────────────────────────
const orderMock = vi.fn()
const eqLoadMock = vi.fn()
const selectLoadMock = vi.fn()

const selectInsertMock = vi.fn()
const singleMock = vi.fn()
const eqInsertMock = vi.fn()

const fromMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: fromMock,
  }),
}))

import ProjectSelector from '../ProjectSelector'

const TEST_USER_ID = 'user-xyz'

const MOCK_PROJECTS = [
  { id: 'proj-1', name: 'Project Alpha', created_at: '2024-01-02T00:00:00Z' },
  { id: 'proj-2', name: 'Project Beta', created_at: '2024-01-01T00:00:00Z' },
]

function setupLoadProjects(projects = MOCK_PROJECTS) {
  orderMock.mockResolvedValue({ data: projects })
  eqLoadMock.mockReturnValue({ order: orderMock })
  selectLoadMock.mockReturnValue({ eq: eqLoadMock })
  fromMock.mockReturnValue({ select: selectLoadMock })
}

function setupLoadProjectsEmpty() {
  setupLoadProjects([])
}

function setupCreateProject(newProject = { id: 'proj-new', name: 'New Project', created_at: '2024-03-01T00:00:00Z' }) {
  singleMock.mockResolvedValue({ data: newProject, error: null })
  selectInsertMock.mockReturnValue({ single: singleMock })
  // Insert returns a mock that chains .select().single()
  const insertMock = vi.fn().mockReturnValue({ select: selectInsertMock })
  fromMock.mockReturnValue({ select: selectLoadMock, insert: insertMock })
  return newProject
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset the project store before each test
  useProjectStore.setState({ activeProjectId: null, activeProjectName: null })
})

describe('ProjectSelector', () => {
  describe('rendering', () => {
    it('renders the trigger button', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('shows "No project" when there is no active project', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      expect(await screen.findByText('No project')).toBeInTheDocument()
    })

    it('shows the active project name after auto-selection', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      // Auto-select fires when projects load and none is active
      await waitFor(() => {
        expect(useProjectStore.getState().activeProjectId).toBe('proj-1')
      })
    })

    it('shows "No project" when there are no projects and none is active', async () => {
      setupLoadProjectsEmpty()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())
      expect(screen.getByText('No project')).toBeInTheDocument()
    })
  })

  describe('dropdown', () => {
    it('opens the dropdown when the trigger button is clicked', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button'))
      // Wait for the dropdown list to appear (it's a <ul>)
      const list = await screen.findByRole('list')
      expect(within(list).getByText('Project Alpha')).toBeInTheDocument()
    })

    it('shows all loaded projects in the dropdown', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await userEvent.click(screen.getByRole('button'))
      const list = await screen.findByRole('list')
      expect(within(list).getByText('Project Alpha')).toBeInTheDocument()
      expect(within(list).getByText('Project Beta')).toBeInTheDocument()
    })

    it('shows "No projects yet" when there are no projects', async () => {
      setupLoadProjectsEmpty()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button'))
      expect(await screen.findByText('No projects yet')).toBeInTheDocument()
    })

    it('closes the dropdown when clicking outside', async () => {
      setupLoadProjects()
      render(
        <div>
          <ProjectSelector userId={TEST_USER_ID} />
          <div data-testid="outside">Outside</div>
        </div>
      )
      await userEvent.click(screen.getByRole('button'))
      // Wait for the list to appear
      expect(await screen.findByRole('list')).toBeInTheDocument()

      fireEvent.mouseDown(screen.getByTestId('outside'))
      await waitFor(() => {
        expect(screen.queryByRole('list')).not.toBeInTheDocument()
      })
    })
  })

  describe('project selection', () => {
    it('sets the active project when a project item is clicked', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(await screen.findByText('Project Beta'))

      expect(useProjectStore.getState().activeProjectId).toBe('proj-2')
      expect(useProjectStore.getState().activeProjectName).toBe('Project Beta')
    })

    it('closes the dropdown after selecting a project', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(await screen.findByText('Project Beta'))

      await waitFor(() => {
        expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument()
      })
    })
  })

  describe('auto-select', () => {
    it('auto-selects the first project when no project is active and projects load', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => {
        const state = useProjectStore.getState()
        expect(state.activeProjectId).toBe('proj-1')
        expect(state.activeProjectName).toBe('Project Alpha')
      })
    })

    it('does not override an already-active project', async () => {
      // Pre-set an active project
      act(() => {
        useProjectStore.getState().setActiveProject('proj-2', 'Project Beta')
      })
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())
      // Should still be proj-2, not replaced by proj-1
      expect(useProjectStore.getState().activeProjectId).toBe('proj-2')
    })
  })

  describe('create new project', () => {
    it('shows the create form when "New project" is clicked', async () => {
      setupLoadProjectsEmpty()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(await screen.findByText(/new project/i))
      expect(await screen.findByPlaceholderText('Project name…')).toBeInTheDocument()
    })

    it('hides the create form when × is clicked', async () => {
      setupLoadProjectsEmpty()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(await screen.findByText(/new project/i))
      await userEvent.click(await screen.findByText('×'))
      expect(screen.queryByPlaceholderText('Project name…')).not.toBeInTheDocument()
    })

    it('does not submit with an empty name', async () => {
      setupLoadProjectsEmpty()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(await screen.findByText(/new project/i))

      // Submit with blank name
      const form = screen.getByPlaceholderText('Project name…').closest('form')!
      fireEvent.submit(form)

      // Should not have called insert
      await waitFor(() => expect(fromMock.mock.calls.length).toBeLessThanOrEqual(1))
    })

    it('adds a new project and makes it active after creation', async () => {
      // Load returns empty list initially
      orderMock.mockResolvedValueOnce({ data: [] })
      eqLoadMock.mockReturnValue({ order: orderMock })
      selectLoadMock.mockReturnValue({ eq: eqLoadMock })

      const newProject = { id: 'proj-new', name: 'My New Track', created_at: '2024-03-01T00:00:00Z' }
      singleMock.mockResolvedValue({ data: newProject, error: null })
      selectInsertMock.mockReturnValue({ single: singleMock })
      const insertMock = vi.fn().mockReturnValue({ select: selectInsertMock })
      fromMock.mockReturnValue({ select: selectLoadMock, insert: insertMock })

      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())

      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(await screen.findByText(/new project/i))
      await userEvent.type(screen.getByPlaceholderText('Project name…'), 'My New Track')
      await userEvent.click(screen.getByRole('button', { name: /add/i }))

      await waitFor(() => {
        expect(useProjectStore.getState().activeProjectId).toBe('proj-new')
        expect(useProjectStore.getState().activeProjectName).toBe('My New Track')
      })
    })

    it('shows the new project in the list after creation', async () => {
      orderMock.mockResolvedValueOnce({ data: [] })
      eqLoadMock.mockReturnValue({ order: orderMock })
      selectLoadMock.mockReturnValue({ eq: eqLoadMock })

      const newProject = { id: 'proj-xyz', name: 'Fresh Project', created_at: '2024-03-01T00:00:00Z' }
      singleMock.mockResolvedValue({ data: newProject, error: null })
      selectInsertMock.mockReturnValue({ single: singleMock })
      const insertMock = vi.fn().mockReturnValue({ select: selectInsertMock })
      fromMock.mockReturnValue({ select: selectLoadMock, insert: insertMock })

      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(fromMock).toHaveBeenCalled())

      await userEvent.click(screen.getByRole('button'))
      await userEvent.click(await screen.findByText(/new project/i))
      await userEvent.type(screen.getByPlaceholderText('Project name…'), 'Fresh Project')
      await userEvent.click(screen.getByRole('button', { name: /add/i }))

      // After create the dropdown closes; reopen it and check the list
      await waitFor(() => expect(screen.queryByPlaceholderText('Project name…')).not.toBeInTheDocument())
      await userEvent.click(screen.getByRole('button'))
      const list = await screen.findByRole('list')
      expect(within(list).getByText('Fresh Project')).toBeInTheDocument()
    })
  })

  describe('data loading', () => {
    it('calls supabase with the provided userId', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId="specific-user-id" />)
      await waitFor(() => expect(eqLoadMock).toHaveBeenCalledWith('user_id', 'specific-user-id'))
    })

    it('orders projects by created_at descending', async () => {
      setupLoadProjects()
      render(<ProjectSelector userId={TEST_USER_ID} />)
      await waitFor(() => expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false }))
    })
  })
})