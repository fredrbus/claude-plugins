import { expect, test } from 'claude-code/testing'

import { age, parsePrs, parseRuns, rollup } from './github'

const pr = (number: number, branch: string, state = 'OPEN', checks: unknown[] = []) => ({
  number,
  title: `PR ${number}`,
  headRefName: branch,
  state,
  isDraft: false,
  reviewDecision: '',
  url: `https://github.com/o/r/pull/${number}`,
  statusCheckRollup: checks,
})

const run = (id: number, workflow: string, branch: string, status = 'completed', conclusion = 'success') => ({
  databaseId: id,
  workflowName: workflow,
  headBranch: branch,
  displayTitle: 't',
  status,
  conclusion,
  createdAt: '2026-10-17T12:00:00Z',
  url: `https://github.com/o/r/actions/runs/${id}`,
})

test('a failed check fails the rollup, a running one holds it', () => {
  expect(rollup([{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('fail')
  expect(rollup([{ status: 'IN_PROGRESS', conclusion: '' }, { status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('running')
  expect(rollup([{ state: 'PENDING' }])).toBe('running')
  expect(rollup([{ status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('pass')
  expect(rollup([])).toBe('none')
})

test('the current branch PR comes first, even when merged', () => {
  const open = JSON.stringify([pr(2, 'other'), pr(3, 'feature')])
  const merged = JSON.stringify(pr(1, 'mine', 'MERGED'))
  const prs = parsePrs(open, merged, 'mine')
  expect(prs.map(p => p.number)).toEqual([1, 2, 3])
  expect(prs[0]?.isCurrent).toBe(true)
})

test('the current branch PR is not listed twice', () => {
  const open = JSON.stringify([pr(2, 'other'), pr(3, 'mine')])
  const prs = parsePrs(open, JSON.stringify(pr(3, 'mine')), 'mine')
  expect(prs.map(p => p.number)).toEqual([3, 2])
})

test('builds keep the newest run per workflow on the branch and main', () => {
  const runs = parseRuns(
    JSON.stringify([
      run(5, 'Frontend', 'mine', 'in_progress', ''),
      run(4, 'Frontend', 'main'),
      run(3, 'Frontend', 'mine', 'completed', 'failure'),
      run(2, 'Backend', 'elsewhere'),
      run(1, 'Backend', 'main', 'completed', 'failure'),
    ]),
    'mine',
  )
  expect(runs.map(r => [r.id, r.verdict])).toEqual([
    [5, 'running'],
    [4, 'pass'],
    [1, 'fail'],
  ])
})

test('age reads in minutes, hours and days', () => {
  const at = Date.parse('2026-10-17T12:00:00Z')
  expect(age('2026-10-17T11:55:00Z', at)).toBe('5m')
  expect(age('2026-10-17T09:00:00Z', at)).toBe('3t')
  expect(age('2026-10-15T12:00:00Z', at)).toBe('2d')
})
