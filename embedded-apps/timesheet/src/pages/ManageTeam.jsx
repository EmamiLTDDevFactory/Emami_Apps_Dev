import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import BackButton from '../components/BackButton'

export default function ManageTeam({ navigate }) {
  const {
    directReports,
    projects,
    tasks,
    assignments,
    teamSettings,
    addTeamMember,
    addProject,
    addTask,
    updateProject,
    deleteProject,
    updateTask,
    deleteTask,
    setUserAssignments,
    updateTeamSettings,
  } = useApp()
  const { showToast } = useToast()

  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [addingMember, setAddingMember] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newTaskName, setNewTaskName] = useState('')
  const [newTaskProject, setNewTaskProject] = useState(projects[0]?.id || '')
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    if (!projects.some((p) => p.id === newTaskProject)) {
      setNewTaskProject(projects[0]?.id || '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects])

  function handleAddProject(e) {
    e.preventDefault()
    if (!newProjectName.trim()) return
    addProject(newProjectName.trim())
    setNewProjectName('')
    showToast('Project added.', 'success')
  }

  function handleAddTask(e) {
    e.preventDefault()
    if (!newTaskName.trim() || !newTaskProject) return
    addTask(newTaskProject, newTaskName.trim())
    setNewTaskName('')
    showToast('Task added.', 'success')
  }

  function startEditProject(project) {
    setEditingProjectId(project.id)
    setDraftName(project.name)
  }

  function saveEditProject(id) {
    if (draftName.trim()) updateProject(id, draftName.trim())
    setEditingProjectId(null)
  }

  function handleDeleteProject(project) {
    if (!window.confirm(`Delete "${project.name}"? Its tasks will be removed and unassigned from your team.`)) return
    deleteProject(project.id)
    if (editingProjectId === project.id) setEditingProjectId(null)
    showToast('Project deleted.', 'success')
  }

  function startEditTask(task) {
    setEditingTaskId(task.id)
    setDraftName(task.name)
  }

  function saveEditTask(id) {
    if (draftName.trim()) updateTask(id, draftName.trim())
    setEditingTaskId(null)
  }

  function handleDeleteTask(task) {
    if (!window.confirm(`Delete "${task.name}"?`)) return
    deleteTask(task.id)
    if (editingTaskId === task.id) setEditingTaskId(null)
    showToast('Task deleted.', 'success')
  }

  function toggleAssignment(userId, taskId) {
    const current = assignments[userId] || []
    const next = current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    setUserAssignments(userId, next)
  }

  async function handleAddMember(e) {
    e.preventDefault()
    if (!newMemberName.trim() || !newMemberEmail.trim()) return
    setAddingMember(true)
    try {
      await addTeamMember(newMemberName.trim(), newMemberEmail.trim())
      setNewMemberName('')
      setNewMemberEmail('')
      showToast('Team member added.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to add team member.', 'error')
    } finally {
      setAddingMember(false)
    }
  }

  return (
    <div className="space-y-6">
      <BackButton onClick={() => navigate('dashboard')} />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Manage Team</h1>
        <p className="text-sm text-slate-500 mt-1">Direct reports, project/task setup, and submission deadline.</p>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-1">Monthly submission deadline</h2>
        <p className="text-sm text-slate-500 mb-3">Timesheets are due this many days after the month ends:</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="28"
            value={teamSettings.deadlineDaysAfterMonthEnd}
            onChange={(e) => updateTeamSettings({ deadlineDaysAfterMonthEnd: Math.max(0, Number(e.target.value) || 0) })}
            className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <span className="text-sm text-slate-600">days after month end</span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-3">Direct reports & task assignments</h2>

        <form onSubmit={handleAddMember} className="flex flex-wrap gap-2 mb-5 pb-5 border-b border-slate-100">
          <label htmlFor="new-member-name" className="sr-only">
            Full name
          </label>
          <input
            id="new-member-name"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            placeholder="Full name"
            className="flex-1 min-w-[8rem] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <label htmlFor="new-member-email" className="sr-only">
            Emami email address
          </label>
          <input
            id="new-member-email"
            type="email"
            value={newMemberEmail}
            onChange={(e) => setNewMemberEmail(e.target.value)}
            placeholder="Emami email address"
            className="flex-1 min-w-[12rem] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={addingMember}
            className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:from-indigo-500 hover:to-violet-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60"
          >
            {addingMember ? 'Adding…' : 'Add team member'}
          </button>
        </form>

        <div className="space-y-5">
          {directReports.map((user) => (
            <div key={user.id} className="border border-slate-100 rounded-lg p-4">
              <div className="mb-2">
                <p className="font-medium text-slate-800">{user.name}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Assigned tasks</legend>
                <div className="flex flex-wrap gap-2">
                  {tasks.map((task) => {
                    const project = projects.find((p) => p.id === task.projectId)
                    const checked = (assignments[user.id] || []).includes(task.id)
                    return (
                      <label
                        key={task.id}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs cursor-pointer ${
                          checked ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssignment(user.id, task.id)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {project?.name} · {task.name}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            </div>
          ))}
          {directReports.length === 0 && <p className="text-sm text-slate-400">No direct reports.</p>}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Projects</h2>
          <ul className="space-y-2 mb-4">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-2 last:border-0">
                {editingProjectId === project.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEditProject(project.id)}
                    onBlur={() => saveEditProject(project.id)}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <span className="text-slate-700">{project.name}</span>
                )}
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => (editingProjectId === project.id ? saveEditProject(project.id) : startEditProject(project))}
                    className="text-indigo-600 hover:text-indigo-800 text-xs font-medium focus:outline-none focus-visible:underline"
                  >
                    {editingProjectId === project.id ? 'Save' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(project)}
                    className="text-red-600 hover:text-red-800 text-xs font-medium focus:outline-none focus-visible:underline"
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddProject} className="flex gap-2">
            <label htmlFor="new-project" className="sr-only">
              New project name
            </label>
            <input
              id="new-project"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="New project name"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:from-indigo-500 hover:to-violet-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Add
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Tasks</h2>
          <ul className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {tasks.map((task) => {
              const project = projects.find((p) => p.id === task.projectId)
              return (
                <li key={task.id} className="flex items-center justify-between gap-2 text-sm border-b border-slate-100 pb-2 last:border-0">
                  {editingTaskId === task.id ? (
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveEditTask(task.id)}
                      onBlur={() => saveEditTask(task.id)}
                      className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <span className="text-slate-700">
                      <span className="text-slate-400">{project?.name}</span> · {task.name}
                    </span>
                  )}
                  <span className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => (editingTaskId === task.id ? saveEditTask(task.id) : startEditTask(task))}
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-medium focus:outline-none focus-visible:underline"
                    >
                      {editingTaskId === task.id ? 'Save' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task)}
                      className="text-red-600 hover:text-red-800 text-xs font-medium focus:outline-none focus-visible:underline"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
          <form onSubmit={handleAddTask} className="flex flex-wrap gap-2">
            <label htmlFor="new-task-project" className="sr-only">
              Project
            </label>
            <select
              id="new-task-project"
              value={newTaskProject}
              onChange={(e) => setNewTaskProject(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label htmlFor="new-task-name" className="sr-only">
              New task name
            </label>
            <input
              id="new-task-name"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              placeholder="New task name"
              className="flex-1 min-w-[8rem] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:shadow-md hover:from-indigo-500 hover:to-violet-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Add
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
