import type { Pr, Run, Verdict } from '../types'

type Check = { status?: string; conclusion?: string; state?: string }

type RawPr = {
  number: number
  title: string
  headRefName: string
  state: string
  isDraft: boolean
  reviewDecision: string
  url: string
  statusCheckRollup: Check[] | null
}

type RawRun = {
  databaseId: number
  workflowName: string
  headBranch: string
  displayTitle: string
  status: string
  conclusion: string
  createdAt: string
  url: string
}

export const PR_FIELDS = 'number,title,headRefName,state,isDraft,reviewDecision,url,statusCheckRollup'
export const RUN_FIELDS = 'databaseId,workflowName,headBranch,displayTitle,status,conclusion,createdAt,url'

const FAILED = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE']

// A check run carries status and conclusion; a commit status carries state alone.
function checkVerdict(check: Check): Verdict {
  const conclusion = (check.conclusion ?? check.state ?? '').toUpperCase()
  if (FAILED.includes(conclusion)) return 'fail'
  if (check.status && check.status.toUpperCase() !== 'COMPLETED') return 'running'
  if (conclusion === 'PENDING' || conclusion === 'EXPECTED') return 'running'
  return 'pass'
}

export function rollup(checks: Check[] | null): Verdict {
  if (!checks || checks.length === 0) return 'none'
  const verdicts = checks.map(checkVerdict)
  if (verdicts.includes('fail')) return 'fail'
  if (verdicts.includes('running')) return 'running'
  return 'pass'
}

export function runVerdict(status: string, conclusion: string): Verdict {
  if (status !== 'completed') return 'running'
  if (conclusion === 'success' || conclusion === 'skipped' || conclusion === 'neutral') return 'pass'
  return 'fail'
}

function toPr(raw: RawPr, branch: string): Pr {
  return {
    number: raw.number,
    title: raw.title,
    branch: raw.headRefName,
    state: raw.state,
    isDraft: raw.isDraft,
    isCurrent: raw.headRefName === branch,
    review: raw.reviewDecision,
    checks: rollup(raw.statusCheckRollup),
    url: raw.url,
  }
}

// Open pull requests, plus the current branch's even when it is merged or closed.
// The current branch's comes first.
export function parsePrs(openJson: string, currentJson: string | undefined, branch: string): Pr[] {
  const open = (JSON.parse(openJson) as RawPr[]).map(raw => toPr(raw, branch))
  const current = currentJson ? toPr(JSON.parse(currentJson) as RawPr, branch) : undefined
  const all = current && !open.some(pr => pr.number === current.number) ? [current, ...open] : open
  return [...all.filter(pr => pr.isCurrent), ...all.filter(pr => !pr.isCurrent)]
}

// The newest run of each workflow on the current branch and on main.
export function parseRuns(json: string, branch: string, max = 8): Run[] {
  const seen = new Set<string>()
  const runs: Run[] = []
  for (const raw of JSON.parse(json) as RawRun[]) {
    if (raw.headBranch !== branch && raw.headBranch !== 'main') continue
    const key = `${raw.headBranch}/${raw.workflowName}`
    if (seen.has(key)) continue
    seen.add(key)
    runs.push({
      id: raw.databaseId,
      workflow: raw.workflowName,
      branch: raw.headBranch,
      title: raw.displayTitle,
      verdict: runVerdict(raw.status, raw.conclusion),
      createdAt: raw.createdAt,
      url: raw.url,
    })
  }
  return runs.slice(0, max)
}

export function age(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000))
  if (minutes < 60) return `${minutes}m`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}t`
  return `${Math.round(minutes / 60 / 24)}d`
}
