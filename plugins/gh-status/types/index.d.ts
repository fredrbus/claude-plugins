export type Verdict = 'pass' | 'fail' | 'running' | 'none'

export type Pr = {
  number: number
  title: string
  branch: string
  state: string
  isDraft: boolean
  isCurrent: boolean
  review: string
  checks: Verdict
  url: string
}

export type Run = {
  id: number
  workflow: string
  branch: string
  title: string
  verdict: Verdict
  createdAt: string
  url: string
}

export type Snapshot = {
  branch: string
  prs: Pr[]
  runs: Run[]
  error?: string
  updatedAt: number
  isLoading: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'gh-status': { snapshot: Snapshot }
  }
}
